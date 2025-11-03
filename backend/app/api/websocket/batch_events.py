"""WebSocket event handling for batch processing progress."""

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

logger = logging.getLogger(__name__)


class BatchWebSocketManager:
    """Manager for batch processing WebSocket connections."""

    def __init__(self):
        """Initialize WebSocket manager."""
        # Map of batch_id to set of websocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Map of batch_id to latest progress data
        self.progress_cache: Dict[str, Dict[str, Any]] = {}
        # Message buffer for offline clients
        self.message_buffer: Dict[str, list] = {}
        # Lock for thread-safe operations
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, batch_id: str) -> None:
        """Accept and register WebSocket connection."""
        await websocket.accept()

        async with self.lock:
            if batch_id not in self.active_connections:
                self.active_connections[batch_id] = set()
                self.message_buffer[batch_id] = []
            self.active_connections[batch_id].add(websocket)

        logger.info(f"WebSocket connected for batch {batch_id}")

        # Send buffered messages if any
        if batch_id in self.message_buffer and self.message_buffer[batch_id]:
            for message in self.message_buffer[batch_id]:
                await self.send_to_client(websocket, message)
            # Clear buffer after sending
            self.message_buffer[batch_id] = []

        # Send cached progress if available
        if batch_id in self.progress_cache:
            await self.send_to_client(websocket, self.progress_cache[batch_id])

    async def disconnect(self, websocket: WebSocket, batch_id: str) -> None:
        """Remove WebSocket connection."""
        async with self.lock:
            if batch_id in self.active_connections:
                self.active_connections[batch_id].discard(websocket)
                if not self.active_connections[batch_id]:
                    del self.active_connections[batch_id]

        logger.info(f"WebSocket disconnected for batch {batch_id}")

    async def send_to_client(self, websocket: WebSocket, data: Dict[str, Any]) -> None:
        """Send data to specific WebSocket client."""
        try:
            if websocket.application_state == WebSocketState.CONNECTED:
                await websocket.send_json(data)
        except Exception as e:
            logger.error(f"Error sending to WebSocket: {str(e)}")

    async def broadcast_event(self, batch_id: str, event: Dict[str, Any]) -> None:
        """Broadcast event to all connected clients for a batch."""
        # Cache latest progress for certain event types
        if event.get("event_type") in ["batch.progress", "batch.started"]:
            self.progress_cache[batch_id] = event

        # Buffer message if no active connections
        if batch_id not in self.active_connections or not self.active_connections[batch_id]:
            if batch_id not in self.message_buffer:
                self.message_buffer[batch_id] = []
            self.message_buffer[batch_id].append(event)
            # Limit buffer size
            if len(self.message_buffer[batch_id]) > 100:
                self.message_buffer[batch_id] = self.message_buffer[batch_id][-100:]
            return

        # Get connections for this batch
        connections = self.active_connections.get(batch_id, set()).copy()

        # Send to all connected clients
        disconnected = set()
        for websocket in connections:
            try:
                await self.send_to_client(websocket, event)
            except WebSocketDisconnect:
                disconnected.add(websocket)
            except Exception as e:
                logger.error(f"Error broadcasting to WebSocket: {str(e)}")
                disconnected.add(websocket)

        # Remove disconnected clients
        if disconnected:
            async with self.lock:
                if batch_id in self.active_connections:
                    self.active_connections[batch_id] -= disconnected

    async def emit_batch_started(self, batch_id: str, total_items: int) -> None:
        """Emit batch processing started event."""
        event = {
            "event_type": "batch.started",
            "batch_id": batch_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "total_items": total_items,
                "message": "Batch processing started",
            }
        }
        await self.broadcast_event(batch_id, event)

    async def emit_item_processing(self, batch_id: str, item_id: str, item_index: int) -> None:
        """Emit item processing started event."""
        event = {
            "event_type": "item.processing",
            "batch_id": batch_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "item_id": item_id,
                "item_index": item_index,
                "message": f"Processing item {item_index + 1}",
            }
        }
        await self.broadcast_event(batch_id, event)

    async def emit_item_completed(
        self,
        batch_id: str,
        item_id: str,
        item_index: int,
        success: bool,
        result: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Emit item processing completed event."""
        event = {
            "event_type": "item.completed",
            "batch_id": batch_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "item_id": item_id,
                "item_index": item_index,
                "success": success,
                "result": result,
                "message": f"Item {item_index + 1} {'completed' if success else 'failed'}",
            }
        }
        await self.broadcast_event(batch_id, event)

    async def emit_item_failed(
        self,
        batch_id: str,
        item_id: str,
        item_index: int,
        error: str,
        retry_count: int,
        will_retry: bool,
    ) -> None:
        """Emit item processing failed event."""
        event = {
            "event_type": "item.failed",
            "batch_id": batch_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "item_id": item_id,
                "item_index": item_index,
                "error": error,
                "retry_count": retry_count,
                "will_retry": will_retry,
                "message": f"Item {item_index + 1} failed: {error}",
            }
        }
        await self.broadcast_event(batch_id, event)

    async def emit_batch_progress(
        self,
        batch_id: str,
        progress: float,
        processed_items: int,
        failed_items: int,
        total_items: int,
        estimated_completion: Optional[datetime] = None,
    ) -> None:
        """Emit batch progress update event."""
        event = {
            "event_type": "batch.progress",
            "batch_id": batch_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "progress": progress,
                "processed_items": processed_items,
                "failed_items": failed_items,
                "total_items": total_items,
                "estimated_completion": (
                    estimated_completion.isoformat() if estimated_completion else None
                ),
                "message": f"Progress: {progress:.1f}% ({processed_items}/{total_items})",
            }
        }
        await self.broadcast_event(batch_id, event)

    async def emit_batch_completed(
        self,
        batch_id: str,
        total_processed: int,
        total_failed: int,
        duration_seconds: float,
        results_url: Optional[str] = None,
    ) -> None:
        """Emit batch processing completed event."""
        event = {
            "event_type": "batch.completed",
            "batch_id": batch_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "total_processed": total_processed,
                "total_failed": total_failed,
                "duration_seconds": duration_seconds,
                "results_url": results_url,
                "message": f"Batch completed: {total_processed} successful, {total_failed} failed",
            }
        }
        await self.broadcast_event(batch_id, event)

        # Clear cache and buffer for completed batch
        await self.clear_batch_data(batch_id)

    async def clear_batch_data(self, batch_id: str) -> None:
        """Clear cached data and buffers for a batch."""
        if batch_id in self.progress_cache:
            del self.progress_cache[batch_id]
        if batch_id in self.message_buffer:
            del self.message_buffer[batch_id]

    async def handle_client_message(
        self,
        websocket: WebSocket,
        batch_id: str,
        message: str,
    ) -> None:
        """Handle incoming client messages."""
        try:
            data = json.loads(message)
            command = data.get("type")

            if command == "ping":
                await websocket.send_json({"type": "pong"})

            elif command == "get_status":
                # Send current status from cache
                if batch_id in self.progress_cache:
                    await websocket.send_json(self.progress_cache[batch_id])
                else:
                    await websocket.send_json({
                        "type": "status",
                        "message": "No status available",
                    })

            elif command == "get_buffered":
                # Send any buffered messages
                if batch_id in self.message_buffer:
                    await websocket.send_json({
                        "type": "buffered_messages",
                        "messages": self.message_buffer[batch_id],
                    })

        except json.JSONDecodeError:
            await websocket.send_json({
                "type": "error",
                "message": "Invalid JSON",
            })

    def get_connection_stats(self) -> Dict[str, int]:
        """Get WebSocket connection statistics."""
        return {
            "total_batches": len(self.active_connections),
            "total_connections": sum(
                len(connections) for connections in self.active_connections.values()
            ),
            "batches_with_buffer": len(self.message_buffer),
        }


# Global instance
batch_ws_manager = BatchWebSocketManager()


async def batch_websocket_endpoint(websocket: WebSocket, batch_id: str):
    """WebSocket endpoint for batch processing progress."""
    await batch_ws_manager.connect(websocket, batch_id)

    try:
        while True:
            # Keep connection alive and handle client messages
            data = await websocket.receive_text()
            await batch_ws_manager.handle_client_message(websocket, batch_id, data)

    except WebSocketDisconnect:
        await batch_ws_manager.disconnect(websocket, batch_id)
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        await batch_ws_manager.disconnect(websocket, batch_id)