"""Actual bounded transport, strict parsing and original pixel projection."""

import asyncio
import base64
import functools
import json
from types import SimpleNamespace

import cv2
import httpx
import numpy as np
import pytest


@pytest.fixture(autouse=True)
def local_models(monkeypatch, tmp_path):
    import importlib

    from app.core.config import settings

    monkeypatch.setattr(settings, "MODEL_PATH", str(tmp_path / "models"))
    global proposals
    proposals = importlib.import_module("app.services.artwork_proposals")


def envelope(regions, finish="stop"):
    return {
        "choices": [
            {
                "finish_reason": finish,
                "message": {"content": json.dumps({"regions": regions})},
            }
        ]
    }


def test_projection_original_resolution_dedup_and_negative():
    region = {"box_2d": [100, 200, 300, 400]}
    assert proposals.parse_proposals(envelope([region, region]), 10000, 8000) == [
        {"bbox": {"x": 2000, "y": 800, "width": 2000, "height": 1600}}
    ]
    assert proposals.parse_proposals(envelope([]), 100, 100) == []


@pytest.mark.parametrize(
    "region",
    [
        {"box_2d": [1, 2, 3]},
        {"box_2d": [1, 2, 0, 4]},
        {"box_2d": [0, -1, 100, 200]},
        {"box_2d": [0, 0, 1001, 10]},
        {"box_2d": [False, 0, 10, 10]},
        {"box_2d": [0, 0, float("nan"), 10]},
        {"box_2d": [0, 0, 10, 10], "confidence": 1},
        {"box_2d": [0, 0, 10, 10], "label": "GREEN_DOT"},
    ],
)
def test_rejects_malformed_or_classifier_fields(region):
    with pytest.raises(ValueError):
        proposals.parse_proposals(envelope([region]), 100, 100)


def test_rejects_partial_excess_and_duplicate_keys():
    with pytest.raises(ValueError):
        proposals.parse_proposals(envelope([], "length"), 100, 100)
    with pytest.raises(ValueError):
        proposals.parse_proposals(envelope([{"box_2d": [0, 0, 10, 10]}] * 65), 100, 100)
    duplicate = {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {"content": '{"regions":[],"regions":[]}'},
            }
        ]
    }
    with pytest.raises(ValueError):
        proposals.parse_proposals(duplicate, 100, 100)


def test_only_provider_image_downscaled_original_unmodified():
    image = np.zeros((3000, 1000, 3), np.uint8)
    original = image.copy()
    data = proposals.proposal_image(image)
    decoded = cv2.imdecode(
        np.frombuffer(base64.b64decode(data), np.uint8), cv2.IMREAD_COLOR
    )
    assert decoded.shape[:2] == (2400, 800)
    assert np.array_equal(image, original)


def provider_transport(monkeypatch, handler):
    monkeypatch.setattr(
        proposals,
        "provider_config",
        lambda: (
            "https://provider.example/v1",
            "FAKE_TEST_KEY",
            ["configured-model", "second"],
        ),
    )
    monkeypatch.setattr(
        proposals,
        "httpx",
        SimpleNamespace(
            AsyncClient=functools.partial(
                httpx.AsyncClient, transport=httpx.MockTransport(handler)
            ),
            Timeout=httpx.Timeout,
        ),
    )


@pytest.mark.asyncio
async def test_actual_transport_only_sends_inline_proposal_image(monkeypatch):
    def handle(request):
        payload = json.loads(request.content)
        assert payload["model"] == "configured-model" and payload["max_tokens"] == 8192
        assert payload["messages"][1]["content"][0]["image_url"]["url"].startswith(
            "data:image/jpeg;base64,"
        )
        assert b"GREEN_DOT" in request.content
        return httpx.Response(200, json=envelope([{"box_2d": [0, 0, 1000, 1000]}]))

    provider_transport(monkeypatch, handle)
    assert await proposals.visual_proposals(
        np.zeros((10, 20, 3), np.uint8), ["GREEN_DOT"], lambda: 1
    ) == [{"bbox": {"x": 0, "y": 0, "width": 20, "height": 10}}]


@pytest.mark.asyncio
async def test_transport_deadline_covers_whole_response(monkeypatch):
    async def handle(request):
        await asyncio.sleep(1)
        return httpx.Response(200, json=envelope([]))

    provider_transport(monkeypatch, handle)
    with pytest.raises(asyncio.TimeoutError):
        await proposals.visual_proposals(
            np.zeros((10, 20, 3), np.uint8), [], lambda: 0.02
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [httpx.Response(503), httpx.Response(200, content=b"x" * (256 * 1024 + 1))],
)
async def test_provider_failure_or_oversized_not_negative(monkeypatch, response):
    provider_transport(monkeypatch, lambda request: response)
    with pytest.raises((ValueError, httpx.HTTPError)):
        await proposals.visual_proposals(np.zeros((10, 20, 3), np.uint8), [], lambda: 1)
