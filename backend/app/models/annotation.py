"""Pydantic schemas for annotation persistence workflows."""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, validator


class BoundingBoxPayload(BaseModel):
    """Structured payload describing a single annotated logo."""

    id: str = Field(..., description="Stable identifier generated client-side.")
    image_id: str = Field(..., description="Identifier of the image that owns the annotation.")
    x: float = Field(..., ge=0, description="X coordinate of the bounding box origin.")
    y: float = Field(..., ge=0, description="Y coordinate of the bounding box origin.")
    width: float = Field(..., gt=0, description="Width of the bounding box in pixels.")
    height: float = Field(..., gt=0, description="Height of the bounding box in pixels.")
    category: str = Field(..., min_length=1, description="Logical category label (e.g. 'Brand').")
    value: str = Field(..., min_length=1, description="Concrete value within the category (e.g. 'Nike').")
    category_id: Optional[str] = Field(None, description="Optional category identifier from taxonomy store.")
    value_id: Optional[str] = Field(None, description="Optional value identifier from taxonomy store.")
    confidence: Optional[float] = Field(
        None,
        ge=0,
        le=1,
        description="Optional model confidence score for semi-automatic annotations.",
    )
    tags: List[str] = Field(default_factory=list, description="Arbitrary tag labels assigned to the annotation.")
    created: Optional[datetime] = Field(
        default=None, description="Client-side creation timestamp for traceability."
    )
    updated: Optional[datetime] = Field(
        default=None, description="Client-side last update timestamp for traceability."
    )
    image_width: Optional[int] = Field(
        default=None,
        gt=0,
        description="Optional source image width in pixels for boundary validation.",
    )
    image_height: Optional[int] = Field(
        default=None,
        gt=0,
        description="Optional source image height in pixels for boundary validation.",
    )
    metadata: Dict[str, str] = Field(
        default_factory=dict,
        description="Additional annotation metadata supplied by the client (e.g. annotator notes).",
    )

    @validator("category", "value")
    def _strip_labels(cls, value: str) -> str:
        """Normalise textual labels by stripping whitespace."""

        return value.strip()


class AnnotationSubmission(BaseModel):
    """Incoming payload when the UI persists annotations."""

    dataset_id: str = Field(..., description="Dataset identifier provided by the frontend context.")
    user_id: str = Field(..., description="Authenticated user performing the action.")
    annotations: List[BoundingBoxPayload] = Field(
        default_factory=list,
        description="Collection of annotations to persist for the dataset.",
    )
    status: Literal["draft", "final"] = Field(
        "final", description="Persistence mode. Draft keeps working copy, final creates new version."
    )
    base_version_id: Optional[str] = Field(
        default=None,
        description="When saving, optional reference to the version the client used for diffing.",
    )
    conflict_resolutions: Dict[
        str, Literal["merge", "keep_new", "discard_new", "keep_both"]
    ] = Field(
        default_factory=dict,
        description="Client supplied resolutions for outstanding conflicts keyed by conflict id.",
    )
    tags: List[str] = Field(
        default_factory=list,
        description="High-level dataset tags (e.g. 'batch-23', 'food').",
    )
    feature_flag_snapshot: Dict[str, bool] = Field(
        default_factory=dict,
        description="Feature flag state to support staged rollouts.",
    )


class AnnotationSummary(BaseModel):
    """Lightweight summary describing a dataset version."""

    dataset_version_id: str
    version_number: int
    status: Literal["draft", "final"]
    total_annotations: int
    total_images: int
    checksum: str
    created_at: datetime
    created_by: str
    tags: List[str] = Field(default_factory=list)
    added: int = 0
    updated: int = 0
    removed: int = 0


class AnnotationDiffSummary(BaseModel):
    """Describes changes between the previous published version and the current submission."""

    added: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0


class AnnotationConflict(BaseModel):
    """Represents a detected conflict blocking persistence."""

    conflict_id: str
    reason: str
    existing_annotation: BoundingBoxPayload
    incoming_annotation: BoundingBoxPayload
    overlap_ratio: float


class AnnotationSaveResponse(BaseModel):
    """Response returned after attempting to persist annotations."""

    status: Literal["saved", "draft", "conflict", "noop"]
    dataset_version_id: Optional[str]
    version_number: Optional[int]
    checksum: Optional[str]
    total_annotations: int
    total_images: int
    diff: AnnotationDiffSummary = Field(default_factory=AnnotationDiffSummary)
    conflicts: List[AnnotationConflict] = Field(default_factory=list)
    saved_at: datetime = Field(default_factory=datetime.utcnow)
    message: Optional[str] = None
