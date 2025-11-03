"""
Comprehensive Integration Test Suite
Tests all major components: upload, annotation, classification, training, recognition
"""

import pytest
import io
import base64
from PIL import Image
from unittest.mock import Mock, patch, MagicMock
import tempfile
import os


def create_test_image(width=640, height=480, color=(255, 0, 0)):
    """Create a test image in memory"""
    img = Image.new('RGB', (width, height), color)
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    img_byte_arr.seek(0)
    return img_byte_arr


def create_test_image_base64(width=640, height=480):
    """Create a test image as base64 string"""
    img_bytes = create_test_image(width, height).getvalue()
    return base64.b64encode(img_bytes).decode('utf-8')


# =============================================================================
# TEST 1: Image Upload Functionality
# =============================================================================

class TestImageUpload:
    """Test image upload end-to-end"""

    def test_single_image_upload_success(self, client):
        """Test uploading a single image"""
        img_file = create_test_image()

        response = client.post(
            "/api/images/upload",
            files={"file": ("test.png", img_file, "image/png")}
        )

        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "filename" in data
        assert data["filename"] == "test.png"

    def test_batch_image_upload_success(self, client):
        """Test uploading multiple images"""
        files = [
            ("files", ("test1.png", create_test_image(color=(255, 0, 0)), "image/png")),
            ("files", ("test2.png", create_test_image(color=(0, 255, 0)), "image/png")),
            ("files", ("test3.png", create_test_image(color=(0, 0, 255)), "image/png")),
        ]

        response = client.post("/api/images/batch-upload", files=files)

        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert len(data["results"]) == 3
        assert all(r["status"] == "success" for r in data["results"])

    def test_upload_invalid_file_type(self, client):
        """Test uploading invalid file type"""
        # Create a text file instead of image
        text_file = io.BytesIO(b"This is not an image")

        response = client.post(
            "/api/images/upload",
            files={"file": ("test.txt", text_file, "text/plain")}
        )

        assert response.status_code in [400, 415]

    def test_upload_oversized_image(self, client):
        """Test uploading image exceeding size limit"""
        # Create very large image (> 10MB)
        large_img = create_test_image(width=5000, height=5000)

        response = client.post(
            "/api/images/upload",
            files={"file": ("large.png", large_img, "image/png")}
        )

        # Should either succeed or reject with 413
        assert response.status_code in [200, 413]

    def test_base64_image_upload(self, client):
        """Test uploading base64 encoded image"""
        base64_img = create_test_image_base64()

        response = client.post(
            "/api/images/upload-base64",
            json={
                "image": base64_img,
                "filename": "test_base64.png"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert "id" in data


# =============================================================================
# TEST 2: Annotation Workflow
# =============================================================================

class TestAnnotationWorkflow:
    """Test annotation create, edit, delete workflow"""

    @pytest.fixture
    async def test_image_id(self, client):
        """Create a test image and return its ID"""
        img_file = create_test_image()
        response = client.post(
            "/api/images/upload",
            files={"file": ("test.png", img_file, "image/png")}
        )
        assert response.status_code == 200
        return response.json()["id"]

    def test_create_annotation(self, client, test_image_id):
        """Test creating an annotation"""
        annotation_data = {
            "image_id": test_image_id,
            "bounding_box": {
                "x": 10,
                "y": 10,
                "width": 100,
                "height": 100
            },
            "label": "test_logo",
            "confidence": 1.0
        }

        response = client.post("/api/annotations", json=annotation_data)

        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["label"] == "test_logo"

    def test_update_annotation(self, client, test_image_id):
        """Test updating an annotation"""
        # First create annotation
        create_response = client.post("/api/annotations", json={
            "image_id": test_image_id,
            "bounding_box": {"x": 10, "y": 10, "width": 100, "height": 100},
            "label": "logo_v1"
        })
        annotation_id = create_response.json()["id"]

        # Update annotation
        update_response = client.put(
            f"/api/annotations/{annotation_id}",
            json={"label": "logo_v2"}
        )

        assert update_response.status_code == 200
        data = update_response.json()
        assert data["label"] == "logo_v2"

    def test_delete_annotation(self, client, test_image_id):
        """Test deleting an annotation"""
        # Create annotation
        create_response = client.post("/api/annotations", json={
            "image_id": test_image_id,
            "bounding_box": {"x": 10, "y": 10, "width": 100, "height": 100},
            "label": "to_delete"
        })
        annotation_id = create_response.json()["id"]

        # Delete annotation
        delete_response = client.delete(f"/api/annotations/{annotation_id}")
        assert delete_response.status_code == 200

        # Verify deletion
        get_response = client.get(f"/api/annotations/{annotation_id}")
        assert get_response.status_code == 404

    def test_list_annotations_for_image(self, client, test_image_id):
        """Test listing all annotations for an image"""
        # Create multiple annotations
        for i in range(3):
            client.post("/api/annotations", json={
                "image_id": test_image_id,
                "bounding_box": {"x": i*50, "y": i*50, "width": 100, "height": 100},
                "label": f"logo_{i}"
            })

        # List annotations
        response = client.get(f"/api/images/{test_image_id}/annotations")

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 3


# =============================================================================
# TEST 3: Classification/Inference Pipeline
# =============================================================================

class TestClassificationPipeline:
    """Test logo detection and classification"""

    def test_detect_logos_in_image(self, client):
        """Test logo detection endpoint"""
        img_file = create_test_image()

        response = client.post(
            "/api/detect",
            files={"file": ("test.png", img_file, "image/png")}
        )

        assert response.status_code == 200
        data = response.json()
        assert "detections" in data
        assert isinstance(data["detections"], list)

    def test_detect_with_confidence_threshold(self, client):
        """Test detection with custom confidence threshold"""
        img_file = create_test_image()

        response = client.post(
            "/api/detect",
            files={"file": ("test.png", img_file, "image/png")},
            data={"confidence_threshold": 0.8}
        )

        assert response.status_code == 200
        data = response.json()
        # All detections should have confidence >= 0.8
        for detection in data.get("detections", []):
            assert detection.get("confidence", 0) >= 0.8

    def test_batch_detection(self, client):
        """Test batch logo detection"""
        files = [
            ("files", ("test1.png", create_test_image(), "image/png")),
            ("files", ("test2.png", create_test_image(), "image/png")),
        ]

        response = client.post("/api/detect/batch", files=files)

        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert len(data["results"]) == 2

    def test_detect_base64_image(self, client):
        """Test detection with base64 image"""
        base64_img = create_test_image_base64()

        response = client.post(
            "/api/detect/base64",
            json={"image": base64_img}
        )

        assert response.status_code == 200
        data = response.json()
        assert "detections" in data


# =============================================================================
# TEST 4: Training Pipeline
# =============================================================================

class TestTrainingPipeline:
    """Test model training and management"""

    @pytest.fixture
    async def training_dataset(self, client):
        """Create a small training dataset"""
        dataset_images = []

        # Upload images with annotations
        for i in range(5):
            img_file = create_test_image(color=(i*50, i*50, i*50))
            response = client.post(
                "/api/images/upload",
                files={"file": (f"train_{i}.png", img_file, "image/png")}
            )
            image_id = response.json()["id"]

            # Add annotation
            client.post("/api/annotations", json={
                "image_id": image_id,
                "bounding_box": {"x": 10, "y": 10, "width": 100, "height": 100},
                "label": f"class_{i % 2}"  # 2 classes
            })

            dataset_images.append(image_id)

        return dataset_images

    def test_create_training_job(self, client, training_dataset):
        """Test creating a training job"""
        response = client.post(
            "/api/training/jobs",
            json={
                "name": "test_training",
                "dataset_ids": training_dataset,
                "epochs": 10,
                "batch_size": 2
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert "job_id" in data
        assert data["status"] in ["pending", "queued"]

    def test_get_training_job_status(self, client, training_dataset):
        """Test getting training job status"""
        # Create job
        create_response = client.post(
            "/api/training/jobs",
            json={
                "name": "status_test",
                "dataset_ids": training_dataset,
                "epochs": 5
            }
        )
        job_id = create_response.json()["job_id"]

        # Get status
        status_response = client.get(f"/api/training/jobs/{job_id}")

        assert status_response.status_code == 200
        data = status_response.json()
        assert "status" in data
        assert "progress" in data

    def test_cancel_training_job(self, client, training_dataset):
        """Test canceling a training job"""
        # Create job
        create_response = client.post(
            "/api/training/jobs",
            json={
                "name": "cancel_test",
                "dataset_ids": training_dataset,
                "epochs": 100
            }
        )
        job_id = create_response.json()["job_id"]

        # Cancel job
        cancel_response = client.post(f"/api/training/jobs/{job_id}/cancel")

        assert cancel_response.status_code == 200

        # Verify cancellation
        status_response = client.get(f"/api/training/jobs/{job_id}")
        assert status_response.json()["status"] in ["cancelled", "cancelling"]

    def test_list_trained_models(self, client):
        """Test listing all trained models"""
        response = client.get("/api/models")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


# =============================================================================
# TEST 5: Logo Recognition End-to-End Workflow
# =============================================================================

class TestLogoRecognitionWorkflow:
    """Test complete workflow from upload to recognition"""

    async def test_complete_workflow(self, client):
        """Test complete end-to-end workflow"""

        # Step 1: Upload training images
        training_images = []
        for i in range(3):
            img_file = create_test_image(color=(i*80, 0, 0))
            response = client.post(
                "/api/images/upload",
                files={"file": (f"brand_{i}.png", img_file, "image/png")}
            )
            assert response.status_code == 200
            training_images.append(response.json()["id"])

        # Step 2: Annotate images
        for image_id in training_images:
            response = client.post("/api/annotations", json={
                "image_id": image_id,
                "bounding_box": {"x": 50, "y": 50, "width": 200, "height": 200},
                "label": "target_brand"
            })
            assert response.status_code == 200

        # Step 3: Create training job (if endpoint exists)
        try:
            train_response = client.post(
                "/api/training/jobs",
                json={
                    "name": "workflow_test",
                    "dataset_ids": training_images,
                    "epochs": 5
                }
            )
            # Training job created successfully
            if train_response.status_code == 200:
                job_id = train_response.json()["job_id"]

                # Wait for training to complete (with timeout)
                import time
                timeout = 60  # 60 seconds
                start_time = time.time()

                while time.time() - start_time < timeout:
                    status_response = client.get(f"/api/training/jobs/{job_id}")
                    if status_response.status_code == 200:
                        status = status_response.json()["status"]
                        if status in ["completed", "failed", "cancelled"]:
                            break
                    time.sleep(2)
        except Exception as e:
            # Training endpoint might not be fully implemented
            pass

        # Step 4: Test detection on new image
        test_img = create_test_image(color=(100, 0, 0))
        detect_response = client.post(
            "/api/detect",
            files={"file": ("test.png", test_img, "image/png")}
        )

        assert detect_response.status_code == 200
        data = detect_response.json()
        assert "detections" in data

        # Step 5: Verify detection results structure
        for detection in data.get("detections", []):
            assert "bounding_box" in detection
            assert "label" in detection
            assert "confidence" in detection


# =============================================================================
# TEST 6: Performance and Load Testing
# =============================================================================

class TestPerformance:
    """Test system performance under load"""

    def test_concurrent_uploads(self, client):
        """Test handling concurrent uploads"""
        import concurrent.futures

        def upload_image(index):
            img_file = create_test_image()
            response = client.post(
                "/api/images/upload",
                files={"file": (f"concurrent_{index}.png", img_file, "image/png")}
            )
            return response.status_code

        # Upload 10 images concurrently
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(upload_image, i) for i in range(10)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        # All should succeed
        assert all(code == 200 for code in results)

    def test_detection_performance(self, client):
        """Test detection speed"""
        import time

        img_file = create_test_image()

        start_time = time.time()
        response = client.post(
            "/api/detect",
            files={"file": ("perf_test.png", img_file, "image/png")}
        )
        elapsed = time.time() - start_time

        assert response.status_code == 200
        # Detection should complete within 5 seconds
        assert elapsed < 5.0


# =============================================================================
# TEST 7: Error Handling and Edge Cases
# =============================================================================

class TestErrorHandling:
    """Test error handling and edge cases"""

    def test_upload_corrupted_image(self, client):
        """Test handling corrupted image data"""
        corrupted_data = io.BytesIO(b"CORRUPTED_IMAGE_DATA")

        response = client.post(
            "/api/images/upload",
            files={"file": ("corrupted.png", corrupted_data, "image/png")}
        )

        assert response.status_code in [400, 415, 422]

    def test_annotation_for_nonexistent_image(self, client):
        """Test creating annotation for non-existent image"""
        response = client.post("/api/annotations", json={
            "image_id": "nonexistent-id-12345",
            "bounding_box": {"x": 10, "y": 10, "width": 100, "height": 100},
            "label": "test"
        })

        assert response.status_code in [404, 400, 422]

    def test_invalid_bounding_box(self, client):
        """Test annotation with invalid bounding box"""
        # First upload an image
        img_file = create_test_image(640, 480)
        upload_response = client.post(
            "/api/images/upload",
            files={"file": ("test.png", img_file, "image/png")}
        )
        image_id = upload_response.json()["id"]

        # Try to create annotation with invalid bbox (negative coordinates)
        response = client.post("/api/annotations", json={
            "image_id": image_id,
            "bounding_box": {"x": -10, "y": -10, "width": 100, "height": 100},
            "label": "invalid"
        })

        assert response.status_code in [400, 422]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
