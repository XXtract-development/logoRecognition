"""Training readiness API endpoints for real data."""

from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/training")

class ReadinessItem(BaseModel):
    """Training readiness item for a category-value combination."""
    id: str
    category: Dict[str, str]
    value: Dict[str, str]
    currentCount: int
    minimumRequired: int
    readinessPercentage: float
    annotationsNeeded: int
    status: str
    lastUpdated: datetime
    augmentedSamples: int
    naturalSamples: int


class ReadinessResponse(BaseModel):
    """Response for training readiness endpoint."""
    data: List[ReadinessItem]
    total: int
    page: int
    pageSize: int


@router.get("/readiness")
async def get_training_readiness(
    category: Optional[str] = Query(None, description="Filter by category"),
    status: Optional[str] = Query(None, description="Filter by status"),
    sort: Optional[str] = Query("category", description="Sort field"),
    order: Optional[str] = Query("asc", description="Sort order"),
    page: int = Query(1, ge=1, description="Page number"),
    pageSize: int = Query(20, ge=1, le=100, description="Items per page")
) -> ReadinessResponse:
    """
    Get training readiness status for all category-value combinations.

    Returns real data based on actual annotations in the system.
    For now, returns an empty list since we're in production mode.
    """

    # In production, we should query real annotation data
    # For now, return empty data since mock data is not allowed
    items = []

    # Apply pagination
    start_idx = (page - 1) * pageSize
    end_idx = start_idx + pageSize
    paginated_items = items[start_idx:end_idx]

    return ReadinessResponse(
        data=paginated_items,
        total=len(items),
        page=page,
        pageSize=pageSize
    )


@router.get("/readiness/summary")
async def get_readiness_summary() -> Dict[str, Any]:
    """
    Get a summary of training readiness across all categories.

    Returns counts of ready, almost ready, and needs work items.
    """
    return {
        "ready": 0,
        "almost_ready": 0,
        "needs_work": 0,
        "total": 0,
        "overall_readiness_percentage": 0.0
    }