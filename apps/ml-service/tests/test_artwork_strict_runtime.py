"""ASGI tests exercise the actual artwork routes and classification failure catches."""

import asyncio
import base64
import importlib
import io
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import numpy as np
import pytest
from fastapi import FastAPI, Request
from PIL import Image


@pytest.fixture
def runtime(monkeypatch, tmp_path):
    from app.core.config import settings

    monkeypatch.setattr(settings, "MODEL_PATH", str(tmp_path / "models"))
    route = importlib.import_module("app.api.artwork")
    classification = importlib.import_module("app.services.classification")
    from app.ml.model_manager import model_manager
    from app.services import ghs_reference, keurmerk_gate, nutriscore_reader
    from app.services.database import db_service

    monkeypatch.setattr(route, "_TEMPLATE_CACHE", (0.0, None))
    monkeypatch.setattr(route, "_TEMPLATE_CACHE_STRICT", False)
    monkeypatch.setattr(route, "_STRICT_TASKS", set())
    monkeypatch.setattr(model_manager, "is_loaded", True)
    monkeypatch.setattr(model_manager, "embedding_model", object())
    monkeypatch.setattr(
        model_manager,
        "generate_embedding",
        AsyncMock(return_value=np.ones(512, dtype=np.float32)),
    )
    monkeypatch.setattr(
        model_manager,
        "generate_embedding_sync",
        Mock(return_value=np.ones(512, dtype=np.float32)),
    )
    conn = SimpleNamespace(fetchval=AsyncMock(return_value=True))

    @asynccontextmanager
    async def connection():
        yield conn

    monkeypatch.setattr(db_service, "get_connection", connection)
    monkeypatch.setattr(
        db_service, "find_similar_references", AsyncMock(return_value=[])
    )
    monkeypatch.setattr(db_service, "get_active_model", AsyncMock(return_value=None))
    monkeypatch.setattr(
        db_service, "get_active_reference_logos", AsyncMock(return_value=[])
    )
    monkeypatch.setattr(ghs_reference, "classify_ghs", lambda crop, **kwargs: None)
    monkeypatch.setattr(ghs_reference, "detect_ghs", lambda *args, **kwargs: [])
    monkeypatch.setattr(nutriscore_reader, "read_nutriscore", lambda crop: (None, {}))
    monkeypatch.setattr(keurmerk_gate, "keurmerk_probability", lambda emb: None)
    app = FastAPI()
    app.include_router(route.router, prefix="/ml")
    return route, classification, model_manager, db_service, conn, app


def image_b64():
    stream = io.BytesIO()
    Image.new("RGB", (20, 20), "white").save(stream, format="PNG")
    return base64.b64encode(stream.getvalue()).decode()


def payload(**kwargs):
    return {
        "image_b64": image_b64(),
        "strict_runtime": True,
        "remaining_budget_ms": 1000,
        "crops": [{"x": 0, "y": 0, "width": 10, "height": 10}],
        **kwargs,
    }


@pytest.mark.asyncio
async def test_strict_classifier_propagates_actual_embedding_backend_error(runtime):
    *_, model, db, conn, app = runtime
    model.generate_embedding_sync.side_effect = RuntimeError("PRIVATE_BACKEND_MARKER")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/ml/artwork/classify", json=payload())
    assert response.status_code == 503
    assert "PRIVATE_BACKEND_MARKER" not in response.text
    model.generate_embedding_sync.assert_called_once()


@pytest.mark.asyncio
async def test_default_classifier_keeps_existing_unknown_on_backend_error(runtime):
    _, _, model, _, _, app = runtime
    model.generate_embedding.side_effect = RuntimeError("unavailable")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/ml/artwork/classify", json=payload(strict_runtime=False)
        )
    assert response.status_code == 200
    assert response.json()["results"][0]["t3777_code"] == "UNKNOWN"


