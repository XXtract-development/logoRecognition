"""Green-phase tests voor het /ml/phash-endpoint (Story 13.1).

Bouwt een minimale FastAPI-app rond alleen de flywheel-router, zodat de test niet
de volledige ml-service (torch/model-manager) hoeft te laden. De storage-service
wordt gemockt voor het ``crop_path``-pad.
"""

import base64
import io
import re

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.api import flywheel


@pytest.fixture()
def client() -> TestClient:
    app = FastAPI()
    app.include_router(flywheel.router, prefix="/ml", tags=["Flywheel"])
    return TestClient(app)


def _b64_image(color=(120, 200, 40), size=(48, 48)) -> str:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------------------
# AC1 — endpoint retourneert content_hash + phash in één response
# ---------------------------------------------------------------------------


def test_13_1_ac1_endpoint_retourneert_content_hash_en_phash(client):
    resp = client.post("/ml/phash", json={"image_b64": _b64_image()})
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"content_hash", "phash"}
    assert re.fullmatch(r"[0-9a-f]{64}", body["content_hash"])
    assert isinstance(body["phash"], str) and len(body["phash"]) > 0


# ---------------------------------------------------------------------------
# AC2 — endpoint is deterministisch
# ---------------------------------------------------------------------------


def test_13_1_ac2_endpoint_is_deterministisch(client):
    payload = {"image_b64": _b64_image()}
    first = client.post("/ml/phash", json=payload).json()
    second = client.post("/ml/phash", json=payload).json()
    assert first == second


# ---------------------------------------------------------------------------
# AC1 — crop_path-pad laadt via de storage-service
# ---------------------------------------------------------------------------


def test_13_1_ac1_crop_path_laadt_via_storage_service(client, monkeypatch):
    img = Image.new("RGB", (48, 48), (10, 20, 30))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    monkeypatch.setattr(
        flywheel.storage_service, "get_training_image", lambda path: buf.getvalue()
    )
    resp = client.post("/ml/phash", json={"crop_path": "crops/abc.png"})
    assert resp.status_code == 200
    assert re.fullmatch(r"[0-9a-f]{64}", resp.json()["content_hash"])


# ---------------------------------------------------------------------------
# Foutpaden — geen hash in de response (fail-closed, AD-14)
# ---------------------------------------------------------------------------


def test_13_1_onbestaand_crop_path_geeft_http_fout_geen_hash(client, monkeypatch):
    def _raise(path):
        raise FileNotFoundError(path)

    monkeypatch.setattr(flywheel.storage_service, "get_training_image", _raise)
    resp = client.post("/ml/phash", json={"crop_path": "crops/missing.png"})
    assert resp.status_code == 422
    assert "content_hash" not in resp.json()


def test_13_1_geen_bron_geeft_validatiefout(client):
    resp = client.post("/ml/phash", json={})
    assert resp.status_code == 422


def test_13_1_onleesbare_crop_geeft_http_fout(client, monkeypatch):
    monkeypatch.setattr(
        flywheel.storage_service, "get_training_image", lambda path: b"not-an-image"
    )
    resp = client.post("/ml/phash", json={"crop_path": "crops/bad.png"})
    assert resp.status_code == 422
    assert "content_hash" not in resp.json()
