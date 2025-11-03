"""Unit tests for batch processing system."""

import asyncio
import json
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch, call
from uuid import uuid4

import pytest
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession

from app.batch.models import (
    BatchJob,
    BatchItem,
    BatchStatus,
    ItemStatus,
    ProcessingType,
    BatchConfiguration,
    BatchMetrics,
    BatchJobCreate,
)
from app.batch.processor import BatchProcessor
from app.batch.tasks import process_batch, process_batch_chunk, cleanup_old_batches


@pytest.fixture
def mock_db_session():
    """Mock database session."""
    session = AsyncMock(spec=AsyncSession)
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.execute = AsyncMock()
    session.refresh = AsyncMock()
    return session


@pytest.fixture
def mock_minio_client():
    """Mock MinIO client."""
    client = AsyncMock()
    client.download_image = AsyncMock()
    client.store_batch_results = AsyncMock()
    client.delete_batch_results = AsyncMock()
    client.upload_model_version = AsyncMock()
    return client


@pytest.fixture
def batch_processor(mock_minio_client):
    """Create batch processor instance."""
    config = BatchConfiguration(
        max_workers=5,
        chunk_size=2,
        max_retries=2,
        retry_delays=[1, 2],
    )
    return BatchProcessor(config=config, minio_client=mock_minio_client)


@pytest.fixture
def sample_batch_job():
    """Create sample batch job."""
    return BatchJob(
        id=uuid4(),
        status=BatchStatus.PENDING,
        total_items=10,
        processed_items=0,
        failed_items=0,
        processing_type=ProcessingType.DETECTION,
        created_at=datetime.utcnow(),
    )


@pytest.fixture
def sample_batch_items():
    """Create sample batch items."""
    batch_id = uuid4()
    return [
        BatchItem(
            id=uuid4(),
            batch_id=batch_id,
            image_path=f"test_image_{i}.jpg",
            status=ItemStatus.PENDING,
        )
        for i in range(5)
    ]


