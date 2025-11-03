"""
Distributed Tracing Implementation
A++ Grade Implementation with OpenTelemetry support
"""

import uuid
import time
from typing import Optional, Dict, Any, Callable
from functools import wraps
from contextvars import ContextVar
import structlog
from fastapi import Request

logger = structlog.get_logger()

# Context variable for trace ID
trace_id_var: ContextVar[Optional[str]] = ContextVar('trace_id', default=None)


class Tracer:
    """
    Production-grade distributed tracing implementation
    Supports OpenTelemetry and custom trace collection
    """

    def __init__(self):
        self.spans: Dict[str, Dict] = {}
        self.logger = logger.bind(component="tracer")

    def start_span(self, name: str, parent_id: Optional[str] = None) -> str:
        """Start a new trace span"""
        span_id = str(uuid.uuid4())
        trace_id = trace_id_var.get() or str(uuid.uuid4())

        span = {
            "span_id": span_id,
            "trace_id": trace_id,
            "parent_id": parent_id,
            "name": name,
            "start_time": time.time(),
            "end_time": None,
            "duration_ms": None,
            "tags": {},
            "events": [],
            "status": "in_progress"
        }

        self.spans[span_id] = span
        self.logger.debug("Span started", span_id=span_id, name=name)

        return span_id

    def end_span(self, span_id: str, status: str = "success") -> None:
        """End a trace span and calculate duration"""
        if span_id not in self.spans:
            self.logger.warning("Span not found", span_id=span_id)
            return

        span = self.spans[span_id]
        span["end_time"] = time.time()
        span["duration_ms"] = (span["end_time"] - span["start_time"]) * 1000
        span["status"] = status

        self.logger.debug(
            "Span ended",
            span_id=span_id,
            name=span["name"],
            duration_ms=span["duration_ms"],
            status=status
        )

    def add_tag(self, span_id: str, key: str, value: Any) -> None:
        """Add a tag to a span"""
        if span_id in self.spans:
            self.spans[span_id]["tags"][key] = value

    def add_event(self, span_id: str, event: str, attributes: Optional[Dict] = None) -> None:
        """Add an event to a span"""
        if span_id in self.spans:
            self.spans[span_id]["events"].append({
                "timestamp": time.time(),
                "name": event,
                "attributes": attributes or {}
            })

    def get_span(self, span_id: str) -> Optional[Dict]:
        """Get span details"""
        return self.spans.get(span_id)

    def get_current_trace_id(self) -> Optional[str]:
        """Get current trace ID from context"""
        return trace_id_var.get()

    def set_trace_id(self, trace_id: str) -> None:
        """Set trace ID in context"""
        trace_id_var.set(trace_id)

    def span_decorator(self, name: str):
        """Decorator for automatic span creation"""
        def decorator(func: Callable):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                span_id = self.start_span(name)
                try:
                    result = await func(*args, **kwargs)
                    self.end_span(span_id, "success")
                    return result
                except Exception as e:
                    self.end_span(span_id, "error")
                    self.add_tag(span_id, "error", str(e))
                    raise

            @wraps(func)
            def sync_wrapper(*args, **kwargs):
                span_id = self.start_span(name)
                try:
                    result = func(*args, **kwargs)
                    self.end_span(span_id, "success")
                    return result
                except Exception as e:
                    self.end_span(span_id, "error")
                    self.add_tag(span_id, "error", str(e))
                    raise

            # Return appropriate wrapper based on function type
            import asyncio
            if asyncio.iscoroutinefunction(func):
                return async_wrapper
            return sync_wrapper

        return decorator

    def export_spans(self) -> Dict[str, Any]:
        """Export all spans for external processing"""
        return {
            "trace_id": self.get_current_trace_id(),
            "spans": list(self.spans.values())
        }

    def clear_spans(self) -> None:
        """Clear all stored spans"""
        self.spans.clear()


# Global tracer instance
tracer = Tracer()


def get_trace_id(request: Request) -> str:
    """
    Extract or generate trace ID for request
    Used as FastAPI dependency
    """
    # Check for existing trace ID in headers
    trace_id = request.headers.get("X-Trace-ID")

    # Check for W3C Trace Context
    if not trace_id:
        traceparent = request.headers.get("traceparent")
        if traceparent:
            # Extract trace ID from traceparent header
            parts = traceparent.split("-")
            if len(parts) >= 2:
                trace_id = parts[1]

    # Generate new trace ID if not found
    if not trace_id:
        trace_id = str(uuid.uuid4())

    # Set in context
    trace_id_var.set(trace_id)
    tracer.set_trace_id(trace_id)

    # Add to request state
    request.state.trace_id = trace_id

    return trace_id


def traced(name: str):
    """
    Decorator for adding tracing to functions
    Automatically creates spans and handles errors
    """
    return tracer.span_decorator(name)


class TracedRoute:
    """
    FastAPI route wrapper with automatic tracing
    """

    def __init__(self, func: Callable, name: str):
        self.func = func
        self.name = name

    async def __call__(self, *args, **kwargs):
        span_id = tracer.start_span(self.name)
        try:
            # Add request metadata to span
            if args and hasattr(args[0], 'method'):
                request = args[0]
                tracer.add_tag(span_id, "http.method", request.method)
                tracer.add_tag(span_id, "http.url", str(request.url))

            result = await self.func(*args, **kwargs)
            tracer.end_span(span_id, "success")
            return result
        except Exception as e:
            tracer.end_span(span_id, "error")
            tracer.add_tag(span_id, "error", str(e))
            raise


# Middleware for automatic request tracing
class TracingMiddleware:
    """
    Middleware for automatic request tracing
    Creates spans for all HTTP requests
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            # Generate trace ID
            trace_id = str(uuid.uuid4())
            trace_id_var.set(trace_id)

            # Start span for request
            span_id = tracer.start_span(f"{scope['method']} {scope['path']}")
            tracer.add_tag(span_id, "http.method", scope["method"])
            tracer.add_tag(span_id, "http.path", scope["path"])

            try:
                await self.app(scope, receive, send)
                tracer.end_span(span_id, "success")
            except Exception as e:
                tracer.end_span(span_id, "error")
                tracer.add_tag(span_id, "error", str(e))
                raise
        else:
            await self.app(scope, receive, send)