@pytest.mark.asyncio
async def test_strict_classifier_legitimate_negative_remains_success(runtime):
    _, _, _, _, _, app = runtime
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/ml/artwork/classify", json=payload())
    assert response.status_code == 200
    assert response.json()["results"][0]["t3777_code"] == "UNKNOWN"
    assert response.json()["results"][0]["confidence"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", ["model", "index"])
async def test_strict_required_readiness_missing_is_not_negative(runtime, missing):
    _, _, model, _, conn, app = runtime
    if missing == "model":
        model.embedding_model = None
    else:
        conn.fetchval.return_value = False
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/ml/artwork/classify", json=payload())
    assert response.status_code == 503
    model.generate_embedding.assert_not_awaited()


@pytest.mark.asyncio
async def test_strict_empty_template_library_is_not_negative(runtime):
    _, _, _, _, _, app = runtime
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/ml/artwork/localize", json=payload())
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_strict_reference_storage_failure_exercises_actual_loader(
    runtime, monkeypatch
):
    _, _, _, db, _, app = runtime
    db.get_active_reference_logos.return_value = [
        {"t3777_code": "GREEN_DOT", "storage_path": "missing.png"}
    ]
    import minio

    captured = {}

    def storage_client(*args, **kwargs):
        captured.update(kwargs)

        def fail(*args):
            raise RuntimeError("PRIVATE_STORAGE_MARKER")

        return SimpleNamespace(get_object=fail, _http=kwargs["http_client"])

    monkeypatch.setattr(minio, "Minio", storage_client)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/ml/artwork/localize", json=payload())
    assert response.status_code == 503
    assert "PRIVATE_STORAGE_MARKER" not in response.text
    timeout = captured["http_client"].connection_pool_kw["timeout"]
    assert 0 < timeout.connect_timeout <= 3
    assert 0 < timeout.read_timeout <= 5
    assert captured["http_client"].connection_pool_kw["retries"].total is False


@pytest.mark.asyncio
async def test_actual_work_holds_admission_after_caller_cancellation(runtime):
    route, _, model, _, _, app = runtime
    import threading

    entered = 0
    started = threading.Event()
    release = threading.Event()

    def blocked_embedding(image, **kwargs):
        nonlocal entered
        entered += 1
        if entered == 2:
            started.set()
        release.wait(2)
        return np.ones(512, dtype=np.float32)

    model.generate_embedding_sync.side_effect = blocked_embedding
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        first = asyncio.create_task(client.post("/ml/artwork/classify", json=payload()))
        second = asyncio.create_task(
            client.post("/ml/artwork/classify", json=payload())
        )
        for _ in range(100):
            if started.is_set():
                break
            await asyncio.sleep(0.005)
        assert started.is_set()
        first.cancel()
        with pytest.raises(asyncio.CancelledError):
            await first
        assert len(route._STRICT_TASKS) == 2
        busy = await client.post("/ml/artwork/classify", json=payload())
        assert busy.status_code == 503
        release.set()
        await second
        await asyncio.sleep(0)
        assert not route._STRICT_TASKS


@pytest.mark.asyncio
async def test_strict_disconnected_caller_rejected_before_model(runtime, monkeypatch):
    _, _, model, _, _, app = runtime
    monkeypatch.setattr(Request, "is_disconnected", AsyncMock(return_value=True))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/ml/artwork/classify", json=payload())
    assert response.status_code == 499
    model.generate_embedding.assert_not_awaited()


@pytest.mark.asyncio
async def test_strict_deadline_stops_slow_embedding_and_frees_after_completion(runtime):
    route, _, model, _, _, app = runtime

    def slow(image, **kwargs):
        import time

        time.sleep(0.05)
        return np.ones(512, dtype=np.float32)

    model.generate_embedding_sync.side_effect = slow
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/ml/artwork/classify", json=payload(remaining_budget_ms=1)
        )
    assert response.status_code in (503, 504)
    await asyncio.sleep(0.1)
    assert not route._STRICT_TASKS


@pytest.mark.asyncio
async def test_actual_strict_classifier_preserves_positive_reference_score(runtime):
    _, _, _, db, _, app = runtime
    db.find_similar_references.return_value = [
        {"t3777_code": "GREEN_DOT", "similarity": 0.999}
    ]
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/ml/artwork/classify", json=payload(confidence_threshold=0.99)
        )
    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["t3777_code"] == "GREEN_DOT"
    assert result["confidence"] == 0.999
    assert result["method"] == "embedding"
    assert result["uncertain"] is False


@pytest.mark.asyncio
async def test_actual_strict_classifier_reaches_a2_family_fallback(
    runtime, monkeypatch
):
    _, _, _, db, _, app = runtime
    from app.services import nutriscore_a2

    db.find_similar_references.return_value = [
        {"t3777_code": "NUTRISCORE_A", "similarity": 0.6}
    ]

    def predict(crop, **kwargs):
        return ("A", 0.999, {})

    monkeypatch.setattr(nutriscore_a2, "predict_letter", predict)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/ml/artwork/classify", json=payload(confidence_threshold=0.99)
        )
    assert response.status_code == 200
    assert response.json()["results"][0]["method"] == "nutriscore-a2"
    assert response.json()["results"][0]["confidence"] == 0.999


