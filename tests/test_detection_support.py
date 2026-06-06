"""Detection-support tests — Story 8-3O (Epic 8-nazorg).

Covers the ML-side additions:
  * localize template-loading: TTL cache, reload-templates endpoint, open-input
    gate (empty reference library → empty detections, no error).
  * classify crop-persistence: gtin + persist_crops → crop_path with an
    idempotent MinIO key; existing callers (no flags) unaffected.

The bare test env has no torch / asyncpg server / MinIO, so db_service and
storage_service are the conftest MagicMock singletons (see tests/conftest.py).
The functions under test (app.api.artwork handlers + the cache helpers) are the
REAL ones — mirroring the test_crop_classification real-module strategy, but
here only the IO singletons are mocked.
"""

import asyncio
import os
import sys

import numpy as np
import pytest
from unittest.mock import AsyncMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "ml-service"))


@pytest.fixture(autouse=True)
def _restore_db_service():
    """Snapshot/restore app.services.database.db_service around each test.

    These tests bind an AsyncMock onto the shared conftest mock module; without
    restoration that leaks into files collected afterwards. The conftest mock is
    pollution-by-design, but we don't add to it (don't leave a landmine).
    """
    db_module = sys.modules.get("app.services.database")
    prior = getattr(db_module, "db_service", None) if db_module is not None else None
    try:
        yield
    finally:
        if db_module is not None and prior is not None:
            db_module.db_service = prior


def _make_rgba_template(color=(0, 200, 0)) -> bytes:
    """Encode a small opaque BGRA PNG so the loader can decode it."""
    import cv2

    img = np.zeros((40, 40, 4), dtype=np.uint8)
    img[:, :, 0] = color[0]
    img[:, :, 1] = color[1]
    img[:, :, 2] = color[2]
    img[:, :, 3] = 255
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


# ---------------------------------------------------------------------------
# Template loading — TTL cache
# ---------------------------------------------------------------------------


def test_template_cache_loads_once_within_ttl():
    """A second load within the TTL reuses the cache (no second DB call)."""
    from app.api import artwork
    from app.services import storage as storage_module

    artwork.reset_template_cache()

    db_mock = AsyncMock()
    db_mock.get_active_reference_logos.return_value = [
        {"t3777_code": "GREEN_DOT", "variant_label": "v1", "storage_path": "reference-logos/green/v1.png"},
    ]

    # Bind the async db mock onto the module object that the handler resolves via
    # `from app.services.database import db_service` (sys.modules is authoritative
    # — other test files swap this module in/out, so write through sys.modules).
    sys.modules["app.services.database"].db_service = db_mock
    storage_module.storage_service.get_training_image.return_value = _make_rgba_template()

    try:
        first = asyncio.run(artwork._get_reference_templates_cached())
        second = asyncio.run(artwork._get_reference_templates_cached())
        assert len(first) == 1
        assert first[0]["t3777_code"] == "GREEN_DOT"
        assert len(second) == 1
        # Cache hit: the DB accessor was called exactly once across two loads.
        assert db_mock.get_active_reference_logos.await_count == 1
    finally:
        artwork.reset_template_cache()


def test_reload_templates_endpoint_invalidates_cache():
    """POST /ml/artwork/reload-templates drops the cache → next load re-queries."""
    from app.api import artwork
    from app.services import storage as storage_module

    artwork.reset_template_cache()

    db_mock = AsyncMock()
    db_mock.get_active_reference_logos.return_value = [
        {"t3777_code": "GREEN_DOT", "variant_label": "v1", "storage_path": "reference-logos/green/v1.png"},
    ]
    # Bind the async db mock onto the module object that the handler resolves via
    # `from app.services.database import db_service` (sys.modules is authoritative
    # — other test files swap this module in/out, so write through sys.modules).
    sys.modules["app.services.database"].db_service = db_mock
    storage_module.storage_service.get_training_image.return_value = _make_rgba_template()

    try:
        asyncio.run(artwork._get_reference_templates_cached())
        assert db_mock.get_active_reference_logos.await_count == 1

        resp = asyncio.run(artwork.reload_templates())
        assert resp["status"] == "reloaded"

        # After invalidation the next load re-queries the DB (count → 2).
        asyncio.run(artwork._get_reference_templates_cached())
        assert db_mock.get_active_reference_logos.await_count == 2
    finally:
        artwork.reset_template_cache()


