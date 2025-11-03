"""Comprehensive tests for WebSocket Infrastructure (US-017)."""
import pytest
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import WebSocket

from app.websocket import (
    ConnectionManager,
    WebSocketAuthenticator,
    MessageQueue,
    BinaryDataHandler,
    manager
)


@pytest.fixture
async def connection_manager():
    """Create a ConnectionManager instance."""
    cm = ConnectionManager()
    with patch('app.websocket.redis.from_url', new_callable=AsyncMock) as mock_redis:
        mock_redis.return_value = AsyncMock()
        mock_redis.return_value.pubsub.return_value = AsyncMock()
        await cm.initialize()
        yield cm


@pytest.fixture
def mock_websocket():
    """Create a mock WebSocket."""
    ws = AsyncMock(spec=WebSocket)
    ws.accept = AsyncMock()
    ws.send_text = AsyncMock()
    ws.send_json = AsyncMock()
    ws.send_bytes = AsyncMock()
    ws.receive_text = AsyncMock()
    ws.receive_json = AsyncMock()
    ws.receive_bytes = AsyncMock()
    return ws


class TestConnectionManager:
    """Test ConnectionManager functionality."""

    async def test_connect_client(self, connection_manager, mock_websocket):
        """Test connecting a client."""
        await connection_manager.connect(mock_websocket, "test_client", "test_room")

        assert "test_room" in connection_manager.active_connections
        assert mock_websocket in connection_manager.active_connections["test_room"]
        assert mock_websocket in connection_manager.connection_metadata
        mock_websocket.accept.assert_called_once()

    async def test_disconnect_client(self, connection_manager, mock_websocket):
        """Test disconnecting a client."""
        await connection_manager.connect(mock_websocket, "test_client", "test_room")
        await connection_manager.disconnect(mock_websocket)

        assert mock_websocket not in connection_manager.connection_metadata
        if "test_room" in connection_manager.active_connections:
            assert mock_websocket not in connection_manager.active_connections["test_room"]

    async def test_broadcast_to_room(self, connection_manager, mock_websocket):
        """Test broadcasting to a room."""
        ws1 = mock_websocket
        ws2 = AsyncMock(spec=WebSocket)

        await connection_manager.connect(ws1, "client1", "test_room")
        await connection_manager.connect(ws2, "client2", "test_room")

        message = {"type": "test", "content": "hello"}
        await connection_manager.broadcast_to_room("test_room", message)

        # Both clients should receive the message
        ws1.send_json.assert_called()
        ws2.send_json.assert_called()

    async def test_handle_message_broadcast(self, connection_manager, mock_websocket):
        """Test handling broadcast messages."""
        await connection_manager.connect(mock_websocket, "test_client", "test_room")

        message = {
            "type": "broadcast",
            "content": "Hello room!"
        }

        await connection_manager.handle_message(mock_websocket, message)
        # Should trigger broadcast (mocked Redis publish)
        connection_manager.redis_client.publish.assert_called()

    async def test_rate_limiting(self, connection_manager):
        """Test rate limiting functionality."""
        client_id = "test_client"

        # First 100 messages should pass
        for _ in range(100):
            assert await connection_manager.check_rate_limit(client_id)

        # 101st message should fail
        assert not await connection_manager.check_rate_limit(client_id)

    async def test_move_to_room(self, connection_manager, mock_websocket):
        """Test moving client between rooms."""
        await connection_manager.connect(mock_websocket, "test_client", "room1")
        await connection_manager.move_to_room(mock_websocket, "room2")

        metadata = connection_manager.connection_metadata[mock_websocket]
        assert metadata["room"] == "room2"
        assert mock_websocket in connection_manager.active_connections["room2"]

        if "room1" in connection_manager.active_connections:
            assert mock_websocket not in connection_manager.active_connections["room1"]

    def test_get_room_info(self, connection_manager):
        """Test getting room information."""
        info = connection_manager.get_room_info("nonexistent")
        assert info["connections"] == 0
        assert info["clients"] == []

    def test_get_stats(self, connection_manager):
        """Test getting WebSocket statistics."""
        stats = connection_manager.get_stats()
        assert "total_connections" in stats
        assert "total_rooms" in stats
        assert "total_messages" in stats
        assert "rooms" in stats


