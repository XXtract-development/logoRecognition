"""
WebSocket endpoints for real-time annotation collaboration.
Provides <100ms latency communication for annotation tools.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from typing import Dict, Any, Optional
import json
import asyncio
import logging
from datetime import datetime

from ..services.annotation_service_advanced import collaborative_service
from ..auth import get_current_user_ws

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ws", tags=["websocket"])


@router.websocket("/annotations/{dataset_id}")
async def annotation_websocket(
    websocket: WebSocket,
    dataset_id: str,
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time annotation collaboration.

    Features:
    - Real-time cursor tracking
    - Live annotation updates
    - Conflict detection and resolution
    - User presence indicators
    - <100ms latency for all operations

    Args:
        websocket: WebSocket connection
        dataset_id: Dataset being annotated
        token: Authentication token
    """
    user_id = None

    try:
        # Authenticate user
        user = await get_current_user_ws(token)
        if not user:
            await websocket.close(code=4001, reason="Unauthorized")
            return

        user_id = user.id

        # Connect to collaborative session
        await collaborative_service.connect_websocket(websocket, dataset_id, user_id)

        logger.info(f"User {user_id} connected to dataset {dataset_id}")

        # Message handling loop
        while True:
            try:
                # Receive message with timeout for keepalive
                message = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=60.0  # 60 second timeout
                )

                # Parse message
                try:
                    data = json.loads(message)
                except json.JSONDecodeError:
                    await websocket.send_json({
                        'type': 'error',
                        'message': 'Invalid JSON format'
                    })
                    continue

                # Handle message based on type
                response = await handle_websocket_message(
                    dataset_id,
                    user_id,
                    data
                )

                # Send response if needed
                if response:
                    await websocket.send_json(response)

            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                await websocket.send_json({'type': 'ping'})

            except WebSocketDisconnect:
                break

            except Exception as e:
                logger.error(f"Error handling message: {e}")
                await websocket.send_json({
                    'type': 'error',
                    'message': str(e)
                })

    except WebSocketDisconnect:
        pass

    except Exception as e:
        logger.error(f"WebSocket error: {e}")

    finally:
        # Disconnect from collaborative session
        if user_id:
            await collaborative_service.disconnect_websocket(
                websocket,
                dataset_id,
                user_id
            )
            logger.info(f"User {user_id} disconnected from dataset {dataset_id}")


async def handle_websocket_message(
    dataset_id: str,
    user_id: str,
    data: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Handle incoming WebSocket message.

    Args:
        dataset_id: Dataset identifier
        user_id: User identifier
        data: Message data

    Returns:
        Response to send back to client
    """
    msg_type = data.get('type')

    if msg_type == 'annotation_create':
        # Handle annotation creation
        from ..models.annotation import BoundingBoxPayload

        annotation_data = data.get('annotation', {})
        annotation = BoundingBoxPayload(**annotation_data)

        result = await collaborative_service.handle_annotation_create(
            dataset_id,
            user_id,
            annotation
        )

        return {
            'type': 'annotation_create_response',
            'request_id': data.get('request_id'),
            **result
        }

    elif msg_type == 'annotation_update':
        # Handle annotation update
        annotation_id = data.get('annotation_id')
        updates = data.get('updates', {})

        result = await collaborative_service.handle_annotation_update(
            dataset_id,
            user_id,
            annotation_id,
            updates
        )

        return {
            'type': 'annotation_update_response',
            'request_id': data.get('request_id'),
            **result
        }

    elif msg_type == 'annotation_delete':
        # Handle annotation deletion
        annotation_id = data.get('annotation_id')

        result = await collaborative_service.handle_annotation_delete(
            dataset_id,
            user_id,
            annotation_id
        )

        return {
            'type': 'annotation_delete_response',
            'request_id': data.get('request_id'),
            **result
        }

    elif msg_type == 'cursor_move':
        # Handle cursor movement
        position = data.get('position', {})

        await collaborative_service.handle_cursor_move(
            dataset_id,
            user_id,
            position
        )

        # No response needed for cursor moves
        return None

    elif msg_type == 'selection_change':
        # Handle selection change
        selected_ids = data.get('selected_ids', [])

        await collaborative_service.handle_selection_change(
            dataset_id,
            user_id,
            selected_ids
        )

        return None

    elif msg_type == 'undo':
        # Handle undo request
        annotation_id = data.get('annotation_id')

        result = await collaborative_service.undo_annotation_action(
            dataset_id,
            user_id,
            annotation_id
        )

        return {
            'type': 'undo_response',
            'request_id': data.get('request_id'),
            **result
        }

    elif msg_type == 'get_history':
        # Get annotation history
        annotation_id = data.get('annotation_id')
        limit = data.get('limit', 50)

        history = await collaborative_service.get_annotation_history(
            annotation_id,
            limit
        )

        return {
            'type': 'history_response',
            'request_id': data.get('request_id'),
            'annotation_id': annotation_id,
            'history': history
        }

    elif msg_type == 'pong':
        # Handle pong response for keepalive
        return None

    else:
        return {
            'type': 'error',
            'message': f'Unknown message type: {msg_type}'
        }


@router.websocket("/annotations/{dataset_id}/monitor")
async def annotation_monitor_websocket(
    websocket: WebSocket,
    dataset_id: str,
    token: str = Query(...),
):
    """
    Monitor-only WebSocket for viewing annotation activity.

    This endpoint allows users to watch annotation activity
    without participating (useful for supervisors/reviewers).

    Args:
        websocket: WebSocket connection
        dataset_id: Dataset to monitor
        token: Authentication token
    """
    try:
        # Authenticate user
        user = await get_current_user_ws(token)
        if not user:
            await websocket.close(code=4001, reason="Unauthorized")
            return

        await websocket.accept()

        # Add to monitor sessions
        collaborative_service.active_sessions[f"monitor_{dataset_id}"].add(websocket)

        # Send initial state
        annotations = await collaborative_service._get_dataset_annotations(dataset_id)
        await websocket.send_json({
            'type': 'monitor_init',
            'annotations': annotations,
            'timestamp': datetime.now().isoformat()
        })

        # Keep connection alive
        while True:
            try:
                # Wait for disconnect or timeout
                await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=60.0
                )
            except asyncio.TimeoutError:
                # Send ping
                await websocket.send_json({'type': 'ping'})
            except WebSocketDisconnect:
                break

    except Exception as e:
        logger.error(f"Monitor WebSocket error: {e}")

    finally:
        # Clean up
        collaborative_service.active_sessions[f"monitor_{dataset_id}"].discard(websocket)