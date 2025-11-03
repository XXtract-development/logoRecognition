"""
Backend Integration Tests for Categories Training Readiness API

Tests AC-2: Backend - Training Readiness Endpoint
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_session
from app.models.category import Category


# Setup in-memory SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_session():
    """Override database session for testing"""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_session] = override_get_session
client = TestClient(app)


@pytest.fixture(scope="function")
def test_db():
    """Create test database and tables"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    # Create test categories
    test_categories = [
        Category(
            id=1,
            categorie="brand",
            categorie_naam="Brand Logos",
            code="nike",
            code_naam="Nike"
        ),
        Category(
            id=2,
            categorie="brand",
            categorie_naam="Brand Logos",
            code="adidas",
            code_naam="Adidas"
        ),
        Category(
            id=3,
            categorie="brand",
            categorie_naam="Brand Logos",
            code="puma",
            code_naam="Puma"
        ),
    ]

    for cat in test_categories:
        db.add(cat)
    db.commit()

    yield db

    Base.metadata.drop_all(bind=engine)
    db.close()


class TestCategoriesReadinessAPI:
    """Test suite for /api/categories/training-readiness endpoint"""

    def test_endpoint_exists(self, test_db):
        """Test that the training-readiness endpoint exists and returns 200"""
        response = client.get("/api/categories/training-readiness")

        assert response.status_code == 200

    def test_response_structure(self, test_db):
        """Test AC-2: Response includes all required fields"""
        response = client.get("/api/categories/training-readiness")

        assert response.status_code == 200
        data = response.json()

        # Check root structure
        assert "categories" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "summary" in data

        # Check summary structure
        summary = data["summary"]
        assert "total_categories" in summary
        assert "ready_for_training" in summary
        assert "need_more_data" in summary
        assert "insufficient" in summary
        assert "avg_readiness" in summary

    def test_category_fields(self, test_db):
        """Test AC-2: Each category includes required fields"""
        response = client.get("/api/categories/training-readiness")

        assert response.status_code == 200
        data = response.json()

        if len(data["categories"]) > 0:
            category = data["categories"][0]

            # Required fields from AC-2
            assert "category_id" in category or "categoryId" in category
            assert "categorie" in category
            assert "code" in category
            assert "annotation_count" in category or "annotationCount" in category
            assert "unique_images" in category or "uniqueImages" in category
            assert "readiness_percentage" in category or "readinessPercentage" in category
            assert "readiness_status" in category or "readinessStatus" in category
            assert "readiness_color" in category or "readinessColor" in category
            assert "required_additional_annotations" in category or "requiredAdditionalAnnotations" in category
            assert "recommendations" in category

    def test_pagination(self, test_db):
        """Test AC-2: Support pagination (20 items per page)"""
        # Test default pagination
        response = client.get("/api/categories/training-readiness")
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["page_size"] == 20

        # Test custom page size
        response = client.get("/api/categories/training-readiness?page=1&page_size=10")
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["page_size"] == 10

    def test_min_readiness_filter(self, test_db):
        """Test filtering by minimum readiness percentage"""
        # Get all categories first
        response_all = client.get("/api/categories/training-readiness")
        all_count = response_all.json()["total"]

        # Filter by high readiness (should return fewer or equal)
        response_filtered = client.get("/api/categories/training-readiness?min_readiness=85")
        assert response_filtered.status_code == 200
        filtered_count = response_filtered.json()["total"]

        assert filtered_count <= all_count

    def test_readiness_status_values(self, test_db):
        """Test that readiness_status is valid enum value"""
        response = client.get("/api/categories/training-readiness")

        assert response.status_code == 200
        data = response.json()

        valid_statuses = ["insufficient", "low", "moderate", "high", "very_high"]

        for category in data["categories"]:
            status = category.get("readiness_status") or category.get("readinessStatus")
            assert status in valid_statuses

    def test_readiness_color_format(self, test_db):
        """Test that readiness_color is hex color code"""
        response = client.get("/api/categories/training-readiness")

        assert response.status_code == 200
        data = response.json()

        import re
        hex_color_pattern = re.compile(r'^#[0-9A-Fa-f]{6}$')

        for category in data["categories"]:
            color = category.get("readiness_color") or category.get("readinessColor")
            assert hex_color_pattern.match(color), f"Invalid color format: {color}"

    def test_readiness_percentage_range(self, test_db):
        """Test that readiness_percentage is 0-100"""
        response = client.get("/api/categories/training-readiness")

        assert response.status_code == 200
        data = response.json()

        for category in data["categories"]:
            percentage = category.get("readiness_percentage") or category.get("readinessPercentage")
            assert 0 <= percentage <= 100

    def test_recommendations_is_array(self, test_db):
        """Test that recommendations is an array"""
        response = client.get("/api/categories/training-readiness")

        assert response.status_code == 200
        data = response.json()

        for category in data["categories"]:
            recommendations = category.get("recommendations", [])
            assert isinstance(recommendations, list)

    def test_response_time_performance(self, test_db):
        """Test AC-2: Response time < 500ms for 100 categories"""
        import time

        start = time.time()
        response = client.get("/api/categories/training-readiness")
        elapsed = (time.time() - start) * 1000  # Convert to ms

        assert response.status_code == 200
        # For 3 test categories, should be well under 500ms
        # In production with 100 categories and caching, should still be < 500ms
        assert elapsed < 500, f"Response too slow: {elapsed}ms"

    def test_summary_statistics_accuracy(self, test_db):
        """Test that summary statistics are correctly calculated"""
        response = client.get("/api/categories/training-readiness")

        assert response.status_code == 200
        data = response.json()

        summary = data["summary"]
        categories = data["categories"]

        # Total should match number of categories
        assert summary["total_categories"] == len(categories)

        # Count readiness levels
        ready_count = sum(1 for c in categories
                         if (c.get("readiness_percentage") or c.get("readinessPercentage", 0)) >= 85)
        need_more = sum(1 for c in categories
                       if 70 <= (c.get("readiness_percentage") or c.get("readinessPercentage", 0)) < 85)
        insufficient = sum(1 for c in categories
                          if (c.get("readiness_percentage") or c.get("readinessPercentage", 0)) < 70)

        assert summary["ready_for_training"] == ready_count
        assert summary["need_more_data"] == need_more
        assert summary["insufficient"] == insufficient

    def test_error_handling_invalid_page(self, test_db):
        """Test error handling for invalid pagination parameters"""
        response = client.get("/api/categories/training-readiness?page=0")
        # Should either return 422 validation error or handle gracefully
        assert response.status_code in [200, 422]

    def test_caching_behavior(self, test_db):
        """Test AC-2: Results are cached for 5 minutes"""
        # First request
        response1 = client.get("/api/categories/training-readiness")
        assert response1.status_code == 200
        data1 = response1.json()

        # Second request (should use cache)
        response2 = client.get("/api/categories/training-readiness")
        assert response2.status_code == 200
        data2 = response2.json()

        # Results should be identical (from cache)
        assert data1 == data2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
