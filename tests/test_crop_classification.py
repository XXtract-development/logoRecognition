"""Crop classification tests — Epic 8, Story 8.4 (real-path coverage).

These tests exercise the REAL implementations (not facades):
  * db_service.find_similar_references — pgvector cosine query against the
    reference library (query shape + threshold filtering + [0,1] clamping).
  * db_service.get_reference_embeddings — vector-text → numpy parsing + active
    filter.
  * similarity_service.rebuild_reference_embeddings — one embedding per ACTIVE
    reference variant, table cleared first (idempotent).
  * classification.classify_crop — embedding route via find_similar_references,
    classifier route only when an active model exists, per-method thresholds,
    fail-closed.
  * /ml/artwork/classify endpoint — per-crop dispatch.

The bare test environment has no torch/onnxruntime/asyncpg server, so the
backbone and DB connection are mocked (AsyncMock, mirroring the holdout_trainer
pattern). The functions under test themselves are the real ones.
"""

import asyncio
import importlib
import os
import sys

import numpy as np
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# conftest.py (auto-loaded by pytest) installs module-level mocks for asyncpg,
# torch, and the heavy app.services.* singletons (shared by the artwork/holdout
# test files). For THIS file we need the REAL database / similarity /
# classification modules — but ONLY for our own tests. A global, module-level
# swap would corrupt sys.modules for the whole pytest session and break the
# artwork/holdout tests that rely on the mocks.
#
# Strategy:
#   * Swap in the real modules just long enough to import them (binding the real
#     db_service into the real similarity module), then RESTORE the conftest
#     mocks so collection of other files is unaffected.
#   * Keep `app.services` (package), `trainer` and `storage` as the conftest
#     mocks throughout (our tests never reach the real trainer/storage), which
#     also sidesteps the trainer's import-time MODEL_PATH mkdir.
#   * An autouse, function-scoped fixture re-installs the three real modules for
#     the duration of each test, so classify_crop's call-time
#     `from app.services.database import db_service` resolves to the real object.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "ml-service"))

_REAL_MODULE_NAMES = (
    "app.services.database",
    "app.services.similarity",
    "app.services.classification",
)

_saved_mocks = {name: sys.modules.get(name) for name in _REAL_MODULE_NAMES}

# Import the real modules (order matters: database before similarity, because
# similarity binds `db_service` from database at import time).
for _name in _REAL_MODULE_NAMES:
    sys.modules.pop(_name, None)
database = importlib.import_module("app.services.database")
similarity = importlib.import_module("app.services.similarity")
classification = importlib.import_module("app.services.classification")
_real_modules = {name: sys.modules[name] for name in _REAL_MODULE_NAMES}

# Restore the conftest mocks so other test files (collected after us) see them.
for _name, _mock in _saved_mocks.items():
    if _mock is not None:
        sys.modules[_name] = _mock
    else:
        sys.modules.pop(_name, None)


@pytest.fixture(autouse=True)
def _use_real_services():
    """Install the real database/similarity/classification modules for the
    duration of each test, then restore the conftest mocks on teardown."""
    previous = {name: sys.modules.get(name) for name in _REAL_MODULE_NAMES}
    for name, mod in _real_modules.items():
        sys.modules[name] = mod
    try:
        yield
    finally:
        for name, mod in previous.items():
            if mod is not None:
                sys.modules[name] = mod
            else:
                sys.modules.pop(name, None)


# ---------------------------------------------------------------------------
# Async connection mock helper
# ---------------------------------------------------------------------------


class _FakeConn:
    """Minimal async asyncpg connection stub."""

    def __init__(self, fetch_rows=None, fetchrow_row=None, execute_result="DELETE 0"):
        self._fetch_rows = fetch_rows or []
        self._fetchrow_row = fetchrow_row
        self._execute_result = execute_result
        self.fetch_calls = []
        self.execute_calls = []

    async def fetch(self, query, *args):
        self.fetch_calls.append((query, args))
        return self._fetch_rows

    async def fetchrow(self, query, *args):
        return self._fetchrow_row

    async def execute(self, query, *args):
        self.execute_calls.append((query, args))
        return self._execute_result


def _patch_connection(db_service, conn):
    """Patch db_service.get_connection to yield the given fake connection."""
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _fake_get_connection():
        yield conn

    return patch.object(db_service, "get_connection", _fake_get_connection)


# ---------------------------------------------------------------------------
# _parse_pgvector
# ---------------------------------------------------------------------------


