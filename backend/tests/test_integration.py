"""
Integration Testing Suite
Story: STORY-030
"""

import pytest
import asyncio
from playwright.sync_api import sync_playwright
import requests
import time

class TestEndToEndWorkflow:
    """Test complete end-to-end workflows"""

    def test_upload_to_training_flow(self):
        """Test upload to training workflow"""
        # 1. Upload images
        files = [('files', open(f'test_{i}.png', 'rb')) for i in range(5)]
        response = requests.post('http://localhost:8000/api/batch-upload', files=files)
        assert response.status_code == 200
        job_id = response.json()['job_id']

        # 2. Wait for processing
        for _ in range(30):
            status = requests.get(f'http://localhost:8000/api/job/{job_id}')
            if status.json()['status'] == 'completed':
                break
            time.sleep(1)

        # 3. Perform detection
        detect_response = requests.post('http://localhost:8000/api/detect', json={
            'image_id': response.json()['files'][0]['id'],
            'click_point': {'x': 100, 'y': 100}
        })
        assert detect_response.status_code == 200
        assert detect_response.json()['confidence'] > 0.8

        # 4. Apply augmentation
        aug_response = requests.post('http://localhost:8000/api/augment', json={
            'image_id': response.json()['files'][0]['id'],
            'count': 10
        })
        assert aug_response.status_code == 200
        assert len(aug_response.json()['variants']) == 10

        # 5. Create training dataset
        dataset_response = requests.post('http://localhost:8000/api/dataset/create', json={
            'name': 'test_dataset',
            'images': aug_response.json()['variants']
        })
        assert dataset_response.status_code == 200

    def test_frontend_integration(self):
        """Test frontend integration with Playwright"""
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()

            # Navigate to app
            page.goto('http://localhost:3000')

            # Test file upload
            page.set_input_files('input[type="file"]', ['test_image.png'])
            page.click('button:has-text("Upload")')

            # Wait for upload to complete
            page.wait_for_selector('.upload-success')

            # Test canvas annotation
            page.click('.canvas-container')
            page.wait_for_selector('.annotation-box')

            # Verify annotation was created
            annotations = page.query_selector_all('.annotation-box')
            assert len(annotations) > 0

            browser.close()

    def test_performance_within_sla(self):
        """Test performance is within SLA"""
        # Detection performance
        start = time.time()
        response = requests.post('http://localhost:8000/api/detect', json={
            'image_id': 'test',
            'click_point': {'x': 100, 'y': 100}
        })
        duration = (time.time() - start) * 1000

        assert response.status_code == 200
        assert duration < 100  # Under 100ms

        # Batch upload performance
        files = [('files', open(f'test_{i}.png', 'rb')) for i in range(100)]
        start = time.time()
        response = requests.post('http://localhost:8000/api/batch-upload', files=files)
        duration = time.time() - start

        assert response.status_code == 200
        assert duration < 30  # Under 30 seconds for 100 images

    def test_error_handling(self):
        """Test error handling and recovery"""
        # Invalid file type
        response = requests.post('http://localhost:8000/api/upload',
                                files={'file': ('test.txt', b'text content')})
        assert response.status_code == 400
        assert 'Invalid file type' in response.json()['error']

        # Oversized file
        large_file = b'x' * (11 * 1024 * 1024)  # 11MB
        response = requests.post('http://localhost:8000/api/upload',
                                files={'file': ('large.png', large_file)})
        assert response.status_code == 400
        assert 'exceeds maximum size' in response.json()['error']

    def test_security_controls(self):
        """Test security controls"""
        # Test authentication required
        response = requests.get('http://localhost:8000/api/protected')
        assert response.status_code == 401

        # Test with valid token
        token = self._get_auth_token()
        response = requests.get('http://localhost:8000/api/protected',
                               headers={'Authorization': f'Bearer {token}'})
        assert response.status_code == 200

        # Test rate limiting
        for i in range(101):  # Exceed rate limit
            response = requests.get('http://localhost:8000/api/detect')
            if i >= 100:
                assert response.status_code == 429  # Too Many Requests

    def test_data_integrity(self):
        """Test data integrity"""
        # Upload file
        with open('test.png', 'rb') as f:
            content = f.read()
            file_hash = hashlib.sha256(content).hexdigest()

        response = requests.post('http://localhost:8000/api/upload',
                                files={'file': open('test.png', 'rb')})
        uploaded_id = response.json()['file_id']

        # Download and verify
        download = requests.get(f'http://localhost:8000/api/download/{uploaded_id}')
        downloaded_hash = hashlib.sha256(download.content).hexdigest()

        assert file_hash == downloaded_hash

    def test_monitoring_alerts(self):
        """Test monitoring and alerting"""
        # Check Prometheus metrics
        metrics = requests.get('http://localhost:9090/api/v1/query',
                              params={'query': 'up'})
        assert metrics.status_code == 200

        # Check Grafana dashboards
        dashboards = requests.get('http://localhost:3000/api/dashboards')
        assert dashboards.status_code == 200

        # Trigger alert condition
        for _ in range(10):
            requests.post('http://localhost:8000/api/error')  # Force errors

        # Check alert was triggered
        alerts = requests.get('http://localhost:9093/api/v1/alerts')
        assert len(alerts.json()) > 0

    def test_recovery_procedures(self):
        """Test recovery procedures"""
        # Simulate service failure
        requests.post('http://localhost:8000/api/admin/shutdown-service',
                     json={'service': 'ml-model'})

        # Verify circuit breaker activates
        response = requests.post('http://localhost:8000/api/detect',
                                json={'image_id': 'test', 'click_point': {'x': 100, 'y': 100}})
        assert response.status_code == 503  # Service Unavailable

        # Restart service
        requests.post('http://localhost:8000/api/admin/start-service',
                     json={'service': 'ml-model'})

        # Verify recovery
        time.sleep(5)
        response = requests.post('http://localhost:8000/api/detect',
                                json={'image_id': 'test', 'click_point': {'x': 100, 'y': 100}})
        assert response.status_code == 200

    def _get_auth_token(self):
        """Helper to get auth token"""
        response = requests.post('http://localhost:8000/api/auth/login',
                                json={'username': 'test', 'password': 'test'})
        return response.json()['token']
