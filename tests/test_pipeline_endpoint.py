"""Pipeline endpoint tests — Epic 9, Story 9.3 (AC4).

Tests the REST wrapper POST /ml/pipeline/build-synthetic-batch that wires the
deferred 8.7 synthetic-batch hook into the training pipeline.

Only DB IO is mocked (db_service.get_class_counts); the real reshape logic
(flat plan → { batches, shortfall_reported }) and the real ratio-cap planner
run. References/backgrounds are absent in the bare test env, so capped classes
fall through to the open-input shortfall path — which is exactly the contract
the Node ML-client depends on.
"""

import pytest
from unittest.mock import AsyncMock, patch

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'ml-service'))


@pytest.mark.asyncio
async def test_build_synthetic_batch_endpoint_returns_batches_and_shortfall_shape():
    """The endpoint always returns the { batches, shortfall_reported } contract,
    with shortfall_reported a label→int map (never a flat list, never None)."""
    from app.api.pipeline import build_synthetic_batch_endpoint, BuildSyntheticBatchRequest

    # One under-represented class with 3 real samples; ratio 0.5 caps synthetics
    # at 1 (floor(3*0.5)), so it cannot reach min_per_class=20 → residual shortfall.
    with patch(
        "app.services.database.db_service.get_class_counts",
        new=AsyncMock(return_value={"RARE_MARK": 3}),
    ):
        resp = await build_synthetic_batch_endpoint(
            BuildSyntheticBatchRequest(min_per_class=20, real_synthetic_ratio=0.5)
        )

    assert isinstance(resp.batches, list)
    assert isinstance(resp.shortfall_reported, dict)
    # Residual shortfall for the capped class must be reported as a positive int.
    assert resp.shortfall_reported.get("RARE_MARK", 0) > 0
    assert all(isinstance(v, int) for v in resp.shortfall_reported.values())
    # No shortfall entry leaks into batches (they are split out).
    assert all(not b.get("shortfall_reported") for b in resp.batches)


@pytest.mark.asyncio
async def test_build_synthetic_batch_endpoint_empty_when_all_classes_sufficient():
    """Classes already at/above min_per_class need no fill: empty plan, empty
    shortfall — a clean 200, not a 5xx (open-input / nothing-to-do case)."""
    from app.api.pipeline import build_synthetic_batch_endpoint, BuildSyntheticBatchRequest

    with patch(
        "app.services.database.db_service.get_class_counts",
        new=AsyncMock(return_value={"COMMON_MARK": 500}),
    ):
        resp = await build_synthetic_batch_endpoint(
            BuildSyntheticBatchRequest(min_per_class=20, real_synthetic_ratio=0.5)
        )

    assert resp.batches == []
    assert resp.shortfall_reported == {}


@pytest.mark.asyncio
async def test_build_synthetic_batch_endpoint_maps_500_on_planner_failure():
    """An unexpected planner failure surfaces as a clean HTTP 500, not a leaked
    stack trace."""
    from fastapi import HTTPException
    from app.api.pipeline import build_synthetic_batch_endpoint, BuildSyntheticBatchRequest

    with patch(
        "app.services.synthesis.build_synthetic_batch",
        new=AsyncMock(side_effect=RuntimeError("boom")),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await build_synthetic_batch_endpoint(
                BuildSyntheticBatchRequest(min_per_class=20, real_synthetic_ratio=0.5)
            )

    assert exc_info.value.status_code == 500
