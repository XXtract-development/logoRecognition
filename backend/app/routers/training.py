"""Routes handling training dataset annotation persistence."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.models.annotation import (
    AnnotationDiffSummary,
    AnnotationSaveResponse,
    AnnotationSubmission,
    AnnotationSummary,
    BoundingBoxPayload,
)
from app.repositories import AnnotationRepository
from app.services.annotation_service import AnnotationService, _to_payload


router = APIRouter(tags=["training"])


@lru_cache(maxsize=1)
def _annotation_service() -> AnnotationService:
    """Instantiate annotation service with repository."""

    storage_root = Path(
        os.getenv(
            "ANNOTATION_STORAGE_DIR",
            Path(__file__).resolve().parents[2] / "uploads" / "annotation_store",
        )
    )
    repository = AnnotationRepository(storage_root)
    return AnnotationService(repository)


def get_service() -> AnnotationService:
    return _annotation_service()


@router.post("/annotations", response_model=AnnotationSaveResponse, status_code=status.HTTP_200_OK)
async def save_annotations(
    submission: AnnotationSubmission,
    service: AnnotationService = Depends(get_service),
) -> AnnotationSaveResponse:
    """Persist annotations as draft or final dataset version."""

    return service.save_annotations(submission)


@router.get(
    "/annotations",
    response_model=List[AnnotationSummary],
    status_code=status.HTTP_200_OK,
)
async def list_all_dataset_versions(
    service: AnnotationService = Depends(get_service),
) -> List[AnnotationSummary]:
    """Get all available dataset versions across all datasets for training."""
    try:
        # Get all dataset IDs from the annotation storage
        all_versions = []
        storage_root = service.repository.storage_root

        # Scan all dataset directories
        if storage_root.exists():
            for dataset_dir in storage_root.iterdir():
                if dataset_dir.is_dir():
                    dataset_id = dataset_dir.name
                    try:
                        versions = service.list_versions(dataset_id)
                        all_versions.extend(versions)
                    except Exception:
                        # Skip datasets that have issues
                        continue

        return all_versions
    except Exception as e:
        # Return empty list instead of error to prevent frontend crashes
        return []


@router.get(
    "/annotations/draft",
    response_model=AnnotationSaveResponse,
    status_code=status.HTTP_200_OK,
)
async def load_draft(
    dataset_id: str = Query(..., description="Dataset identifier"),
    service: AnnotationService = Depends(get_service),
) -> AnnotationSaveResponse:
    """Return the most recent draft snapshot for the dataset if available."""

    payload = service.load_draft(dataset_id)
    if not payload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")

    record, annotations = payload
    return AnnotationSaveResponse(
        status="draft",
        dataset_version_id=record.dataset_version_id,
        version_number=record.version_number,
        checksum=record.checksum,
        total_annotations=record.total_annotations,
        total_images=record.total_images,
        diff=AnnotationDiffSummary(),
        conflicts=[],
        message="Draft loaded successfully.",
    )


@router.get(
    "/dataset/versions",
    response_model=List[AnnotationSummary],
    status_code=status.HTTP_200_OK,
)
async def list_versions(
    dataset_id: str = Query(..., description="Dataset identifier"),
    service: AnnotationService = Depends(get_service),
) -> List[AnnotationSummary]:
    """List dataset versions with change metadata."""

    return service.list_versions(dataset_id)


@router.get(
    "/dataset/versions/{version_id}",
    response_model=List[BoundingBoxPayload],
    status_code=status.HTTP_200_OK,
)
async def get_version(
    version_id: str,
    dataset_id: str = Query(..., description="Dataset identifier"),
    service: AnnotationService = Depends(get_service),
) -> List[BoundingBoxPayload]:
    """Return annotations for the specified dataset version."""

    record, annotations = service.get_version(dataset_id, version_id)
    del record  # response focuses on annotation payloads
    return [_to_payload(item) for item in annotations]


@router.get("/dataset/audit", status_code=status.HTTP_200_OK)
async def get_audit_trail(
    dataset_id: str = Query(..., description="Dataset identifier"),
    limit: int = Query(5, ge=1, le=50),
    service: AnnotationService = Depends(get_service),
):
    """Return latest audit trail entries."""

    return service.load_audit(dataset_id, limit=limit)
