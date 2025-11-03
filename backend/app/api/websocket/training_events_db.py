"""WebSocket event handling with DATABASE integration.

US-INT-005: WebSocket Database Events
This module connects WebSocket to actual database changes for real-time updates.

Key Features:
- Receives database change notifications
- Broadcasts to connected clients
- Reconnection with database state
- Multiple client support
- Authentication and scaling
"""

import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.training import TrainingJob

logger = logging.getLogger(__name__)


class TrainingWebSocketManager:
    """
    WebSocket manager with DATABASE integration.

    Acceptance Criteria Coverage:
    - AC1: WebSocket Receives Database Change Events
    - AC2: Real-time Progress Events During Training
    - AC3: Multiple Client Broadcast
    - AC4: Reconnection with Database State
    - AC5: WebSocket Integration in Service Layer
    """

    def __init__(self):
        """Initialize WebSocket manager."""
        # Map: job_id → list of WebSocket connections
        self.connections: Dict[str, List[WebSocket]] = {}

        # Cache for last broadcast (reconnection recovery)
        self.last_broadcast: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket, job_id: str):
        """
        Accept WebSocket connection and send current state from DATABASE (AC4).

        Args:
            websocket: WebSocket connection
            job_id: Training job UUID
        """
        await websocket.accept()
        logger.info(f"WebSocket connected for job {job_id}")

        # AC4: Load current state from DATABASE (not cache)
        db = next(get_db())
        try:
            job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()

            if job:
                # Send current state
                progress_pct = 0
                if job.total_epochs and job.current_epoch:
                    progress_pct = int((job.current_epoch / job.total_epochs) * 100)

                await websocket.send_json({
                    "event": "reconnection.success",
                    "job_id": job_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": {
                        "status": job.status,
                        "current_epoch": job.current_epoch,
                        "total_epochs": job.total_epochs,
                        "metrics": job.metrics or {},
                        "resources": job.resources or {},
                        "progress_pct": progress_pct,
                        "eta_seconds": job.eta_seconds
                    }
                })
                logger.info(f"Sent current state from DATABASE to client for job {job_id}")
            else:
                logger.warning(f"Job {job_id} not found in database")

        except Exception as e:
            logger.error(f"Error loading job state from database: {e}")
        finally:
            db.close()

        # Register connection for future updates
        if job_id not in self.connections:
            self.connections[job_id] = []
        self.connections[job_id].append(websocket)

    async def disconnect(self, websocket: WebSocket, job_id: str):
        """
        Remove WebSocket connection.

        Args:
            websocket: WebSocket to disconnect
            job_id: Training job UUID
        """
        if job_id in self.connections:
            if websocket in self.connections[job_id]:
                self.connections[job_id].remove(websocket)
                logger.info(f"WebSocket disconnected for job {job_id}")

            # Clean up empty lists
            if not self.connections[job_id]:
                del self.connections[job_id]

    async def emit_training_started(self, job_id: str, data: Dict[str, Any]):
        """
        Emit training started event from DATABASE update (AC5).

        Called by TrainingJobService.start_job() AFTER database commit.

        Args:
            job_id: Training job UUID
            data: Event data from database
        """
        event = {
            "event": "training.started",
            "job_id": job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data
        }

        await self._broadcast(job_id, event)

    async def emit_progress_from_db(
        self,
        job_id: str,
        epoch: Optional[int],
        total_epochs: Optional[int],
        metrics: Optional[Dict],
        resources: Optional[Dict],
        eta_seconds: Optional[int] = None,
        phase: str = "training"
    ):
        """
        Emit progress update from DATABASE changes (AC1, AC2).

        Called by TrainingJobService.update_progress() AFTER database commit.

        Args:
            job_id: Training job UUID
            epoch: Current epoch from database
            total_epochs: Total epochs from database
            metrics: Latest metrics from database
            resources: Resource usage from database
            eta_seconds: Estimated time remaining
            phase: Training phase
        """
        if not total_epochs:
            total_epochs = 100  # Default if not set

        progress_pct = int((epoch / total_epochs) * 100) if epoch else 0

        event = {
            "event": "training.epoch",
            "job_id": job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "epoch": epoch,
                "total_epochs": total_epochs,
                "metrics": metrics or {},
                "resources": resources or {},
                "phase": phase,
                "progress_pct": progress_pct,
                "eta_seconds": eta_seconds
            }
        }

        await self._broadcast(job_id, event)

    async def emit_training_completed(self, job_id: str, data: Dict[str, Any]):
        """
        Emit training completed event from DATABASE update (AC5).

        Called by TrainingJobService.complete_job() AFTER database commit.

        Args:
            job_id: Training job UUID
            data: Completion data from database
        """
        event = {
            "event": "training.completed",
            "job_id": job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data
        }

        await self._broadcast(job_id, event)

    async def emit_training_failed(self, job_id: str, error: str):
        """
        Emit training failed event from DATABASE update (AC5).

        Called by TrainingJobService.fail_job() AFTER database commit.

        Args:
            job_id: Training job UUID
            error: Error message from database
        """
        event = {
            "event": "training.failed",
            "job_id": job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {"error": error}
        }

        await self._broadcast(job_id, event)

    async def _broadcast(self, job_id: str, event: Dict[str, Any]):
        """
        Broadcast event to all connected clients for job_id (AC3).

        Args:
            job_id: Training job UUID
            event: Event data to broadcast
        """
        if job_id not in self.connections:
            logger.debug(f"No connections for job {job_id}")
            return

        # Cache for reconnection recovery
        self.last_broadcast[job_id] = event

        # AC3: Broadcast to all clients concurrently
        failed_connections = []

        for websocket in self.connections[job_id]:
            try:
                await websocket.send_json(event)
                logger.debug(f"Broadcasted {event['event']} to client for job {job_id}")
            except Exception as e:
                logger.error(f"Failed to send to WebSocket: {e}")
                failed_connections.append(websocket)

        # AC3: Remove failed connections
        for ws in failed_connections:
            if ws in self.connections[job_id]:
                self.connections[job_id].remove(ws)

        active_count = len(self.connections[job_id])
        logger.info(f"Broadcasted {event['event']} to {active_count} clients for job {job_id}")