def test_parse_pgvector_bracketed_string():
    arr = database._parse_pgvector("[1.0,2.5,-3.0]")
    assert isinstance(arr, np.ndarray)
    assert arr.dtype == np.float32
    np.testing.assert_allclose(arr, [1.0, 2.5, -3.0])


def test_parse_pgvector_empty_and_none():
    assert database._parse_pgvector("[]").size == 0
    assert database._parse_pgvector(None).size == 0


# ---------------------------------------------------------------------------
# find_similar_references — query shape, threshold, clamping
# ---------------------------------------------------------------------------


def test_find_similar_references_query_uses_reference_tables_and_active_filter():
    rows = [
        {"reference_logo_id": "r1", "t3777_code": "EU_ORGANIC", "variant_label": "v1", "similarity": 0.92},
    ]
    conn = _FakeConn(fetch_rows=rows)
    with _patch_connection(database.db_service, conn):
        result = asyncio.run(
            database.db_service.find_similar_references(np.ones(512, dtype=np.float32), limit=3, threshold=0.5)
        )

    # Real pgvector query, against the reference tables, active-only.
    executed_sql = conn.fetch_calls[0][0]
    assert "reference_embeddings" in executed_sql
    assert "reference_logos" in executed_sql
    assert "rl.active = true" in executed_sql
    assert "<=>" in executed_sql  # pgvector cosine distance operator
    assert result[0]["t3777_code"] == "EU_ORGANIC"
    assert result[0]["similarity"] == pytest.approx(0.92)


def test_find_similar_references_filters_below_threshold_and_clamps():
    rows = [
        {"reference_logo_id": "r1", "t3777_code": "A", "variant_label": "v", "similarity": 0.95},
        {"reference_logo_id": "r2", "t3777_code": "B", "variant_label": "v", "similarity": 0.40},
        {"reference_logo_id": "r3", "t3777_code": "C", "variant_label": "v", "similarity": -0.20},
    ]
    conn = _FakeConn(fetch_rows=rows)
    with _patch_connection(database.db_service, conn):
        result = asyncio.run(
            database.db_service.find_similar_references(np.ones(512, dtype=np.float32), limit=5, threshold=0.75)
        )

    # Only the 0.95 row survives the threshold; negative similarity is clamped.
    assert len(result) == 1
    assert result[0]["t3777_code"] == "A"
    assert 0.0 <= result[0]["similarity"] <= 1.0


# ---------------------------------------------------------------------------
# get_reference_embeddings — parsing + active filter
# ---------------------------------------------------------------------------


def test_get_reference_embeddings_parses_vectors_and_joins_active():
    rows = [
        {
            "reference_logo_id": "r1",
            "t3777_code": "EU_ORGANIC",
            "variant_label": "v1",
            "embedding_text": "[0.1,0.2,0.3]",
        }
    ]
    conn = _FakeConn(fetch_rows=rows)
    with _patch_connection(database.db_service, conn):
        result = asyncio.run(database.db_service.get_reference_embeddings())

    executed_sql = conn.fetch_calls[0][0]
    assert "rl.active = true" in executed_sql
    assert isinstance(result[0]["embedding"], np.ndarray)
    np.testing.assert_allclose(result[0]["embedding"], [0.1, 0.2, 0.3], rtol=1e-5)
    assert result[0]["t3777_code"] == "EU_ORGANIC"


# ---------------------------------------------------------------------------
# rebuild_reference_embeddings — one per active variant, clears first
# ---------------------------------------------------------------------------


def test_rebuild_reference_embeddings_stores_one_per_active_variant():
    refs = [
        {"id": "r1", "t3777_code": "A", "variant_label": "v1", "storage_path": "reference-logos/A/v1.png"},
        {"id": "r2", "t3777_code": "B", "variant_label": "v1", "storage_path": "reference-logos/B/v1.png"},
    ]

    with patch.object(database.db_service, "get_active_reference_logos", new=AsyncMock(return_value=refs)), \
         patch.object(database.db_service, "clear_reference_embeddings", new=AsyncMock(return_value=0)) as clear_mock, \
         patch.object(database.db_service, "store_reference_embedding", new=AsyncMock(return_value="emb-id")) as store_mock, \
         patch.object(database.db_service, "reindex_reference_embeddings", new=AsyncMock(return_value=None)):  # 8-N1 hook

        # Mock the backbone + storage (no torch / MinIO in CI).
        from app.services import storage as storage_mod
        storage_mod.storage_service.get_training_image = MagicMock(return_value=b"fakebytes")

        from app.ml import model_manager as mm
        fake_embedding = np.ones(512, dtype=np.float32)

        with patch.object(mm.model_manager, "generate_embedding", new=AsyncMock(return_value=fake_embedding)), \
             patch("PIL.Image.open", return_value=MagicMock(convert=lambda mode: MagicMock())):
            summary = asyncio.run(similarity.similarity_service.rebuild_reference_embeddings())

    # Table cleared exactly once (idempotent rebuild) and one embedding stored
    # per active variant.
    clear_mock.assert_awaited_once()
    assert store_mock.await_count == 2
    assert summary["total_references"] == 2
    assert summary["processed"] == 2
    assert summary["errors"] == 0


