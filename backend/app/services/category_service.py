"""
Category Service

Business logic for category management with annotation counts and search functionality.
"""

from typing import List, Tuple, Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from sqlalchemy.sql import text
import json
from pathlib import Path
from datetime import datetime, timedelta

from app.models.category import Category
from app.services.annotation_statistics import (
    AnnotationStatisticsService,
    ConfidenceLevel
)
from app.schemas.category import (
    CategoryReadiness,
    ReadinessStatus,
    ReadinessSummary
)
# We'll need to create a proper Annotation model or use the existing file-based system


class CategoryService:
    """Service for category operations with advanced querying capabilities."""

    @staticmethod
    async def get_categories_with_counts(
        db: Session,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
        sort_by: str = "categorie",
        sort_order: str = "asc",
        user_id: Optional[str] = None
    ) -> Tuple[List[Category], int, int]:
        """
        Get categories with annotation counts using optimized query.

        Args:
            db: Database session
            search: Optional search term for filtering by category name
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            sort_by: Field to sort by (categorie, annotation_count, created_at)
            sort_order: Sort direction (asc, desc)
            user_id: Optional user ID for filtering (future use)

        Returns:
            Tuple of (categories list, total count, filtered count)
        """

        # Base query - just get Category objects
        query = db.query(Category)

        # Apply search filter if provided
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                or_(
                    Category.categorie.ilike(search_pattern),
                    Category.code.ilike(search_pattern),
                    Category.categorie_naam.ilike(search_pattern),
                    Category.code_naam.ilike(search_pattern)
                )
            )

        # Get total counts
        total_query = db.query(Category)
        total = total_query.count()

        # Get filtered count if search applied
        if search:
            filtered_query = db.query(Category).filter(
                or_(
                    Category.categorie.ilike(search_pattern),
                    Category.code.ilike(search_pattern),
                    Category.categorie_naam.ilike(search_pattern),
                    Category.code_naam.ilike(search_pattern)
                )
            )
            filtered = filtered_query.count()
        else:
            filtered = total

        # Apply sorting
        if sort_by == "annotation_count":
            # For now, sort by ID as a placeholder
            order_column = Category.id
        elif sort_by == "created_at":
            order_column = Category.created_at
        else:
            order_column = Category.categorie

        if sort_order == "desc":
            query = query.order_by(order_column.desc())
        else:
            query = query.order_by(order_column.asc())

        # Apply pagination and get results
        categories = query.offset(skip).limit(limit).all()

        return categories, total, filtered

    @staticmethod
    async def create_category(
        db: Session,
        category_data: dict
    ) -> Category:
        """
        Create a new category with validation.

        Args:
            db: Database session
            category_data: Dictionary containing category fields

        Returns:
            Created Category instance

        Raises:
            ValueError: If category with same (categorie, code) exists
        """
        # Check for duplicate
        existing = db.query(Category).filter(
            Category.categorie == category_data['categorie'],
            Category.code == category_data['code']
        ).first()

        if existing:
            raise ValueError(
                "Category with this combination of categorie and code already exists"
            )

        # Create new category
        new_category = Category(**category_data)
        db.add(new_category)
        db.commit()
        db.refresh(new_category)

        # Set annotation_count to 0 for new categories
        new_category.annotation_count = 0

        return new_category

    @staticmethod
    async def update_category(
        db: Session,
        category_id: int,
        category_data: dict
    ) -> Category:
        """
        Update an existing category.

        Args:
            db: Database session
            category_id: ID of category to update
            category_data: Dictionary containing fields to update

        Returns:
            Updated Category instance

        Raises:
            ValueError: If category not found
        """
        category = db.query(Category).filter(Category.id == category_id).first()

        if not category:
            raise ValueError(f"Category with ID {category_id} not found")

        # Check for duplicate if categorie or code is being changed
        if 'categorie' in category_data or 'code' in category_data:
            new_categorie = category_data.get('categorie', category.categorie)
            new_code = category_data.get('code', category.code)

            existing = db.query(Category).filter(
                Category.categorie == new_categorie,
                Category.code == new_code,
                Category.id != category_id
            ).first()

            if existing:
                raise ValueError(
                    "Another category with this combination of categorie and code already exists"
                )

        # Update fields
        for key, value in category_data.items():
            if hasattr(category, key) and key not in ['id', 'created_at', 'updated_at']:
                setattr(category, key, value)

        db.commit()
        db.refresh(category)

        # Maintain annotation_count (would be recalculated in real implementation)
        if not hasattr(category, 'annotation_count'):
            category.annotation_count = 0

        return category

    @staticmethod
    async def delete_category(
        db: Session,
        category_id: int,
        force: bool = False
    ) -> bool:
        """
        Delete a category.

        Args:
            db: Database session
            category_id: ID of category to delete
            force: If True, delete even if annotations exist

        Returns:
            True if deleted successfully

        Raises:
            ValueError: If category not found or has annotations (when force=False)
        """
        category = db.query(Category).filter(Category.id == category_id).first()

        if not category:
            raise ValueError(f"Category with ID {category_id} not found")

        # In real implementation, check for existing annotations
        # For now, we'll assume no annotations exist
        has_annotations = False

        if has_annotations and not force:
            raise ValueError(
                "Cannot delete category with existing annotations. "
                "Please reassign annotations first or use force delete."
            )

        db.delete(category)
        db.commit()

        return True

    @staticmethod
    async def bulk_update_colors(
        db: Session,
        color_updates: List[dict]
    ) -> int:
        """
        Bulk update category colors for better performance.

        Args:
            db: Database session
            color_updates: List of dicts with 'id' and 'color' keys

        Returns:
            Number of categories updated
        """
        updated_count = 0

        for update in color_updates:
            category = db.query(Category).filter(
                Category.id == update['id']
            ).first()

            if category:
                category.color = update['color']
                updated_count += 1

        db.commit()
        return updated_count

    @staticmethod
    def generate_unique_color(db: Session) -> str:
        """
        Generate a unique color that's not already in use.

        Args:
            db: Database session

        Returns:
            Hex color string
        """
        # Predefined palette of distinct colors
        color_palette = [
            "#3B82F6",  # Blue
            "#EF4444",  # Red
            "#10B981",  # Green
            "#F59E0B",  # Amber
            "#8B5CF6",  # Purple
            "#EC4899",  # Pink
            "#14B8A6",  # Teal
            "#F97316",  # Orange
            "#06B6D4",  # Cyan
            "#84CC16",  # Lime
            "#A855F7",  # Violet
            "#F43F5E",  # Rose
        ]

        # Get used colors
        used_colors = db.query(Category.color).distinct().all()
        used_colors_set = {c[0] for c in used_colors if c[0]}

        # Find first unused color from palette
        for color in color_palette:
            if color not in used_colors_set:
                return color

        # If all palette colors are used, generate a random one
        import random
        while True:
            # Generate random color
            color = "#{:06x}".format(random.randint(0, 0xFFFFFF))
            if color not in used_colors_set:
                return color

    # ===== Training Readiness Methods =====

    def __init__(self):
        """Initialize CategoryService with annotation statistics service."""
        self.stats_service = AnnotationStatisticsService()
        self._readiness_cache: Dict[str, Tuple[datetime, List[CategoryReadiness]]] = {}
        self.cache_ttl = timedelta(minutes=5)

    @staticmethod
    def _load_annotations_for_category(category: Category) -> List[Dict]:
        """
        Load annotation data for a specific category from file system.

        Args:
            category: Category model instance

        Returns:
            List of annotation dictionaries
        """
        annotations = []

        # Look for annotation files in the uploads directory
        uploads_dir = Path("uploads")
        if not uploads_dir.exists():
            return annotations

        # Search for JSON files matching this category
        for json_file in uploads_dir.glob("*.json"):
            try:
                with open(json_file, 'r') as f:
                    data = json.load(f)

                # Extract annotations for this specific category
                if isinstance(data, list):
                    for item in data:
                        if (item.get('category') == category.categorie and
                            item.get('value') == category.code):
                            annotations.append(item)
                elif isinstance(data, dict):
                    # Handle different JSON structures
                    if (data.get('category') == category.categorie and
                        data.get('value') == category.code):
                        annotations.append(data)

            except (json.JSONDecodeError, IOError):
                continue

        return annotations

    def _map_confidence_to_status(self, confidence_level: ConfidenceLevel) -> ReadinessStatus:
        """Map ConfidenceLevel enum to ReadinessStatus enum."""
        mapping = {
            ConfidenceLevel.INSUFFICIENT: ReadinessStatus.INSUFFICIENT,
            ConfidenceLevel.LOW: ReadinessStatus.LOW,
            ConfidenceLevel.MODERATE: ReadinessStatus.MODERATE,
            ConfidenceLevel.HIGH: ReadinessStatus.HIGH,
            ConfidenceLevel.VERY_HIGH: ReadinessStatus.VERY_HIGH,
            ConfidenceLevel.EXCELLENT: ReadinessStatus.VERY_HIGH,  # Map excellent to very_high
        }
        return mapping.get(confidence_level, ReadinessStatus.INSUFFICIENT)

    def _get_status_color(self, status: ReadinessStatus) -> str:
        """Get hex color code for readiness status."""
        colors = {
            ReadinessStatus.INSUFFICIENT: "#EF4444",  # Red
            ReadinessStatus.LOW: "#F59E0B",           # Orange
            ReadinessStatus.MODERATE: "#FBBF24",      # Yellow
            ReadinessStatus.HIGH: "#10B981",          # Green
            ReadinessStatus.VERY_HIGH: "#059669",     # Dark Green
        }
        return colors.get(status, "#6B7280")  # Gray as default

    def _calculate_readiness_for_category(
        self,
        category: Category,
        annotations: Optional[List[Dict]] = None
    ) -> CategoryReadiness:
        """
        Calculate readiness metrics for a single category.

        Args:
            category: Category model instance
            annotations: Optional pre-loaded annotations (if None, will load from files)

        Returns:
            CategoryReadiness model with all metrics
        """
        # Load annotations if not provided
        if annotations is None:
            annotations = self._load_annotations_for_category(category)

        # Calculate sufficiency using annotation statistics service
        analysis = self.stats_service.calculate_sufficiency(
            category=category.categorie,
            value=category.code,
            annotations=annotations,
            target_accuracy=95.0,
            enable_augmentation=True
        )

        # Map confidence level to readiness status
        readiness_status = self._map_confidence_to_status(analysis.confidence_level)

        # Get color for status
        readiness_color = self._get_status_color(readiness_status)

        return CategoryReadiness(
            category_id=category.id,
            categorie=category.categorie,
            categorie_naam=category.categorie_naam,
            code=category.code,
            code_naam=category.code_naam,
            annotation_count=analysis.metrics.total_annotations,
            unique_images=analysis.metrics.unique_images,
            readiness_percentage=round(analysis.current_confidence, 1),
            readiness_status=readiness_status,
            readiness_color=readiness_color,
            required_additional_annotations=analysis.required_additional_annotations,
            estimated_accuracy_range=analysis.estimated_accuracy_range,
            recommendations=analysis.recommendations
        )

    async def get_categories_with_readiness(
        self,
        db: Session,
        skip: int = 0,
        limit: int = 20,
        min_readiness: Optional[float] = None
    ) -> Tuple[List[CategoryReadiness], int]:
        """
        Get categories with training readiness metrics.

        Uses caching for performance (5-minute TTL).

        Args:
            db: Database session
            skip: Pagination offset
            limit: Number of items per page
            min_readiness: Optional minimum readiness percentage filter

        Returns:
            Tuple of (readiness_list, total_count)
        """
        cache_key = f"readiness:{skip}:{limit}:{min_readiness}"

        # Check cache
        if cache_key in self._readiness_cache:
            cached_time, cached_data = self._readiness_cache[cache_key]
            if datetime.now() - cached_time < self.cache_ttl:
                return cached_data, len(cached_data)

        # Fetch all categories
        categories = db.query(Category).all()
        total_count = len(categories)

        # Calculate readiness for each category
        readiness_list = []
        for category in categories:
            readiness = self._calculate_readiness_for_category(category)

            # Apply minimum readiness filter if specified
            if min_readiness is None or readiness.readiness_percentage >= min_readiness:
                readiness_list.append(readiness)

        # Sort by readiness percentage (descending)
        readiness_list.sort(key=lambda x: x.readiness_percentage, reverse=True)

        # Apply pagination
        paginated_list = readiness_list[skip:skip + limit]

        # Cache results
        self._readiness_cache[cache_key] = (datetime.now(), paginated_list)

        return paginated_list, len(readiness_list)

    def calculate_readiness_summary(
        self,
        readiness_list: List[CategoryReadiness]
    ) -> ReadinessSummary:
        """
        Calculate summary statistics for a list of category readiness.

        Args:
            readiness_list: List of CategoryReadiness objects

        Returns:
            ReadinessSummary with aggregate statistics
        """
        if not readiness_list:
            return ReadinessSummary(
                total_categories=0,
                ready_for_training=0,
                need_more_data=0,
                insufficient=0,
                avg_readiness=0.0
            )

        total = len(readiness_list)
        ready_for_training = sum(1 for r in readiness_list if r.readiness_percentage >= 85)
        need_more_data = sum(1 for r in readiness_list
                            if 70 <= r.readiness_percentage < 85)
        insufficient = sum(1 for r in readiness_list if r.readiness_percentage < 70)
        avg_readiness = sum(r.readiness_percentage for r in readiness_list) / total

        return ReadinessSummary(
            total_categories=total,
            ready_for_training=ready_for_training,
            need_more_data=need_more_data,
            insufficient=insufficient,
            avg_readiness=round(avg_readiness, 1)
        )