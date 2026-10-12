"""ATDD voor spec-stap1-localization-recall (CAP-1/3 heel etiket + tegels, CAP-5
Nutri-Score-vangnet, CAP-6 ongeldig vakje overslaan). Geschreven vóór de bouw.

Geen netwerk: de provider draait op een httpx.MockTransport; de localize-route
op de gedeelde ASGI-runtime van test_artwork_strict_runtime.
"""

import asyncio
import base64
import functools
import importlib
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import cv2
import httpx
import numpy as np
import pytest

from tests import test_artwork_strict_runtime as _strict

payload = _strict.payload
runtime = _strict.runtime  # shared ASGI fixture


@pytest.fixture(autouse=True)
def proposals(monkeypatch, tmp_path):
    from app.core.config import settings

    monkeypatch.setattr(settings, "MODEL_PATH", str(tmp_path / "models"))
    monkeypatch.delenv("VISUAL_PROPOSAL_MAX_CALLS", raising=False)
    return importlib.import_module("app.services.artwork_proposals")


def envelope(regions, usage=None):
    body = {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {"content": json.dumps({"regions": regions})},
            }
        ]
    }
    if usage is not None:
        body["usage"] = usage
    return body


def transport(monkeypatch, module, handler):
    monkeypatch.setattr(
        module,
        "provider_config",
        lambda: ("https://provider.example/v1", "FAKE_TEST_KEY", ["model-a", "b"]),
    )
    monkeypatch.setattr(
        module,
        "httpx",
        SimpleNamespace(
            AsyncClient=functools.partial(
                httpx.AsyncClient, transport=httpx.MockTransport(handler)
            ),
            Timeout=httpx.Timeout,
        ),
    )


def sent_image(request):
    """(prompt, hoogte, breedte) van het beeld zoals naar de provider gestuurd."""
    body = json.loads(request.content)
    url = body["messages"][1]["content"][0]["image_url"]["url"]
    data = base64.b64decode(url.split(",", 1)[1])
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    return body["messages"][0]["content"], img.shape[0], img.shape[1]


def is_tile(prompt):
    return "one section of a larger label" in prompt


# --- CAP-6: één ongeldig vakje overslaan ----------------------------------------


@pytest.mark.parametrize(
    "bad",
    [[1, 2, 0, 4], [10, 10, 10, 20], [10, 30, 20, 30], [1000, 1000, 1200, 1300]],
)
def test_cap6_reversed_degenerate_or_empty_box_is_skipped_and_counted(proposals, bad):
    stats = {"skipped": 0}
    result = proposals.parse_proposals(
        envelope([{"box_2d": bad}, {"box_2d": [100, 100, 200, 200]}]),
        1000,
        1000,
        stats,
    )
    assert result == [{"bbox": {"x": 100, "y": 100, "width": 100, "height": 100}}]
    assert stats["skipped"] == 1


@pytest.mark.parametrize(
    "region",
    [
        {"box_2d": [0, 0, 10, 10], "label": "GREEN_DOT"},
        {"box_2d": [0, 0, float("nan"), 10]},
        {"box_2d": [1, 2, 3]},
    ],
)
def test_cap6_other_invalid_answers_still_fail(proposals, region):
    with pytest.raises(ValueError):
        proposals.parse_proposals(envelope([region]), 100, 100, {"skipped": 0})


@pytest.mark.asyncio
async def test_cap6_reversed_box_in_single_call_does_not_fail_the_scan(
    monkeypatch, proposals
):
    monkeypatch.setenv("VISUAL_PROPOSAL_MAX_CALLS", "1")
    transport(
        monkeypatch,
        proposals,
        lambda r: httpx.Response(
            200,
            json=envelope([{"box_2d": [500, 0, 100, 1000]}, {"box_2d": [0, 0, 500, 500]}]),
        ),
    )
    boxes, stats = await proposals.visual_proposals(
        np.zeros((100, 100, 3), np.uint8), [], lambda: 5
    )
    assert boxes == [{"bbox": {"x": 0, "y": 0, "width": 50, "height": 50}}]
    assert stats["skipped"] == 1 and stats["calls"] == 1


