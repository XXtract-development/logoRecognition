"""
FastAPI Application with Security & Monitoring
STORY-004: FastAPI with Security & Monitoring
"""
# Load environment variables FIRST (before any imports that use env vars)
from dotenv import load_dotenv
import os
from pathlib import Path

# Load .env from project root (override=True to replace existing env vars)
env_path = Path(__file__).resolve().parents[2] / '.env'
load_dotenv(dotenv_path=env_path, override=True)

from fastapi import FastAPI, Request, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time
import uuid
import logging
from typing import Optional, Dict, Any
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
import structlog

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Prometheus metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

http_request_duration = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint']
)

# Rate limiting storage
rate_limit_storage = {}


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Add request ID to all requests"""

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        # Add to logs
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        structlog.contextvars.clear_contextvars()
        return response


class MetricsMiddleware(BaseHTTPMiddleware):
    """Collect metrics for all requests"""

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        response = await call_next(request)

        # Track metrics
        duration = time.time() - start_time
        http_request_duration.labels(
            method=request.method,
            endpoint=request.url.path
        ).observe(duration)

        http_requests_total.labels(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code
        ).inc()

        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware"""

    def __init__(self, app, requests_per_minute: int = 100):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute

    async def dispatch(self, request: Request, call_next):
        # Get client IP
        client_ip = request.client.host

        # Check rate limit
        current_minute = int(time.time() / 60)
        key = f"{client_ip}:{current_minute}"

        if key not in rate_limit_storage:
            rate_limit_storage[key] = 0

        rate_limit_storage[key] += 1

        if rate_limit_storage[key] > self.requests_per_minute:
            logger.warning(
                "Rate limit exceeded",
                client_ip=client_ip,
                requests=rate_limit_storage[key]
            )
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"}
            )

        response = await call_next(request)
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to responses"""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Add security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"

        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("Starting application")

    # Initialize SQLAlchemy async session (for training_jobs API)
    try:
        from app.models.base import init_db
        database_url = os.getenv(
            "DATABASE_URL",
            "postgresql+asyncpg://postgres:postgres@localhost:5432/logo_recognition"
        )
        init_db(database_url)
        logger.info(f"SQLAlchemy async session initialized (DB: {database_url.split('@')[1] if '@' in database_url else 'unknown'})")
    except Exception as e:
        logger.error(f"SQLAlchemy initialization failed: {e}")
        # This is critical for training_jobs API, so we log as error

    # Initialize database (optional - for async operations)
    try:
        from app.database import DatabasePool
        from config.database import db_config
        db_pool = DatabasePool(db_config.get_pool_config())
        await db_pool.initialize()
        app.state.db_pool = db_pool
        logger.info("Database pool initialized")
    except Exception as e:
        logger.warning(f"Database pool initialization failed: {e}")
        app.state.db_pool = None

    # Initialize model server (optional)
    try:
        from app.ml_model import ModelServer
        model_config = {
            'model_name': 'EfficientDet-D4',
            'model_path': '/models/efficientdet_d4.onnx',
            'input_size': (1024, 1024)
        }
        model_server = ModelServer(model_config)
        await model_server.load_model()
        await model_server.warmup()
        app.state.model_server = model_server
        logger.info("Model server initialized")
    except Exception as e:
        logger.warning(f"Model server initialization failed: {e}")
        app.state.model_server = None

    # Initialize Redis (optional)
    try:
        import redis.asyncio as redis
        redis_client = await redis.from_url("redis://localhost:6379")
        app.state.redis = redis_client
        logger.info("Redis client initialized")
    except Exception as e:
        logger.warning(f"Redis initialization failed: {e}")
        app.state.redis = None

    yield

    # Shutdown
    logger.info("Shutting down application")
    if hasattr(app.state, 'db_pool') and app.state.db_pool:
        await app.state.db_pool.close()
    if hasattr(app.state, 'redis') and app.state.redis:
        await app.state.redis.close()


# Create FastAPI app
app = FastAPI(
    title="Logo Recognition API",
    description="Production-ready API for logo detection and recognition",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan
)

# Add middlewares
app.add_middleware(RequestIDMiddleware)
app.add_middleware(MetricsMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=100)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*.logo-recognition.com", "localhost"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:4001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check(request: Request):
    """Health check endpoint with dependency checks"""
    health_status = {
        "status": "healthy",
        "timestamp": time.time(),
        "checks": {}
    }

    # Check database
    try:
        async with request.app.state.db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
            health_status["checks"]["database"] = "ok"
    except Exception as e:
        health_status["checks"]["database"] = "error"
        health_status["status"] = "unhealthy"
        logger.error("Database health check failed", error=str(e))

    # Check Redis
    try:
        await request.app.state.redis.ping()
        health_status["checks"]["redis"] = "ok"
    except Exception as e:
        health_status["checks"]["redis"] = "error"
        health_status["status"] = "unhealthy"
        logger.error("Redis health check failed", error=str(e))

    # Check model
    if request.app.state.model_server.is_loaded:
        health_status["checks"]["model"] = "ok"
    else:
        health_status["checks"]["model"] = "not_loaded"
        health_status["status"] = "degraded"

    status_code = 200 if health_status["status"] == "healthy" else 503
    return JSONResponse(content=health_status, status_code=status_code)


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Logo Recognition API",
        "version": "1.0.0",
        "docs": "/api/docs"
    }


# API Routes
from app.routers import logos, auth, websocket, training, annotation_metrics, image_upload, training_readiness
from app.api.v1 import training_jobs  # Production training jobs router (US-INT-002)
# Temporarily disabled due to missing app.api.core module
# from app.api.v1.recognition.controller import router as recognition_router

app.include_router(logos.router, prefix="/api/v1/logos", tags=["logos"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["authentication"])
app.include_router(websocket.router, prefix="/ws", tags=["websocket"])

# Training routes - IMPORTANT: Two separate routers!
# 1. Annotation training router (draft/final dataset management)
app.include_router(training.router, prefix="/api/v1/training", tags=["training-annotations"])
# 2. Production training jobs router (job lifecycle, progress, models)
app.include_router(training_jobs.router, tags=["training-jobs"])  # Prefix already in router

app.include_router(annotation_metrics.router, prefix="/api/annotation-metrics", tags=["annotation-metrics"])
app.include_router(image_upload.router, tags=["image-upload"])

# Category management (US-014)
from app.routers import categories
app.include_router(categories.router, tags=["categories"])

# Training readiness (Production)
app.include_router(training_readiness.router, tags=["training-readiness"])

# Notification preferences (US-INT-006 unsubscribe support)
from app.api.v1 import notifications
app.include_router(notifications.router, tags=["notifications"])

# Add the production-grade Recognition API (A++ Grade Implementation)
# Temporarily disabled due to missing app.api.core module
# app.include_router(recognition_router, prefix="/api/v1", tags=["recognition"])


# Exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions"""
    logger.error(
        "HTTP exception",
        status_code=exc.status_code,
        detail=exc.detail,
        path=request.url.path
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "request_id": getattr(request.state, "request_id", None)
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions"""
    logger.error(
        "Unhandled exception",
        error=str(exc),
        path=request.url.path,
        exc_info=True
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "request_id": getattr(request.state, "request_id", None)
        }
    )
