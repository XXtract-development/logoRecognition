"""Endpoint -> actual reference rows -> canonical hash -> real self-match guard."""

import asyncio
import io
from unittest.mock import AsyncMock

import numpy as np
import pytest
from fastapi import HTTPException
from PIL import Image

# Reuse the isolated, offline runtime used by reference registration contracts.
import importlib.util
from pathlib import Path

_fixture_spec = importlib.util.spec_from_file_location(
    "registration_fixture",
    Path(__file__).with_name("test_reference_registration_contract.py"),
)
_fixture_module = importlib.util.module_from_spec(_fixture_spec)
_fixture_spec.loader.exec_module(_fixture_module)
runtime = _fixture_module.runtime


def png(color):
    stream = io.BytesIO()
    Image.new("RGB", (32, 32), color).save(stream, "PNG")
    return stream.getvalue()


@pytest.fixture
def evaluation(runtime, monkeypatch):
    import importlib
    import sys

    monkeypatch.delitem(sys.modules, "app.api.flywheel", raising=False)
    flywheel = importlib.import_module("app.api.flywheel")
    _, _, _, db, model, storage = runtime
    db.get_active_reference_entries = AsyncMock(
        return_value=[
            {
                "reference_logo_id": "ref-real-id",
                "embedding": np.array([1.0, 0.0]),
                "t3777_code": "A",
                "storage_path": "ref.png",
            }
        ]
    )
    model.generate_embedding.return_value = np.array([1.0, 0.0])
    yield flywheel, db, storage
    sys.modules.pop("app.api.flywheel", None)


def request(flywheel):
    return flywheel.RegressionEvalRequest(
        gold_set=[
            {
                "id": "negative",
                "crop_path": "query.png",
                "label": "VALS",
                "t3777_code": "A",
            }
        ],
        threshold=0.9,
        include_shadow=False,
    )


def test_same_content_under_different_path_excluded(evaluation):
    flywheel, db, storage = evaluation
    storage.get_training_image.return_value = png("white")
    result = asyncio.run(flywheel.regression_eval(request(flywheel)))
    assert result.total == 1
    assert result.samples[0]["recognized"] is False
    assert result.samples[0]["correct"] is True
    db.get_active_reference_entries.assert_awaited_once()


def test_different_pixels_identical_embedding_remains_false_positive(evaluation):
    flywheel, _, storage = evaluation
    storage.get_training_image.side_effect = lambda path: png(
        "white" if path == "query.png" else "black"
    )
    result = asyncio.run(flywheel.regression_eval(request(flywheel)))
    assert result.total == 1  # a blank negative query must survive evaluation
    assert result.samples[0]["recognized"] is True
    assert result.samples[0]["correct"] is False


@pytest.mark.parametrize("failure", [b"corrupt", FileNotFoundError("missing")])
def test_reference_read_failure_cannot_return_success(evaluation, failure):
    flywheel, _, storage = evaluation
    if isinstance(failure, Exception):
        storage.get_training_image.side_effect = failure
    else:
        storage.get_training_image.return_value = failure
    with pytest.raises(HTTPException) as exc:
        asyncio.run(flywheel.regression_eval(request(flywheel)))
    assert exc.value.status_code == 422
    assert "ref-real-id" in exc.value.detail


def test_http_regression_route_uses_reference_pixel_hash_and_preserves_negative(
    evaluation,
):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    flywheel, _, storage = evaluation
    storage.get_training_image.return_value = png("white")
    app = FastAPI()
    app.include_router(flywheel.router, prefix="/ml")
    response = TestClient(app).post(
        "/ml/regression-eval",
        json={
            "gold_set": [
                {
                    "id": "negative",
                    "crop_path": "query.png",
                    "label": "VALS",
                    "t3777_code": "A",
                }
            ],
            "threshold": 0.9,
            "include_shadow": False,
        },
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["samples"][0]["recognized"] is False


def test_delayed_reference_read_does_not_block_async_heartbeat(evaluation):
    import threading

    flywheel, _, storage = evaluation
    reading = threading.Event()
    release = threading.Event()
    heartbeat_progress = []

    def read(path):
        if path == "ref.png":
            reading.set()
            release.wait(timeout=0.3)
            assert (
                release.is_set()
            ), "heartbeat could not run while reference read blocked"
        return png("white")

    storage.get_training_image.side_effect = read

    async def heartbeat():
        while not reading.is_set():
            await asyncio.sleep(0.001)
        heartbeat_progress.append(True)
        release.set()

    async def measure():
        result, _ = await asyncio.gather(
            flywheel.regression_eval(request(flywheel)), heartbeat()
        )
        assert result.total == 1

    asyncio.run(measure())
    assert heartbeat_progress == [True]
