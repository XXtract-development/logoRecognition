"""
Category Pydantic Schemas

Request/response models for category endpoints including import functionality.
"""

from typing import List, Optional, Tuple
from datetime import datetime
from pydantic import BaseModel, Field, validator
from enum import Enum


class CategoryBase(BaseModel):
    """Base category schema"""
    categorie: str = Field(..., min_length=1, max_length=100, description="Category name")
    categorie_naam: Optional[str] = Field(None, max_length=500, description="Category full name")
    code: str = Field(..., min_length=1, max_length=100, description="Category code")
    code_naam: Optional[str] = Field(None, max_length=500, description="Code full name")
    definitie: Optional[str] = Field(None, max_length=2000, description="Definition")

    @validator('code')
    def validate_code_format(cls, v: str) -> str:
        """Validate code contains only alphanumeric, underscore, dash, plus, and parentheses"""
        import re
        if not re.match(r'^[a-zA-Z0-9_\-\+\(\)]+$', v):
            raise ValueError('Code mag alleen letters, cijfers, underscores, streepjes, plus-tekens en haakjes bevatten')
        return v


class CategoryCreate(CategoryBase):
    """Schema for creating a new category"""
    pass


class CategoryUpdate(CategoryBase):
    """Schema for updating an existing category"""
    pass


class CategoryResponse(CategoryBase):
    """Schema for category response"""
    id: int
    annotation_count: int = Field(default=0, description="Number of annotations using this category")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CategoryWithCount(CategoryResponse):
    """Category response with annotation count for list views"""
    pass


class CategoryListResponse(BaseModel):
    """Schema for paginated category list with filtering support"""
    categories: List[CategoryWithCount]
    total: int = Field(..., description="Total categories in database")
    filtered: int = Field(..., description="Categories after search filter applied")
    page: Optional[int] = None
    page_size: Optional[int] = None
    search_term: Optional[str] = Field(None, description="Applied search filter")


class ImportErrorDetail(BaseModel):
    """Error detail for a single row in import"""
    rowNumber: int = Field(..., description="Row number in Excel (1-based)")
    categorie: Optional[str] = Field(None, description="Category value from row")
    code: Optional[str] = Field(None, description="Code value from row")
    errors: List[str] = Field(..., description="List of error messages for this row")


class ImportSummary(BaseModel):
    """Summary of import operation"""
    total: int = Field(..., description="Total rows processed")
    imported: int = Field(..., description="Successfully imported rows")
    skipped: int = Field(..., description="Skipped duplicate rows")
    failed: int = Field(..., description="Failed validation rows")
    errorDetails: Optional[List[ImportErrorDetail]] = Field(
        None,
        description="Details of rows that failed validation"
    )


class CategoryImportResponse(BaseModel):
    """Response from category import endpoint"""
    success: bool = Field(..., description="Whether import was successful")
    summary: ImportSummary = Field(..., description="Import statistics")
    message: str = Field(..., description="Human-readable message")


# ===== Training Readiness Schemas =====


class ReadinessStatus(str, Enum):
    """Training readiness status levels"""
    INSUFFICIENT = "insufficient"  # < 50%
    LOW = "low"                    # 50-70%
    MODERATE = "moderate"          # 70-85%
    HIGH = "high"                  # 85-95%
    VERY_HIGH = "very_high"        # 95%+


class CategoryReadiness(BaseModel):
    """Training readiness information for a category"""
    category_id: int = Field(..., description="Category ID")
    categorie: str = Field(..., description="Category name")
    categorie_naam: Optional[str] = Field(None, description="Category full name")
    code: str = Field(..., description="Category code")
    code_naam: Optional[str] = Field(None, description="Code full name")
    annotation_count: int = Field(..., ge=0, description="Total number of annotations")
    unique_images: int = Field(..., ge=0, description="Number of unique images")
    readiness_percentage: float = Field(..., ge=0, le=100, description="Training readiness confidence (0-100%)")
    readiness_status: ReadinessStatus = Field(..., description="Readiness status level")
    readiness_color: str = Field(..., description="Hex color code for badge display")
    required_additional_annotations: int = Field(..., ge=0, description="Annotations needed for 95% target")
    estimated_accuracy_range: Tuple[float, float] = Field(..., description="Expected accuracy range (min%, max%)")
    recommendations: List[str] = Field(default=[], description="Actionable improvement suggestions")

    class Config:
        schema_extra = {
            "example": {
                "category_id": 1,
                "categorie": "brand",
                "categorie_naam": "Brand Logos",
                "code": "nike",
                "code_naam": "Nike",
                "annotation_count": 15,
                "unique_images": 12,
                "readiness_percentage": 84.3,
                "readiness_status": "high",
                "readiness_color": "#10B981",
                "required_additional_annotations": 5,
                "estimated_accuracy_range": [83.0, 93.0],
                "recommendations": [
                    "Add 5 more annotations to reach 95% confidence",
                    "Increase image variety by 3 more unique images"
                ]
            }
        }


class ReadinessSummary(BaseModel):
    """Summary statistics for training readiness across all categories"""
    total_categories: int = Field(..., ge=0, description="Total number of categories")
    ready_for_training: int = Field(..., ge=0, description="Categories with >= 85% readiness")
    need_more_data: int = Field(..., ge=0, description="Categories with 70-85% readiness")
    insufficient: int = Field(..., ge=0, description="Categories with < 70% readiness")
    avg_readiness: float = Field(..., ge=0, le=100, description="Average readiness percentage")


class CategoryReadinessListResponse(BaseModel):
    """Paginated list of category training readiness"""
    categories: List[CategoryReadiness] = Field(..., description="List of categories with readiness data")
    total: int = Field(..., ge=0, description="Total number of categories")
    page: int = Field(..., ge=1, description="Current page number")
    page_size: int = Field(..., ge=1, le=100, description="Items per page")
    summary: ReadinessSummary = Field(..., description="Aggregate readiness statistics")