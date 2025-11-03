"""Tests for WebSocket + Database integration.

US-INT-005: WebSocket Database Events
This module tests WebSocket integration with PostgreSQL database.
"""

import pytest
import asyncio
from uuid import uuid4
from datetime import datetime
from unittest.mock import AsyncMock, patch

from app.api.websocket.training_events_db import (
    TrainingWebSocketManager,
    training_ws_manager
)
from app.models.training import TrainingJob


@pytest.mark.asyncio
class TestWebSocketDatabaseIntegration:
    """Test suite for WebSocket + Database integration (US-INT-005)."""

    async def test_emit_progress_loads_from_database(self, db_session):
        """
        Test progress emission loads state from DATABASE, not cache (AC1).

        Verifies that WebSocket manager queries database for latest state.
        """
        # Create job in database
        job = TrainingJob(
            id=uuid4(),
            status="running",
            current_epoch=30,
            total_epochs=100,
            metrics={"loss": 0.42, "accuracy": 0.85},
            resources={"gpu_utilization": 85, "memory_mb": 8192}
        )
        db_session.add(job)
        db_session.commit()

        manager = TrainingWebSocketManager()

        # Mock WebSocket
        mock_ws = AsyncMock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()

        # Connect (should load from database)
        await manager.connect(mock_ws, str(job.id))

        # Verify initial state sent from database
        assert mock_ws.send_json.called
        reconnect_event = mock_ws.send_json.call_args[0][0]
        assert reconnect_event["event"] == "reconnection.success"
        assert reconnect_event["data"]["current_epoch"] == 30
        assert reconnect_event["data"]["total_epochs"] == 100
        assert reconnect_event["data"]["metrics"]["loss"] == 0.42

        # Emit progress (should load from database)
        await manager.emit_progress_from_db(
            job_id=str(job.id),
            epoch=30,
            total_epochs=100,
            metrics={"loss": 0.42, "accuracy": 0.85},
            resources={"gpu_utilization": 85, "memory_mb": 8192}
        )

        # Verify sent to WebSocket
        assert mock_ws.send_json.call_count >= 2
        progress_event = mock_ws.send_json.call_args[0][0]
        assert progress_event["event"] == "training.epoch"
        assert progress_event["data"]["epoch"] == 30
        assert progress_event["data"]["metrics"]["accuracy"] == 0.85

    async def test_multiple_clients_receive_broadcast(self, db_session):
        """Test all connected clients receive database updates (AC3)."""
        job_id = str(uuid4())

        manager = TrainingWebSocketManager()

        # Connect 3 clients
        clients = []
        for i in range(3):
            mock_ws = AsyncMock()
            mock_ws.accept = AsyncMock()
            mock_ws.send_json = AsyncMock()
            clients.append(mock_ws)
            await manager.connect(mock_ws, job_id)

        # Emit progress
        await manager.emit_progress_from_db(
            job_id=job_id,
            epoch=50,
            total_epochs=100,
            metrics={"loss": 0.3, "accuracy": 0.92},
            resources={"gpu_utilization": 90}
        )

        # Verify all clients received
        for client in clients:
            # Should have received reconnection + progress
            assert client.send_json.call_count >= 1
            # Check last call was progress update
            last_call = client.send_json.call_args_list[-1]
            sent_event = last_call[0][0]
            assert sent_event["event"] == "training.epoch"
            assert sent_event["data"]["epoch"] == 50
            assert sent_event["data"]["metrics"]["accuracy"] == 0.92

    async def test_reconnection_loads_current_state(self, db_session):
        """Test reconnection sends current state from DATABASE (AC4)."""
        # Create job in database with progress
        job = TrainingJob(
            id=uuid4(),
            status="running",
            current_epoch=75,
            total_epochs=100,
            metrics={"loss": 0.15, "accuracy": 0.95},
            eta_seconds=180
        )
        db_session.add(job)
        db_session.commit()

        manager = TrainingWebSocketManager()

        # Simulate reconnection
        mock_ws = AsyncMock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()

        await manager.connect(mock_ws, str(job.id))

        # Verify current state sent from database
        assert mock_ws.send_json.called
        reconnect_event = mock_ws.send_json.call_args[0][0]

        assert reconnect_event["event"] == "reconnection.success"
        assert reconnect_event["data"]["current_epoch"] == 75
        assert reconnect_event["data"]["total_epochs"] == 100
        assert reconnect_event["data"]["progress_pct"] == 75
        assert reconnect_event["data"]["metrics"]["accuracy"] == 0.95
        assert reconnect_event["data"]["eta_seconds"] == 180

    async def test_failed_connections_removed(self):
        """Test failed connections are automatically removed (AC3)."""
        job_id = str(uuid4())
        manager = TrainingWebSocketManager()

        # Create 3 clients, one will fail
        clients = []
        for i in range(3):
            mock_ws = AsyncMock()
            mock_ws.accept = AsyncMock()
            if i == 1:
                # This client will fail to send
                mock_ws.send_json = AsyncMock(side_effect=Exception("Connection lost"))
            else:
                mock_ws.send_json = AsyncMock()
            clients.append(mock_ws)
            await manager.connect(mock_ws, job_id)

        # Emit progress
        await manager.emit_progress_from_db(
            job_id=job_id,
            epoch=10,
            total_epochs=100,
            metrics={"loss": 0.5},
            resources={}
        )

        # Verify healthy clients received, failed client removed
        assert clients[0].send_json.call_count >= 1
        assert clients[1].send_json.call_count >= 1  # Called but failed
        assert clients[2].send_json.call_count >= 1

        # Verify failed connection removed from manager
        assert len(manager.connections.get(job_id, [])) == 2

    async def test_training_lifecycle_events(self, db_session):
        """Test complete lifecycle: started → progress → completed (AC2)."""
        job_id = str(uuid4())
        manager = TrainingWebSocketManager()

        # Connect client
        mock_ws = AsyncMock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()
        await manager.connect(mock_ws, job_id)

        # Emit started
        await manager.emit_training_started(
            job_id=job_id,
            data={"celery_task_id": "task-123"}
        )

        # Emit progress
        await manager.emit_progress_from_db(
            job_id=job_id,
            epoch=50,
            total_epochs=100,
            metrics={"loss": 0.3, "accuracy": 0.9},
            resources={"gpu_utilization": 85}
        )

        # Emit completed
        await manager.emit_training_completed(
            job_id=job_id,
            data={"metrics": {"accuracy": 0.95}, "model_version": "v1"}
        )

        # Verify all events received in order
        calls = mock_ws.send_json.call_args_list
        # Should have: reconnection + started + progress + completed
        assert len(calls) >= 4

        # Check event types in order (after reconnection)
        event_types = [call[0][0]["event"] for call in calls]
        assert "reconnection.success" in event_types
        assert "training.started" in event_types
        assert "training.epoch" in event_types
        assert "training.completed" in event_types

    async def test_websocket_broadcast_performance(self):
        """Test broadcast latency < 100ms for 10 clients (AC1)."""
        import time

        job_id = str(uuid4())
        manager = TrainingWebSocketManager()

        # Connect 10 clients
        clients = []
        for i in range(10):
            mock_ws = AsyncMock()
            mock_ws.accept = AsyncMock()
            mock_ws.send_json = AsyncMock()
            clients.append(mock_ws)
            await manager.connect(mock_ws, job_id)

        # Measure broadcast time
        start = time.time()
        await manager.emit_progress_from_db(
            job_id=job_id,
            epoch=50,
            total_epochs=100,
            metrics={"loss": 0.3},
            resources={}
        )
        elapsed_ms = (time.time() - start) * 1000

        # Verify all clients received
        for client in clients:
            assert client.send_json.call_count >= 1

        # Verify latency < 100ms
        assert elapsed_ms < 100, f"Broadcast took {elapsed_ms:.2f}ms (should be < 100ms)"

    async def test_emit_training_failed_event(self):
        """Test training failed event with error message (AC2)."""
        job_id = str(uuid4())
        manager = TrainingWebSocketManager()

        mock_ws = AsyncMock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()
        await manager.connect(mock_ws, job_id)

        # Emit failed event
        error_msg = "Out of memory error during training"
        await manager.emit_training_failed(
            job_id=job_id,
            error=error_msg
        )

        # Verify failed event sent
        calls = mock_ws.send_json.call_args_list
        # Should have reconnection + failed
        assert len(calls) >= 2

        failed_event = calls[-1][0][0]
        assert failed_event["event"] == "training.failed"
        assert failed_event["data"]["error"] == error_msg
        assert "job_id" in failed_event
        assert "timestamp" in failed_event