class TestWebSocketAuthenticator:
    """Test WebSocket authentication."""

    @pytest.mark.asyncio
    async def test_authenticate_valid_token(self):
        """Test authenticating with valid token."""
        with patch('app.auth.auth_manager.verify_token', new_callable=AsyncMock) as mock_verify:
            mock_verify.return_value = MagicMock(username="test_user")

            authenticator = WebSocketAuthenticator()
            result = await authenticator.authenticate("valid_token")

            assert result == "test_user"
            mock_verify.assert_called_once_with("valid_token")

    @pytest.mark.asyncio
    async def test_authenticate_invalid_token(self):
        """Test authenticating with invalid token."""
        with patch('app.auth.auth_manager.verify_token', new_callable=AsyncMock) as mock_verify:
            mock_verify.side_effect = Exception("Invalid token")

            authenticator = WebSocketAuthenticator()
            result = await authenticator.authenticate("invalid_token")

            assert result is None


class TestMessageQueue:
    """Test message queue functionality."""

    @pytest.mark.asyncio
    async def test_queue_message(self):
        """Test queuing messages for offline clients."""
        mq = MessageQueue()

        with patch('app.websocket.redis.from_url', new_callable=AsyncMock) as mock_redis:
            mock_redis.return_value = AsyncMock()
            await mq.initialize()

            message = {"type": "notification", "content": "Hello"}
            await mq.queue_message("offline_client", message)

            mq.redis_client.lpush.assert_called_once()
            mq.redis_client.expire.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_queued_messages(self):
        """Test retrieving queued messages."""
        mq = MessageQueue()

        with patch('app.websocket.redis.from_url', new_callable=AsyncMock) as mock_redis:
            mock_redis_client = AsyncMock()
            mock_redis.return_value = mock_redis_client
            mock_redis_client.lrange.return_value = [
                json.dumps({"type": "msg1"}),
                json.dumps({"type": "msg2"})
            ]

            await mq.initialize()
            messages = await mq.get_queued_messages("client_id")

            assert len(messages) == 2
            assert messages[0]["type"] == "msg1"
            assert messages[1]["type"] == "msg2"
            mock_redis_client.delete.assert_called_once()


class TestBinaryDataHandler:
    """Test binary data handling."""

    @pytest.mark.asyncio
    async def test_send_binary(self, mock_websocket):
        """Test sending binary data."""
        data = b"binary_data"
        metadata = {"filename": "test.bin", "size": len(data)}

        await BinaryDataHandler.send_binary(mock_websocket, data, metadata)

        # Should send metadata first, then binary
        mock_websocket.send_json.assert_called_once()
        mock_websocket.send_bytes.assert_called_once_with(data)

    @pytest.mark.asyncio
    async def test_receive_binary(self, mock_websocket):
        """Test receiving binary data."""
        mock_websocket.receive_json.return_value = {
            "type": "binary_metadata",
            "metadata": {"filename": "test.bin"}
        }
        mock_websocket.receive_bytes.return_value = b"binary_data"

        data, metadata = await BinaryDataHandler.receive_binary(mock_websocket)

        assert data == b"binary_data"
        assert metadata["filename"] == "test.bin"


class TestWebSocketPerformance:
    """Test WebSocket performance requirements."""

    @pytest.mark.asyncio
    async def test_concurrent_connections(self, connection_manager):
        """Test handling 100 concurrent connections."""
        websockets = []

        for i in range(100):
            ws = AsyncMock(spec=WebSocket)
            websockets.append(ws)
            await connection_manager.connect(ws, f"client_{i}", "stress_test")

        assert len(connection_manager.connection_metadata) == 100
        assert len(connection_manager.active_connections["stress_test"]) == 100

    @pytest.mark.asyncio
    async def test_auto_reconnection(self, mock_websocket):
        """Test auto-reconnection logic."""
        # This would be tested in the client implementation
        # Server should handle reconnection gracefully
        cm = ConnectionManager()

        # Simulate disconnect and reconnect
        await cm.connect(mock_websocket, "client1", "room1")
        await cm.disconnect(mock_websocket)
        await cm.connect(mock_websocket, "client1", "room1")

        assert mock_websocket in cm.connection_metadata


@pytest.mark.asyncio
async def test_heartbeat_mechanism():
    """Test heartbeat mechanism."""
    cm = ConnectionManager()
    ws1 = AsyncMock(spec=WebSocket)
    ws2 = AsyncMock(spec=WebSocket)

    await cm.connect(ws1, "client1", "room1")
    await cm.connect(ws2, "client2", "room1")

    # Mock one websocket failing heartbeat
    ws2.send_json.side_effect = Exception("Connection lost")

    # Run one heartbeat cycle
    heartbeat_task = asyncio.create_task(cm.heartbeat())
    await asyncio.sleep(0.1)  # Let it run briefly
    heartbeat_task.cancel()

    # ws2 should be disconnected
    # Implementation needs to handle exceptions in heartbeat
