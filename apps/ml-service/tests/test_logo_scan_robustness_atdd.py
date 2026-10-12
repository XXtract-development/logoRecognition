"""ATDD voor spec-logo-scan-robustness (CAP-1 lege uitsneden, CAP-2 foutklassen,
CAP-3 tellingen van stap 1). Geschreven vóór de implementatie; per test de AC.

Hergebruikt de ASGI-runtime-fixture van test_artwork_strict_runtime (echte routes,
gestubde backbone/database/provider; geen netwerk, geen model).
"""

import asyncio
import base64
import io
from unittest.mock import AsyncMock, Mock

import httpx
import numpy as np
import pytest
from fastapi import HTTPException
from PIL import Image, ImageDraw

from tests import test_artwork_strict_runtime as _strict

payload = _strict.payload
runtime = _strict.runtime  # shared ASGI fixture (pytest finds it by name)


def _reference_content():
    """Geïsoleerde module-load (zoals unit/test_reference_content.py): voorkomt dat
    het app-pakket bij collectie settings/MODEL_PATH aanraakt."""
    import importlib.util
    from pathlib import Path

    spec = importlib.util.spec_from_file_location(
        "reference_content_atdd",
        Path(__file__).resolve().parents[1] / "app/services/reference_content.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _b64(image):
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    return base64.b64encode(stream.getvalue()).decode()


def blank_b64(color="white"):
    return _b64(Image.new("RGB", (20, 20), color))


def marked_b64():
    image = Image.new("RGB", (20, 20), "white")
    ImageDraw.Draw(image).line((4, 10, 16, 10), fill="black", width=2)
    return _b64(image)


async def classify(app, **kwargs):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.post(
            "/ml/artwork/classify",
            json=payload(crops=[{"x": 0, "y": 0, "width": 20, "height": 20}], **kwargs),
        )


async def localize_visual(app, **kwargs):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.post(
            "/ml/artwork/localize", json=payload(proposal_strategy="visual", **kwargs)
        )


# --- CAP-1 ------------------------------------------------------------------


@pytest.mark.parametrize("color", ["white", "black", (34, 80, 120)])
def test_ac_1_3_shared_helper_rejects_uniform_surface(color):
    reference_content = _reference_content()
    assert (
        reference_content.has_visible_content(Image.new("RGB", (40, 40), color))
        is False
    )


def test_ac_1_3_shared_helper_accepts_thin_central_mark():
    reference_content = _reference_content()
    image = Image.new("RGB", (200, 200), "white")
    ImageDraw.Draw(image).line((100, 70, 100, 130), fill="black", width=1)
    assert reference_content.has_visible_content(image) is True


def test_ac_1_3_helper_rejects_outer_frame_only():
    reference_content = _reference_content()
    image = Image.new("RGB", (200, 200), "white")
    ImageDraw.Draw(image).rectangle((1, 1, 198, 198), outline="black", width=2)
    assert reference_content.has_visible_content(image) is False


def test_ac_1_3_assert_reference_content_still_uses_the_same_rule():
    reference_content = _reference_content()
    with pytest.raises(ValueError, match="centrale beeldinhoud"):
        reference_content.assert_reference_content(Image.new("RGB", (40, 40), "white"))


@pytest.mark.asyncio
@pytest.mark.parametrize("color", ["white", "black"])
async def test_ac_1_1_blank_crop_is_not_embedded_and_gets_explicit_outcome(
    runtime, monkeypatch, color
):
    route, _, model, _, _, app = runtime
    log = Mock()
    monkeypatch.setattr(route, "logger", log)
    response = await classify(app, image_b64=blank_b64(color))
    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["t3777_code"] == "UNKNOWN"
    assert result["confidence"] == 0.0
    assert result["method"] == "embedding"
    assert result["uncertain"] is True
    assert result["evidence"] == {"reason": "blank_crop"}
    model.generate_embedding_sync.assert_not_called()
    model.generate_embedding.assert_not_awaited()
    # AC-1.5: geteld in het afsluitende logevent.
    complete = [
        c
        for c in log.info.call_args_list
        if c.args[0] == "Artwork classification complete"
    ]
    assert len(complete) == 1
    assert complete[0].kwargs["extra"]["blank_crops"] == 1
    assert complete[0].kwargs["extra"]["regions"] == 1


@pytest.mark.asyncio
async def test_ac_1_2_crop_with_a_mark_follows_the_existing_chain(runtime, monkeypatch):
    route, _, model, _, _, app = runtime
    log = Mock()
    monkeypatch.setattr(route, "logger", log)
    response = await classify(app, image_b64=marked_b64())
    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result.get("evidence") != {"reason": "blank_crop"}
    model.generate_embedding_sync.assert_called_once()
    complete = [
        c
        for c in log.info.call_args_list
        if c.args[0] == "Artwork classification complete"
    ]
    assert complete[0].kwargs["extra"]["blank_crops"] == 0


@pytest.mark.asyncio
async def test_ac_1_4_blank_check_failure_is_fail_open(runtime, monkeypatch):
    route, _, model, _, _, app = runtime
    import importlib

    reference_content = importlib.import_module("app.services.reference_content")
    monkeypatch.setattr(
        reference_content,
        "has_visible_content",
        Mock(side_effect=RuntimeError("PRIVATE_HELPER")),
    )
    log = Mock()
    monkeypatch.setattr(route, "logger", log)
    response = await classify(app, image_b64=blank_b64())
    assert response.status_code == 200
    assert "PRIVATE_HELPER" not in response.text
    model.generate_embedding_sync.assert_called_once()
    log.warning.assert_called()


@pytest.mark.asyncio
async def test_ac_1_1_blank_crop_is_never_persisted(runtime, monkeypatch):
    route, _, _, _, _, app = runtime
    put = Mock()
    monkeypatch.setattr(route.storage_service, "put_training_image", put)
    blank = await classify(
        app,
        image_b64=blank_b64(),
        strict_runtime=False,
        persist_crops=True,
        gtin="01234567890123",
    )
    assert blank.status_code == 200
    assert blank.json()["results"][0]["crop_path"] is None
    put.assert_not_called()
    marked = await classify(
        app,
        image_b64=marked_b64(),
        strict_runtime=False,
        persist_crops=True,
        gtin="01234567890123",
    )
    assert marked.json()["results"][0]["crop_path"] is not None
    put.assert_called_once()


@pytest.mark.asyncio
async def test_ac_1_1_blank_check_runs_in_default_runtime_too(runtime, monkeypatch):
    _, _, model, _, _, app = runtime
    response = await classify(app, image_b64=blank_b64(), strict_runtime=False)
    assert response.status_code == 200
    assert response.json()["results"][0]["evidence"] == {"reason": "blank_crop"}
    model.generate_embedding.assert_not_awaited()


# --- CAP-2 ------------------------------------------------------------------


def _status_error(code):
    request = httpx.Request("POST", "https://provider.test/chat/completions")
    return httpx.HTTPStatusError(
        "boom", request=request, response=httpx.Response(code, request=request)
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "exc,error_class",
    [
        (asyncio.TimeoutError(), "time_budget"),
        (httpx.ReadTimeout("slow"), "time_budget"),
        (_status_error(429), "provider_status_429"),
        (httpx.ConnectError("refused"), "provider_transport"),
        (ValueError("Incomplete proposal response"), "proposal_parse_error"),
        (KeyError("choices"), "proposal_parse_error"),
        (ValueError("Proposal response exceeds size limit"), "proposal_response_size"),
        (ValueError("Proposal image exceeds bounds"), "proposal_image_bounds"),
        (RuntimeError("Embedding model is not ready"), "runtime_not_ready"),
        (OSError("disk"), "unexpected_OSError"),
    ],
)
async def test_ac_2_1_2_2_visual_failure_is_logged_and_classified(
    runtime, monkeypatch, exc, error_class
):
    route, _, _, _, _, app = runtime
    from app.services import artwork_proposals

    monkeypatch.setattr(
        artwork_proposals, "visual_proposals", AsyncMock(side_effect=exc)
    )
    log = Mock()
    monkeypatch.setattr(route, "logger", log)
    response = await localize_visual(app)
    assert response.status_code == 503
    assert (
        response.json()["detail"] == f"Visual localization unavailable ({error_class})"
    )
    failures = [
        c for c in log.error.call_args_list if c.args[0] == "Visual localization failed"
    ]
    assert len(failures) == 1
    extra = failures[0].kwargs["extra"]
    assert extra["error_class"] == error_class
    assert extra["error_type"] == type(exc).__name__
    assert len(extra["error"]) <= 200
    assert "exc_info" not in failures[0].kwargs


@pytest.mark.asyncio
async def test_ac_2_2_capacity_and_empty_library_classes(runtime, monkeypatch):
    route, _, _, _, _, app = runtime
    from app.services import (
        artwork_proposals,
        artwork_template_refinement,
        ghs_reference,
    )

    monkeypatch.setattr(route, "logger", Mock())
    # template_library_empty: één voorstel, maar geen actieve templates.
    monkeypatch.setattr(
        artwork_proposals,
        "visual_proposals",
        AsyncMock(return_value=[{"bbox": {"x": 1, "y": 2, "width": 3, "height": 4}}]),
    )
    monkeypatch.setattr(
        route, "_get_reference_templates_cached", AsyncMock(return_value=[])
    )
    response = await localize_visual(app)
    assert (
        response.json()["detail"]
        == "Visual localization unavailable (template_library_empty)"
    )

    # proposal_capacity: 64 voorstellen + 1 GHS-detectie > 64.
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
    response = await localize_visual(app)
    assert (
        response.json()["detail"]
        == "Visual localization unavailable (proposal_capacity)"
    )


@pytest.mark.asyncio
async def test_ac_2_3_strict_http_exception_passes_through_but_is_logged(
    runtime, monkeypatch
):
    route, _, _, _, _, app = runtime
    from app.services import artwork_proposals

    monkeypatch.setattr(
        artwork_proposals,
        "visual_proposals",
        AsyncMock(
            side_effect=HTTPException(
                status_code=504, detail="Recognition deadline exceeded"
            )
        ),
    )
    log = Mock()
    monkeypatch.setattr(route, "logger", log)
    response = await localize_visual(app)
    assert response.status_code == 504
    assert response.json()["detail"] == "Recognition deadline exceeded"
    failures = [
        c for c in log.error.call_args_list if c.args[0] == "Visual localization failed"
    ]
    assert failures and failures[0].kwargs["extra"]["error_class"] == "http_504"


@pytest.mark.asyncio
async def test_ac_2_4_no_secret_or_image_bytes_in_log_or_response(runtime, monkeypatch):
    route, _, _, _, _, app = runtime
    from app.services import artwork_proposals

    leak = (
        "Authorization: Bearer sk-or-PRIVATEKEY data:image/jpeg;base64,QUJDREVGR0g= "
        "api_key=sk-or-v1-BAREKEY " + "x" * 400
    )
    monkeypatch.setattr(
        artwork_proposals, "visual_proposals", AsyncMock(side_effect=ValueError(leak))
    )
    log = Mock()
    monkeypatch.setattr(route, "logger", log)
    response = await localize_visual(app)
    assert response.status_code == 503
    logged = str(log.error.call_args_list)
    for secret in ("PRIVATEKEY", "BAREKEY", "QUJDREVGR0g=", "x" * 201):
        assert secret not in response.text
        assert secret not in logged


# --- CAP-3 ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ac_3_1_visual_response_carries_proposal_counts(runtime, monkeypatch):
    route, _, _, _, _, app = runtime
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
    monkeypatch.setattr(
        artwork_proposals,
        "visual_proposals",
        AsyncMock(return_value=[{"bbox": {"x": 1, "y": 2, "width": 3, "height": 4}}]),
    )
    monkeypatch.setattr(
        ghs_reference,
        "detect_ghs",
        lambda *args, **kwargs: [{"bbox": {"x": 10, "y": 10, "width": 5, "height": 5}}],
    )
    response = await localize_visual(app, codes=["GREEN_DOT"])
    assert response.status_code == 200
    body = response.json()
    assert len(body["detections"]) == 4
    assert body["proposals"] == {"raw": 1, "refined": 2, "ghs": 1}


@pytest.mark.asyncio
async def test_ac_3_1_visual_negative_reports_zero_counts(runtime, monkeypatch):
    route, _, _, _, _, app = runtime
    from app.services import artwork_proposals

    monkeypatch.setattr(
        artwork_proposals, "visual_proposals", AsyncMock(return_value=[])
    )
    monkeypatch.setattr(
        route,
        "_get_reference_templates_cached",
        AsyncMock(side_effect=AssertionError("Brute force path must not run")),
    )
    response = await localize_visual(app)
    assert response.status_code == 200
    assert response.json() == {
        "detections": [],
        "truncated": False,
        "proposals": {"raw": 0, "refined": 0, "ghs": 0},
    }


@pytest.mark.asyncio
async def test_ac_3_1_template_route_has_no_proposal_counts(runtime, monkeypatch):
    route, _, _, _, _, app = runtime
    monkeypatch.setattr(
        route,
        "_get_reference_templates_cached",
        AsyncMock(
            return_value=[
                {"t3777_code": "GREEN_DOT", "image": np.zeros((2, 2, 3), np.uint8)}
            ]
        ),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/ml/artwork/localize", json=payload(scale_min_px=8, scale_max_px=16)
        )
    assert response.status_code == 200
    assert response.json().get("proposals") is None