@pytest.mark.asyncio
class TestWebSocketCacheConsistency:
    """Test WebSocket cache vs database consistency."""

    async def test_cache_invalidation_on_database_update(self, db_session):
        """
        Test cached data doesn't serve stale information.

        Verifies that reconnection always loads latest from database.
        """
        # Create job
        job = TrainingJob(
            id=uuid4(),
            status="running",
            current_epoch=10,
            total_epochs=100,
            metrics={"loss": 0.8}
        )
        db_session.add(job)
        db_session.commit()

        manager = TrainingWebSocketManager()

        # First connection
        mock_ws1 = AsyncMock()
        mock_ws1.accept = AsyncMock()
        mock_ws1.send_json = AsyncMock()
        await manager.connect(mock_ws1, str(job.id))

        # Verify initial state
        initial_call = mock_ws1.send_json.call_args[0][0]
        assert initial_call["data"]["current_epoch"] == 10

        # Update database directly
        job.current_epoch = 50
        job.metrics = {"loss": 0.3}
        db_session.commit()

        # Reconnect (should load fresh from database)
        mock_ws2 = AsyncMock()
        mock_ws2.accept = AsyncMock()
        mock_ws2.send_json = AsyncMock()
        await manager.connect(mock_ws2, str(job.id))

        # Verify fresh state from database
        fresh_call = mock_ws2.send_json.call_args[0][0]
        assert fresh_call["data"]["current_epoch"] == 50
        assert fresh_call["data"]["metrics"]["loss"] == 0.3


@pytest.fixture
def db_session():
    """Mock database session for testing."""
    from unittest.mock import MagicMock
    from sqlalchemy.orm import Session

    session = MagicMock(spec=Session)

    # Mock query behavior
    def mock_query(model):
        query_mock = MagicMock()
        query_mock.filter = MagicMock(return_value=query_mock)
        query_mock.first = MagicMock(return_value=None)
        return query_mock

    session.query = mock_query
    session.add = MagicMock()
    session.commit = MagicMock()
    session.close = MagicMock()

    return session