# --- CAP-1/3: heel etiket + tegels --------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("max_calls", [1, 2, 3, 4, 5, 6])
async def test_cap1_call_count_respects_ceiling_and_whole_label_first(
    monkeypatch, proposals, max_calls
):
    monkeypatch.setenv("VISUAL_PROPOSAL_MAX_CALLS", str(max_calls))
    prompts = []

    def handle(request):
        prompts.append(sent_image(request)[0])
        return httpx.Response(200, json=envelope([]))

    transport(monkeypatch, proposals, handle)
    boxes, stats = await proposals.visual_proposals(
        np.zeros((3000, 4400, 3), np.uint8), [], lambda: 5
    )
    assert boxes == []
    assert stats["calls"] == len(prompts) <= max_calls
    assert sum(not is_tile(p) for p in prompts) == 1  # precies één hele-etiket-aanroep
    if max_calls <= 2:
        assert len(prompts) == 1
    else:
        assert len(prompts) >= 3  # een 4400 px etiket wordt echt getegeld


@pytest.mark.asyncio
async def test_cap1_default_ceiling_is_six_and_invalid_env_falls_back(
    monkeypatch, proposals
):
    seen = []
    transport(
        monkeypatch,
        proposals,
        lambda r: seen.append(1) or httpx.Response(200, json=envelope([])),
    )
    image = np.zeros((9000, 2000, 3), np.uint8)
    _, stats = await proposals.visual_proposals(image, [], lambda: 5)
    assert stats["calls"] == len(seen) == 6
    monkeypatch.setenv("VISUAL_PROPOSAL_MAX_CALLS", "99")
    _, stats_bad = await proposals.visual_proposals(image, [], lambda: 5)
    assert stats_bad["calls"] == stats["calls"]


@pytest.mark.asyncio
async def test_cap1_small_label_gets_only_the_whole_label_call(monkeypatch, proposals):
    seen = []
    transport(
        monkeypatch,
        proposals,
        lambda r: seen.append(1) or httpx.Response(200, json=envelope([])),
    )
    _, stats = await proposals.visual_proposals(
        np.zeros((800, 1200, 3), np.uint8), [], lambda: 5
    )
    assert stats["calls"] == len(seen) == 1


@pytest.mark.asyncio
async def test_cap1_tile_boxes_map_back_and_duplicates_merge(monkeypatch, proposals):
    """Etiket 1600x3400, plafond 3: heel etiket + 2 tegels (boven/onder).
    Heel etiket en bovenste tegel wijzen dezelfde plek (y 0..1000) aan -> 1 vakje;
    de onderste tegel wijst een eigen plek aan -> teruggerekend naar het hele etiket."""
    monkeypatch.setenv("VISUAL_PROPOSAL_MAX_CALLS", "3")
    tiles = []

    def handle(request):
        prompt, h, w = sent_image(request)
        if not is_tile(prompt):
            return httpx.Response(200, json=envelope([{"box_2d": [0, 0, 294, 1000]}]))
        tiles.append(h)
        if len(tiles) == 1:  # bovenste tegel (eerste in rij-volgorde)
            return httpx.Response(
                200, json=envelope([{"box_2d": [0, 0, round(1000 * 1000 / h), 1000]}])
            )
        return httpx.Response(200, json=envelope([{"box_2d": [900, 0, 1000, 500]}]))

    transport(monkeypatch, proposals, handle)
    image = np.zeros((3400, 1600, 3), np.uint8)
    boxes, stats = await proposals.visual_proposals(image, [], lambda: 5)
    assert stats["calls"] == 3 and len(tiles) == 2
    assert len(boxes) == 2
    top, bottom = boxes
    assert top["bbox"]["y"] == 0 and abs(top["bbox"]["height"] - 1000) <= 10
    b = bottom["bbox"]
    assert b["y"] > 1600 and b["y"] + b["height"] == 3400  # onderste tegel, teruggerekend
    assert b["x"] == 0 and abs(b["width"] - 800) <= 2