@pytest.mark.asyncio
async def test_strict_storage_reads_bounded_chunks_and_closes(runtime, monkeypatch):
    _, _, _, db, _, app = runtime
    db.get_active_reference_logos.return_value = [
        {"t3777_code": "GREEN_DOT", "storage_path": "valid.png"}
    ]
    from unittest.mock import Mock

    import minio

    chunks = [base64.b64decode(image_b64()), b""]
    response = SimpleNamespace(
        read1=Mock(side_effect=chunks), close=Mock(), release_conn=Mock()
    )

    def storage_client(*args, **kwargs):
        return SimpleNamespace(
            get_object=lambda *args: response, _http=kwargs["http_client"]
        )

    monkeypatch.setattr(minio, "Minio", storage_client)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        result = await client.post(
            "/ml/artwork/localize", json=payload(scale_min_px=8, scale_max_px=16)
        )
    assert result.status_code == 200
    response.read1.assert_called_with(64 * 1024)
    response.close.assert_called_once()
    response.release_conn.assert_called_once()


@pytest.mark.asyncio
async def test_strict_readiness_deadline_includes_blocked_pool_acquire(
    runtime, monkeypatch
):
    route, _, _, db, conn, app = runtime

    @asynccontextmanager
    async def blocked_connection():
        await asyncio.sleep(10)
        yield conn

    monkeypatch.setattr(db, "get_connection", blocked_connection)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await asyncio.wait_for(
            client.post("/ml/artwork/classify", json=payload(remaining_budget_ms=30)),
            0.3,
        )
    assert response.status_code in (503, 504)
    conn.fetchval.assert_not_awaited()
    await asyncio.sleep(0.02)
    assert not route._STRICT_TASKS


@pytest.mark.asyncio
async def test_real_blocking_localization_deadline_keeps_admission_and_loop_responsive(
    runtime, monkeypatch
):
    import threading

    route, _, _, _, _, app = runtime
    from app.services import ghs_reference

    release = threading.Event()
    entered = threading.Event()

    def blocked_detector(*args, **kwargs):
        entered.set()
        release.wait(2)
        return []

    monkeypatch.setattr(ghs_reference, "detect_ghs", blocked_detector)
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            first = asyncio.create_task(
                client.post(
                    "/ml/artwork/localize", json=payload(remaining_budget_ms=40)
                )
            )
            second = asyncio.create_task(
                client.post(
                    "/ml/artwork/localize", json=payload(remaining_budget_ms=40)
                )
            )
            for _ in range(100):
                if entered.is_set():
                    break
                await asyncio.sleep(0.001)
            assert entered.is_set()
            busy = await asyncio.wait_for(
                client.post("/ml/artwork/localize", json=payload()), 0.2
            )
            assert busy.status_code == 503
            expired = await asyncio.wait_for(asyncio.gather(first, second), 0.3)
            assert all(response.status_code == 504 for response in expired)
            assert len(route._STRICT_TASKS) == 2
            still_busy = await client.post("/ml/artwork/localize", json=payload())
            assert still_busy.status_code == 503
    finally:
        release.set()
        for _ in range(100):
            if not route._STRICT_TASKS:
                break
            await asyncio.sleep(0.005)
    assert not route._STRICT_TASKS


def test_strict_localization_uses_remaining_budget_with_classification_reserve(
    runtime, monkeypatch
):
    route, *_ = runtime
    token = route._STRICT_CONTROL.set(SimpleNamespace(remaining=lambda: 150.0))
    try:
        assert route._localization_match_budget() == 130.0
        monkeypatch.setattr(route._STRICT_CONTROL.get(), "remaining", lambda: 10.0)
        assert route._localization_match_budget() == 8.0
    finally:
        route._STRICT_CONTROL.reset(token)
    from app.services.localization import LOCALIZE_TIME_BUDGET_S

    assert route._localization_match_budget() == LOCALIZE_TIME_BUDGET_S


@pytest.mark.asyncio
async def test_strict_persistence_rejected_before_admission_or_processing(runtime):
    route, _, model, _, conn, app = runtime
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/ml/artwork/classify",
            json=payload(persist_crops=True, gtin="01234567890123"),
        )
    assert response.status_code == 422
    model.generate_embedding_sync.assert_not_called()
    conn.fetchval.assert_not_awaited()
    assert not route._STRICT_TASKS