# ---------------------------------------------------------------------------
# Story 8-N1 — REINDEX hook after rebuild (ivfflat degenerates on empty table)
# ---------------------------------------------------------------------------


def _run_rebuild_with_refs(refs, reindex_mock):
    """Run rebuild_reference_embeddings with the standard mock harness and the
    given reindex mock; returns the summary dict."""
    from app.services import storage as storage_mod
    from app.ml import model_manager as mm

    storage_mod.storage_service.get_training_image = MagicMock(return_value=b"fakebytes")
    fake_embedding = np.ones(512, dtype=np.float32)

    with patch.object(database.db_service, "get_active_reference_logos", new=AsyncMock(return_value=refs)), \
         patch.object(database.db_service, "clear_reference_embeddings", new=AsyncMock(return_value=0)), \
         patch.object(database.db_service, "store_reference_embedding", new=AsyncMock(return_value="emb-id")), \
         patch.object(database.db_service, "reindex_reference_embeddings", new=reindex_mock), \
         patch.object(mm.model_manager, "generate_embedding", new=AsyncMock(return_value=fake_embedding)), \
         patch("PIL.Image.open", return_value=MagicMock(convert=lambda mode: MagicMock())):
        return asyncio.run(similarity.similarity_service.rebuild_reference_embeddings())


def test_rebuild_reindexes_after_storing_embeddings():
    """8-N1 AC1: processed > 0 ⇒ exact één REINDEX-aanroep, errors blijft 0."""
    refs = [
        {"id": "r1", "t3777_code": "A", "variant_label": "v1", "storage_path": "reference-logos/A/v1.png"},
        {"id": "r2", "t3777_code": "B", "variant_label": "v1", "storage_path": "reference-logos/B/v1.png"},
    ]
    reindex_mock = AsyncMock(return_value=None)

    summary = _run_rebuild_with_refs(refs, reindex_mock)

    reindex_mock.assert_awaited_once()
    assert summary["processed"] == 2
    assert summary["errors"] == 0


def test_rebuild_skips_reindex_when_nothing_processed():
    """8-N1 AC2: processed == 0 ⇒ géén REINDEX (index op lege tabel herbouwen
    lost niets op; waarschuwing volstaat)."""
    reindex_mock = AsyncMock(return_value=None)

    summary = _run_rebuild_with_refs([], reindex_mock)

    reindex_mock.assert_not_awaited()
    assert summary["processed"] == 0


def test_rebuild_counts_reindex_failure_as_error_without_raising():
    """8-N1 AC1: een REINDEX-fout verhoogt errors en crasht de rebuild NIET."""
    refs = [
        {"id": "r1", "t3777_code": "A", "variant_label": "v1", "storage_path": "reference-logos/A/v1.png"},
    ]
    reindex_mock = AsyncMock(side_effect=RuntimeError("ivfflat boom"))

    summary = _run_rebuild_with_refs(refs, reindex_mock)  # mag niet raisen

    reindex_mock.assert_awaited_once()
    assert summary["processed"] == 1
    assert summary["errors"] == 1  # alleen de REINDEX-fout


# ---------------------------------------------------------------------------
# classify_crop — embedding route, thresholds, fail-closed
# ---------------------------------------------------------------------------


def _make_crop():
    return np.zeros((32, 32, 3), dtype=np.uint8)


def test_classify_crop_embedding_route_returns_match():
    fake_embedding = np.ones(512, dtype=np.float32)
    match = [{"reference_logo_id": "r1", "t3777_code": "EU_ORGANIC", "variant_label": "v1", "similarity": 0.90}]

    from app.ml import model_manager as mm
    with patch.object(mm.model_manager, "generate_embedding", new=AsyncMock(return_value=fake_embedding)), \
         patch.object(database.db_service, "find_similar_references", new=AsyncMock(return_value=match)):
        result = asyncio.run(classification.classify_crop(_make_crop()))

    assert result["t3777_code"] == "EU_ORGANIC"
    assert result["method"] == "embedding"
    assert result["confidence"] == pytest.approx(0.90)
    assert result.get("uncertain", False) is False


