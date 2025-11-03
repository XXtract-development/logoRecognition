"""
Unit tests for Category Service

Tests the business logic for category management with annotation counts and search functionality.
"""

import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy.orm import Session

from app.services.category_service import CategoryService
from app.models.category import Category


class TestCategoryService:
    """Test suite for CategoryService"""

    @pytest.fixture
    def db_session(self):
        """Mock database session"""
        return MagicMock(spec=Session)

    @pytest.fixture
    def service(self):
        """CategoryService instance"""
        return CategoryService()

    @pytest.mark.asyncio
    async def test_get_categories_with_counts_no_search(self, service, db_session):
        """Test fetching categories without search filter"""
        # Setup test data
        mock_categories = [
            Category(
                id=1,
                categorie="Logo",
                code="LOGO_001",
                color="#FF0000",
            ),
            Category(
                id=2,
                categorie="Text",
                code="TEXT_001",
                color="#00FF00",
            ),
        ]

        # Mock query results
        db_session.query.return_value.filter.return_value.count.return_value = 2
        db_session.query.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = [
            (cat, idx) for idx, cat in enumerate(mock_categories)
        ]

        # Test
        categories, total, filtered = await service.get_categories_with_counts(
            db_session, skip=0, limit=10
        )

        # Assertions
        assert len(categories) == 2
        assert total == 2
        assert filtered == 2
        assert categories[0].annotation_count == 0
        assert categories[1].annotation_count == 1

    @pytest.mark.asyncio
    async def test_get_categories_with_search_filter(self, service, db_session):
        """Test search functionality"""
        # Setup
        search_term = "logo"

        # Mock filtered query
        mock_filtered = [
            Category(
                id=1,
                categorie="Logo",
                code="LOGO_001",
                color="#FF0000",
            ),
        ]

        db_session.query.return_value.count.return_value = 5  # Total
        db_session.query.return_value.filter.return_value.count.return_value = 1  # Filtered
        db_session.query.return_value.filter.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = [
            (mock_filtered[0], 2)
        ]

        # Test
        categories, total, filtered = await service.get_categories_with_counts(
            db_session, search=search_term, skip=0, limit=10
        )

        # Assertions
        assert len(categories) == 1
        assert total == 5
        assert filtered == 1
        assert categories[0].categorie == "Logo"
        assert categories[0].annotation_count == 2

    @pytest.mark.asyncio
    async def test_create_category_success(self, service, db_session):
        """Test successful category creation"""
        # Setup
        category_data = {
            "categorie": "NewCategory",
            "code": "NEW_001",
            "color": "#3B82F6",
            "description": "Test description",
        }

        db_session.query.return_value.filter.return_value.first.return_value = None  # No existing

        # Test
        result = await service.create_category(db_session, category_data)

        # Assertions
        assert result.categorie == "NewCategory"
        assert result.code == "NEW_001"
        assert result.color == "#3B82F6"
        assert result.annotation_count == 0
        db_session.add.assert_called_once()
        db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_category_duplicate_error(self, service, db_session):
        """Test duplicate category creation prevention"""
        # Setup
        category_data = {
            "categorie": "Logo",
            "code": "LOGO_001",
            "color": "#FF0000",
        }

        existing = Category(**category_data)
        db_session.query.return_value.filter.return_value.first.return_value = existing

        # Test & Assert
        with pytest.raises(ValueError, match="already exists"):
            await service.create_category(db_session, category_data)

        db_session.add.assert_not_called()
        db_session.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_update_category_success(self, service, db_session):
        """Test successful category update"""
        # Setup
        category_id = 1
        existing_category = Category(
            id=category_id,
            categorie="OldName",
            code="OLD_001",
            color="#FF0000",
        )

        update_data = {
            "categorie": "NewName",
            "color": "#00FF00",
            "description": "Updated description",
        }

        db_session.query.return_value.filter.return_value.first.side_effect = [
            existing_category,  # First call - find category
            None,  # Second call - check for duplicate
        ]

        # Test
        result = await service.update_category(db_session, category_id, update_data)

        # Assertions
        assert result.categorie == "NewName"
        assert result.color == "#00FF00"
        assert result.description == "Updated description"
        db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_category_not_found(self, service, db_session):
        """Test deleting non-existent category"""
        # Setup
        category_id = 999
        db_session.query.return_value.filter.return_value.first.return_value = None

        # Test & Assert
        with pytest.raises(ValueError, match="not found"):
            await service.delete_category(db_session, category_id)

        db_session.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_generate_unique_color(self, service, db_session):
        """Test unique color generation"""
        # Setup - simulate some colors already in use
        used_colors = [
            ("#3B82F6",),
            ("#EF4444",),
            ("#10B981",),
        ]
        db_session.query.return_value.distinct.return_value.all.return_value = used_colors

        # Test
        new_color = service.generate_unique_color(db_session)

        # Assertions
        assert new_color.startswith("#")
        assert len(new_color) == 7
        assert new_color not in [c[0] for c in used_colors]

    @pytest.mark.asyncio
    async def test_sorting_by_annotation_count(self, service, db_session):
        """Test sorting categories by annotation count"""
        # Setup
        mock_categories = [
            (Category(id=1, categorie="A", code="A1"), 5),
            (Category(id=2, categorie="B", code="B1"), 10),
            (Category(id=3, categorie="C", code="C1"), 2),
        ]

        db_session.query.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = mock_categories
        db_session.query.return_value.count.return_value = 3

        # Test
        categories, total, filtered = await service.get_categories_with_counts(
            db_session,
            sort_by="annotation_count",
            sort_order="desc",
            skip=0,
            limit=10
        )

        # Assertions
        assert categories[0].annotation_count == 5
        assert categories[1].annotation_count == 10
        assert categories[2].annotation_count == 2

    @pytest.mark.asyncio
    async def test_bulk_update_colors(self, service, db_session):
        """Test bulk color update functionality"""
        # Setup
        color_updates = [
            {"id": 1, "color": "#FF0000"},
            {"id": 2, "color": "#00FF00"},
            {"id": 3, "color": "#0000FF"},
        ]

        mock_categories = [
            Category(id=1, categorie="A", code="A1"),
            Category(id=2, categorie="B", code="B1"),
            None,  # Category 3 doesn't exist
        ]

        db_session.query.return_value.filter.return_value.first.side_effect = mock_categories

        # Test
        updated_count = await service.bulk_update_colors(db_session, color_updates)

        # Assertions
        assert updated_count == 2
        assert mock_categories[0].color == "#FF0000"
        assert mock_categories[1].color == "#00FF00"
        db_session.commit.assert_called_once()


class TestCategoryServiceIntegration:
    """Integration tests with real database operations"""

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_full_workflow(self, test_db):
        """Test complete category workflow"""
        service = CategoryService()

        # Create category
        new_category_data = {
            "categorie": "TestLogo",
            "code": "TEST_001",
            "color": "#FF5733",
            "description": "Test logo category",
        }

        created = await service.create_category(test_db, new_category_data)
        assert created.id is not None
        assert created.categorie == "TestLogo"

        # Fetch with search
        categories, total, filtered = await service.get_categories_with_counts(
            test_db,
            search="test"
        )
        assert filtered >= 1
        assert any(c.categorie == "TestLogo" for c in categories)

        # Update category
        update_data = {"color": "#00FF00", "description": "Updated description"}
        updated = await service.update_category(test_db, created.id, update_data)
        assert updated.color == "#00FF00"

        # Delete category
        deleted = await service.delete_category(test_db, created.id)
        assert deleted is True

        # Verify deletion
        categories, total, filtered = await service.get_categories_with_counts(
            test_db,
            search="TestLogo"
        )
        assert not any(c.categorie == "TestLogo" for c in categories)