def test_localize_open_input_gate_empty_library_returns_no_detections():
    """Empty reference library → empty detections + warning, never an error (AC2)."""
    from app.api import artwork
    from app.api.artwork import localize_artwork, LocalizeRequest
    from app.services import storage as storage_module

    artwork.reset_template_cache()

    db_mock = AsyncMock()
    db_mock.get_active_reference_logos.return_value = []  # empty library
    # Bind the async db mock onto the module object that the handler resolves via
    # `from app.services.database import db_service` (sys.modules is authoritative
    # — other test files swap this module in/out, so write through sys.modules).
    sys.modules["app.services.database"].db_service = db_mock

    # A valid source image so we get past source decoding to the template gate.
    import cv2

    src = np.full((128, 128, 3), 255, dtype=np.uint8)
    ok, buf = cv2.imencode(".png", src)
    assert ok
    storage_module.storage_service.get_training_image.return_value = buf.tobytes()

    try:
        # templates omitted → ML-side load → empty → open-input gate
        req = LocalizeRequest(storage_path="artwork/123/x.png")
        resp = asyncio.run(localize_artwork(req))
        assert resp.detections == []
    finally:
        artwork.reset_template_cache()


# ---------------------------------------------------------------------------
# Classify — crop persistence
# ---------------------------------------------------------------------------


def test_classify_persists_crops_with_idempotent_key():
    """persist_crops=True writes crops to MinIO and returns a stable crop_path."""
    from app.api.artwork import classify_artwork, ClassifyRequest, CropBBox, _crop_object_key
    from app.services import storage as storage_module

    import cv2

    src = np.full((200, 200, 3), 128, dtype=np.uint8)
    ok, buf = cv2.imencode(".png", src)
    assert ok
    storage_module.storage_service.get_training_image.return_value = buf.tobytes()

    put_calls = []
    storage_module.storage_service.put_training_image.reset_mock()
    storage_module.storage_service.put_training_image.side_effect = (
        lambda key, *a, **k: put_calls.append(key) or key
    )

    async def _fake_classify_crop(crop, confidence_threshold=None):
        return {"t3777_code": "GREEN_DOT", "confidence": 0.9, "method": "embedding", "uncertain": False}

    import app.services.classification as classification_module
    original = getattr(classification_module, "classify_crop", None)
    classification_module.classify_crop = _fake_classify_crop

    try:
        req = ClassifyRequest(
            storage_path="artwork/123/x.png",
            crops=[CropBBox(x=10, y=20, width=30, height=40)],
            gtin="123",
            persist_crops=True,
        )
        resp = asyncio.run(classify_artwork(req))

        assert len(resp.results) == 1
        expected_key = _crop_object_key("123", "artwork/123/x.png", {"x": 10, "y": 20, "width": 30, "height": 40})
        assert resp.results[0].crop_path == expected_key
        assert expected_key.startswith("artwork-crops/123/")
        assert expected_key.endswith(".png")
        assert put_calls == [expected_key]

        # Idempotent key: same source + bbox → same key on a second run.
        again = _crop_object_key("123", "artwork/123/x.png", {"x": 10, "y": 20, "width": 30, "height": 40})
        assert again == expected_key
    finally:
        if original is not None:
            classification_module.classify_crop = original
        storage_module.storage_service.put_training_image.side_effect = None


def test_classify_without_persist_flag_writes_nothing_and_no_crop_path():
    """Existing callers (no gtin/persist_crops) are unaffected: no write, crop_path=None."""
    from app.api.artwork import classify_artwork, ClassifyRequest, CropBBox
    from app.services import storage as storage_module

    import cv2

    src = np.full((200, 200, 3), 128, dtype=np.uint8)
    ok, buf = cv2.imencode(".png", src)
    assert ok
    storage_module.storage_service.get_training_image.return_value = buf.tobytes()
    storage_module.storage_service.put_training_image.reset_mock()
    storage_module.storage_service.put_training_image.side_effect = lambda key, *a, **k: key

    async def _fake_classify_crop(crop, confidence_threshold=None):
        return {"t3777_code": "GREEN_DOT", "confidence": 0.9, "method": "embedding", "uncertain": False}

    import app.services.classification as classification_module
    original = getattr(classification_module, "classify_crop", None)
    classification_module.classify_crop = _fake_classify_crop

    try:
        req = ClassifyRequest(
            storage_path="artwork/123/x.png",
            crops=[CropBBox(x=10, y=20, width=30, height=40)],
        )
        resp = asyncio.run(classify_artwork(req))

        assert len(resp.results) == 1
        assert resp.results[0].crop_path is None
        assert storage_module.storage_service.put_training_image.call_count == 0
    finally:
        if original is not None:
            classification_module.classify_crop = original
