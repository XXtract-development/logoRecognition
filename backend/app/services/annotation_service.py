"""Business logic for annotation persistence and dataset versioning."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException, status

from app.models.annotation import (
    AnnotationConflict,
    AnnotationDiffSummary,
    AnnotationSaveResponse,
    AnnotationSubmission,
    AnnotationSummary,
    BoundingBoxPayload,
)
from app.repositories import AnnotationRepository, DatasetVersionRecord, StoredAnnotation


MIN_BOX_DIMENSION = 20
OVERLAP_THRESHOLD = 0.8


class AnnotationService:
    """Coordinates annotation validation, conflict detection, and persistence."""

    def __init__(self, repository: AnnotationRepository):
        self.repository = repository

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def save_annotations(self, submission: AnnotationSubmission) -> AnnotationSaveResponse:
        """Persist annotations either as draft or final dataset version."""

        annotations = [self.repository.to_stored(item) for item in submission.annotations]
        self._validate_annotations(submission.annotations)

        if submission.status == "draft":
            record = self.repository.save_draft(
                dataset_id=submission.dataset_id,
                annotations=annotations,
                user_id=submission.user_id,
                tags=submission.tags,
            )
            self.repository.append_audit_entry(
                submission.dataset_id,
                _audit_entry(
                    action="autosave",
                    user_id=submission.user_id,
                    version_id=record.dataset_version_id,
                    status="draft",
                    note="Autosave snapshot persisted",
                ),
            )

            diff = AnnotationDiffSummary()
            return AnnotationSaveResponse(
                status="draft",
                dataset_version_id=record.dataset_version_id,
                version_number=record.version_number,
                checksum=record.checksum,
                total_annotations=record.total_annotations,
                total_images=record.total_images,
                diff=diff,
                message="Draft saved successfully.",
            )

        latest = self.repository.latest_version(submission.dataset_id)
        existing_record, existing_annotations = (latest if latest else (None, []))

        conflicts, resolved_annotations = self._resolve_conflicts(
            submission=submission,
            incoming=annotations,
            existing=existing_annotations,
        )

        if conflicts:
            return AnnotationSaveResponse(
                status="conflict",
                dataset_version_id=None,
                version_number=None,
                checksum=None,
                total_annotations=len(annotations),
                total_images=len({item.image_id for item in annotations}),
                diff=AnnotationDiffSummary(),
                conflicts=conflicts,
                message="Conflicts detected. Resolve before saving final version.",
            )

        diff_summary = self._build_diff(existing_annotations, resolved_annotations)

        if diff_summary.added == 0 and diff_summary.updated == 0 and diff_summary.removed == 0:
            self.repository.append_audit_entry(
                submission.dataset_id,
                _audit_entry(
                    action="noop",
                    user_id=submission.user_id,
                    version_id=existing_record.dataset_version_id if existing_record else "initial",
                    status="final",
                    note="No-op save attempt detected",
                ),
            )
            return AnnotationSaveResponse(
                status="noop",
                dataset_version_id=existing_record.dataset_version_id if existing_record else None,
                version_number=existing_record.version_number if existing_record else None,
                checksum=existing_record.checksum if existing_record else None,
                total_annotations=len(resolved_annotations),
                total_images=len({item.image_id for item in resolved_annotations}),
                diff=diff_summary,
                message="No changes detected. Save skipped.",
            )

        diff_counts = {
            "added": diff_summary.added,
            "updated": diff_summary.updated,
            "removed": diff_summary.removed,
        }

        record, stored_annotations = self.repository.create_version(
            dataset_id=submission.dataset_id,
            annotations=resolved_annotations,
            user_id=submission.user_id,
            tags=submission.tags,
            diff_counts=diff_counts,
        )

        self.repository.append_audit_entry(
            submission.dataset_id,
            _audit_entry(
                action="save",
                user_id=submission.user_id,
                version_id=record.dataset_version_id,
                status="final",
                note=f"Dataset version {record.version_number} created",
            ),
        )

        return AnnotationSaveResponse(
            status="saved",
            dataset_version_id=record.dataset_version_id,
            version_number=record.version_number,
            checksum=record.checksum,
            total_annotations=len(stored_annotations),
            total_images=len({item.image_id for item in stored_annotations}),
            diff=diff_summary,
            message="Annotations saved successfully.",
        )

    def list_versions(self, dataset_id: str) -> List[AnnotationSummary]:
        """List dataset versions with diff metadata for UI consumption."""

        records = self.repository.list_versions(dataset_id)
        summaries: List[AnnotationSummary] = []
        for record in records:
            summaries.append(
                AnnotationSummary(
                    dataset_version_id=record.dataset_version_id,
                    version_number=record.version_number,
                    status=record.status,
                    total_annotations=record.total_annotations,
                    total_images=record.total_images,
                    checksum=record.checksum,
                    created_at=record.created_at,
                    created_by=record.created_by,
                    tags=record.tags,
                    added=record.added,
                    updated=record.updated,
                    removed=record.removed,
                )
            )
        return summaries

    def get_version(
        self, dataset_id: str, dataset_version_id: str
    ) -> Tuple[DatasetVersionRecord, List[StoredAnnotation]]:
        """Return full version payload for inspection."""

        payload = self.repository.load_version(dataset_id, dataset_version_id)
        if not payload:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
        return payload

    def load_draft(self, dataset_id: str) -> Optional[Tuple[DatasetVersionRecord, List[StoredAnnotation]]]:
        """Retrieve draft if present."""

        return self.repository.load_draft(dataset_id)

    def load_audit(self, dataset_id: str, limit: int = 5) -> List[Dict[str, str]]:
        """Return most recent audit entries."""

        return self.repository.load_audit_entries(dataset_id, limit=limit)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _validate_annotations(self, annotations: Iterable[BoundingBoxPayload]) -> None:
        """Apply backend validation rules to input annotations."""

        for item in annotations:
            if item.width < MIN_BOX_DIMENSION or item.height < MIN_BOX_DIMENSION:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Bounding box {item.id} too small. Minimum size is {MIN_BOX_DIMENSION}px.",
                )

            if item.image_width and item.x + item.width > item.image_width + 1e-6:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Bounding box {item.id} exceeds image width.",
                )
            if item.image_height and item.y + item.height > item.image_height + 1e-6:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Bounding box {item.id} exceeds image height.",
                )

    def _resolve_conflicts(
        self,
        submission: AnnotationSubmission,
        incoming: List[StoredAnnotation],
        existing: List[StoredAnnotation],
    ) -> Tuple[List[AnnotationConflict], List[StoredAnnotation]]:
        """Detect and optionally resolve conflicts for duplicate annotations."""

        conflicts: List[AnnotationConflict] = []
        resolved: List[StoredAnnotation] = []
        drop_existing_ids: set[str] = set()
        drop_new_ids: set[str] = set()

        existing_by_key: Dict[Tuple[str, str, str], List[StoredAnnotation]] = {}
        for ann in existing:
            key = (ann.image_id, ann.category.lower(), ann.value.lower())
            existing_by_key.setdefault(key, []).append(ann)

        for ann in incoming:
            key = (ann.image_id, ann.category.lower(), ann.value.lower())
            duplicates = existing_by_key.get(key, [])
            conflict_found = False
            for dup in duplicates:
                overlap = _intersection_over_union(ann, dup)
                if overlap >= OVERLAP_THRESHOLD:
                    conflict_id = f"{dup.id}->{ann.id}"
                    resolution = submission.conflict_resolutions.get(conflict_id)
                    if resolution:
                        if resolution in {"merge", "keep_new"}:
                            resolved.append(ann)
                            drop_existing_ids.add(dup.id)
                            conflict_found = True
                        elif resolution == "keep_both":
                            resolved.append(ann)
                            resolved.append(dup)
                            conflict_found = True
                        elif resolution == "discard_new":
                            resolved.append(dup)
                            drop_new_ids.add(ann.id)
                            conflict_found = True
                        break
                    else:
                        conflicts.append(
                            AnnotationConflict(
                                conflict_id=conflict_id,
                                reason="Duplicate annotation detected with >80% overlap",
                                existing_annotation=_to_payload(dup),
                                incoming_annotation=_to_payload(ann),
                                overlap_ratio=overlap,
                            )
                        )
                        conflict_found = True
                        break

            if conflict_found and ann.id in drop_new_ids:
                continue

            if not conflict_found:
                resolved.append(ann)

        if conflicts:
            return conflicts, incoming

        # Add existing annotations that should persist
        resolved_map = {(item.id, item.image_id): item for item in resolved}
        for dup in existing:
            key = (dup.id, dup.image_id)
            if dup.id in drop_existing_ids:
                continue
            if key not in resolved_map:
                resolved.append(dup)

        return [], resolved

    def _build_diff(
        self,
        previous: Iterable[StoredAnnotation],
        current: Iterable[StoredAnnotation],
    ) -> AnnotationDiffSummary:
        prev_map = {item.id: item for item in previous}
        curr_map = {item.id: item for item in current}

        added = len([item for key, item in curr_map.items() if key not in prev_map])
        removed = len([item for key, item in prev_map.items() if key not in curr_map])
        updated = 0
        unchanged = 0

        shared_keys = set(prev_map).intersection(curr_map)
        for key in shared_keys:
            if prev_map[key].checksum() != curr_map[key].checksum():
                updated += 1
            else:
                unchanged += 1

        return AnnotationDiffSummary(added=added, updated=updated, removed=removed, unchanged=unchanged)


def _intersection_over_union(a: StoredAnnotation, b: StoredAnnotation) -> float:
    """Calculate Intersection over Union for two boxes."""

    ax1, ay1 = a.x, a.y
    ax2, ay2 = a.x + a.width, a.y + a.height
    bx1, by1 = b.x, b.y
    bx2, by2 = b.x + b.width, b.y + b.height

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_width = max(0.0, inter_x2 - inter_x1)
    inter_height = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_width * inter_height

    if inter_area <= 0:
        return 0.0

    area_a = a.width * a.height
    area_b = b.width * b.height
    union = area_a + area_b - inter_area
    if union <= 0:
        return 0.0
    return inter_area / union


def _audit_entry(action: str, user_id: str, version_id: str, status: str, note: str) -> Dict[str, str]:
    """Build a structured audit log entry."""

    return {
        "id": f"audit-{datetime.utcnow().timestamp()}",
        "action": action,
        "user_id": user_id,
        "version_id": version_id,
        "status": status,
        "note": note,
        "timestamp": datetime.utcnow().isoformat(),
    }


def _to_payload(annotation: StoredAnnotation) -> BoundingBoxPayload:
    """Convert stored annotation back to API payload."""

    payload = BoundingBoxPayload(
        id=annotation.id,
        image_id=annotation.image_id,
        x=annotation.x,
        y=annotation.y,
        width=annotation.width,
        height=annotation.height,
        category=annotation.category,
        value=annotation.value,
        category_id=annotation.category_id,
        value_id=annotation.value_id,
        confidence=annotation.confidence,
        tags=list(annotation.tags),
        metadata=dict(annotation.metadata),
    )
    return payload
