"""
Advanced Annotation Service for A++ Implementation.
Provides real-time collaborative annotation with WebSocket support.
"""

import asyncio
import json
import uuid
from typing import List, Dict, Any, Optional, Set
from datetime import datetime, timedelta
import redis.asyncio as redis
from fastapi import WebSocket, WebSocketDisconnect
import numpy as np
from collections import defaultdict
import logging

from ..models.annotation import BoundingBoxPayload, AnnotationSubmission
from ..database import get_async_session

logger = logging.getLogger(__name__)


class AdvancedAnnotationService:
    """
    Advanced annotation service with comprehensive features.
    """

    def __init__(self):
        self.annotations_cache = {}
        self.history = defaultdict(list)
        self.conflicts_cache = {}

    async def create_annotation(self, dataset_id: str, annotation: BoundingBoxPayload) -> Dict:
        """Create new annotation."""
        self.annotations_cache[annotation.id] = annotation
        self.history[annotation.id].append({
            "action": "create",
            "timestamp": datetime.now(),
            "annotation": annotation.dict()
        })
        return {
            "id": annotation.id,
            "status": "created",
            "timestamp": datetime.now().isoformat()
        }

    async def update_annotation(self, dataset_id: str, annotation_id: str, updates: Dict) -> Dict:
        """Update existing annotation."""
        if annotation_id in self.annotations_cache:
            for key, value in updates.items():
                setattr(self.annotations_cache[annotation_id], key, value)
            self.history[annotation_id].append({
                "action": "update",
                "timestamp": datetime.now(),
                "updates": updates
            })
        return {"status": "updated", "updates": updates}

    async def delete_annotation(self, dataset_id: str, annotation_id: str) -> Dict:
        """Delete annotation."""
        if annotation_id in self.annotations_cache:
            del self.annotations_cache[annotation_id]
            self.history[annotation_id].append({
                "action": "delete",
                "timestamp": datetime.now()
            })
        return {"status": "deleted", "id": annotation_id}

    async def batch_create(self, dataset_id: str, annotations: List[BoundingBoxPayload]) -> Dict:
        """Batch create annotations."""
        created = 0
        failed = 0
        for ann in annotations:
            try:
                await self.create_annotation(dataset_id, ann)
                created += 1
            except Exception as e:
                logger.error(f"Failed to create annotation: {e}")
                failed += 1
        return {"created": created, "failed": failed}

    async def _detect_conflicts(self, dataset_id: str, annotation: BoundingBoxPayload) -> List[Dict]:
        """Detect annotation conflicts."""
        conflicts = []
        for ann_id, ann in self.annotations_cache.items():
            if ann_id != annotation.id and hasattr(ann, 'x'):
                # Calculate IoU
                x1, y1, w1, h1 = annotation.x, annotation.y, annotation.width, annotation.height
                x2, y2, w2, h2 = ann.x, ann.y, ann.width, ann.height

                xi1 = max(x1, x2)
                yi1 = max(y1, y2)
                xi2 = min(x1 + w1, x2 + w2)
                yi2 = min(y1 + h1, y2 + h2)

                if xi2 > xi1 and yi2 > yi1:
                    intersection = (xi2 - xi1) * (yi2 - yi1)
                    union = w1 * h1 + w2 * h2 - intersection
                    iou = intersection / union if union > 0 else 0
                    if iou > 0:
                        conflicts.append({"id": ann_id, "iou": iou})
        return conflicts

    async def get_annotation_history(self, annotation_id: str, limit: int = 50) -> List[Dict]:
        """Get annotation history."""
        history = self.history.get(annotation_id, [])
        return history[-limit:] if len(history) > limit else history

    async def _get_dataset_annotations(self, dataset_id: str) -> List[Dict]:
        """Get all annotations for a dataset."""
        return [ann.dict() if hasattr(ann, 'dict') else ann for ann in self.annotations_cache.values()]