class TestBatchProcessor:
    """Test batch processor functionality."""

    @pytest.mark.asyncio
    async def test_process_batch(
        self,
        batch_processor,
        mock_db_session,
        sample_batch_job,
        sample_batch_items,
    ):
        """Test batch processing."""
        # Mock database queries
        mock_db_session.execute.return_value.scalar_one_or_none.return_value = sample_batch_job
        mock_db_session.execute.return_value.scalars.return_value.all.return_value = sample_batch_items

        # Mock WebSocket manager
        with patch("app.batch.processor.batch_ws_manager") as mock_ws:
            mock_ws.emit_batch_started = AsyncMock()
            mock_ws.emit_batch_progress = AsyncMock()
            mock_ws.emit_batch_completed = AsyncMock()
            mock_ws.emit_item_processing = AsyncMock()
            mock_ws.emit_item_completed = AsyncMock()

            # Mock image processing
            with patch.object(
                batch_processor,
                "_process_image",
                return_value={"result": "success"}
            ):
                result = await batch_processor.process_batch(
                    str(sample_batch_job.id),
                    mock_db_session,
                )

        assert result["status"] == "completed"
        assert "processed" in result
        assert "failed" in result
        mock_db_session.commit.assert_called()

    @pytest.mark.asyncio
    async def test_process_single_item(
        self,
        batch_processor,
        mock_db_session,
        sample_batch_items,
    ):
        """Test single item processing."""
        item = sample_batch_items[0]

        with patch("app.batch.processor.batch_ws_manager") as mock_ws:
            mock_ws.emit_item_processing = AsyncMock()
            mock_ws.emit_item_completed = AsyncMock()

            with patch.object(
                batch_processor,
                "_process_image",
                return_value={"result": "success"}
            ):
                result = await batch_processor._process_single_item(
                    "batch-123",
                    item,
                    ProcessingType.DETECTION,
                    mock_db_session,
                    0,
                )

        assert result["success"] is True
        assert result["item_id"] == str(item.id)
        assert "result" in result

    @pytest.mark.asyncio
    async def test_process_single_item_with_retry(
        self,
        batch_processor,
        mock_db_session,
        sample_batch_items,
    ):
        """Test item processing with retry logic."""
        item = sample_batch_items[0]

        with patch("app.batch.processor.batch_ws_manager") as mock_ws:
            mock_ws.emit_item_processing = AsyncMock()
            mock_ws.emit_item_failed = AsyncMock()
            mock_ws.emit_item_completed = AsyncMock()

            # First attempt fails, second succeeds
            with patch.object(
                batch_processor,
                "_process_image",
                side_effect=[
                    Exception("Temporary error"),
                    {"result": "success"}
                ]
            ):
                with patch("asyncio.sleep", return_value=None):
                    result = await batch_processor._process_single_item(
                        "batch-123",
                        item,
                        ProcessingType.DETECTION,
                        mock_db_session,
                        0,
                    )

        assert result["success"] is True
        mock_ws.emit_item_failed.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_single_item_max_retries(
        self,
        batch_processor,
        mock_db_session,
        sample_batch_items,
    ):
        """Test item processing with max retries exceeded."""
        item = sample_batch_items[0]

        with patch("app.batch.processor.batch_ws_manager") as mock_ws:
            mock_ws.emit_item_processing = AsyncMock()
            mock_ws.emit_item_failed = AsyncMock()

            # All attempts fail
            with patch.object(
                batch_processor,
                "_process_image",
                side_effect=Exception("Persistent error")
            ):
                with patch("asyncio.sleep", return_value=None):
                    result = await batch_processor._process_single_item(
                        "batch-123",
                        item,
                        ProcessingType.DETECTION,
                        mock_db_session,
                        0,
                    )

        assert result["success"] is False
        assert result["error"] == "Persistent error"
        assert mock_ws.emit_item_failed.call_count == 3  # Initial + 2 retries

    @pytest.mark.asyncio
    async def test_load_and_preprocess_image(self, batch_processor):
        """Test image loading and preprocessing."""
        # Mock cv2.imread
        with patch("cv2.imread") as mock_imread:
            mock_image = np.random.randint(0, 255, (3000, 3000, 3), dtype=np.uint8)
            mock_imread.return_value = mock_image

            image = await batch_processor._load_and_preprocess_image("test.jpg")

        # Should be resized
        assert image.shape[0] <= 2048
        assert image.shape[1] <= 2048

    @pytest.mark.asyncio
    async def test_load_image_from_minio(
        self,
        batch_processor,
        mock_minio_client,
    ):
        """Test loading image from MinIO."""
        mock_minio_client.download_image.return_value = b"fake_image_data"

        with patch("cv2.imdecode") as mock_decode:
            mock_decode.return_value = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)

            image = await batch_processor._load_and_preprocess_image("s3://bucket/image.jpg")

        mock_minio_client.download_image.assert_called_once()
        assert image is not None

    @pytest.mark.asyncio
    async def test_process_items_in_chunks(
        self,
        batch_processor,
        mock_db_session,
        sample_batch_items,
    ):
        """Test chunked processing of items."""
        with patch("app.batch.processor.batch_ws_manager") as mock_ws:
            mock_ws.emit_batch_progress = AsyncMock()
            mock_ws.emit_item_processing = AsyncMock()
            mock_ws.emit_item_completed = AsyncMock()

            with patch.object(
                batch_processor,
                "_process_image",
                return_value={"result": "success"}
            ):
                results = await batch_processor._process_items_in_chunks(
                    "batch-123",
                    sample_batch_items,
                    ProcessingType.DETECTION,
                    mock_db_session,
                )

        assert len(results) == len(sample_batch_items)
        assert all(r["success"] for r in results)

    @pytest.mark.asyncio
    async def test_store_results(self, batch_processor, mock_minio_client):
        """Test result storage."""
        results = [
            {"item_id": "1", "success": True, "result": {}},
            {"item_id": "2", "success": False, "error": "Failed"},
        ]

        path = await batch_processor._store_results("batch-123", results)

        assert "batches/" in path
        assert "batch-123" in path
        mock_minio_client.store_batch_results.assert_called_once()

    @pytest.mark.asyncio
    async def test_cancel_batch(self, batch_processor, mock_db_session):
        """Test batch cancellation."""
        batch_id = "batch-123"

        # Add active batch
        mock_task = AsyncMock()
        batch_processor.active_batches[batch_id] = mock_task

        result = await batch_processor.cancel_batch(batch_id, mock_db_session)

        assert result is True
        assert batch_id not in batch_processor.active_batches
        mock_task.cancel.assert_called_once()

    @pytest.mark.asyncio
    async def test_cleanup_old_batches(
        self,
        batch_processor,
        mock_db_session,
        mock_minio_client,
    ):
        """Test cleanup of old batches."""
        old_batch = BatchJob(
            id=uuid4(),
            status=BatchStatus.COMPLETED,
            completed_at=datetime.utcnow() - timedelta(days=10),
            total_items=5,
        )

        mock_db_session.execute.return_value.scalars.return_value.all.return_value = [old_batch]

        count = await batch_processor.cleanup_old_batches(mock_db_session)

        assert count == 1
        mock_minio_client.delete_batch_results.assert_called_once()
        mock_db_session.commit.assert_called()