def test_classify_crop_embedding_below_threshold_marked_uncertain():
    fake_embedding = np.ones(512, dtype=np.float32)
    match = [{"reference_logo_id": "r1", "t3777_code": "EU_ORGANIC", "variant_label": "v1", "similarity": 0.60}]

    from app.ml import model_manager as mm
    with patch.object(mm.model_manager, "generate_embedding", new=AsyncMock(return_value=fake_embedding)), \
         patch.object(database.db_service, "find_similar_references", new=AsyncMock(return_value=match)), \
         patch.object(database.db_service, "get_active_model", new=AsyncMock(return_value=None)):
        # Default embedding threshold is 0.75 → 0.60 is uncertain.
        result = asyncio.run(classification.classify_crop(_make_crop()))

    assert result["method"] == "embedding"
    assert result["uncertain"] is True


def test_classify_crop_no_references_fails_closed_unknown():
    fake_embedding = np.ones(512, dtype=np.float32)

    from app.ml import model_manager as mm
    with patch.object(mm.model_manager, "generate_embedding", new=AsyncMock(return_value=fake_embedding)), \
         patch.object(database.db_service, "find_similar_references", new=AsyncMock(return_value=[])), \
         patch.object(database.db_service, "get_active_model", new=AsyncMock(return_value=None)):
        result = asyncio.run(classification.classify_crop(_make_crop()))

    assert result["t3777_code"] == classification.CLASSIFY_UNKNOWN_CODE
    assert result["confidence"] == 0.0
    assert result["uncertain"] is True
    assert result["method"] == "embedding"


def test_classify_crop_no_active_model_uses_embedding_only_no_error():
    """No active model → classifier route is silently skipped (not an error)."""
    fake_embedding = np.ones(512, dtype=np.float32)
    match = [{"reference_logo_id": "r1", "t3777_code": "X", "variant_label": "v", "similarity": 0.55}]

    from app.ml import model_manager as mm
    with patch.object(mm.model_manager, "generate_embedding", new=AsyncMock(return_value=fake_embedding)), \
         patch.object(database.db_service, "find_similar_references", new=AsyncMock(return_value=match)), \
         patch.object(database.db_service, "get_active_model", new=AsyncMock(return_value=None)) as model_mock:
        result = asyncio.run(classification.classify_crop(_make_crop()))

    model_mock.assert_awaited()  # classifier route consulted the model registry
    assert result["method"] == "embedding"  # but fell back to embedding result


def test_classify_crop_explicit_threshold_overrides_default():
    fake_embedding = np.ones(512, dtype=np.float32)
    match = [{"reference_logo_id": "r1", "t3777_code": "Y", "variant_label": "v", "similarity": 0.80}]

    from app.ml import model_manager as mm
    with patch.object(mm.model_manager, "generate_embedding", new=AsyncMock(return_value=fake_embedding)), \
         patch.object(database.db_service, "find_similar_references", new=AsyncMock(return_value=match)), \
         patch.object(database.db_service, "get_active_model", new=AsyncMock(return_value=None)):
        # 0.80 >= default 0.75 (would be certain), but explicit 0.99 → uncertain.
        result = asyncio.run(classification.classify_crop(_make_crop(), confidence_threshold=0.99))

    assert result["uncertain"] is True


# ---------------------------------------------------------------------------
# Endpoint — per-crop dispatch
# ---------------------------------------------------------------------------


def test_classify_endpoint_dispatches_per_crop():
    import cv2
    from app.api.artwork import classify_artwork, ClassifyRequest

    # 40x40 white image so crops are in-bounds.
    img = np.full((40, 40, 3), 255, dtype=np.uint8)
    ok, buf = cv2.imencode(".png", img)
    b64 = __import__("base64").b64encode(buf.tobytes()).decode()

    async def _fake_classify(crop, confidence_threshold=None):
        return {"t3777_code": "EU_ORGANIC", "confidence": 0.91, "method": "embedding"}

    with patch("app.services.classification.classify_crop", new=_fake_classify):
        req = ClassifyRequest(
            image_b64=b64,
            crops=[{"x": 0, "y": 0, "width": 20, "height": 20}, {"x": 20, "y": 20, "width": 10, "height": 10}],
        )
        resp = asyncio.run(classify_artwork(req))

    assert len(resp.results) == 2
    assert all(r.t3777_code == "EU_ORGANIC" for r in resp.results)
    assert resp.results[0].bbox == {"x": 0, "y": 0, "width": 20, "height": 20}