# Global singleton
training_ws_manager = TrainingWebSocketManager()


async def training_websocket_endpoint(websocket: WebSocket, job_id: str, token: str):
    """
    WebSocket endpoint for training progress updates with authentication.

    US-INT-005 AC7: JWT authentication and authorization required.

    Args:
        websocket: WebSocket connection
        job_id: Training job UUID
        token: JWT access token (query parameter)

    Security:
        - Validates JWT token
        - Verifies user owns the training job
        - Implements rate limiting (basic connection limit)
    """
    from app.middleware.jwt_auth import decode_access_token
    from app.models.training import TrainingJob
    from app.core.database import get_db
    from sqlalchemy.orm import Session
    from uuid import UUID

    # AC7.1: JWT authentication
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=1008, reason="Invalid token")
            return
    except Exception as e:
        logger.error(f"WebSocket auth failed: {e}")
        await websocket.close(code=1008, reason="Authentication failed")
        return

    # AC7.2: Authorization - verify user owns the job
    try:
        db: Session = next(get_db())
        job = db.query(TrainingJob).filter(TrainingJob.id == UUID(job_id)).first()
        if not job:
            await websocket.close(code=1008, reason="Job not found")
            return
        if job.created_by and job.created_by != user_id:
            logger.warning(f"User {user_id} attempted to access job {job_id} owned by {job.created_by}")
            await websocket.close(code=1008, reason="Unauthorized")
            return
    except Exception as e:
        logger.error(f"Authorization check failed: {e}")
        await websocket.close(code=1008, reason="Authorization failed")
        return
    finally:
        db.close()

    # AC7.4: Connection limit (basic check - 1000 max)
    if len(training_ws_manager.active_connections) >= 1000:
        await websocket.close(code=1008, reason="Server at capacity")
        return

    await training_ws_manager.connect(websocket, job_id)

    # AC6: Database polling fallback (every 2 seconds)
    import asyncio
    last_poll_time = asyncio.get_event_loop().time()
    POLL_INTERVAL = 2.0  # seconds

    try:
        # Keep connection alive and receive pings
        while True:
            try:
                # Wait for client messages with timeout for polling
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=POLL_INTERVAL
                )

                # AC7.5: Handle ping/pong heartbeat
                if data == "ping":
                    await websocket.send_text("pong")

            except asyncio.TimeoutError:
                # AC6: Poll database for updates if no real-time events received
                current_time = asyncio.get_event_loop().time()
                if current_time - last_poll_time >= POLL_INTERVAL:
                    try:
                        db: Session = next(get_db())
                        job = db.query(TrainingJob).filter(TrainingJob.id == UUID(job_id)).first()
                        if job:
                            # Send current state to client
                            state = {
                                "type": "status_update",
                                "status": job.status,
                                "current_epoch": job.current_epoch,
                                "total_epochs": job.total_epochs,
                                "metrics": job.metrics,
                                "eta_seconds": job.eta_seconds
                            }
                            await websocket.send_json(state)
                        last_poll_time = current_time
                    except Exception as e:
                        logger.error(f"Database polling failed: {e}")
                    finally:
                        db.close()

    except WebSocketDisconnect:
        logger.info(f"Client disconnected from job {job_id}")
    finally:
        await training_ws_manager.disconnect(websocket, job_id)
