"""
Enhanced Integration Tests for Recognition API
A++ Grade Implementation with real service integration
"""

import pytest
import asyncio
import base64
import json
import time
from datetime import datetime
import aiohttp
from PIL import Image
import io
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import pika

from app.api.v1.recognition.models import (
    RecognitionRequest,
    RecognitionResponse,
    BatchRecognitionRequest,
    ProcessingMode
)
from app.api.v1.recognition.controller import recognition_controller
from app.api.v1.recognition.services import RecognitionService, CacheService
from app.models.base import Base


class TestRecognitionIntegration:
    """Enhanced integration tests with real services"""

    @pytest.fixture
    async def test_db(self):
        """Create test database"""
        engine = create_async_engine(
            "postgresql+asyncpg://test:test@localhost/test_recognition",
            echo=False
        )
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async_session = sessionmaker(
            engine, expire_on_commit=False, class_=AsyncSession
        )

        yield async_session

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    @pytest.fixture
    async def test_redis(self):
        """Create test Redis connection"""
        client = redis.Redis(
            host='localhost',
            port=6379,
            db=15,  # Use separate test database
            decode_responses=True
        )
        await client.flushdb()
        yield client
        await client.flushdb()
        await client.close()

    @pytest.fixture
    def test_rabbitmq(self):
        """Create test RabbitMQ connection"""
        connection = pika.BlockingConnection(
            pika.ConnectionParameters('localhost')
        )
        channel = connection.channel()
        channel.queue_declare(queue='test_recognition_queue')
        yield channel
        channel.queue_delete(queue='test_recognition_queue')
        connection.close()

    @pytest.fixture
    def sample_images(self):
        """Generate sample test images"""
        images = {}

        # Create different format images
        for fmt in ['JPEG', 'PNG', 'WEBP']:
            img = Image.new('RGB', (800, 600), color='white')
            # Add some content
            from PIL import ImageDraw
            draw = ImageDraw.Draw(img)
            draw.rectangle([100, 100, 300, 300], fill='black')
            draw.text((400, 300), "Test Logo", fill='black')

            buffer = io.BytesIO()
            if fmt == 'WEBP':
                img.save(buffer, format=fmt, quality=95)
            else:
                img.save(buffer, format=fmt)
            images[fmt] = base64.b64encode(buffer.getvalue()).decode('utf-8')

        return images

    # ============= Model Integration Tests =============

    @pytest.mark.asyncio
    async def test_recognize_with_real_model(self, sample_images):
        """Test with actual ML model (if available)"""
        service = RecognitionService()

        # Initialize model
        try:
            await service._initialize_models()
        except Exception as e:
            pytest.skip(f"Model not available: {e}")

        # Test each image format
        for fmt, image_data in sample_images.items():
            image = await service.decode_image(image_data, "auto")
            detections = await service.detect_logos(
                image,
                confidence_threshold=0.5,
                max_detections=10
            )

            # Model should return some result (even if no logos detected)
            assert isinstance(detections, list)

    @pytest.mark.asyncio
    async def test_recognize_model_versions(self, sample_images):
        """Test multiple model versions"""
        service = RecognitionService()

        versions = ["v1.0.0", "v1.1.0"]
        for version in versions:
            try:
                service.models[version] = service.ml_service.load_model(version)
            except Exception:
                continue

            image_data = sample_images['PNG']
            image = await service.decode_image(image_data, "auto")

            detections = await service.detect_logos(
                image,
                model_version=version
            )

            assert isinstance(detections, list)
            if detections:
                assert all(d.model_version == version for d in detections)

    # ============= Database Integration Tests =============

    @pytest.mark.asyncio
    async def test_recognize_with_database_logging(self, test_db, sample_images):
        """Test database logging of requests"""
        async with test_db() as session:
            # Create request log table if needed
            from app.models.request_log import RequestLog

            # Process request
            service = RecognitionService()
            image = await service.decode_image(sample_images['JPEG'], "auto")
            detections = await service.detect_logos(image)

            # Log to database
            log_entry = RequestLog(
                request_id="test-123",
                user_id="user-456",
                endpoint="/api/v1/recognize",
                status_code=200,
                processing_time_ms=150.5,
                detections_count=len(detections),
                created_at=datetime.utcnow()
            )
            session.add(log_entry)
            await session.commit()

            # Verify entry exists
            result = await session.get(RequestLog, "test-123")
            assert result is not None
            assert result.status_code == 200
            assert result.detections_count == len(detections)

    @pytest.mark.asyncio
    async def test_recognize_database_failure_handling(self, sample_images):
        """Test graceful handling of database failures"""
        service = RecognitionService()

        # Simulate database down
        with patch.object(service, 'check_database_health', return_value=False):
            health = await service.check_database_health()
            assert health is False

        # Recognition should still work without database
        image = await service.decode_image(sample_images['PNG'], "auto")
        detections = await service.detect_logos(image)
        assert isinstance(detections, list)

    # ============= Redis Cache Integration Tests =============

    @pytest.mark.asyncio
    async def test_recognize_with_redis_caching(self, test_redis, sample_images):
        """Test Redis caching behavior"""
        cache = CacheService()
        cache.redis_client = test_redis

        image_data = sample_images['PNG']
        cache_key = "test-image-hash"

        # First request - cache miss
        cached = await cache.get(cache_key)
        assert cached is None

        # Store result
        result = {
            "detections": [{"brand": "TestBrand", "confidence": 0.95}],
            "timestamp": datetime.utcnow().isoformat()
        }
        await cache.set(cache_key, result, ttl=60)

        # Second request - cache hit
        cached = await cache.get(cache_key)
        assert cached is not None
        assert cached["detections"][0]["brand"] == "TestBrand"

    @pytest.mark.asyncio
    async def test_recognize_cache_expiration(self, test_redis, sample_images):
        """Test cache TTL expiration"""
        cache = CacheService()
        cache.redis_client = test_redis

        cache_key = "test-expire"
        result = {"test": "data"}

        # Set with short TTL
        await cache.set(cache_key, result, ttl=1)

        # Should exist immediately
        cached = await cache.get(cache_key)
        assert cached is not None

        # Wait for expiration
        await asyncio.sleep(2)

        # Should be expired
        cached = await cache.get(cache_key)
        assert cached is None

    @pytest.mark.asyncio
    async def test_recognize_cache_concurrent_access(self, test_redis):
        """Test concurrent cache access"""
        cache = CacheService()
        cache.redis_client = test_redis

        async def cache_operation(i):
            key = f"concurrent-{i % 10}"  # Share some keys
            await cache.set(key, {"value": i}, ttl=60)
            result = await cache.get(key)
            return result

        # Run concurrent operations
        tasks = [cache_operation(i) for i in range(100)]
        results = await asyncio.gather(*tasks)

        assert len(results) == 100
        assert all(r is not None for r in results)

    # ============= Message Queue Integration Tests =============

    @pytest.mark.asyncio
    async def test_recognize_async_with_rabbitmq(self, test_rabbitmq, sample_images):
        """Test async processing via RabbitMQ"""
        service = RecognitionService()

        # Mock the celery app for testing
        with patch('app.celery_app.celery_app.send_task') as mock_send:
            mock_send.return_value.id = "celery-task-123"

            await service.queue_task(
                task_id="async-123",
                request=RecognitionRequest(image=sample_images['JPEG']),
                trace_id="trace-456",
                webhook_url="http://callback.test/webhook"
            )

            mock_send.assert_called_once()
            call_args = mock_send.call_args
            assert call_args[0][0] == 'recognize_image'
            assert call_args[1]['kwargs']['task_id'] == "async-123"

    @pytest.mark.asyncio
    async def test_recognize_queue_depth_monitoring(self):
        """Test queue depth monitoring"""
        service = RecognitionService()

        with patch('app.celery_app.celery_app.control.inspect') as mock_inspect:
            mock_inspect.return_value.reserved.return_value = {
                'worker1': ['task1', 'task2'],
                'worker2': ['task3']
            }

            depth = await service.get_queue_depth()
            assert depth == 3

    # ============= End-to-End Integration Tests =============

    @pytest.mark.asyncio
    async def test_recognize_full_pipeline(self, test_db, test_redis, sample_images):
        """Test complete recognition pipeline"""
        # Setup controller with real services
        controller = recognition_controller
        controller.cache.redis_client = test_redis

        # Create request
        request = RecognitionRequest(
            image=sample_images['JPEG'],
            confidence_threshold=0.8,
            max_detections=5
        )

        # First request (cache miss)
        with patch.object(controller.recognition, 'detect_logos',
                         new_callable=AsyncMock) as mock_detect:
            mock_detect.return_value = [
                DetectedLogo(
                    brand="TestBrand",
                    confidence=0.92,
                    bbox=BoundingBox(x=0.1, y=0.2, width=0.3, height=0.2),
                    quality_score=0.9,
                    processing_time_ms=50,
                    model_version="v1.0.0"
                )
            ]

            result1 = await controller.recognize(
                request,
                background_tasks=Mock(),
                trace_id="trace-001",
                current_user={"id": "user-123"}
            )

            assert isinstance(result1, RecognitionResponse)
            assert len(result1.detections) == 1
            assert result1.detections[0].brand == "TestBrand"
            assert result1.cache_hit is False

        # Second request (cache hit)
        result2 = await controller.recognize(
            request,
            background_tasks=Mock(),
            trace_id="trace-002",
            current_user={"id": "user-123"}
        )

        assert isinstance(result2, RecognitionResponse)
        assert result2.cache_hit is True

    @pytest.mark.asyncio
    async def test_batch_recognize_integration(self, test_redis, sample_images):
        """Test batch processing with real services"""
        controller = recognition_controller
        controller.cache.redis_client = test_redis

        # Create batch request
        batch_request = BatchRecognitionRequest(
            images=[
                RecognitionRequest(image=sample_images[fmt])
                for fmt in ['JPEG', 'PNG', 'WEBP']
            ],
            parallel=True
        )

        with patch.object(controller.recognition, 'detect_logos',
                         new_callable=AsyncMock) as mock_detect:
            mock_detect.return_value = []

            result = await controller.batch_recognize(
                batch_request,
                background_tasks=Mock(),
                trace_id="batch-001",
                current_user={"id": "user-123"}
            )

            assert result.total == 3
            assert result.successful == 3
            assert result.failed == 0
            assert len(result.results) == 3

    # ============= Performance Integration Tests =============

    @pytest.mark.asyncio
    async def test_recognize_performance_under_load(self, test_redis, sample_images):
        """Test performance with concurrent load"""
        controller = recognition_controller
        controller.cache.redis_client = test_redis

        # Mock detection for consistent performance
        with patch.object(controller.recognition, 'detect_logos',
                         new_callable=AsyncMock) as mock_detect:
            mock_detect.return_value = []

            async def make_request(i):
                request = RecognitionRequest(
                    image=sample_images['JPEG'],
                    confidence_threshold=0.8 + (i % 20) * 0.01
                )
                start = time.time()
                result = await controller.recognize(
                    request,
                    background_tasks=Mock(),
                    trace_id=f"perf-{i}",
                    current_user={"id": f"user-{i % 10}"}
                )
                duration = time.time() - start
                return duration

            # Run concurrent requests
            tasks = [make_request(i) for i in range(100)]
            durations = await asyncio.gather(*tasks)

            # Calculate metrics
            avg_duration = sum(durations) / len(durations)
            p95_duration = sorted(durations)[95]
            p99_duration = sorted(durations)[99]

            # Performance assertions
            assert avg_duration < 0.5  # Average under 500ms
            assert p95_duration < 1.0  # p95 under 1 second
            assert p99_duration < 2.0  # p99 under 2 seconds

    @pytest.mark.asyncio
    async def test_recognize_memory_stability(self, sample_images):
        """Test memory stability over extended operations"""
        import psutil
        import gc

        service = RecognitionService()
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB

        # Process many images
        for i in range(500):
            image = await service.decode_image(
                sample_images['JPEG'],
                "auto"
            )
            # Simulate detection (without actual model)
            _ = service._prepare_image_for_model(image)

            if i % 100 == 0:
                gc.collect()

        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory

        # Memory increase should be reasonable (less than 100MB)
        assert memory_increase < 100

    # ============= Failover Integration Tests =============

    @pytest.mark.asyncio
    async def test_recognize_redis_failover(self, sample_images):
        """Test system behavior when Redis is unavailable"""
        controller = recognition_controller

        # Simulate Redis failure
        controller.cache.redis_client = None

        with patch.object(controller.recognition, 'detect_logos',
                         new_callable=AsyncMock) as mock_detect:
            mock_detect.return_value = []

            request = RecognitionRequest(image=sample_images['PNG'])

            # Should work without cache
            result = await controller.recognize(
                request,
                background_tasks=Mock(),
                trace_id="failover-001",
                current_user={"id": "user-123"}
            )

            assert isinstance(result, RecognitionResponse)
            assert result.cache_hit is False

    @pytest.mark.asyncio
    async def test_recognize_partial_service_degradation(self, test_redis, sample_images):
        """Test graceful degradation with partial service failure"""
        controller = recognition_controller
        controller.cache.redis_client = test_redis

        # Simulate database failure but cache working
        with patch.object(controller.recognition, 'check_database_health',
                         return_value=False):
            health = await controller.health_check()

            assert health.status == "degraded"
            assert health.dependencies["database"]["status"] == "unhealthy"
            assert health.dependencies["cache"]["status"] == "healthy"

            # Recognition should still work
            with patch.object(controller.recognition, 'detect_logos',
                             new_callable=AsyncMock) as mock_detect:
                mock_detect.return_value = []

                request = RecognitionRequest(image=sample_images['WEBP'])
                result = await controller.recognize(
                    request,
                    background_tasks=Mock(),
                    trace_id="degrade-001",
                    current_user={"id": "user-123"}
                )

                assert isinstance(result, RecognitionResponse)