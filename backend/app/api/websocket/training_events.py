"""WebSocket event handling for training progress."""

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

logger = logging.getLogger(__name__)


class TrainingWebSocketManager:
    """Manager for training progress WebSocket connections."""

    def __init__(self):
        """Initialize WebSocket manager."""
        # Map of job_id to set of websocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Map of job_id to latest progress data
        self.progress_cache: Dict[str, Dict[str, Any]] = {}
        # Lock for thread-safe operations
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, job_id: str) -> None:
        """Accept and register WebSocket connection."""
        await websocket.accept()

        async with self.lock:
            if job_id not in self.active_connections:
                self.active_connections[job_id] = set()
            self.active_connections[job_id].add(websocket)

        logger.info(f"WebSocket connected for training job {job_id}")

        # Send cached progress if available
        if job_id in self.progress_cache:
            await self.send_to_client(websocket, self.progress_cache[job_id])

    async def disconnect(self, websocket: WebSocket, job_id: str) -> None:
        """Remove WebSocket connection."""
        async with self.lock:
            if job_id in self.active_connections:
                self.active_connections[job_id].discard(websocket)
                if not self.active_connections[job_id]:
                    del self.active_connections[job_id]

        logger.info(f"WebSocket disconnected for training job {job_id}")

    async def send_to_client(self, websocket: WebSocket, data: Dict[str, Any]) -> None:
        """Send data to specific WebSocket client."""
        try:
            if websocket.application_state == WebSocketState.CONNECTED:
                await websocket.send_json(data)
        except Exception as e:
            logger.error(f"Error sending to WebSocket: {str(e)}")

    async def broadcast_progress(self, job_id: str, progress: Dict[str, Any]) -> None:
        """Broadcast progress to all connected clients for a job."""
        # Cache progress
        self.progress_cache[job_id] = progress

        # Get connections for this job
        connections = self.active_connections.get(job_id, set()).copy()

        # Send to all connected clients
        disconnected = set()
        for websocket in connections:
            try:
                await self.send_to_client(websocket, progress)
            except WebSocketDisconnect:
                disconnected.add(websocket)
            except Exception as e:
                logger.error(f"Error broadcasting to WebSocket: {str(e)}")
                disconnected.add(websocket)

        # Remove disconnected clients
        if disconnected:
            async with self.lock:
                if job_id in self.active_connections:
                    self.active_connections[job_id] -= disconnected

    async def emit_training_started(self, job_id: str, config: Dict[str, Any]) -> None:
        """Emit training started event."""
        event = {
            "event": "training.started",
            "job_id": job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "status": "started",
                "config": config,
                "message": "Training has started",
            }
        }
        await self.broadcast_progress(job_id, event)

    async def emit_epoch_progress(
        self,
        job_id: str,
        epoch: int,
        total_epochs: int,
        metrics: Dict[str, float],
    ) -> None:
        """Emit epoch progress event."""
        event = {
            "event": "training.epoch",
            "job_id": job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "epoch": epoch,
                "total_epochs": total_epochs,
                "progress": (epoch / total_epochs) * 100,
                "metrics": metrics,
                "message": f"Epoch {epoch}/{total_epochs} completed",
            }
        }
        await self.broadcast_progress(job_id, event)

    async def emit_metrics_update(
        self,
        job_id: str,
        metrics: Dict[str, float],
    ) -> None:
        """Emit metrics update event."""
        event = {
            "event": "training.metrics",
            "job_id": job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "metrics": metrics,
                "message": f"Loss: {metrics.get('loss', 0):.4f}, Accuracy: {metrics.get('accuracy', 0):.2%}",
            }
        }
        await self.broadcast_progress(job_id, event)

    async def emit_training_completed(
        self,
        job_id: str,
        final_metrics: Dict[str, Any],
        model_path: str,
    ) -> None:
        """Emit training completed event."""
        event = {
            "event": "training.completed",
            "job_id": job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "status": "completed",
                "final_metrics": final_metrics,
                "model_path": model_path,
                "message": "Training completed successfully",
            }
        }
        await self.broadcast_progress(job_id, event)

        # Clear cache after completion
        await self.clear_job_cache(job_id)

    async def emit_training_failed(
        self,
        job_id: str,
        error: str,
        traceback: Optional[str] = None,
    ) -> None:
        """Emit training failed event."""
        event = {
            "event": "training.failed",
            "job_id": job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "status": "failed",
                "error": error,
                "traceback": traceback,
                "message": f"Training failed: {error}",
            }
        }
        await self.broadcast_progress(job_id, event)

        # Clear cache after failure
        await self.clear_job_cache(job_id)

    async def clear_job_cache(self, job_id: str) -> None:
        """Clear cached data for a job."""
        if job_id in self.progress_cache:
            del self.progress_cache[job_id]

    async def handle_reconnection(self, websocket: WebSocket, job_id: str) -> None:
        """Handle WebSocket reconnection with message buffering."""
        # Check if there's cached progress
        if job_id in self.progress_cache:
            # Send buffered messages
            await self.send_to_client(websocket, {
                "event": "reconnection.success",
                "data": {
                    "cached_progress": self.progress_cache[job_id],
                    "message": "Reconnected successfully with cached progress",
                }
            })

    def get_active_jobs(self) -> list:
        """Get list of jobs with active WebSocket connections."""
        return list(self.active_connections.keys())

    def get_connection_count(self, job_id: str) -> int:
        """Get number of active connections for a job."""
        return len(self.active_connections.get(job_id, set()))


# Global instance
training_ws_manager = TrainingWebSocketManager()


async def training_websocket_endpoint(websocket: WebSocket, job_id: str):
    """WebSocket endpoint for training progress."""
    await training_ws_manager.connect(websocket, job_id)

    try:
        while True:
            # Keep connection alive and handle client messages
            data = await websocket.receive_text()

            # Handle client commands
            try:
                command = json.loads(data)

                if command.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})

                elif command.get("type") == "get_status":
                    if job_id in training_ws_manager.progress_cache:
                        await websocket.send_json(training_ws_manager.progress_cache[job_id])

            except json.JSONDecodeError:
                await websocket.send_json({
                    "error": "Invalid JSON",
                    "message": "Command must be valid JSON",
                })

    except WebSocketDisconnect:
        await training_ws_manager.disconnect(websocket, job_id)
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        await training_ws_manager.disconnect(websocket, job_id)