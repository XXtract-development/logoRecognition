"""
Test Category Service Training Readiness Functionality

Tests for the readiness calculation methods in CategoryService.
"""

import pytest
from unittest.mock import Mock, patch
from app.services.category_service import CategoryService
from app.models.category import Category
from app.schemas.category import ReadinessStatus


class TestCategoryReadiness:
    """Test suite for category training readiness calculations"""

    def setup_method(self):
        """Setup test fixtures"""
        self.service = CategoryService()

        # Mock category
        self.mock_category = Mock(spec=Category)
        self.mock_category.id = 1
        self.mock_category.categorie = "brand"
        self.mock_category.categorie_naam = "Brand Logos"
        self.mock_category.code = "nike"
        self.mock_category.code_naam = "Nike"

    def test_map_confidence_to_status_insufficient(self):
        """Test mapping INSUFFICIENT confidence level to ReadinessStatus"""
        from app.services.annotation_statistics import ConfidenceLevel

        result = self.service._map_confidence_to_status(ConfidenceLevel.INSUFFICIENT)

        assert result == ReadinessStatus.INSUFFICIENT

    def test_map_confidence_to_status_high(self):
        """Test mapping HIGH confidence level to ReadinessStatus"""
        from app.services.annotation_statistics import ConfidenceLevel

        result = self.service._map_confidence_to_status(ConfidenceLevel.HIGH)

        assert result == ReadinessStatus.HIGH

    def test_get_status_color_insufficient(self):
        """Test color mapping for INSUFFICIENT status"""
        color = self.service._get_status_color(ReadinessStatus.INSUFFICIENT)

        assert color == "#EF4444"  # Red

    def test_get_status_color_high(self):
        """Test color mapping for HIGH status"""
        color = self.service._get_status_color(ReadinessStatus.HIGH)

        assert color == "#10B981"  # Green

    def test_get_status_color_very_high(self):
        """Test color mapping for VERY_HIGH status"""
        color = self.service._get_status_color(ReadinessStatus.VERY_HIGH)

        assert color == "#059669"  # Dark Green

    @patch.object(CategoryService, '_load_annotations_for_category')
    def test_calculate_readiness_with_no_annotations(self, mock_load):
        """Test readiness calculation with zero annotations"""
        mock_load.return_value = []

        result = self.service._calculate_readiness_for_category(self.mock_category)

        assert result.category_id == 1
        assert result.annotation_count == 0
        assert result.unique_images == 0
        assert result.readiness_percentage < 50
        assert result.readiness_status == ReadinessStatus.INSUFFICIENT
        assert result.readiness_color == "#EF4444"
        assert result.required_additional_annotations > 0

    @patch.object(CategoryService, '_load_annotations_for_category')
    def test_calculate_readiness_with_sufficient_annotations(self, mock_load):
        """Test readiness calculation with sufficient annotations (>= 75)"""
        # Create mock annotations - 75 annotations across 50 images
        mock_annotations = []
        for i in range(75):
            mock_annotations.append({
                'image_id': f'img_{i % 50}',
                'bbox': {'x': 10, 'y': 10, 'width': 100, 'height': 100},
                'created_at': f'2025-01-{(i % 28) + 1:02d}T10:00:00'
            })
        mock_load.return_value = mock_annotations

        result = self.service._calculate_readiness_for_category(self.mock_category)

        assert result.annotation_count == 75
        assert result.unique_images == 50
        # 75 annotations is at the OPTIMAL_95 threshold, so moderate-high is expected
        assert result.readiness_percentage >= 70  # Should be at least moderate confidence
        assert result.readiness_status in [ReadinessStatus.MODERATE, ReadinessStatus.HIGH, ReadinessStatus.VERY_HIGH]
        assert result.readiness_color in ["#FBBF24", "#10B981", "#059669"]  # Yellow or green colors

    def test_calculate_readiness_summary_empty(self):
        """Test summary calculation with no categories"""
        result = self.service.calculate_readiness_summary([])

        assert result.total_categories == 0
        assert result.ready_for_training == 0
        assert result.need_more_data == 0
        assert result.insufficient == 0
        assert result.avg_readiness == 0.0

    def test_calculate_readiness_summary_with_data(self):
        """Test summary calculation with mixed readiness levels"""
        from app.schemas.category import CategoryReadiness

        # Create mock readiness data
        readiness_list = [
            CategoryReadiness(
                category_id=1, categorie="brand", code="nike",
                annotation_count=100, unique_images=60,
                readiness_percentage=95.0, readiness_status=ReadinessStatus.VERY_HIGH,
                readiness_color="#059669", required_additional_annotations=0,
                estimated_accuracy_range=(93.0, 97.0), recommendations=[]
            ),
            CategoryReadiness(
                category_id=2, categorie="brand", code="adidas",
                annotation_count=80, unique_images=50,
                readiness_percentage=88.0, readiness_status=ReadinessStatus.HIGH,
                readiness_color="#10B981", required_additional_annotations=5,
                estimated_accuracy_range=(85.0, 92.0), recommendations=[]
            ),
            CategoryReadiness(
                category_id=3, categorie="brand", code="puma",
                annotation_count=40, unique_images=30,
                readiness_percentage=72.0, readiness_status=ReadinessStatus.MODERATE,
                readiness_color="#FBBF24", required_additional_annotations=35,
                estimated_accuracy_range=(68.0, 80.0), recommendations=[]
            ),
            CategoryReadiness(
                category_id=4, categorie="brand", code="reebok",
                annotation_count=10, unique_images=8,
                readiness_percentage=45.0, readiness_status=ReadinessStatus.INSUFFICIENT,
                readiness_color="#EF4444", required_additional_annotations=65,
                estimated_accuracy_range=(20.0, 50.0), recommendations=[]
            ),
        ]

        result = self.service.calculate_readiness_summary(readiness_list)

        assert result.total_categories == 4
        assert result.ready_for_training == 2  # >= 85%
        assert result.need_more_data == 1  # 70-85%
        assert result.insufficient == 1  # < 70%
        assert result.avg_readiness == 75.0  # (95 + 88 + 72 + 45) / 4


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
