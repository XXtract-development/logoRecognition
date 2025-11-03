"""
Categories Router

FastAPI router for category management including CRUD operations and Excel import.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
import pandas as pd
from io import BytesIO
import sentry_sdk

from app.database import get_session
from app.models.category import Category
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
    CategoryListResponse,
    CategoryWithCount,
    CategoryImportResponse,
    ImportSummary,
    ImportErrorDetail,
    CategoryReadinessListResponse,
    CategoryReadiness,
    ReadinessSummary,
)
from app.services.category_service import CategoryService

router = APIRouter(prefix="/api/categories", tags=["categories"])

# Constants
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_ROWS = 10000


@router.get("", response_model=CategoryListResponse)
async def get_categories(
    search: Optional[str] = Query(None, min_length=1, max_length=100, description="Search filter for category names"),
    page: Optional[int] = Query(1, ge=1, description="Page number"),
    page_size: Optional[int] = Query(20, ge=1, le=1000, description="Items per page"),
    sort_by: str = Query("categorie", pattern="^(categorie|annotation_count|created_at)$", description="Field to sort by"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$", description="Sort direction"),
    db: Session = Depends(get_session)
):
    """
    Get categories with optional search filter and annotation counts.

    - **search**: Filter categories by name/code (case-insensitive)
    - **page**: Page number (1-indexed)
    - **page_size**: Number of items per page
    - **sort_by**: Field to sort by (categorie, annotation_count, created_at)
    - **sort_order**: Sort direction (asc/desc)
    """
    try:
        # Calculate offset
        offset = (page - 1) * page_size

        # Get categories with counts using service
        service = CategoryService()
        categories, total, filtered = await service.get_categories_with_counts(
            db=db,
            search=search,
            skip=offset,
            limit=page_size,
            sort_by=sort_by,
            sort_order=sort_order
        )

        # Convert to response model with counts
        # Create new objects with annotation_count instead of mutating
        category_responses = []
        for cat in categories:
            # Create dict with all category fields plus annotation_count
            cat_dict = {
                "id": cat.id,
                "categorie": cat.categorie,
                "categorie_naam": cat.categorie_naam,
                "code": cat.code,
                "code_naam": cat.code_naam,
                "definitie": cat.definitie,
                "created_at": cat.created_at,
                "updated_at": cat.updated_at,
                "annotation_count": 0  # Placeholder - would come from actual join
            }
            category_responses.append(CategoryWithCount(**cat_dict))

        return CategoryListResponse(
            categories=category_responses,
            total=total,
            filtered=filtered,
            page=page,
            page_size=page_size,
            search_term=search
        )
    except Exception as e:
        # Log the actual error for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error fetching categories: {str(e)}", exc_info=True)

        sentry_sdk.capture_exception(e)

        # Return empty result if database is not available
        return CategoryListResponse(
            categories=[],
            total=0,
            filtered=0,
            page=page,
            page_size=page_size,
            search_term=search
        )


@router.get("/training-readiness", response_model=CategoryReadinessListResponse)
async def get_categories_training_readiness(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    min_readiness: Optional[float] = Query(None, ge=0, le=100, description="Minimum readiness percentage filter"),
    db: Session = Depends(get_session)
):
    """
    Get training readiness for all categories.

    Returns readiness metrics calculated using AnnotationStatisticsService.
    Results are cached for 5 minutes for performance.

    - **page**: Page number (1-indexed)
    - **page_size**: Number of items per page (max 100)
    - **min_readiness**: Optional minimum readiness percentage filter (0-100)

    Returns:
        CategoryReadinessListResponse with readiness data and summary statistics
    """
    try:
        # Calculate offset
        offset = (page - 1) * page_size

        # Get categories with readiness using service
        service = CategoryService()
        readiness_list, total = await service.get_categories_with_readiness(
            db=db,
            skip=offset,
            limit=page_size,
            min_readiness=min_readiness
        )

        # Calculate summary statistics
        summary = service.calculate_readiness_summary(readiness_list)

        return CategoryReadinessListResponse(
            categories=readiness_list,
            total=total,
            page=page,
            page_size=page_size,
            summary=summary
        )

    except Exception as e:
        # Log the actual error for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error fetching training readiness: {str(e)}", exc_info=True)

        sentry_sdk.capture_exception(e)

        # Return empty result on error
        return CategoryReadinessListResponse(
            categories=[],
            total=0,
            page=page,
            page_size=page_size,
            summary=ReadinessSummary(
                total_categories=0,
                ready_for_training=0,
                need_more_data=0,
                insufficient=0,
                avg_readiness=0.0
            )
        )


@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(category_id: int, db: Session = Depends(get_session)):
    """
    Get a single category by ID.

    Args:
        category_id: Category ID
        db: Database session

    Returns:
        CategoryResponse

    Raises:
        HTTPException: 404 if category not found
    """
    category = db.query(Category).filter(Category.id == category_id).first()

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Categorie met ID {category_id} niet gevonden"
        )

    return category


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    category: CategoryCreate,
    db: Session = Depends(get_session)
):
    """
    Create a new category.

    Args:
        category: Category data
        db: Database session

    Returns:
        Created category

    Raises:
        HTTPException: 400 if duplicate exists
    """
    try:
        # Check for duplicate
        existing = (
            db.query(Category)
            .filter(
                Category.categorie == category.categorie,
                Category.code == category.code
            )
            .first()
        )

        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Categorie met deze combinatie van categorie en code bestaat al"
            )

        # Create new category
        db_category = Category(**category.dict())
        db.add(db_category)
        db.commit()
        db.refresh(db_category)

        return db_category
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        sentry_sdk.capture_exception(e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Fout bij aanmaken van categorie"
        )


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    category: CategoryUpdate,
    db: Session = Depends(get_session)
):
    """Update an existing category."""
    db_category = db.query(Category).filter(Category.id == category_id).first()

    if not db_category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Categorie met ID {category_id} niet gevonden"
        )

    try:
        # Update fields
        for key, value in category.dict().items():
            setattr(db_category, key, value)

        db.commit()
        db.refresh(db_category)

        return db_category
    except Exception as e:
        db.rollback()
        sentry_sdk.capture_exception(e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Fout bij updaten van categorie"
        )


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: int, db: Session = Depends(get_session)):
    """Delete a category."""
    db_category = db.query(Category).filter(Category.id == category_id).first()

    if not db_category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Categorie met ID {category_id} niet gevonden"
        )

    try:
        db.delete(db_category)
        db.commit()
    except Exception as e:
        db.rollback()
        sentry_sdk.capture_exception(e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Fout bij verwijderen van categorie"
        )


@router.post("/import", response_model=CategoryImportResponse)
async def import_categories(
    file: UploadFile = File(...),
    db: Session = Depends(get_session)
):
    """
    Import categories from Excel file.

    Process:
    1. Validate file type and size
    2. Parse Excel file
    3. Validate each row
    4. Insert valid rows (skip duplicates using ON CONFLICT DO NOTHING)
    5. Return summary

    Args:
        file: Excel file (.xlsx)
        db: Database session

    Returns:
        CategoryImportResponse with import summary

    Raises:
        HTTPException: 400 for validation errors, 500 for server errors
    """
    # Validation: File type
    if not file.filename or not file.filename.endswith('.xlsx'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Alleen .xlsx bestanden zijn toegestaan"
        )

    # Read file content
    content = await file.read()

    # Validation: File size (10MB max)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bestand te groot. Maximum {MAX_FILE_SIZE // (1024 * 1024)}MB toegestaan"
        )

    try:
        # Parse Excel
        df = pd.read_excel(BytesIO(content), engine='openpyxl')

        # Normalize column names (lowercase, strip whitespace, replace spaces with underscores)
        df.columns = df.columns.str.lower().str.strip().str.replace(' ', '_', regex=False)

        # Validate required columns
        required_columns = {'categorie', 'code'}
        if not required_columns.issubset(df.columns):
            missing = required_columns - set(df.columns)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Verplichte kolommen ontbreken: {', '.join(missing)}"
            )

        # Validate row count
        if len(df) > MAX_ROWS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum {MAX_ROWS} rijen toegestaan"
            )

        # Import logic
        imported = 0
        skipped = 0
        failed = 0
        error_details: List[ImportErrorDetail] = []

        for index, row in df.iterrows():
            row_number = index + 2  # +2 for header and 0-based index

            try:
                # Validate required fields
                if pd.isna(row['categorie']) or not str(row['categorie']).strip():
                    error_details.append(ImportErrorDetail(
                        rowNumber=row_number,
                        categorie=None,
                        code=None,
                        errors=['Categorie is verplicht']
                    ))
                    failed += 1
                    continue

                if pd.isna(row['code']) or not str(row['code']).strip():
                    error_details.append(ImportErrorDetail(
                        rowNumber=row_number,
                        categorie=str(row['categorie']),
                        code=None,
                        errors=['Code is verplicht']
                    ))
                    failed += 1
                    continue

                # Prepare data
                category_data = {
                    'categorie': str(row['categorie']).strip(),
                    'code': str(row['code']).strip(),
                    'categorie_naam': (
                        str(row.get('categorie_naam', '')).strip()
                        if pd.notna(row.get('categorie_naam')) else None
                    ),
                    'code_naam': (
                        str(row.get('code_naam', '')).strip()
                        if pd.notna(row.get('code_naam')) else None
                    ),
                    'definitie': (
                        str(row.get('definitie', '')).strip()
                        if pd.notna(row.get('definitie')) else None
                    ),
                }

                # Use PostgreSQL INSERT ... ON CONFLICT DO NOTHING
                stmt = pg_insert(Category).values(**category_data)
                stmt = stmt.on_conflict_do_nothing(
                    index_elements=['categorie', 'code']
                )

                result = db.execute(stmt)

                if result.rowcount > 0:
                    imported += 1
                else:
                    skipped += 1  # Duplicate

            except Exception as e:
                failed += 1
                error_details.append(ImportErrorDetail(
                    rowNumber=row_number,
                    categorie=str(row.get('categorie', '')),
                    code=str(row.get('code', '')),
                    errors=[str(e)]
                ))

        db.commit()

        # Log to Sentry for monitoring
        sentry_sdk.capture_message(
            f"Category import completed",
            level="info",
            extras={
                'imported': imported,
                'skipped': skipped,
                'failed': failed,
                'total_rows': len(df),
                'filename': file.filename
            }
        )

        return CategoryImportResponse(
            success=True,
            summary=ImportSummary(
                total=len(df),
                imported=imported,
                skipped=skipped,
                failed=failed,
                errorDetails=error_details if error_details else None
            ),
            message=f"Import voltooid: {imported} geïmporteerd, {skipped} overgeslagen, {failed} gefaald"
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        sentry_sdk.capture_exception(e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Fout bij verwerken van bestand"
        )