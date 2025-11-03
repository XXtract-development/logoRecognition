"""File-based repository backing annotation persistence."""

from __future__ import annotations

import json
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from app.models.annotation import BoundingBoxPayload


@dataclass
class StoredAnnotation:
    """Internal representation of a persisted annotation."""

    id: str
    image_id: str
    x: float
    y: float
    width: float
    height: float
    category: str
    value: str
    category_id: Optional[str] = None
    value_id: Optional[str] = None
    confidence: Optional[float] = None
    tags: List[str] = field(default_factory=list)
    created: Optional[str] = None
    updated: Optional[str] = None
    metadata: Dict[str, str] = field(default_factory=dict)

    def checksum(self) -> str:
        """Create a stable checksum for the annotation."""

        digest = sha256()
        digest.update(self.id.encode("utf-8"))
        digest.update(self.image_id.encode("utf-8"))
        digest.update(str(self.x).encode("utf-8"))
        digest.update(str(self.y).encode("utf-8"))
        digest.update(str(self.width).encode("utf-8"))
        digest.update(str(self.height).encode("utf-8"))
        digest.update(self.category.lower().encode("utf-8"))
        digest.update(self.value.lower().encode("utf-8"))
        return digest.hexdigest()


@dataclass
class DatasetVersionRecord:
    """Metadata describing a dataset version stored on disk."""

    dataset_version_id: str
    dataset_id: str
    version_number: int
    status: str
    total_annotations: int
    total_images: int
    checksum: str
    created_at: datetime
    created_by: str
    tags: List[str] = field(default_factory=list)
    added: int = 0
    updated: int = 0
    removed: int = 0