@pytest.mark.asyncio
async def test_visual_preserves_full_resolution_and_ghs_union(runtime, monkeypatch):
    route, _, _, _, conn, app = runtime
    from app.services import (
        artwork_proposals,
        artwork_template_refinement,
        ghs_reference,
    )

    monkeypatch.setattr(
        route,
        "_get_reference_templates_cached",
        AsyncMock(
            return_value=[
                {"t3777_code": "GREEN_DOT", "image": np.zeros((2, 2, 3), np.uint8)}
            ]
        ),
    )
    monkeypatch.setattr(
        artwork_template_refinement,
        "refine_proposals",
        lambda *args: [
            {"x": 2, "y": 3, "width": 2, "height": 3},
            {"x": 6, "y": 3, "width": 2, "height": 3},
        ],
    )
    provider = AsyncMock(
        return_value=[{"bbox": {"x": 1, "y": 2, "width": 3, "height": 4}}]
    )
    monkeypatch.setattr(artwork_proposals, "visual_proposals", provider)
    monkeypatch.setattr(
        ghs_reference,
        "detect_ghs",
        lambda *args, **kwargs: [{"bbox": {"x": 10, "y": 10, "width": 5, "height": 5}}],
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/ml/artwork/localize",
            json=payload(proposal_strategy="visual", codes=["GREEN_DOT"]),
        )
    assert response.status_code == 200 and response.json()["truncated"] is False
    assert len(response.json()["detections"]) == 4
    returned_boxes = [d["bbox"] for d in response.json()["detections"]]
    assert {"x": 2, "y": 3, "width": 2, "height": 3} in returned_boxes
    assert {"x": 6, "y": 3, "width": 2, "height": 3} in returned_boxes
    assert {"x": 1, "y": 2, "width": 3, "height": 4} in returned_boxes
    assert provider.call_args.args[0].shape == (20, 20, 3)
    conn.fetchval.assert_awaited_once()


@pytest.mark.asyncio
async def test_visual_runtime_or_provider_failure_not_empty_success(
    runtime, monkeypatch
):
    _, _, _, _, conn, app = runtime
    from app.services import artwork_proposals

    provider = AsyncMock(side_effect=ValueError("PRIVATE_PROVIDER_FAILURE"))
    monkeypatch.setattr(artwork_proposals, "visual_proposals", provider)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/ml/artwork/localize", json=payload(proposal_strategy="visual")
        )
        assert (
            response.status_code == 503
            and "PRIVATE_PROVIDER_FAILURE" not in response.text
        )
        conn.fetchval.return_value = False
        provider.reset_mock()
        response = await client.post(
            "/ml/artwork/localize", json=payload(proposal_strategy="visual")
        )
        assert response.status_code == 503
        provider.assert_not_awaited()


@pytest.mark.asyncio
async def test_visual_negative_does_not_load_all_templates(runtime, monkeypatch):
    route, _, _, _, _, app = runtime
    from app.services import artwork_proposals

    monkeypatch.setattr(
        artwork_proposals, "visual_proposals", AsyncMock(return_value=[])
    )
    templates = AsyncMock(side_effect=AssertionError("Brute force path must not run"))
    monkeypatch.setattr(route, "_get_reference_templates_cached", templates)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/ml/artwork/localize", json=payload(proposal_strategy="visual")
        )
    assert response.status_code == 200
    assert response.json() == {"detections": [], "truncated": False}
    templates.assert_not_awaited()


@pytest.mark.asyncio
async def test_visual_combined_capacity_does_not_trim_originals(runtime, monkeypatch):
    route, _, _, _, _, app = runtime
    from app.services import (
        artwork_proposals,
        artwork_template_refinement,
        ghs_reference,
    )

    regions = [
        {"bbox": {"x": i % 20, "y": i // 20, "width": 1, "height": 1}}
        for i in range(64)
    ]
    monkeypatch.setattr(
        artwork_proposals, "visual_proposals", AsyncMock(return_value=regions)
    )
    monkeypatch.setattr(
        route,
        "_get_reference_templates_cached",
        AsyncMock(return_value=[{"image": np.zeros((2, 2, 3), np.uint8)}]),
    )
    monkeypatch.setattr(
        artwork_template_refinement, "refine_proposals", lambda *args: []
    )
    monkeypatch.setattr(
        ghs_reference,
        "detect_ghs",
        lambda *args, **kwargs: [{"bbox": {"x": 10, "y": 10, "width": 2, "height": 2}}],
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/ml/artwork/localize", json=payload(proposal_strategy="visual")
        )
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_visual_requires_strict_before_upstream_or_decode(runtime):
    route, _, model, _, conn, app = runtime
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/ml/artwork/localize",
            json=payload(
                proposal_strategy="visual", strict_runtime=False, image_b64="INVALID"
            ),
        )
    assert response.status_code == 422
    conn.fetchval.assert_not_awaited()
    model.generate_embedding_sync.assert_not_called()
    assert not route._STRICT_TASKS
