"""
WebSocket manager for real-time detection updates.
"""

from typing import Dict, List, Optional, Any
from fastapi import WebSocket, WebSocketDisconnect
import json
import logging
import asyncio
from datetime import datetime

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections for real-time detection updates.

    This manager handles multiple client connections and broadcasts
    detection progress updates to subscribed clients.
    """

    def __init__(self):
        """
        Initialize the connection manager.
        """
        # Store active connections by upload_id
        self.active_connections: Dict[str, List[WebSocket]] = {}

        # Store connections by client_id for management
        self.client_connections: Dict[str, WebSocket] = {}

        # Track connection metadata
        self.connection_metadata: Dict[str, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, client_id: str,
                     upload_id: Optional[str] = None) -> None:
        """
        Accept and register a new WebSocket connection.

        Args:
            websocket: The WebSocket connection.
            client_id: Unique identifier for the client.
            upload_id: Optional upload ID to subscribe to.
        """
        await websocket.accept()

        # Store client connection
        self.client_connections[client_id] = websocket

        # Store metadata
        self.connection_metadata[client_id] = {
            "connected_at": datetime.utcnow().isoformat(),
            "upload_id": upload_id,
            "message_count": 0
        }

        # Subscribe to upload if specified
        if upload_id:
            await self.subscribe_to_upload(client_id, upload_id)

        # Send welcome message
        await self.send_personal_message(
            client_id,
            {
                "type": "connected",
                "clientId": client_id,
                "uploadId": upload_id,
                "message": "Connected to detection updates"
            }
        )

        logger.info(f"Client {client_id} connected, subscribed to {upload_id}")

    async def disconnect(self, client_id: str) -> None:
        """
        Remove a WebSocket connection.

        Args:
            client_id: Client identifier to disconnect.
        """
        if client_id in self.client_connections:
            # Remove from upload subscriptions
            metadata = self.connection_metadata.get(client_id, {})
            upload_id = metadata.get("upload_id")

            if upload_id and upload_id in self.active_connections:
                websocket = self.client_connections[client_id]
                if websocket in self.active_connections[upload_id]:
                    self.active_connections[upload_id].remove(websocket)

                # Clean up empty upload lists
                if not self.active_connections[upload_id]:
                    del self.active_connections[upload_id]

            # Remove client connection
            del self.client_connections[client_id]

            # Remove metadata
            if client_id in self.connection_metadata:
                del self.connection_metadata[client_id]

            logger.info(f"Client {client_id} disconnected")

    async def subscribe_to_upload(self, client_id: str, upload_id: str) -> None:
        """
        Subscribe a client to updates for a specific upload.

        Args:
            client_id: Client identifier.
            upload_id: Upload ID to subscribe to.
        """
        if client_id not in self.client_connections:
            logger.warning(f"Client {client_id} not connected")
            return

        websocket = self.client_connections[client_id]

        # Add to upload subscription list
        if upload_id not in self.active_connections:
            self.active_connections[upload_id] = []

        if websocket not in self.active_connections[upload_id]:
            self.active_connections[upload_id].append(websocket)

        # Update metadata
        if client_id in self.connection_metadata:
            self.connection_metadata[client_id]["upload_id"] = upload_id

        # Send subscription confirmation
        await self.send_personal_message(
            client_id,
            {
                "type": "subscribed",
                "uploadId": upload_id,
                "message": f"Subscribed to updates for {upload_id}"
            }
        )

        logger.info(f"Client {client_id} subscribed to {upload_id}")

    async def unsubscribe_from_upload(self, client_id: str, upload_id: str) -> None:
        """
        Unsubscribe a client from upload updates.

        Args:
            client_id: Client identifier.
            upload_id: Upload ID to unsubscribe from.
        """
        if client_id not in self.client_connections:
            return

        websocket = self.client_connections[client_id]

        if upload_id in self.active_connections:
            if websocket in self.active_connections[upload_id]:
                self.active_connections[upload_id].remove(websocket)

            # Clean up empty lists
            if not self.active_connections[upload_id]:
                del self.active_connections[upload_id]

        # Update metadata
        if client_id in self.connection_metadata:
            self.connection_metadata[client_id]["upload_id"] = None

        logger.info(f"Client {client_id} unsubscribed from {upload_id}")

    async def send_personal_message(self, client_id: str, message: Dict[str, Any]) -> None:
        """
        Send a message to a specific client.

        Args:
            client_id: Client identifier.
            message: Message dictionary to send.
        """
        if client_id in self.client_connections:
            websocket = self.client_connections[client_id]
            try:
                await websocket.send_json(message)

                # Update message count
                if client_id in self.connection_metadata:
                    self.connection_metadata[client_id]["message_count"] += 1

            except Exception as e:
                logger.error(f"Error sending message to {client_id}: {e}")
                await self.disconnect(client_id)

    async def broadcast_to_upload(self, upload_id: str, message: Dict[str, Any]) -> None:
        """
        Broadcast a message to all clients subscribed to an upload.

        Args:
            upload_id: Upload ID to broadcast to.
            message: Message dictionary to broadcast.
        """
        if upload_id not in self.active_connections:
            return

        # Send to all subscribed connections
        disconnected = []
        for websocket in self.active_connections[upload_id]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to websocket: {e}")
                disconnected.append(websocket)

        # Remove disconnected websockets
        for websocket in disconnected:
            self.active_connections[upload_id].remove(websocket)

        # Clean up empty lists
        if not self.active_connections[upload_id]:
            del self.active_connections[upload_id]

        logger.debug(f"Broadcast to {upload_id}: {message['type']}")

    async def send_detection_progress(self, upload_id: str, stage: str,
                                     progress: int, estimated_time: Optional[int] = None) -> None:
        """
        Send detection progress update.

        Args:
            upload_id: Upload ID being processed.
            stage: Current processing stage.
            progress: Progress percentage (0-100).
            estimated_time: Estimated time remaining in milliseconds.
        """
        message = {
            "type": "progress",
            "uploadId": upload_id,
            "stage": stage,
            "progress": progress,
            "timestamp": datetime.utcnow().isoformat()
        }

        if estimated_time is not None:
            message["estimatedTimeRemaining"] = estimated_time

        await self.broadcast_to_upload(upload_id, message)

    async def send_detection_complete(self, upload_id: str,
                                     detection_id: str,
                                     num_detections: int) -> None:
        """
        Send detection completion notification.

        Args:
            upload_id: Upload ID that was processed.
            detection_id: Detection job ID.
            num_detections: Number of logos detected.
        """
        message = {
            "type": "complete",
            "uploadId": upload_id,
            "detectionId": detection_id,
            "numDetections": num_detections,
            "message": f"Detection complete: {num_detections} logos found",
            "timestamp": datetime.utcnow().isoformat()
        }

        await self.broadcast_to_upload(upload_id, message)

    async def send_detection_error(self, upload_id: str, error: str) -> None:
        """
        Send detection error notification.

        Args:
            upload_id: Upload ID that failed.
            error: Error message.
        """
        message = {
            "type": "error",
            "uploadId": upload_id,
            "error": error,
            "timestamp": datetime.utcnow().isoformat()
        }

        await self.broadcast_to_upload(upload_id, message)

    def get_connection_stats(self) -> Dict[str, Any]:
        """
        Get statistics about current connections.

        Returns:
            Dictionary with connection statistics.
        """
        total_clients = len(self.client_connections)
        total_subscriptions = sum(len(connections)
                                 for connections in self.active_connections.values())

        upload_stats = {
            upload_id: len(connections)
            for upload_id, connections in self.active_connections.items()
        }

        return {
            "totalClients": total_clients,
            "totalSubscriptions": total_subscriptions,
            "uploadsBeingWatched": len(self.active_connections),
            "uploadStats": upload_stats,
            "connectionMetadata": self.connection_metadata
        }


# Global WebSocket manager instance
websocket_manager = ConnectionManager()