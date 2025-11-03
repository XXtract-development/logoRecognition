"""
WebSocket API endpoints for real-time detection updates.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Optional
import uuid
import logging
import json

from ..websocket_manager import websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/detection/{client_id}")
async def websocket_detection_endpoint(
    websocket: WebSocket,
    client_id: str,
    upload_id: Optional[str] = Query(None)
):
    """
    WebSocket endpoint for real-time detection updates.

    Args:
        websocket: WebSocket connection.
        client_id: Unique client identifier.
        upload_id: Optional upload ID to subscribe to immediately.

    The WebSocket protocol:
    - Connect: Establishes connection and optionally subscribes to an upload
    - Messages from client:
        - {"action": "subscribe", "uploadId": "uuid"}
        - {"action": "unsubscribe", "uploadId": "uuid"}
        - {"action": "ping"}
    - Messages to client:
        - {"type": "connected", "clientId": "...", "message": "..."}
        - {"type": "progress", "stage": "...", "progress": 50, ...}
        - {"type": "complete", "detectionId": "...", "numDetections": 3, ...}
        - {"type": "error", "error": "...", ...}
        - {"type": "pong"}
    """
    await websocket_manager.connect(websocket, client_id, upload_id)

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
                action = message.get("action")

                if action == "subscribe":
                    upload_id = message.get("uploadId")
                    if upload_id:
                        await websocket_manager.subscribe_to_upload(client_id, upload_id)
                        logger.info(f"Client {client_id} subscribed to {upload_id}")

                elif action == "unsubscribe":
                    upload_id = message.get("uploadId")
                    if upload_id:
                        await websocket_manager.unsubscribe_from_upload(client_id, upload_id)
                        logger.info(f"Client {client_id} unsubscribed from {upload_id}")

                elif action == "ping":
                    await websocket_manager.send_personal_message(
                        client_id,
                        {"type": "pong", "timestamp": message.get("timestamp")}
                    )

                else:
                    await websocket_manager.send_personal_message(
                        client_id,
                        {
                            "type": "error",
                            "error": f"Unknown action: {action}",
                            "message": "Supported actions: subscribe, unsubscribe, ping"
                        }
                    )

            except json.JSONDecodeError:
                await websocket_manager.send_personal_message(
                    client_id,
                    {
                        "type": "error",
                        "error": "Invalid JSON",
                        "message": "Message must be valid JSON"
                    }
                )
            except Exception as e:
                logger.error(f"Error processing message from {client_id}: {e}")
                await websocket_manager.send_personal_message(
                    client_id,
                    {
                        "type": "error",
                        "error": "Processing error",
                        "message": str(e)
                    }
                )

    except WebSocketDisconnect:
        await websocket_manager.disconnect(client_id)
        logger.info(f"Client {client_id} disconnected")
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
        await websocket_manager.disconnect(client_id)


@router.websocket("/ws/detection/status/{upload_id}")
async def websocket_upload_status(
    websocket: WebSocket,
    upload_id: str
):
    """
    Simplified WebSocket endpoint for monitoring a specific upload.

    Args:
        websocket: WebSocket connection.
        upload_id: Upload ID to monitor.

    This endpoint automatically subscribes to the specified upload
    and only receives updates for that upload.
    """
    client_id = str(uuid.uuid4())
    await websocket_manager.connect(websocket, client_id, upload_id)

    try:
        while True:
            # Just keep the connection alive, all updates are pushed
            data = await websocket.receive_text()

            # Handle ping/pong for keep-alive
            if data == "ping":
                await websocket.send_text("pong")

    except WebSocketDisconnect:
        await websocket_manager.disconnect(client_id)
        logger.info(f"Upload monitor {client_id} disconnected from {upload_id}")
    except Exception as e:
        logger.error(f"WebSocket error for upload monitor {client_id}: {e}")
        await websocket_manager.disconnect(client_id)


@router.get("/api/v1/websocket/stats")
async def get_websocket_stats():
    """
    Get WebSocket connection statistics.

    Returns:
        Statistics about active WebSocket connections.
    """
    return websocket_manager.get_connection_stats()