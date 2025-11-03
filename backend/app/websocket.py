"""
WebSocket with Scale
STORY-014: WebSocket with Scale
"""
import asyncio
import json
import time
from typing import Dict, Set, Any, Optional, List
from fastapi import WebSocket, WebSocketDisconnect, Depends, HTTPException
import redis.asyncio as redis
from datetime import datetime
import logging
import hashlib
from prometheus_client import Counter, Gauge, Histogram

logger = logging.getLogger(__name__)

# Metrics
ws_connections = Gauge('websocket_connections', 'Active WebSocket connections')
ws_messages = Counter('websocket_messages_total', 'Total WebSocket messages', ['direction', 'room'])
ws_latency = Histogram('websocket_message_latency_seconds', 'WebSocket message latency')


class ConnectionManager:
    """Manage WebSocket connections with horizontal scaling"""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.connection_metadata: Dict[WebSocket, Dict[str, Any]] = {}
        self.redis_client: Optional[redis.Redis] = None
        self.pubsub: Optional[redis.client.PubSub] = None
        self.rate_limits: Dict[str, int] = {}

    async def initialize(self):
        """Initialize Redis for pub/sub"""
        self.redis_client = await redis.from_url("redis://localhost:6379/4")
        self.pubsub = self.redis_client.pubsub()

    async def connect(
        self,
        websocket: WebSocket,
        client_id: str,
        room: str = "default"
    ):
        """Accept WebSocket connection"""
        await websocket.accept()

        # Add to room
        if room not in self.active_connections:
            self.active_connections[room] = set()

        self.active_connections[room].add(websocket)

        # Store metadata
        self.connection_metadata[websocket] = {
            'client_id': client_id,
            'room': room,
            'connected_at': datetime.utcnow(),
            'last_activity': datetime.utcnow(),
            'message_count': 0
        }

        # Subscribe to Redis channel for room
        await self.pubsub.subscribe(f"room:{room}")

        # Update metrics
        ws_connections.inc()

        # Notify room of new connection
        await self.broadcast_to_room(
            room,
            {
                'type': 'user_joined',
                'client_id': client_id,
                'timestamp': datetime.utcnow().isoformat()
            },
            exclude=websocket
        )

        logger.info(f"Client {client_id} connected to room {room}")

    async def disconnect(self, websocket: WebSocket):
        """Remove WebSocket connection"""
        if websocket not in self.connection_metadata:
            return

        metadata = self.connection_metadata[websocket]
        room = metadata['room']
        client_id = metadata['client_id']

        # Remove from room
        if room in self.active_connections:
            self.active_connections[room].discard(websocket)
            if not self.active_connections[room]:
                del self.active_connections[room]

        # Unsubscribe from Redis channel
        await self.pubsub.unsubscribe(f"room:{room}")

        # Remove metadata
        del self.connection_metadata[websocket]

        # Update metrics
        ws_connections.dec()

        # Notify room of disconnection
        await self.broadcast_to_room(
            room,
            {
                'type': 'user_left',
                'client_id': client_id,
                'timestamp': datetime.utcnow().isoformat()
            }
        )

        logger.info(f"Client {client_id} disconnected from room {room}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        """Send message to specific connection"""
        try:
            await websocket.send_text(message)
            ws_messages.labels(direction='outgoing', room='personal').inc()
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            await self.disconnect(websocket)

    async def broadcast_to_room(
        self,
        room: str,
        message: Dict[str, Any],
        exclude: Optional[WebSocket] = None
    ):
        """Broadcast message to all connections in room"""
        if room not in self.active_connections:
            return

        # Publish to Redis for other instances
        await self.redis_client.publish(
            f"room:{room}",
            json.dumps(message)
        )

        # Send to local connections
        disconnected = []
        for connection in self.active_connections[room]:
            if connection == exclude:
                continue

            try:
                await connection.send_json(message)
                ws_messages.labels(direction='outgoing', room=room).inc()
            except Exception as e:
                logger.error(f"Failed to send to connection: {e}")
                disconnected.append(connection)

        # Clean up disconnected
        for conn in disconnected:
            await self.disconnect(conn)

    async def handle_message(
        self,
        websocket: WebSocket,
        message: Dict[str, Any]
    ):
        """Handle incoming WebSocket message"""
        if websocket not in self.connection_metadata:
            return

        metadata = self.connection_metadata[websocket]
        client_id = metadata['client_id']
        room = metadata['room']

        # Check rate limit
        if not await self.check_rate_limit(client_id):
            await self.send_personal_message(
                json.dumps({'error': 'Rate limit exceeded'}),
                websocket
            )
            return

        # Update activity
        metadata['last_activity'] = datetime.utcnow()
        metadata['message_count'] += 1

        # Track metrics
        ws_messages.labels(direction='incoming', room=room).inc()

        # Process message based on type
        message_type = message.get('type')

        if message_type == 'broadcast':
            await self.broadcast_to_room(room, {
                'type': 'message',
                'from': client_id,
                'content': message.get('content'),
                'timestamp': datetime.utcnow().isoformat()
            })

        elif message_type == 'join_room':
            new_room = message.get('room')
            await self.move_to_room(websocket, new_room)

        elif message_type == 'ping':
            await self.send_personal_message(
                json.dumps({'type': 'pong', 'timestamp': time.time()}),
                websocket
            )

    async def move_to_room(self, websocket: WebSocket, new_room: str):
        """Move connection to different room"""
        if websocket not in self.connection_metadata:
            return

        metadata = self.connection_metadata[websocket]
        old_room = metadata['room']
        client_id = metadata['client_id']

        # Leave old room
        if old_room in self.active_connections:
            self.active_connections[old_room].discard(websocket)
            await self.pubsub.unsubscribe(f"room:{old_room}")

        # Join new room
        if new_room not in self.active_connections:
            self.active_connections[new_room] = set()

        self.active_connections[new_room].add(websocket)
        await self.pubsub.subscribe(f"room:{new_room}")

        # Update metadata
        metadata['room'] = new_room

        logger.info(f"Client {client_id} moved from {old_room} to {new_room}")

    async def check_rate_limit(self, client_id: str, limit: int = 100) -> bool:
        """Check rate limit per connection"""
        current_minute = int(time.time() / 60)
        key = f"{client_id}:{current_minute}"

        if key not in self.rate_limits:
            self.rate_limits[key] = 0

        self.rate_limits[key] += 1

        # Clean old entries
        old_keys = [k for k in self.rate_limits if not k.endswith(str(current_minute))]
        for k in old_keys:
            del self.rate_limits[k]

        return self.rate_limits[key] <= limit

    async def heartbeat(self):
        """Send heartbeat to all connections"""
        while True:
            await asyncio.sleep(30)

            disconnected = []
            for websocket in self.connection_metadata:
                try:
                    await websocket.send_json({'type': 'heartbeat'})
                except:
                    disconnected.append(websocket)

            for conn in disconnected:
                await self.disconnect(conn)

    async def handle_redis_messages(self):
        """Handle messages from Redis pub/sub"""
        async for message in self.pubsub.listen():
            if message['type'] == 'message':
                room = message['channel'].decode().split(':')[1]
                data = json.loads(message['data'])

                # Broadcast to local connections
                if room in self.active_connections:
                    for connection in self.active_connections[room]:
                        try:
                            await connection.send_json(data)
                        except:
                            pass

    def get_room_info(self, room: str) -> Dict[str, Any]:
        """Get information about a room"""
        if room not in self.active_connections:
            return {'room': room, 'connections': 0, 'clients': []}

        clients = []
        for conn in self.active_connections[room]:
            if conn in self.connection_metadata:
                metadata = self.connection_metadata[conn]
                clients.append({
                    'client_id': metadata['client_id'],
                    'connected_at': metadata['connected_at'].isoformat(),
                    'message_count': metadata['message_count']
                })

        return {
            'room': room,
            'connections': len(self.active_connections[room]),
            'clients': clients
        }

    def get_stats(self) -> Dict[str, Any]:
        """Get WebSocket statistics"""
        total_connections = sum(len(conns) for conns in self.active_connections.values())
        total_messages = sum(m['message_count'] for m in self.connection_metadata.values())

        return {
            'total_connections': total_connections,
            'total_rooms': len(self.active_connections),
            'total_messages': total_messages,
            'rooms': list(self.active_connections.keys())
        }


# Global connection manager
manager = ConnectionManager()


class WebSocketAuthenticator:
    """Authenticate WebSocket connections"""

    @staticmethod
    async def authenticate(token: str) -> Optional[str]:
        """Authenticate token and return client_id"""
        # Implement JWT verification
        from app.auth import auth_manager

        try:
            token_data = await auth_manager.verify_token(token)
            return token_data.username
        except:
            return None


class MessageQueue:
    """Queue messages for offline clients"""

    def __init__(self):
        self.redis_client = None

    async def initialize(self):
        """Initialize Redis client"""
        self.redis_client = await redis.from_url("redis://localhost:6379/5")

    async def queue_message(self, client_id: str, message: Dict[str, Any]):
        """Queue message for offline client"""
        key = f"offline_messages:{client_id}"
        await self.redis_client.lpush(key, json.dumps(message))
        await self.redis_client.expire(key, 86400)  # 24 hours

    async def get_queued_messages(self, client_id: str) -> List[Dict[str, Any]]:
        """Get queued messages for client"""
        key = f"offline_messages:{client_id}"
        messages = await self.redis_client.lrange(key, 0, -1)
        await self.redis_client.delete(key)

        return [json.loads(msg) for msg in messages]


message_queue = MessageQueue()


class BinaryDataHandler:
    """Handle binary data over WebSocket"""

    @staticmethod
    async def send_binary(websocket: WebSocket, data: bytes, metadata: Dict[str, Any]):
        """Send binary data with metadata"""
        # Send metadata first
        await websocket.send_json({
            'type': 'binary_metadata',
            'size': len(data),
            'metadata': metadata
        })

        # Send binary data
        await websocket.send_bytes(data)

    @staticmethod
    async def receive_binary(websocket: WebSocket) -> tuple[bytes, Dict[str, Any]]:
        """Receive binary data with metadata"""
        # Receive metadata
        metadata_msg = await websocket.receive_json()
        if metadata_msg['type'] != 'binary_metadata':
            raise ValueError("Expected binary metadata")

        # Receive binary data
        data = await websocket.receive_bytes()

        return data, metadata_msg['metadata']