class TestBatchModels:
    """Test batch data models."""

    def test_batch_job_create_validation(self):
        """Test batch job creation validation."""
        # Valid creation
        job = BatchJobCreate(
            processing_type=ProcessingType.DETECTION,
            images=["image1.jpg", "image2.jpg"],
            priority=5,
        )
        assert len(job.images) == 2
        assert job.priority == 5

        # Test validation
        with pytest.raises(ValueError):
            BatchJobCreate(
                processing_type=ProcessingType.DETECTION,
                images=[],  # Empty list should fail
            )

    def test_batch_progress_percentage(self):
        """Test progress percentage calculation."""
        from app.batch.models import BatchJobResponse

        response = BatchJobResponse(
            id="123",
            status=BatchStatus.PROCESSING,
            total_items=100,
            processed_items=25,
            failed_items=5,
            progress=30,
            created_at=datetime.utcnow(),
            processing_type=ProcessingType.DETECTION,
            priority=5,
        )

        assert response.progress_percentage == 25.0

    def test_error_retryability(self):
        """Test error retryability check."""
        from app.batch.models import BatchErrorReport

        # Retryable error
        error1 = BatchErrorReport(
            batch_id="123",
            item_id="456",
            error_type="NetworkError",
            error_message="Connection timeout",
            retry_count=1,
            timestamp=datetime.utcnow(),
        )
        assert error1.is_retryable() is True

        # Non-retryable error
        error2 = BatchErrorReport(
            batch_id="123",
            item_id="789",
            error_type="InvalidFormat",
            error_message="Not an image file",
            retry_count=0,
            timestamp=datetime.utcnow(),
        )
        assert error2.is_retryable() is False


class TestBatchTasks:
    """Test Celery batch tasks."""

    @patch("app.batch.tasks.get_db_sync")
    @patch("app.batch.tasks.BatchProcessor")
    def test_process_batch_task(self, mock_processor_class, mock_get_db):
        """Test batch processing Celery task."""
        mock_processor = MagicMock()
        mock_processor_class.return_value = mock_processor

        # Mock async processing
        mock_processor.process_batch = MagicMock()
        mock_processor.process_batch.return_value = {
            "status": "completed",
            "processed": 10,
            "failed": 0,
        }

        # Mock asyncio
        with patch("asyncio.new_event_loop") as mock_loop:
            loop = MagicMock()
            mock_loop.return_value = loop
            loop.run_until_complete.return_value = {
                "status": "completed",
                "processed": 10,
                "failed": 0,
            }

            result = process_batch("batch-123", priority=5)

        assert result["status"] == "completed"
        assert result["processed"] == 10

    @patch("app.batch.tasks.get_db_sync")
    def test_monitor_batch_progress(self, mock_get_db):
        """Test batch progress monitoring."""
        from app.batch.tasks import monitor_batch_progress

        mock_batch = MagicMock()
        mock_batch.id = uuid4()
        mock_batch.status = BatchStatus.PROCESSING
        mock_batch.total_items = 100
        mock_batch.processed_items = 50
        mock_batch.failed_items = 5
        mock_batch.created_at = datetime.utcnow()

        mock_db = MagicMock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = mock_batch
        mock_get_db.return_value.__enter__.return_value = mock_db

        result = monitor_batch_progress(str(mock_batch.id))

        assert result["status"] == BatchStatus.PROCESSING
        assert result["progress"] == 50.0

    @patch("app.batch.tasks.AsyncResult")
    @patch("app.batch.tasks.get_db_sync")
    def test_cancel_batch_task(self, mock_get_db, mock_async_result):
        """Test batch cancellation task."""
        from app.batch.tasks import cancel_batch

        mock_result = MagicMock()
        mock_result.state = "STARTED"
        mock_async_result.return_value = mock_result

        mock_batch = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = mock_batch
        mock_get_db.return_value.__enter__.return_value = mock_db

        result = cancel_batch("batch-123")

        assert result is True
        mock_result.revoke.assert_called_once()


@pytest.mark.integration
class TestBatchProcessingIntegration:
    """Integration tests for batch processing."""

    @pytest.mark.asyncio
    async def test_end_to_end_batch_processing(self, tmp_path):
        """Test end-to-end batch processing workflow."""
        # Create processor
        processor = BatchProcessor()

        # Create test images
        test_images = []
        for i in range(5):
            img_path = tmp_path / f"test_{i}.jpg"
            # Create dummy image file
            import cv2
            img = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
            cv2.imwrite(str(img_path), img)
            test_images.append(str(img_path))

        # Mock database and WebSocket
        with patch("app.batch.processor.batch_ws_manager") as mock_ws:
            mock_ws.emit_batch_started = AsyncMock()
            mock_ws.emit_batch_progress = AsyncMock()
            mock_ws.emit_batch_completed = AsyncMock()
            mock_ws.emit_item_processing = AsyncMock()
            mock_ws.emit_item_completed = AsyncMock()

            # Create mock batch job and items
            batch_job = BatchJob(
                id=uuid4(),
                status=BatchStatus.PENDING,
                total_items=len(test_images),
                processing_type=ProcessingType.VALIDATION,
            )

            batch_items = [
                BatchItem(
                    id=uuid4(),
                    batch_id=batch_job.id,
                    image_path=img_path,
                    status=ItemStatus.PENDING,
                )
                for img_path in test_images
            ]

            # Process items
            results = await processor._process_items_in_chunks(
                str(batch_job.id),
                batch_items,
                ProcessingType.VALIDATION,
                AsyncMock(),
            )

            assert len(results) == len(test_images)
            assert all("item_id" in r for r in results)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--cov=app.batch"])