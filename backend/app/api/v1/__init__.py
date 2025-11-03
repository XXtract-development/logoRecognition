"""
API v1 Package
US-INT-002: Production API endpoints for training jobs
"""

from fastapi import APIRouter

from .training_jobs import router as training_jobs_router

# Main v1 router
api_v1_router = APIRouter(prefix="/api/v1")

# Include sub-routers
api_v1_router.include_router(training_jobs_router, tags=["training-jobs"])

__all__ = ["api_v1_router"]
