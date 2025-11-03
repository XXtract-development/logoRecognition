"""
Test suite for ML Model Integration with EfficientDet-D4
STORY-003: ML Model Integration with Versioning
"""
import pytest
import numpy as np
import time
import asyncio
from unittest.mock import Mock, patch, MagicMock
import io
from PIL import Image


class TestMLModelIntegration:
    """Test EfficientDet-D4 model integration"""

    @pytest.fixture
    def model_config(self):
        """Model configuration for testing"""
        return {
            'model_name': 'EfficientDet-D4',
            'model_path': '/models/efficientdet_d4.onnx',
            'input_size': (1024, 1024),
            'num_classes': 80,
            'confidence_threshold': 0.5,
            'nms_threshold': 0.5
        }

    @pytest.fixture
    def test_image(self):
        """Create test image"""
        img = Image.new('RGB', (1024, 1024), color='white')
        return img

    @pytest.mark.asyncio
    async def test_model_serving_with_onnx(self, model_config):
        """Test EfficientDet-D4 model served via ONNX Runtime"""
        from app.ml_model import ModelServer

        server = ModelServer(model_config)

        # Verify ONNX Runtime configuration
        assert server.runtime == 'onnxruntime'
        assert server.model_name == 'EfficientDet-D4'
        assert server.optimization_level == 3

        # Test model loading
        await server.load_model()
        assert server.model is not None
        assert server.is_loaded is True

    @pytest.mark.asyncio
    async def test_model_versioning(self, model_config):
        """Test model versioning with semantic versioning"""
        from app.ml_model import ModelRegistry

        registry = ModelRegistry()

        # Register model versions
        v1 = await registry.register_model(
            name='EfficientDet-D4',
            version='1.0.0',
            path='/models/v1.onnx',
            metadata={'accuracy': 0.92}
        )

        v2 = await registry.register_model(
            name='EfficientDet-D4',
            version='1.1.0',
            path='/models/v2.onnx',
            metadata={'accuracy': 0.94}
        )

        # Verify semantic versioning
        assert registry.get_latest_version() == '1.1.0'
        assert registry.compare_versions('1.0.0', '1.1.0') == -1

        # Test version retrieval
        model = await registry.get_model('1.0.0')
        assert model['version'] == '1.0.0'

    @pytest.mark.asyncio
    async def test_ab_testing_framework(self):
        """Test A/B testing framework for model comparison"""
        from app.ml_model import ABTestManager

        manager = ABTestManager()

        # Configure A/B test
        await manager.configure_test(
            model_a={'name': 'EfficientDet-D4', 'version': '1.0.0'},
            model_b={'name': 'EfficientDet-D4', 'version': '1.1.0'},
            traffic_split={'a': 90, 'b': 10}
        )

        # Test traffic routing
        assignments = []
        for _ in range(1000):
            model = await manager.route_request()
            assignments.append(model['version'])

        # Verify traffic split (with tolerance)
        count_a = assignments.count('1.0.0')
        assert 850 <= count_a <= 950  # 90% ± 5%

    @pytest.mark.asyncio
    async def test_inference_performance(self, model_config, test_image):
        """Test inference <150ms for single image"""
        from app.ml_model import InferenceEngine

        engine = InferenceEngine(model_config)
        await engine.initialize()

        # Convert image to numpy array
        img_array = np.array(test_image)

        # Measure inference time
        start_time = time.time()
        predictions = await engine.predict(img_array)
        inference_time = (time.time() - start_time) * 1000  # ms

        assert inference_time < 150
        assert 'boxes' in predictions
        assert 'scores' in predictions
        assert 'classes' in predictions

    @pytest.mark.asyncio
    async def test_batch_inference(self, model_config):
        """Test batch inference for up to 32 images"""
        from app.ml_model import BatchInferenceEngine

        engine = BatchInferenceEngine(model_config)

        # Create batch of test images
        batch_size = 32
        batch = [np.random.rand(1024, 1024, 3).astype(np.float32) for _ in range(batch_size)]

        # Test batch inference
        results = await engine.batch_predict(batch)

        assert len(results) == batch_size
        for result in results:
            assert 'boxes' in result
            assert 'scores' in result

    @pytest.mark.asyncio
    async def test_model_performance_metrics(self):
        """Test model performance metrics to Prometheus"""
        from app.ml_model import ModelMetrics

        metrics = ModelMetrics()

        # Track inference metrics
        await metrics.track_inference(
            model_version='1.0.0',
            duration_ms=45.2,
            success=True
        )

        await metrics.track_batch_inference(
            model_version='1.0.0',
            batch_size=32,
            total_duration_ms=850.5
        )

        # Verify metrics
        exported = metrics.export()
        assert 'model_inference_duration_seconds' in exported
        assert 'model_inference_total' in exported
        assert 'model_batch_size' in exported

    @pytest.mark.asyncio
    async def test_model_warmup(self, model_config):
        """Test automatic model warm-up on startup"""
        from app.ml_model import ModelServer

        server = ModelServer(model_config)

        # Test warm-up
        warmup_result = await server.warmup(iterations=10)

        assert warmup_result['iterations'] == 10
        assert warmup_result['avg_time_ms'] < 150
        assert server.is_warmed_up is True

    @pytest.mark.asyncio
    async def test_gpu_cpu_fallback(self, model_config):
        """Test GPU and CPU inference with automatic fallback"""
        from app.ml_model import InferenceEngine

        engine = InferenceEngine(model_config)

        # Try GPU first
        gpu_available = await engine.check_gpu_availability()

        if gpu_available:
            assert engine.device == 'cuda'
        else:
            # Fallback to CPU
            assert engine.device == 'cpu'

        # Test inference works on selected device
        test_input = np.random.rand(1, 1024, 1024, 3).astype(np.float32)
        result = await engine.predict(test_input)
        assert result is not None

    @pytest.mark.asyncio
    async def test_model_registry_metadata(self):
        """Test model registry with metadata tracking"""
        from app.ml_model import ModelRegistry

        registry = ModelRegistry()

        # Register model with metadata
        await registry.register_model(
            name='EfficientDet-D4',
            version='1.0.0',
            path='/models/efficientdet.onnx',
            metadata={
                'accuracy': 0.92,
                'precision': 0.89,
                'recall': 0.91,
                'f1_score': 0.90,
                'training_date': '2024-01-15',
                'dataset': 'COCO',
                'parameters': 20.5e6
            }
        )

        # Query model metadata
        metadata = await registry.get_model_metadata('1.0.0')
        assert metadata['accuracy'] == 0.92
        assert metadata['parameters'] == 20.5e6

    @pytest.mark.asyncio
    async def test_dynamic_batching(self, model_config):
        """Test dynamic batching with 100ms timeout"""
        from app.ml_model import DynamicBatcher

        batcher = DynamicBatcher(
            max_batch_size=32,
            timeout_ms=100
        )

        # Add requests to batcher
        requests = []
        for i in range(10):
            req = batcher.add_request(
                np.random.rand(1024, 1024, 3).astype(np.float32)
            )
            requests.append(req)

        # Wait for batch processing
        await asyncio.sleep(0.15)  # Wait for timeout

        # Verify all requests processed
        for req in requests:
            result = await req
            assert result is not None

    @pytest.mark.asyncio
    async def test_tensorrt_acceleration(self, model_config):
        """Test TensorRT acceleration for GPU inference"""
        from app.ml_model import TensorRTEngine

        # Skip if TensorRT not available
        if not TensorRTEngine.is_available():
            pytest.skip("TensorRT not available")

        engine = TensorRTEngine(model_config)
        await engine.optimize_model()

        # Test optimized inference
        test_input = np.random.rand(1, 1024, 1024, 3).astype(np.float32)

        start_time = time.time()
        result = await engine.predict(test_input)
        inference_time = (time.time() - start_time) * 1000

        # TensorRT should provide faster inference
        assert inference_time < 100  # Faster than 150ms requirement
        assert result is not None

    @pytest.mark.asyncio
    async def test_model_caching_in_redis(self):
        """Test model caching in Redis"""
        from app.ml_model import ModelCache

        cache = ModelCache(redis_url='redis://localhost:6379')

        # Cache model outputs
        test_key = 'image_hash_123'
        test_predictions = {
            'boxes': [[10, 20, 100, 200]],
            'scores': [0.95],
            'classes': ['logo']
        }

        await cache.set(test_key, test_predictions, ttl=300)

        # Retrieve from cache
        cached = await cache.get(test_key)
        assert cached == test_predictions

    @pytest.mark.asyncio
    async def test_automatic_rollback(self):
        """Test automatic rollback on error rate >5%"""
        from app.ml_model import ModelDeployment

        deployment = ModelDeployment()

        # Deploy new model
        await deployment.deploy(
            model_version='1.1.0',
            rollback_threshold=0.05
        )

        # Simulate errors
        for i in range(100):
            success = i < 94  # 6% error rate
            await deployment.record_inference(success=success)

        # Check if rollback triggered
        status = await deployment.get_status()
        assert status['current_version'] == '1.0.0'  # Rolled back
        assert status['rollback_reason'] == 'Error rate exceeded 5%'

    @pytest.mark.asyncio
    async def test_model_monitoring_metrics(self):
        """Test comprehensive model monitoring"""
        from app.ml_model import ModelMonitor

        monitor = ModelMonitor()

        # Track various metrics
        await monitor.track_latency('1.0.0', p50=45, p95=120, p99=145)
        await monitor.track_accuracy('1.0.0', accuracy=0.92)
        await monitor.track_gpu_utilization(85.5)
        await monitor.track_memory_usage(model_version='1.0.0', memory_mb=2048)

        # Get monitoring report
        report = await monitor.get_report()
        assert report['latency']['p99'] == 145
        assert report['accuracy'] == 0.92
        assert report['gpu_utilization'] == 85.5
        assert report['memory_usage_mb'] == 2048