@pytest.mark.asyncio
async def test_cap3_stats_sum_usage_and_missing_usage_is_null(monkeypatch, proposals):
    monkeypatch.setenv("VISUAL_PROPOSAL_MAX_CALLS", "3")
    transport(
        monkeypatch,
        proposals,
        lambda r: httpx.Response(
            200,
            json=envelope([], usage={"prompt_tokens": 100, "completion_tokens": 7}),
        ),
    )
    image = np.zeros((3400, 1600, 3), np.uint8)
    _, stats = await proposals.visual_proposals(image, [], lambda: 5)
    assert stats["tokens_in"] == 100 * stats["calls"]
    assert stats["tokens_out"] == 7 * stats["calls"]

    first = []

    def partial_usage(request):
        usage = None if first else {"prompt_tokens": 1, "completion_tokens": 1}
        first.append(1)
        return httpx.Response(200, json=envelope([], usage=usage))

    transport(monkeypatch, proposals, partial_usage)
    _, stats = await proposals.visual_proposals(image, [], lambda: 5)
    assert stats["tokens_in"] is None and stats["tokens_out"] is None


@pytest.mark.asyncio
async def test_cap1_one_failing_tile_fails_the_whole_localization(
    monkeypatch, proposals
):
    monkeypatch.setenv("VISUAL_PROPOSAL_MAX_CALLS", "3")

    def handle(request):
        if is_tile(sent_image(request)[0]):
            return httpx.Response(429)
        return httpx.Response(200, json=envelope([{"box_2d": [0, 0, 10, 10]}]))

    transport(monkeypatch, proposals, handle)
    with pytest.raises(httpx.HTTPStatusError):
        await proposals.visual_proposals(
            np.zeros((3400, 1600, 3), np.uint8), [], lambda: 5
        )