class AnnotationRepository:
    """Persist annotations and dataset metadata on the filesystem."""

    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self.root_dir.mkdir(parents=True, exist_ok=True)
        (self.root_dir / "versions").mkdir(exist_ok=True)
        (self.root_dir / "drafts").mkdir(exist_ok=True)
        (self.root_dir / "audit").mkdir(exist_ok=True)
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Draft handling
    # ------------------------------------------------------------------
    def save_draft(
        self,
        dataset_id: str,
        annotations: Iterable[StoredAnnotation],
        user_id: str,
        tags: Optional[List[str]] = None,
    ) -> DatasetVersionRecord:
        """Persist a draft snapshot for the dataset."""

        draft_path = self._draft_path(dataset_id)
        payload = {
            "dataset_id": dataset_id,
            "annotations": [asdict(item) for item in annotations],
            "user_id": user_id,
            "tags": tags or [],
            "updated_at": datetime.utcnow().isoformat(),
        }

        with self._lock:
            draft_path.write_text(json.dumps(payload, indent=2))

        checksum = self._compute_checksum(payload["annotations"])
        record = DatasetVersionRecord(
            dataset_version_id=f"draft-{dataset_id}",
            dataset_id=dataset_id,
            version_number=self._latest_version_number(dataset_id),
            status="draft",
            total_annotations=len(payload["annotations"]),
            total_images=len({item["image_id"] for item in payload["annotations"]}),
            checksum=checksum,
            created_at=datetime.utcnow(),
            created_by=user_id,
            tags=tags or [],
        )
        return record

    def load_draft(self, dataset_id: str) -> Optional[Tuple[DatasetVersionRecord, List[StoredAnnotation]]]:
        """Retrieve previously saved draft if available."""

        draft_path = self._draft_path(dataset_id)
        if not draft_path.exists():
            return None

        payload = json.loads(draft_path.read_text())
        annotations = [StoredAnnotation(**item) for item in payload.get("annotations", [])]
        checksum = self._compute_checksum(payload.get("annotations", []))
        record = DatasetVersionRecord(
            dataset_version_id=f"draft-{dataset_id}",
            dataset_id=dataset_id,
            version_number=self._latest_version_number(dataset_id),
            status="draft",
            total_annotations=len(annotations),
            total_images=len({ann.image_id for ann in annotations}),
            checksum=checksum,
            created_at=datetime.utcnow(),
            created_by=payload.get("user_id", "unknown"),
            tags=payload.get("tags", []),
        )
        return record, annotations

    # ------------------------------------------------------------------
    # Version handling
    # ------------------------------------------------------------------
    def create_version(
        self,
        dataset_id: str,
        annotations: Iterable[StoredAnnotation],
        user_id: str,
        tags: Optional[List[str]],
        diff_counts: Dict[str, int],
    ) -> Tuple[DatasetVersionRecord, List[StoredAnnotation]]:
        """Persist a new dataset version."""

        annotations_list = list(annotations)
        checksum = self._compute_checksum([asdict(item) for item in annotations_list])
        version_number = self._next_version_number(dataset_id)
        version_id = uuid.uuid4().hex
        record = DatasetVersionRecord(
            dataset_version_id=version_id,
            dataset_id=dataset_id,
            version_number=version_number,
            status="final",
            total_annotations=len(annotations_list),
            total_images=len({ann.image_id for ann in annotations_list}),
            checksum=checksum,
            created_at=datetime.utcnow(),
            created_by=user_id,
            tags=tags or [],
            added=diff_counts.get("added", 0),
            updated=diff_counts.get("updated", 0),
            removed=diff_counts.get("removed", 0),
        )

        version_dir = self._version_dir(dataset_id)
        version_dir.mkdir(exist_ok=True, parents=True)
        payload = {
            "version": self._record_to_json(record),
            "annotations": [asdict(item) for item in annotations_list],
        }

        with self._lock:
            version_path = version_dir / f"{version_number:05d}-{version_id}.json"
            version_path.write_text(json.dumps(payload, indent=2))
            self._upsert_index(dataset_id, record)
            # remove draft when final version saved
            draft = self._draft_path(dataset_id)
            if draft.exists():
                draft.unlink()

        return record, annotations_list

    def list_versions(self, dataset_id: str) -> List[DatasetVersionRecord]:
        """Return summary list for the dataset."""

        index_path = self._index_path(dataset_id)
        if not index_path.exists():
            return []

        index_data = json.loads(index_path.read_text())
        versions: List[DatasetVersionRecord] = []
        for item in index_data.get("versions", []):
            versions.append(self._record_from_json(item))
        return sorted(versions, key=lambda rec: rec.version_number, reverse=True)

    def load_version(
        self, dataset_id: str, dataset_version_id: str
    ) -> Optional[Tuple[DatasetVersionRecord, List[StoredAnnotation]]]:
        """Load a specific version and its annotations."""

        version_dir = self._version_dir(dataset_id)
        if not version_dir.exists():
            return None

        for path in version_dir.glob(f"*-{dataset_version_id}.json"):
            payload = json.loads(path.read_text())
            record = self._record_from_json(payload["version"])
            annotations = [StoredAnnotation(**item) for item in payload.get("annotations", [])]
            return record, annotations
        return None

    def latest_version(
        self, dataset_id: str
    ) -> Optional[Tuple[DatasetVersionRecord, List[StoredAnnotation]]]:
        """Convenience helper returning the most recent version."""

        versions = self.list_versions(dataset_id)
        if not versions:
            return None
        latest = versions[0]
        return self.load_version(dataset_id, latest.dataset_version_id)

    # ------------------------------------------------------------------
    # Audit logging
    # ------------------------------------------------------------------
    def append_audit_entry(self, dataset_id: str, entry: Dict[str, str]) -> None:
        """Persist audit trail entry with bounded history."""

        audit_path = self._audit_path(dataset_id)
        with self._lock:
            if audit_path.exists():
                payload = json.loads(audit_path.read_text())
            else:
                payload = {"entries": []}
            payload["entries"].insert(0, entry)
            payload["entries"] = payload["entries"][:200]
            audit_path.write_text(json.dumps(payload, indent=2))

    def load_audit_entries(self, dataset_id: str, limit: int = 20) -> List[Dict[str, str]]:
        """Return audit entries constrained by limit."""

        audit_path = self._audit_path(dataset_id)
        if not audit_path.exists():
            return []
        payload = json.loads(audit_path.read_text())
        return payload.get("entries", [])[:limit]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _draft_path(self, dataset_id: str) -> Path:
        return self.root_dir / "drafts" / f"{dataset_id}.json"

    def _version_dir(self, dataset_id: str) -> Path:
        return self.root_dir / "versions" / dataset_id

    def _index_path(self, dataset_id: str) -> Path:
        return self._version_dir(dataset_id) / "index.json"

    def _audit_path(self, dataset_id: str) -> Path:
        return self.root_dir / "audit" / f"{dataset_id}.json"

    def _latest_version_number(self, dataset_id: str) -> int:
        versions = self.list_versions(dataset_id)
        if not versions:
            return 0
        return versions[0].version_number

    def _next_version_number(self, dataset_id: str) -> int:
        return self._latest_version_number(dataset_id) + 1

    def _record_to_json(self, record: DatasetVersionRecord) -> Dict[str, str]:
        payload = asdict(record)
        payload["created_at"] = record.created_at.isoformat()
        return payload

    def _record_from_json(self, payload: Dict[str, str]) -> DatasetVersionRecord:
        return DatasetVersionRecord(
            dataset_version_id=payload["dataset_version_id"],
            dataset_id=payload["dataset_id"],
            version_number=int(payload["version_number"]),
            status=payload["status"],
            total_annotations=int(payload["total_annotations"]),
            total_images=int(payload.get("total_images", 0)),
            checksum=payload["checksum"],
            created_at=datetime.fromisoformat(payload["created_at"]),
            created_by=payload.get("created_by", "unknown"),
            tags=payload.get("tags", []),
            added=int(payload.get("added", 0)),
            updated=int(payload.get("updated", 0)),
            removed=int(payload.get("removed", 0)),
        )

    def _upsert_index(self, dataset_id: str, record: DatasetVersionRecord) -> None:
        index_path = self._index_path(dataset_id)
        if index_path.exists():
            payload = json.loads(index_path.read_text())
        else:
            payload = {"versions": []}

        payload["versions"] = [
            item
            for item in payload["versions"]
            if item["dataset_version_id"] != record.dataset_version_id
        ]
        payload["versions"].append(self._record_to_json(record))
        payload["versions"] = sorted(
            payload["versions"], key=lambda item: item["version_number"], reverse=True
        )
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text(json.dumps(payload, indent=2))

    def _compute_checksum(self, annotations: Iterable[Dict[str, str]]) -> str:
        digest = sha256()
        for item in sorted(annotations, key=lambda data: (data.get("image_id"), data.get("id"))):
            digest.update(json.dumps(item, sort_keys=True).encode("utf-8"))
        return digest.hexdigest()

    @staticmethod
    def to_stored(annotation: BoundingBoxPayload) -> StoredAnnotation:
        """Convert pydantic payload to repository representation."""

        return StoredAnnotation(
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
            created=annotation.created.isoformat() if annotation.created else None,
            updated=annotation.updated.isoformat() if annotation.updated else None,
            metadata={**annotation.metadata},
        )

