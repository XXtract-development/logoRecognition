"""
Pipeline API — Epic 9, Story 9.3 (synthetic batch-fill wiring of the deferred 8.7 hook).

Endpoints:
  POST /ml/pipeline/build-synthetic-batch  (Story 9.3, AC4)
    Body: { "min_per_class": int, "real_synthetic_ratio": float }
    Response: { "batches": [...], "shortfall_reported": { "<label>": <count>, ... } }

This is a thin REST wrapper around ``app.services.synthesis.build_synthetic_batch``
(implemented + tested in 8.7). It is **compute-only**: it calls the planner with
``persist=False`` so a planning call never writes orphan PNGs that nothing
registers. Actual generation + MinIO persistence + 8.6 registration runs through
the separate ``synthesize_for_class`` → POST /ml/artwork/synthesize path
(Dev Notes #5; see the synthesis.py docstring's orphan-PNG warning).

The planner returns a *flat* list of crop descriptors AND shortfall entries
mixed together (synthesis.py). This endpoint splits them into the contract the
Node ML-client expects (ml-client.ts buildSyntheticBatch):
  - shortfall entries (``shortfall_reported: True``)  → aggregated into the
    ``shortfall_reported`` map (label → residual count)
  - all other crop descriptors                        → ``batches``
The ratio cap wins over min_per_class (conflict-resolution decision 2026-06-04,
enforced inside build_synthetic_batch and tested in 8.7-pytest).
"""

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.logging import logger


router = APIRouter()


class BuildSyntheticBatchRequest(BaseModel):
    """Request a synthetic batch *plan* for under-represented classes.

    ``min_per_class`` is the target floor per class; ``real_synthetic_ratio`` is
    the cap on synthetic-to-real samples (quality over quantity). The ratio cap
    wins over the minimum — residual shortfall is reported, never padded with
    synthetic noise.
    """

    min_per_class: int = Field(..., ge=1, le=10_000, description="Target minimum real+synthetic samples per class")
    real_synthetic_ratio: float = Field(..., gt=0, le=10.0, description="Max synthetic-to-real ratio cap")


class BuildSyntheticBatchResponse(BaseModel):
    """Batch plan: crop descriptors + per-class residual shortfall map."""

    batches: List[Dict[str, Any]]
    shortfall_reported: Dict[str, int]


@router.post("/pipeline/build-synthetic-batch", response_model=BuildSyntheticBatchResponse)
async def build_synthetic_batch_endpoint(
    request: BuildSyntheticBatchRequest,
) -> BuildSyntheticBatchResponse:
    """
    Plan a synthetic batch fill for under-represented keurmerk classes (AC4).

    Wraps ``build_synthetic_batch`` (compute-only, persist=False) and reshapes
    its flat output into ``{ batches, shortfall_reported }``. Class-count or
    reference/background failures are handled softly inside the service (it
    returns an empty plan), so the expected "nothing to fill" case is a 200 with
    empty results — never a 5xx.
    """
    from app.services.synthesis import build_synthetic_batch

    try:
        plan: List[Dict[str, Any]] = await build_synthetic_batch(
            min_per_class=request.min_per_class,
            real_synthetic_ratio=request.real_synthetic_ratio,
            persist=False,
        )
    except Exception as exc:  # noqa: BLE001 - surface as a clean 500, not a stack trace
        logger.error(
            "build_synthetic_batch failed",
            extra={
                "min_per_class": request.min_per_class,
                "real_synthetic_ratio": request.real_synthetic_ratio,
                "error": str(exc),
            },
        )
        raise HTTPException(status_code=500, detail="Synthetische batch-planning mislukt") from exc

    batches: List[Dict[str, Any]] = []
    shortfall_reported: Dict[str, int] = {}

    for entry in plan:
        if entry.get("shortfall_reported"):
            label = str(entry.get("label", "unknown"))
            count = int(entry.get("shortfall_count", 0) or 0)
            # A class can produce both a capped batch AND a shortfall entry; sum residuals.
            shortfall_reported[label] = shortfall_reported.get(label, 0) + count
        else:
            batches.append(entry)

    logger.info(
        "Synthetic batch plan complete",
        extra={
            "batch_size": len(batches),
            "shortfall_classes": len(shortfall_reported),
        },
    )

    return BuildSyntheticBatchResponse(batches=batches, shortfall_reported=shortfall_reported)