@pytest.mark.asyncio
async def test_cap1_whole_visual_phase_respects_the_deadline(monkeypatch, proposals):
    async def handle(request):
        await asyncio.sleep(1)
        return httpx.Response(200, json=envelope([]))

    transport(monkeypatch, proposals, handle)
    with pytest.raises(asyncio.TimeoutError):
        await proposals.visual_proposals(
            np.zeros((3400, 1600, 3), np.uint8), [], lambda: 0.05
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("sleep, times_out", [(0.85, True), (0.5, False)])
async def test_cap1_visual_phase_stops_at_remaining_minus_reserve(
    monkeypatch, proposals, sleep, times_out
):
    """remaining 1,0 s, reserve min(30 s, 25%) = 0,25 s -> de fase krijgt 0,75 s."""

    async def handle(request):
        await asyncio.sleep(sleep)
        return httpx.Response(200, json=envelope([]))

    transport(monkeypatch, proposals, handle)
    monkeypatch.setenv("VISUAL_PROPOSAL_MAX_CALLS", "1")
    reserve = proposals.reserve_seconds(1.0)
    assert reserve == 0.25
    call = proposals.visual_proposals(
        np.zeros((100, 100, 3), np.uint8), [], lambda: 1.0, reserve
    )
    if times_out:
        with pytest.raises(asyncio.TimeoutError):
            await call
    else:
        assert (await call)[0] == []


def test_cap1_tile_windows_tall_label_two_rows_with_overlap(proposals):
    windows = proposals.tile_windows(1600, 3400, 3)
    assert len(windows) == 2
    (ax0, ay0, ax1, ay1), (bx0, by0, bx1, by1) = windows  # rij-volgorde: boven, onder
    assert (ax0, ay0, ax1) == (0, 0, 1600) and (bx0, bx1, by1) == (0, 1600, 3400)
    cell = 3400 / 2
    assert abs((ay1 - by0) - 0.15 * cell) <= 2  # ~15% overlap van de celhoogte
    assert ay1 < 3400 and by0 > 0


def test_cap1_tile_windows_wide_label_row_order_and_clipped(proposals):
    windows = proposals.tile_windows(4400, 3000, 6)
    assert len(windows) == 4  # 2 kolommen x 2 rijen
    assert [w[:2] for w in windows] == sorted(
        (w[:2] for w in windows), key=lambda xy: (xy[1], xy[0])
    )
    assert all(0 <= x0 < x1 <= 4400 and 0 <= y0 < y1 <= 3000 for x0, y0, x1, y1 in windows)
    assert windows[0][:2] == (0, 0) and windows[-1][2:] == (4400, 3000)
    assert proposals.tile_windows(4400, 3000, 2) == []
    assert proposals.tile_windows(1200, 800, 6) == []


def _box(x, w=100):
    return {"bbox": {"x": x, "y": 0, "width": w, "height": 100}}


def test_cap1_merge_proposals_only_across_calls(proposals):
    # IoU(_box(0), _box(15)) = 85/115 ~ 0,74; IoU(_box(0), _box(22)) = 78/122 ~ 0,64
    assert proposals.merge_proposals([[_box(0)], [_box(15)]]) == [_box(0)]
    assert proposals.merge_proposals([[_box(0)], [_box(22)]]) == [_box(0), _box(22)]
    # IoU ~ 0,9 binnen één antwoord: beide blijven staan
    assert proposals.merge_proposals([[_box(0), _box(5)]]) == [_box(0), _box(5)]


# --- CAP-1/3: localize-route (capaciteit, verfijningsbudget, tellingen) -------


async def localize_visual(app, **kwargs):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.post(
            "/ml/artwork/localize", json=payload(proposal_strategy="visual", **kwargs)
        )


def stats(**over):
    return {"calls": 5, "tokens_in": 1000, "tokens_out": 50, "skipped": 1, **over}


def _route_stubs(monkeypatch, route, refine=lambda *a: []):
    from app.services import artwork_template_refinement, ghs_reference

    monkeypatch.setattr(
        route,
        "_get_reference_templates_cached",
        AsyncMock(
            return_value=[
                {"t3777_code": "GREEN_DOT", "image": np.zeros((2, 2, 3), np.uint8)}
            ]
        ),
    )
    monkeypatch.setattr(artwork_template_refinement, "refine_proposals", refine)
    monkeypatch.setattr(
        ghs_reference,
        "detect_ghs",
        lambda *a, **k: [{"bbox": {"x": 30, "y": 30, "width": 2, "height": 2}}],
    )


@pytest.mark.asyncio
async def test_cap3_localize_reports_calls_tokens_and_skipped(runtime, monkeypatch):
    route, *_, app = runtime
    from app.services import artwork_proposals

    _route_stubs(monkeypatch, route)
    monkeypatch.setattr(
        artwork_proposals,
        "visual_proposals",
        AsyncMock(
            return_value=([{"bbox": {"x": 1, "y": 2, "width": 3, "height": 4}}], stats())
        ),
    )
    response = await localize_visual(app)
    assert response.status_code == 200
    p = response.json()["proposals"]
    assert p["raw"] == 1 and p["ghs"] == 1
    assert (p["calls"], p["tokens_in"], p["tokens_out"], p["skipped"]) == (5, 1000, 50, 1)
    assert p["dropped"] == 0 and p["unrefined"] == 0


@pytest.mark.asyncio
async def test_cap1_union_above_64_is_capped_not_a_503(runtime, monkeypatch):
    route, *_, app = runtime
    from app.services import artwork_proposals

    _route_stubs(monkeypatch, route)
    regions = [
        {"bbox": {"x": i % 20, "y": i // 20, "width": 1, "height": 1}} for i in range(70)
    ]
    monkeypatch.setattr(
        artwork_proposals,
        "visual_proposals",
        AsyncMock(return_value=(regions, stats(tokens_in=None, tokens_out=None))),
    )
    response = await localize_visual(app)
    assert response.status_code == 200
    body = response.json()
    assert len(body["detections"]) == 64
    assert body["detections"][0]["bbox"] == {"x": 30, "y": 30, "width": 2, "height": 2}
    assert body["proposals"]["dropped"] == 7  # 1 GHS + 70 voorstellen -> 64
    assert body["proposals"]["tokens_in"] is None


@pytest.mark.asyncio
async def test_cap1_refinement_stops_when_the_reserve_is_reached(runtime, monkeypatch):
    route, *_, app = runtime
    from app.services import artwork_proposals
    import time

    def slow_refine(*args):
        time.sleep(0.3)
        return []

    _route_stubs(monkeypatch, route, refine=slow_refine)
    regions = [
        {"bbox": {"x": i, "y": 0, "width": 1, "height": 1}} for i in range(10)
    ]
    monkeypatch.setattr(
        artwork_proposals, "visual_proposals", AsyncMock(return_value=(regions, stats()))
    )
    response = await localize_visual(app, remaining_budget_ms=1500)
    assert response.status_code == 200
    p = response.json()["proposals"]
    assert p["raw"] == 10
    assert 0 < p["unrefined"] < 10


# --- CAP-5: Nutri-Score-vangnet onder de lat claimt geen letter --------------


@pytest.fixture
def vangnet(monkeypatch, tmp_path):
    from app.core.config import settings

    monkeypatch.setattr(settings, "MODEL_PATH", str(tmp_path / "models"))
    artwork = importlib.import_module("app.api.artwork")
    classification = importlib.import_module("app.services.classification")
    ghs_reference = importlib.import_module("app.services.ghs_reference")
    reader = importlib.import_module("app.services.nutriscore_reader")
    a2 = importlib.import_module("app.services.nutriscore_a2")

    async def blocking(function, *args, **kwargs):
        return function(*args, **kwargs)

    monkeypatch.setattr(artwork, "strict_blocking", blocking)
    monkeypatch.setattr(ghs_reference, "classify_ghs", lambda *a, **k: None)
    monkeypatch.setattr(reader, "read_nutriscore", lambda crop: (None, {}))
    monkeypatch.setattr(
        classification,
        "_classify_via_embedding",
        AsyncMock(
            return_value={
                "t3777_code": "NUTRISCORE_C",
                "confidence": 0.6,
                "method": "embedding",
                "uncertain": True,
            }
        ),
    )
    monkeypatch.setattr(
        classification, "_classify_via_classifier", AsyncMock(return_value=None)
    )
    predict = Mock()
    monkeypatch.setattr(a2, "predict_letter", predict)
    return classification, predict


@pytest.mark.asyncio
@pytest.mark.parametrize("conf", [0.5, 0.9, 0.989])
async def test_cap5_strict_vangnet_below_bar_does_not_claim_a_letter(vangnet, conf):
    classification, predict = vangnet
    predict.return_value = ("A", conf, {"pred": "A"})
    result = await classification.classify_crop(
        np.zeros((20, 20, 3), np.uint8), strict_runtime=True
    )
    assert conf < classification.NUTRISCORE_STRICT_THRESHOLD == 0.99
    assert result["method"] != "nutriscore-a2"
    assert result["t3777_code"] == "NUTRISCORE_C"  # bestaande "geen claim"-uitkomst
    assert result["uncertain"] is True
    predict.assert_called_once()


@pytest.mark.asyncio
async def test_cap5_strict_vangnet_at_or_above_bar_still_claims(vangnet):
    classification, predict = vangnet
    predict.return_value = ("A", 0.995, {"pred": "A"})
    assert 0.995 >= classification.NUTRISCORE_STRICT_THRESHOLD
    result = await classification.classify_crop(
        np.zeros((20, 20, 3), np.uint8), strict_runtime=True
    )
    assert result["t3777_code"] == "NUTRISCORE_A"
    assert result["method"] == "nutriscore-a2"
    assert result["uncertain"] is False


@pytest.mark.asyncio
async def test_cap5_non_strict_vangnet_is_unchanged(vangnet):
    classification, predict = vangnet
    predict.return_value = ("A", 0.6, {"pred": "A"})
    result = await classification.classify_crop(np.zeros((20, 20, 3), np.uint8))
    assert result["t3777_code"] == "NUTRISCORE_A"
    assert result["method"] == "nutriscore-a2"


@pytest.mark.asyncio
async def test_cap5_strict_explicit_threshold_below_a2_floor_does_not_claim(
    vangnet, monkeypatch
):
    classification, predict = vangnet
    a2 = importlib.import_module("app.services.nutriscore_a2")
    monkeypatch.setattr(a2, "min_conf", lambda: 0.5)
    predict.return_value = ("A", 0.4, {"pred": "A"})
    result = await classification.classify_crop(
        np.zeros((20, 20, 3), np.uint8), confidence_threshold=0.3, strict_runtime=True
    )
    assert result is None or result.get("method") != "nutriscore-a2"
    predict.assert_called_once()
