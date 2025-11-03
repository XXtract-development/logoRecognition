"""
Test suite for Object Storage with MinIO and Security
STORY-002: Object Storage with Security
"""
import pytest
import asyncio
import hashlib
import io
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from datetime import datetime, timedelta
import json


class TestObjectStorage:
    """Test MinIO object storage with security features"""

    @pytest.fixture
    def storage_config(self):
        """Storage configuration for testing"""
        return {
            'endpoint': 'localhost:9000',
            'access_key': 'minioadmin',
            'secret_key': 'minioadmin123',
            'secure': False,
            'region': 'us-east-1',
            'bucket_name': 'logo-images'
        }

    @pytest.fixture
    def mock_minio_client(self):
        """Mock MinIO client"""
        client = MagicMock()
        client.bucket_exists = MagicMock(return_value=True)
        client.make_bucket = MagicMock()
        client.put_object = MagicMock()
        client.get_object = MagicMock()
        client.presigned_get_object = MagicMock(return_value="https://example.com/presigned")
        return client

    @pytest.mark.asyncio
    async def test_minio_cluster_setup(self, storage_config):
        """Test MinIO cluster with 4 nodes and erasure coding"""
        from app.storage import StorageCluster

        cluster = StorageCluster(storage_config)

        # Verify cluster configuration
        assert cluster.nodes_count == 4
        assert cluster.erasure_coding_enabled is True
        assert cluster.data_blocks == 2
        assert cluster.parity_blocks == 2

        # Test cluster health
        health = await cluster.check_health()
        assert health['status'] == 'healthy'
        assert health['nodes_online'] == 4
        assert health['erasure_sets'] == 1

    @pytest.mark.asyncio
    async def test_encryption_at_rest_and_transit(self, storage_config):
        """Test encryption at rest (AES-256) and in transit (TLS 1.3)"""
        from app.storage import SecureStorage

        storage = SecureStorage(storage_config)

        # Test encryption at rest
        test_data = b"sensitive logo data"
        encrypted = await storage.encrypt_data(test_data)

        # Verify AES-256 encryption
        assert encrypted != test_data
        assert storage.encryption_algorithm == 'AES-256-GCM'

        # Test decryption
        decrypted = await storage.decrypt_data(encrypted)
        assert decrypted == test_data

        # Test TLS configuration
        assert storage.tls_version == 'TLSv1.3'
        assert storage.tls_enabled is True

    @pytest.mark.asyncio
    async def test_virus_scanning_on_upload(self, mock_minio_client):
        """Test automated virus scanning on upload"""
        from app.storage import VirusScannerMiddleware

        scanner = VirusScannerMiddleware(mock_minio_client)

        # Test clean file
        clean_file = io.BytesIO(b"clean image data")
        scan_result = await scanner.scan_file(clean_file)
        assert scan_result['status'] == 'clean'
        assert scan_result['threats'] == []

        # Test infected file simulation
        infected_file = io.BytesIO(b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")
        scan_result = await scanner.scan_file(infected_file)
        assert scan_result['status'] == 'infected'
        assert len(scan_result['threats']) > 0

        # Verify upload blocking for infected files
        with pytest.raises(ValueError, match="Virus detected"):
            await scanner.upload_with_scan(infected_file, "test.jpg")

    @pytest.mark.asyncio
    async def test_presigned_urls_with_expiration(self, mock_minio_client):
        """Test presigned URLs with 1-hour expiration"""
        from app.storage import StorageManager

        manager = StorageManager(mock_minio_client)

        # Generate presigned URL
        url = await manager.generate_presigned_url(
            bucket="logo-images",
            object_name="test-logo.jpg",
            expiry_seconds=3600
        )

        assert url is not None
        assert "X-Amz-Expires=3600" in url or mock_minio_client.presigned_get_object.called

        # Verify expiration time
        mock_minio_client.presigned_get_object.assert_called_with(
            "logo-images",
            "test-logo.jpg",
            expires=timedelta(seconds=3600)
        )

    @pytest.mark.asyncio
    async def test_object_versioning(self, storage_config):
        """Test object versioning with 30-day retention"""
        from app.storage import VersionedStorage

        storage = VersionedStorage(storage_config)

        # Enable versioning on bucket
        await storage.enable_versioning("logo-images")

        # Upload multiple versions
        object_name = "logo-v1.jpg"
        version1 = await storage.upload_object(object_name, b"version 1 data")
        version2 = await storage.upload_object(object_name, b"version 2 data")
        version3 = await storage.upload_object(object_name, b"version 3 data")

        # List versions
        versions = await storage.list_object_versions(object_name)
        assert len(versions) == 3

        # Verify retention policy
        retention = await storage.get_retention_policy("logo-images")
        assert retention['days'] == 30
        assert retention['mode'] == 'GOVERNANCE'

        # Test version restoration
        await storage.restore_version(object_name, version1['version_id'])
        current = await storage.get_object(object_name)
        assert current == b"version 1 data"

    @pytest.mark.asyncio
    async def test_s3_event_notifications(self):
        """Test S3 event notifications to Redis"""
        from app.storage import EventNotifier

        notifier = EventNotifier()

        # Configure event notifications
        events = await notifier.configure_notifications(
            bucket="logo-images",
            events=['s3:ObjectCreated:*', 's3:ObjectRemoved:*'],
            destination='redis://localhost:6379/0'
        )

        assert 's3:ObjectCreated:Put' in events
        assert 's3:ObjectRemoved:Delete' in events

        # Test event publishing
        test_event = {
            'eventName': 's3:ObjectCreated:Put',
            'bucket': 'logo-images',
            'object': 'new-logo.jpg',
            'timestamp': datetime.utcnow().isoformat()
        }

        await notifier.publish_event(test_event)

        # Verify event in Redis
        received_event = await notifier.get_latest_event()
        assert received_event['object'] == 'new-logo.jpg'

    @pytest.mark.asyncio
    async def test_prometheus_metrics_for_storage(self):
        """Test Prometheus metrics for storage operations"""
        from app.storage import StorageMetrics

        metrics = StorageMetrics()

        # Test operation tracking
        await metrics.track_upload("logo-images", 1024 * 1024)  # 1MB
        await metrics.track_download("logo-images", 512 * 1024)  # 512KB
        await metrics.track_delete("logo-images")

        # Verify metrics
        metrics_data = metrics.export()
        assert 'minio_uploads_total' in metrics_data
        assert 'minio_downloads_total' in metrics_data
        assert 'minio_storage_bytes' in metrics_data
        assert 'minio_operation_duration_seconds' in metrics_data

    @pytest.mark.asyncio
    async def test_availability_sla_monitoring(self, storage_config):
        """Test 99.9% availability SLA monitoring"""
        from app.storage import SLAMonitor

        monitor = SLAMonitor(storage_config)

        # Start monitoring
        await monitor.start_monitoring(interval=60)

        # Simulate availability checks
        for _ in range(1000):
            await monitor.record_availability_check(success=True)

        # Add some failures
        for _ in range(1):
            await monitor.record_availability_check(success=False)

        # Calculate SLA
        sla = await monitor.calculate_sla(period_days=30)
        assert sla['availability_percentage'] >= 99.9
        assert sla['downtime_minutes'] <= 43.2  # 0.1% of 30 days

        # Check alerting for SLA breach
        alerts = await monitor.check_sla_alerts()
        assert len(alerts) == 0  # No alerts as SLA is met

    @pytest.mark.asyncio
    async def test_automated_backup_to_secondary(self, mock_minio_client):
        """Test automated backup to secondary storage"""
        from app.storage import BackupManager

        manager = BackupManager(
            primary_client=mock_minio_client,
            secondary_endpoint='backup.storage.com'
        )

        # Configure backup schedule
        await manager.schedule_backups(
            bucket="logo-images",
            interval_hours=6,
            retention_days=30
        )

        # Test backup execution
        backup_result = await manager.perform_backup("logo-images")
        assert backup_result['status'] == 'success'
        assert backup_result['objects_backed_up'] > 0
        assert backup_result['size_gb'] > 0

        # Verify incremental backup
        incremental = await manager.perform_incremental_backup("logo-images")
        assert incremental['type'] == 'incremental'
        assert incremental['changes_backed_up'] >= 0

    @pytest.mark.asyncio
    async def test_multipart_upload_for_large_files(self, mock_minio_client):
        """Test multipart upload for files >5MB"""
        from app.storage import MultipartUploader

        uploader = MultipartUploader(mock_minio_client)

        # Create large file (10MB)
        large_file = io.BytesIO(b"x" * (10 * 1024 * 1024))

        # Upload with multipart
        result = await uploader.upload_large_file(
            bucket="logo-images",
            object_name="large-logo.jpg",
            file_data=large_file,
            part_size=5 * 1024 * 1024  # 5MB parts
        )

        assert result['upload_type'] == 'multipart'
        assert result['parts_count'] == 2
        assert result['success'] is True

    @pytest.mark.asyncio
    async def test_bandwidth_throttling(self, storage_config):
        """Test bandwidth throttling per client"""
        from app.storage import ThrottledStorage

        storage = ThrottledStorage(storage_config)

        # Set bandwidth limit (1MB/s)
        storage.set_bandwidth_limit(client_id="user123", mbps=1)

        # Test upload with throttling
        start_time = asyncio.get_event_loop().time()
        await storage.upload_with_throttle(
            client_id="user123",
            data=b"x" * (2 * 1024 * 1024),  # 2MB
            object_name="test.jpg"
        )
        elapsed = asyncio.get_event_loop().time() - start_time

        # Should take approximately 2 seconds at 1MB/s
        assert elapsed >= 1.8  # Allow some tolerance

    @pytest.mark.asyncio
    async def test_access_pattern_analysis(self, storage_config):
        """Test access pattern analysis for optimization"""
        from app.storage import AccessAnalyzer

        analyzer = AccessAnalyzer(storage_config)

        # Record access patterns
        for i in range(100):
            await analyzer.record_access(
                object_name=f"logo-{i % 10}.jpg",
                operation='GET',
                client_ip='192.168.1.1',
                response_time_ms=50
            )

        # Analyze patterns
        patterns = await analyzer.analyze_patterns()

        assert 'hot_objects' in patterns
        assert 'access_frequency' in patterns
        assert 'peak_hours' in patterns
        assert 'client_distribution' in patterns

        # Get optimization recommendations
        recommendations = await analyzer.get_recommendations()
        assert len(recommendations) > 0