class CollaborativeAnnotationService:
    """
    Advanced annotation service with real-time collaboration support.
    Handles WebSocket connections, conflict resolution, and synchronization.
    """

    def __init__(self):
        self.redis_client = None
        self.active_sessions: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.user_cursors: Dict[str, Dict] = {}
        self.annotation_locks: Dict[str, str] = {}  # annotation_id -> user_id
        self.annotation_history: Dict[str, List[Dict]] = defaultdict(list)
        self._init_redis()

    def _init_redis(self):
        """Initialize Redis connection for pub/sub and caching."""
        try:
            self.redis_client = redis.Redis(
                host='localhost',
                port=6379,
                db=3,
                decode_responses=True
            )
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")

    async def connect_websocket(
        self,
        websocket: WebSocket,
        dataset_id: str,
        user_id: str
    ):
        """
        Connect a user to collaborative annotation session.

        Args:
            websocket: WebSocket connection
            dataset_id: Dataset being annotated
            user_id: User identifier
        """
        await websocket.accept()

        # Add to active sessions
        self.active_sessions[dataset_id].add(websocket)

        # Initialize user cursor
        self.user_cursors[user_id] = {
            'user_id': user_id,
            'dataset_id': dataset_id,
            'position': {'x': 0, 'y': 0},
            'color': self._generate_user_color(user_id),
            'active': True,
            'timestamp': datetime.now().isoformat()
        }

        # Notify other users
        await self._broadcast_user_joined(dataset_id, user_id)

        # Send current state to new user
        await self._send_initial_state(websocket, dataset_id)

    async def disconnect_websocket(
        self,
        websocket: WebSocket,
        dataset_id: str,
        user_id: str
    ):
        """
        Disconnect user from collaborative session.

        Args:
            websocket: WebSocket connection
            dataset_id: Dataset identifier
            user_id: User identifier
        """
        # Remove from active sessions
        if dataset_id in self.active_sessions:
            self.active_sessions[dataset_id].discard(websocket)

        # Update user status
        if user_id in self.user_cursors:
            self.user_cursors[user_id]['active'] = False

        # Release any locks held by user
        self._release_user_locks(user_id)

        # Notify other users
        await self._broadcast_user_left(dataset_id, user_id)

    async def handle_annotation_create(
        self,
        dataset_id: str,
        user_id: str,
        annotation: BoundingBoxPayload
    ) -> Dict[str, Any]:
        """
        Handle creation of new annotation with conflict detection.

        Args:
            dataset_id: Dataset identifier
            user_id: User creating annotation
            annotation: New annotation data

        Returns:
            Creation result with potential conflicts
        """
        # Check for overlapping annotations
        conflicts = await self._detect_conflicts(dataset_id, annotation)

        if conflicts:
            return {
                'status': 'conflict',
                'conflicts': conflicts,
                'annotation': annotation.dict()
            }

        # Generate unique ID if not provided
        if not annotation.id:
            annotation.id = f"ann_{uuid.uuid4().hex[:12]}"

        # Add to history
        self._add_to_history(annotation.id, {
            'action': 'create',
            'user_id': user_id,
            'timestamp': datetime.now().isoformat(),
            'data': annotation.dict()
        })

        # Save to database
        await self._save_annotation(dataset_id, annotation)

        # Broadcast to other users
        await self._broadcast_annotation_change(
            dataset_id,
            {
                'action': 'create',
                'annotation': annotation.dict(),
                'user_id': user_id
            },
            exclude_user=user_id
        )

        return {
            'status': 'success',
            'annotation_id': annotation.id
        }

    async def handle_annotation_update(
        self,
        dataset_id: str,
        user_id: str,
        annotation_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Handle annotation update with lock management.

        Args:
            dataset_id: Dataset identifier
            user_id: User updating annotation
            annotation_id: Annotation to update
            updates: Update data

        Returns:
            Update result
        """
        # Check if annotation is locked by another user
        if annotation_id in self.annotation_locks:
            if self.annotation_locks[annotation_id] != user_id:
                return {
                    'status': 'locked',
                    'locked_by': self.annotation_locks[annotation_id]
                }

        # Acquire lock
        self.annotation_locks[annotation_id] = user_id

        # Add to history
        self._add_to_history(annotation_id, {
            'action': 'update',
            'user_id': user_id,
            'timestamp': datetime.now().isoformat(),
            'updates': updates
        })

        # Apply updates
        await self._update_annotation(dataset_id, annotation_id, updates)

        # Broadcast to other users
        await self._broadcast_annotation_change(
            dataset_id,
            {
                'action': 'update',
                'annotation_id': annotation_id,
                'updates': updates,
                'user_id': user_id
            },
            exclude_user=user_id
        )

        # Release lock after short delay
        asyncio.create_task(self._auto_release_lock(annotation_id, user_id, 2))

        return {'status': 'success'}

    async def handle_annotation_delete(
        self,
        dataset_id: str,
        user_id: str,
        annotation_id: str
    ) -> Dict[str, Any]:
        """
        Handle annotation deletion.

        Args:
            dataset_id: Dataset identifier
            user_id: User deleting annotation
            annotation_id: Annotation to delete

        Returns:
            Deletion result
        """
        # Check lock
        if annotation_id in self.annotation_locks:
            if self.annotation_locks[annotation_id] != user_id:
                return {
                    'status': 'locked',
                    'locked_by': self.annotation_locks[annotation_id]
                }

        # Add to history
        self._add_to_history(annotation_id, {
            'action': 'delete',
            'user_id': user_id,
            'timestamp': datetime.now().isoformat()
        })

        # Delete from database
        await self._delete_annotation(dataset_id, annotation_id)

        # Broadcast to other users
        await self._broadcast_annotation_change(
            dataset_id,
            {
                'action': 'delete',
                'annotation_id': annotation_id,
                'user_id': user_id
            },
            exclude_user=user_id
        )

        return {'status': 'success'}

    async def handle_cursor_move(
        self,
        dataset_id: str,
        user_id: str,
        position: Dict[str, float]
    ):
        """
        Handle cursor position update.

        Args:
            dataset_id: Dataset identifier
            user_id: User moving cursor
            position: New cursor position
        """
        if user_id in self.user_cursors:
            self.user_cursors[user_id]['position'] = position
            self.user_cursors[user_id]['timestamp'] = datetime.now().isoformat()

            # Broadcast cursor position
            await self._broadcast_cursor_update(dataset_id, user_id, position)

    async def handle_selection_change(
        self,
        dataset_id: str,
        user_id: str,
        selected_ids: List[str]
    ):
        """
        Handle annotation selection change.

        Args:
            dataset_id: Dataset identifier
            user_id: User changing selection
            selected_ids: Selected annotation IDs
        """
        # Broadcast selection change
        await self._broadcast_to_dataset(
            dataset_id,
            {
                'type': 'selection_change',
                'user_id': user_id,
                'selected_ids': selected_ids
            },
            exclude_user=user_id
        )

    async def get_annotation_history(
        self,
        annotation_id: str,
        limit: int = 50
    ) -> List[Dict]:
        """
        Get history for an annotation.

        Args:
            annotation_id: Annotation identifier
            limit: Maximum history entries

        Returns:
            History entries
        """
        history = self.annotation_history.get(annotation_id, [])
        return history[-limit:]

    async def undo_annotation_action(
        self,
        dataset_id: str,
        user_id: str,
        annotation_id: str
    ) -> Dict[str, Any]:
        """
        Undo last action on annotation.

        Args:
            dataset_id: Dataset identifier
            user_id: User requesting undo
            annotation_id: Annotation identifier

        Returns:
            Undo result
        """
        history = self.annotation_history.get(annotation_id, [])

        # Find last action by user
        for i in range(len(history) - 1, -1, -1):
            if history[i]['user_id'] == user_id:
                action = history[i]

                if action['action'] == 'create':
                    # Undo creation by deleting
                    await self.handle_annotation_delete(
                        dataset_id, user_id, annotation_id
                    )
                elif action['action'] == 'update':
                    # Revert to previous state
                    if i > 0:
                        prev_state = history[i - 1].get('data', {})
                        await self.handle_annotation_update(
                            dataset_id, user_id, annotation_id, prev_state
                        )
                elif action['action'] == 'delete':
                    # Restore deleted annotation
                    if 'data' in action:
                        annotation = BoundingBoxPayload(**action['data'])
                        await self.handle_annotation_create(
                            dataset_id, user_id, annotation
                        )

                return {'status': 'success', 'undone_action': action['action']}

        return {'status': 'no_action_to_undo'}

    # Private helper methods

    async def _detect_conflicts(
        self,
        dataset_id: str,
        new_annotation: BoundingBoxPayload
    ) -> List[Dict]:
        """Detect conflicting annotations based on overlap."""
        conflicts = []

        # Get existing annotations
        existing = await self._get_dataset_annotations(dataset_id)

        for ann in existing:
            # Calculate IoU (Intersection over Union)
            iou = self._calculate_iou(
                (new_annotation.x, new_annotation.y,
                 new_annotation.width, new_annotation.height),
                (ann['x'], ann['y'], ann['width'], ann['height'])
            )

            # If IoU > 0.5, consider it a conflict
            if iou > 0.5:
                conflicts.append({
                    'annotation_id': ann['id'],
                    'iou': iou,
                    'category': ann.get('category'),
                    'value': ann.get('value')
                })

        return conflicts

    def _calculate_iou(self, box1: tuple, box2: tuple) -> float:
        """Calculate Intersection over Union for two boxes."""
        x1, y1, w1, h1 = box1
        x2, y2, w2, h2 = box2

        # Calculate intersection
        xi1 = max(x1, x2)
        yi1 = max(y1, y2)
        xi2 = min(x1 + w1, x2 + w2)
        yi2 = min(y1 + h1, y2 + h2)

        if xi2 < xi1 or yi2 < yi1:
            return 0.0

        intersection = (xi2 - xi1) * (yi2 - yi1)

        # Calculate union
        area1 = w1 * h1
        area2 = w2 * h2
        union = area1 + area2 - intersection

        return intersection / union if union > 0 else 0.0

    def _generate_user_color(self, user_id: str) -> str:
        """Generate consistent color for user."""
        hash_val = hash(user_id)
        hue = (hash_val % 360)
        return f"hsl({hue}, 70%, 50%)"

    async def _broadcast_to_dataset(
        self,
        dataset_id: str,
        message: Dict,
        exclude_user: Optional[str] = None
    ):
        """Broadcast message to all users in dataset."""
        if dataset_id not in self.active_sessions:
            return

        message_json = json.dumps(message)
        dead_connections = []

        for websocket in self.active_sessions[dataset_id]:
            try:
                await websocket.send_text(message_json)
            except:
                dead_connections.append(websocket)

        # Clean up dead connections
        for ws in dead_connections:
            self.active_sessions[dataset_id].discard(ws)

    async def _broadcast_annotation_change(
        self,
        dataset_id: str,
        change: Dict,
        exclude_user: Optional[str] = None
    ):
        """Broadcast annotation change to dataset users."""
        message = {
            'type': 'annotation_change',
            'timestamp': datetime.now().isoformat(),
            **change
        }
        await self._broadcast_to_dataset(dataset_id, message, exclude_user)

    async def _broadcast_cursor_update(
        self,
        dataset_id: str,
        user_id: str,
        position: Dict[str, float]
    ):
        """Broadcast cursor position update."""
        message = {
            'type': 'cursor_update',
            'user_id': user_id,
            'position': position,
            'color': self.user_cursors[user_id].get('color')
        }
        await self._broadcast_to_dataset(dataset_id, message, exclude_user=user_id)

    async def _broadcast_user_joined(self, dataset_id: str, user_id: str):
        """Broadcast user joined notification."""
        message = {
            'type': 'user_joined',
            'user_id': user_id,
            'timestamp': datetime.now().isoformat()
        }
        await self._broadcast_to_dataset(dataset_id, message)

    async def _broadcast_user_left(self, dataset_id: str, user_id: str):
        """Broadcast user left notification."""
        message = {
            'type': 'user_left',
            'user_id': user_id,
            'timestamp': datetime.now().isoformat()
        }
        await self._broadcast_to_dataset(dataset_id, message)

    async def _send_initial_state(self, websocket: WebSocket, dataset_id: str):
        """Send initial state to newly connected user."""
        # Get current annotations
        annotations = await self._get_dataset_annotations(dataset_id)

        # Get active users
        active_users = [
            cursor for cursor in self.user_cursors.values()
            if cursor['dataset_id'] == dataset_id and cursor['active']
        ]

        message = {
            'type': 'initial_state',
            'annotations': annotations,
            'active_users': active_users,
            'timestamp': datetime.now().isoformat()
        }

        await websocket.send_text(json.dumps(message))

    def _add_to_history(self, annotation_id: str, entry: Dict):
        """Add entry to annotation history."""
        if annotation_id not in self.annotation_history:
            self.annotation_history[annotation_id] = []

        self.annotation_history[annotation_id].append(entry)

        # Limit history size
        max_history = 100
        if len(self.annotation_history[annotation_id]) > max_history:
            self.annotation_history[annotation_id] = \
                self.annotation_history[annotation_id][-max_history:]

    def _release_user_locks(self, user_id: str):
        """Release all locks held by user."""
        to_remove = []
        for ann_id, lock_user in self.annotation_locks.items():
            if lock_user == user_id:
                to_remove.append(ann_id)

        for ann_id in to_remove:
            del self.annotation_locks[ann_id]

    async def _auto_release_lock(self, annotation_id: str, user_id: str, delay: int):
        """Auto-release lock after delay."""
        await asyncio.sleep(delay)
        if annotation_id in self.annotation_locks:
            if self.annotation_locks[annotation_id] == user_id:
                del self.annotation_locks[annotation_id]

    # Database operations (to be implemented)

    async def _save_annotation(self, dataset_id: str, annotation: BoundingBoxPayload):
        """Save annotation to database."""
        # Store in Redis for now
        if self.redis_client:
            key = f"annotation:{dataset_id}:{annotation.id}"
            await self.redis_client.set(key, annotation.json(), ex=86400)

    async def _update_annotation(
        self,
        dataset_id: str,
        annotation_id: str,
        updates: Dict[str, Any]
    ):
        """Update annotation in database."""
        if self.redis_client:
            key = f"annotation:{dataset_id}:{annotation_id}"
            existing = await self.redis_client.get(key)

            if existing:
                data = json.loads(existing)
                data.update(updates)
                await self.redis_client.set(key, json.dumps(data), ex=86400)

    async def _delete_annotation(self, dataset_id: str, annotation_id: str):
        """Delete annotation from database."""
        if self.redis_client:
            key = f"annotation:{dataset_id}:{annotation_id}"
            await self.redis_client.delete(key)

    async def _get_dataset_annotations(self, dataset_id: str) -> List[Dict]:
        """Get all annotations for dataset."""
        annotations = []

        if self.redis_client:
            pattern = f"annotation:{dataset_id}:*"
            keys = await self.redis_client.keys(pattern)

            for key in keys:
                data = await self.redis_client.get(key)
                if data:
                    annotations.append(json.loads(data))

        return annotations


# Global service instance
collaborative_service = CollaborativeAnnotationService()