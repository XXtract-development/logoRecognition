"""ATDD voor spec-logo-scan-k4aa (CAP-2, CAP-3, CAP-4, CAP-5, CAP-7, CAP-8 ml-kant).
Geschreven vóór de bouw. Geen netwerk (httpx.MockTransport), geen database (nep-db),
geen SigLIP-gewichten (nep-embedder); alleen synthetische beelden.
"""

import asyncio
import base64
import functools
import hashlib
import io
import json
import logging
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import cv2
import httpx
import numpy as np
import pytest
from fastapi import FastAPI
from PIL import Image

KEY = "FAKE_TEST_KEY_K4AA_0123456789"
BASE = "https://openrouter.ai/api/v1"
BRUIKBAAR = {
    "WEIDEMELK",
    "MARINE_STEWARDSHIP_COUNCIL_LABEL",
    "RAINFOREST_ALLIANCE_PEOPLE_NATURE",
    "FOREST_STEWARDSHIP_COUNCIL_MIX",
    "BETER_LEVEN_1_STER",
    "VEGAN_SOCIETY_VEGAN_LOGO",
    "EUROPEAN_V_LABEL_VEGAN",
}


@pytest.fixture
def k4(monkeypatch, tmp_path):
    from app.core.config import settings

    monkeypatch.setattr(settings, "MODEL_PATH", str(tmp_path / "models"))
    from app.services import k4aa

    monkeypatch.setattr(settings, "GHS_REVIEW_BASE_URL", BASE)
    monkeypatch.setattr(
        settings, "GHS_REVIEW_API_KEY", type(settings.GHS_REVIEW_API_KEY)(KEY)
    )
    monkeypatch.setattr(k4aa, "_REF_CACHE", None, raising=False)
    return k4aa


def png_bytes(w, h, color=(255, 255, 255, 255), mode="RGBA"):
    buf = io.BytesIO()
    Image.new(mode, (w, h), color).save(buf, "PNG")
    return buf.getvalue()


def answer(logos, finish="stop", cost=0.002, provider="Google"):
    return {
        "choices": [
            {"finish_reason": finish, "message": {"content": json.dumps({"logos": logos})}}
        ],
        "usage": {"prompt_tokens": 1000, "completion_tokens": 50, "cost": cost},
        "provider": provider,
        "model": "google/gemini-3.8-flash",
    }


def mock_http(monkeypatch, k4, handler):
    seen = []

    def wrapped(request):
        seen.append(request)
        return handler(request, len(seen))

    monkeypatch.setattr(
        k4,
        "httpx",
        SimpleNamespace(
            AsyncClient=functools.partial(
                httpx.AsyncClient, transport=httpx.MockTransport(wrapped)
            ),
            Timeout=httpx.Timeout,
            TimeoutException=httpx.TimeoutException,
            TransportError=httpx.TransportError,
            RequestError=httpx.RequestError,
        ),
    )
    return seen


class FakeEmbedder:
    """Elke uitsnede krijgt dezelfde vaste vector; zo bepaalt de referentiematrix de top 3."""

    def __init__(self, vec):
        self.vec = np.asarray(vec, np.float32)
        self.seen = []

    def embed(self, images):
        self.seen.extend(images)
        v = np.tile(self.vec, (len(images), 1))
        return v / np.linalg.norm(v, axis=1, keepdims=True)


def refs_rows(codes_scores, with_embedding=True):
    """Referenties waarvan de cosinus met de nep-uitsnede (e0) gelijk is aan de score."""
    rows = []
    for i, (code, s) in enumerate(codes_scores):
        e = np.zeros(4, np.float32)
        e[0], e[1] = s, np.sqrt(max(0.0, 1 - s * s))
        rows.append(
            {
                "id": f"00000000-0000-0000-0000-{i:012d}",
                "t3777_code": code,
                "storage_path": f"references/{code}/{i}.png",
                "embedding": e.tolist() if with_embedding else None,
                "embedded_path": f"references/{code}/{i}.png" if with_embedding else None,
            }
        )
    return rows


@pytest.fixture
def world(monkeypatch, k4):
    """Nep-embedder + nep-referenties in de database: WEIDEMELK 0,9 / EU-bio 0,8 / MSC 0,7 / FSC 0,6."""
    from app.services.database import db_service

    emb = FakeEmbedder([1, 0, 0, 0])
    monkeypatch.setattr(k4, "get_embedder", lambda: emb)
    rows = refs_rows(
        [
            ("WEIDEMELK", 0.9),
            ("WEIDEMELK", 0.85),
            ("EU_ORGANIC_FARMING", 0.8),
            ("MARINE_STEWARDSHIP_COUNCIL_LABEL", 0.7),
            ("FOREST_STEWARDSHIP_COUNCIL_MIX", 0.6),
        ]
    )
    get = AsyncMock(return_value=rows)
    upsert = AsyncMock()
    monkeypatch.setattr(db_service, "get_siglip_references", get, raising=False)
    monkeypatch.setattr(db_service, "upsert_siglip_embedding", upsert, raising=False)
    monkeypatch.setattr(k4, "_reference_image", lambda path: Image.new("RGB", (8, 8)))
    return SimpleNamespace(emb=emb, rows=rows, get=get, upsert=upsert)


run = asyncio.run


# --- CAP-2: K1a exact ---------------------------------------------------------


def test_cap2_instruction_schema_sheet_and_model_equal_the_frozen_spike(k4):
    assert (
        hashlib.sha256((k4.INSTRUCTIE + "||" + k4.DEEL).encode()).hexdigest()
        == "6d06a8081cf93c7e163891b33a5ca3393afb75f9a04e7b19ace2792e385b5539"
    )
    assert (
        hashlib.sha256(json.dumps(k4.SCHEMA, sort_keys=True).encode()).hexdigest()
        == "a44b588b8a940b0b9588580f9033b659e79289d6c72b90433276a9374b19166a"
    )
    assert (
        hashlib.sha256(k4.referentieblad_bytes()).hexdigest()
        == "d39f1905cdaaf4f4998c76c29ae0324707975ca9961f9214b1f6c45c74ab9ad3"
    )
    assert k4.MODEL == "google/gemini-3.8-flash"
    assert set(k4.BRUIKBAAR) == BRUIKBAAR
    assert len(k4.TOP15) == 15 and set(BRUIKBAAR) <= set(k4.TOP15)


def test_cap2_windows_are_whole_label_plus_tile_windows_6(k4):
    from app.services.artwork_proposals import tile_windows

    assert k4.windows(6000, 4000) == [(0, 0, 6000, 4000)] + tile_windows(6000, 4000, 6)
    assert len(k4.windows(6000, 4000)) <= 6
    assert k4.windows(800, 600) == [(0, 0, 800, 600)]


def test_cap2_window_encoding_matches_spike_jpeg_b64(k4):
    rng = np.random.default_rng(1)
    img = rng.integers(0, 255, (2001, 3003, 3), dtype=np.uint8)
    b64, w, h = k4.encode_window(img)
    r = 1500 / 3003
    exp = cv2.resize(img, (round(3003 * r), round(2001 * r)), interpolation=cv2.INTER_AREA)
    ok, enc = cv2.imencode(".jpg", exp, [cv2.IMWRITE_JPEG_QUALITY, 85])
    assert (w, h) == (exp.shape[1], exp.shape[0])
    assert base64.b64decode(b64) == enc.tobytes()


def test_cap2_cap5_request_body_per_window(monkeypatch, k4, world):
    seen = mock_http(monkeypatch, k4, lambda req, n: httpx.Response(200, json=answer([])))
    out = run(k4.scan(png_bytes(6000, 4000), lambda: 120.0))
    assert len(seen) == len(k4.windows(6000, 4000)) > 1
    systems = []
    for req in seen:
        assert str(req.url) == BASE + "/chat/completions"
        assert req.headers["authorization"] == "Bearer " + KEY
        body = json.loads(req.content)
        assert body["model"] == "google/gemini-3.8-flash"
        assert body["temperature"] == 0 and body["max_tokens"] == 4096
        assert body["reasoning"] == {"effort": "minimal"}
        assert body["usage"] == {"include": True}
        assert body["provider"] == {"zdr": True, "data_collection": "deny"}
        rf = body["response_format"]
        assert rf["type"] == "json_schema" and rf["json_schema"]["strict"] is True
        assert rf["json_schema"]["schema"] == k4.SCHEMA
        user = body["messages"][1]["content"]
        assert user[0]["image_url"]["url"].startswith("data:image/png;base64,")
        assert base64.b64decode(user[0]["image_url"]["url"].split(",", 1)[1]) == k4.referentieblad_bytes()
        assert user[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
        assert all(c["image_url"]["detail"] == "high" for c in user)
        systems.append(body["messages"][0]["content"])
    assert systems.count(k4.INSTRUCTIE) == 1
    assert systems.count(k4.INSTRUCTIE + k4.DEEL) == len(seen) - 1
    assert out["detections"] == [] and out["stats"]["calls"] == len(seen)


def test_cap2_parse_converts_to_label_pixels_and_drops_ander_and_bad_boxes(k4):
    content = json.dumps(
        {
            "logos": [
                {"code": "WEIDEMELK", "box_2d": [100, 200, 300, 400]},
                {"code": "ander", "box_2d": [0, 0, 10, 10]},
                {"code": "MARINE_STEWARDSHIP_COUNCIL_LABEL", "box_2d": [500, 500, 400, 600]},
                {"code": "NIET_IN_TOP15", "box_2d": [0, 0, 10, 10]},
            ]
        }
    )
    out = k4.parse(content, 1000, 2000, 500, 1000)
    assert len(out) == 1
    m = out[0]
    assert m["code"] == "WEIDEMELK" and m["volgorde"] == 0
    assert m["vak"] == pytest.approx([1000 + 200 * 0.5, 2000 + 100 * 1.0, 1000 + 400 * 0.5, 2000 + 300 * 1.0])


# --- CAP-3: poort en samenvoegen ---------------------------------------------


def test_cap3_top3_distinct_codes_gate_keeps_rank3_and_drops_rank4(k4, world):
    R = np.array([r["embedding"] for r in world.rows], np.float32)
    codes = [r["t3777_code"] for r in world.rows]
    E = world.emb.embed([None])
    top = k4.top_codes(E, R, codes)[0]
    assert [c for c, _ in top] == ["WEIDEMELK", "EU_ORGANIC_FARMING", "MARINE_STEWARDSHIP_COUNCIL_LABEL"]
    assert top[0][1] == pytest.approx(0.9)
    ms = [
        {"code": "MARINE_STEWARDSHIP_COUNCIL_LABEL", "vak": [0, 0, 10, 10], "orde": (0, 0)},
        {"code": "FOREST_STEWARDSHIP_COUNCIL_MIX", "vak": [0, 0, 10, 10], "orde": (0, 1)},
    ]
    kept = k4.gate(ms, [top, top])
    assert [m["code"] for m in kept] == ["MARINE_STEWARDSHIP_COUNCIL_LABEL"]
    assert kept[0]["confidence"] == pytest.approx(0.7)


def test_cap3_merge_like_tel_py_keeps_lowest_order_even_with_higher_confidence(k4):
    ms = [
        {"code": "WEIDEMELK", "vak": [0, 0, 100, 100], "orde": (0, 0), "confidence": 0.5},
        {"code": "WEIDEMELK", "vak": [10, 0, 110, 100], "orde": (1, 0), "confidence": 0.99},
        {"code": "WEIDEMELK", "vak": [20, 0, 120, 100], "orde": (2, 3), "confidence": 0.99},  # keten via lid 2
        {"code": "EU_ORGANIC_FARMING", "vak": [0, 0, 100, 100], "orde": (0, 1), "confidence": 0.9},
        {"code": "WEIDEMELK", "vak": [500, 500, 600, 600], "orde": (0, 2), "confidence": 0.7},
    ]
    out = k4.merge(ms)
    got = sorted((m["code"], m["orde"]) for m in out)
    assert got == [("EU_ORGANIC_FARMING", (0, 1)), ("WEIDEMELK", (0, 0)), ("WEIDEMELK", (0, 2))]


def test_cap3_output_box_is_floor_ceil_clamped_and_at_least_one_pixel(k4):
    assert k4.to_bbox([1.5, 2.2, 2.5, 9.9], 100, 100) == {"x": 1, "y": 2, "width": 2, "height": 8}
    assert k4.to_bbox([-5, -5, 0.2, 0.2], 100, 100) == {"x": 0, "y": 0, "width": 1, "height": 1}
    assert k4.to_bbox([98.5, 99.5, 120, 130], 100, 100) == {"x": 98, "y": 99, "width": 2, "height": 1}


def test_cap3_crop_composites_transparency_on_white(monkeypatch, k4, world):
    # Volledig transparant zwart etiket: de uitsnede moet wit zijn (spike fb_embed.rgb).
    img = png_bytes(400, 300, (0, 0, 0, 0))
    mock_http(
        monkeypatch,
        k4,
        lambda req, n: httpx.Response(200, json=answer([{"code": "WEIDEMELK", "box_2d": [100, 100, 600, 600]}])),
    )
    run(k4.scan(img, lambda: 120.0))
    crop = world.emb.seen[0]
    assert crop.mode == "RGB" and crop.getpixel((1, 1)) == (255, 255, 255)


# --- CAP-4 + end-to-end ml ----------------------------------------------------


def test_cap4_cap8_full_scan_detections_and_stats(monkeypatch, k4, world, caplog):
    caplog.set_level(logging.DEBUG)
    calls = {"n": 0}

    def handler(req, n):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, json={"error": "rate"})  # herhaald; kost niets
        return httpx.Response(
            200,
            json=answer(
                [
                    {"code": "WEIDEMELK", "box_2d": [100, 100, 300, 300]},
                    {"code": "EU_ORGANIC_FARMING", "box_2d": [500, 500, 700, 700]},
                    {"code": "FOREST_STEWARDSHIP_COUNCIL_MIX", "box_2d": [800, 800, 900, 900]},
                ]
            ),
        )

    seen = mock_http(monkeypatch, k4, handler)
    monkeypatch.setattr(k4, "_backoff", lambda attempt: 0, raising=False)
    out = run(k4.scan(png_bytes(1000, 800), lambda: 120.0))
    dets = {d["t3777_code"]: d for d in out["detections"]}
    assert set(dets) == {"WEIDEMELK", "EU_ORGANIC_FARMING"}  # FSC staat op plek 4 → weg
    for code, d in dets.items():
        assert d["method"] == "k4aa"
        assert d["uncertain"] is d["requires_review"] is (code not in BRUIKBAAR)
        assert set(d["bbox"]) == {"x", "y", "width", "height"}
    assert dets["WEIDEMELK"]["confidence"] == pytest.approx(0.9)
    s = out["stats"]
    assert s["calls"] == 1 and len(seen) == 2
    assert s["tokens_in"] == 1000 and s["tokens_out"] == 50
    assert s["cost_usd"] == pytest.approx(0.002)
    assert s["providers"] == ["Google"]
    assert s["k1_meldingen"] == 3 and s["na_poort"] == 2 and s["dropped"] == 0
    assert s["referenties"] == 5 and s["inline_embedded"] == 0
    log = caplog.text
    assert KEY not in log and k4.INSTRUCTIE[:40] not in log and "base64" not in log and "WEIDEMELK\", \"box_2d" not in log


def test_cap4_more_than_64_reports_are_capped_and_counted(monkeypatch, k4, world):
    logos = [{"code": "WEIDEMELK", "box_2d": [i * 10, 0, i * 10 + 5, 5]} for i in range(40)]
    mock_http(monkeypatch, k4, lambda req, n: httpx.Response(200, json=answer(logos)))
    out = run(k4.scan(png_bytes(6000, 4000), lambda: 120.0))
    assert out["stats"]["k1_meldingen"] > 64
    assert out["stats"]["dropped"] == out["stats"]["k1_meldingen"] - 64
    assert len(world.emb.seen) <= 64


# --- CAP-5: privacy en foutklassen -------------------------------------------


@pytest.mark.parametrize(
    "status,klasse",
    [(404, "no_zdr_provider"), (401, "provider_auth"), (403, "provider_auth"), (402, "provider_payment"), (422, "provider_rejected")],
)
def test_cap5_4xx_fails_closed_without_retry(monkeypatch, k4, world, status, klasse):
    seen = mock_http(
        monkeypatch, k4, lambda req, n: httpx.Response(status, json={"error": {"message": "No endpoints found matching your data policy"}})
    )
    with pytest.raises(k4.K4aaError) as e:
        run(k4.scan(png_bytes(800, 600), lambda: 120.0))
    assert e.value.klasse == klasse
    assert len(seen) == 1  # één venster, geen herhaling, geen aanroep zonder zdr
    assert all(json.loads(r.content)["provider"] == {"zdr": True, "data_collection": "deny"} for r in seen)


def test_cap5_200_without_choices_is_malformed_and_not_retried(monkeypatch, k4, world):
    seen = mock_http(monkeypatch, k4, lambda req, n: httpx.Response(200, json={"error": {"code": 500}}))
    with pytest.raises(k4.K4aaError) as e:
        run(k4.scan(png_bytes(800, 600), lambda: 120.0))
    assert e.value.klasse == "provider_malformed" and len(seen) == 1


def test_cap5_unfinished_answers_retry_twice_then_fail(monkeypatch, k4, world):
    monkeypatch.setattr(k4, "_backoff", lambda attempt: 0, raising=False)
    seen = mock_http(monkeypatch, k4, lambda req, n: httpx.Response(200, json=answer([], finish="length")))
    with pytest.raises(k4.K4aaError) as e:
        run(k4.scan(png_bytes(800, 600), lambda: 120.0))
    assert e.value.klasse == "provider_retry_exhausted" and len(seen) == 3


def test_cap5_finish_reason_STOP_in_capitals_is_accepted(monkeypatch, k4, world):
    mock_http(monkeypatch, k4, lambda req, n: httpx.Response(200, json=answer([], finish="STOP")))
    assert run(k4.scan(png_bytes(800, 600), lambda: 120.0))["detections"] == []


def test_cap5_route_refuses_a_non_openrouter_host(monkeypatch, k4, world):
    from app.core.config import settings

    monkeypatch.setattr(settings, "GHS_REVIEW_BASE_URL", "https://provider.example/v1")
    seen = mock_http(monkeypatch, k4, lambda req, n: httpx.Response(200, json=answer([])))
    with pytest.raises(k4.K4aaError) as e:
        run(k4.scan(png_bytes(800, 600), lambda: 120.0))
    assert e.value.klasse == "provider_unavailable" and seen == []


# --- CAP-7: referentie-embeddings --------------------------------------------


def test_cap7_up_to_8_missing_embeddings_are_computed_in_memory_without_writing(monkeypatch, k4, world):
    for r in world.rows[:2]:
        r["embedding"] = None
    mock_http(monkeypatch, k4, lambda req, n: httpx.Response(200, json=answer([])))
    out = run(k4.scan(png_bytes(800, 600), lambda: 120.0))
    assert out["stats"]["inline_embedded"] == 2 and out["stats"]["referenties"] == 5
    world.upsert.assert_not_called()


def test_cap7_more_than_8_missing_embeddings_fail_closed(monkeypatch, k4, world):
    rows = refs_rows([("WEIDEMELK", 0.5)] * 9, with_embedding=False)
    world.get.return_value = rows
    mock_http(monkeypatch, k4, lambda req, n: httpx.Response(200, json=answer([])))
    with pytest.raises(k4.K4aaError) as e:
        run(k4.scan(png_bytes(800, 600), lambda: 120.0))
    assert e.value.klasse == "siglip_references_incomplete"


def test_cap7_missing_table_fails_with_siglip_references_missing(monkeypatch, k4, world):
    import asyncpg

    world.get.side_effect = asyncpg.exceptions.UndefinedTableError("relation does not exist")
    mock_http(monkeypatch, k4, lambda req, n: httpx.Response(200, json=answer([])))
    with pytest.raises(k4.K4aaError) as e:
        run(k4.scan(png_bytes(800, 600), lambda: 120.0))
    assert e.value.klasse == "siglip_references_missing"


def test_cap7_sync_inserts_only_missing_or_moved_and_never_deletes(monkeypatch, k4, world):
    from app.services.database import db_service

    world.rows[0]["embedding"] = None
    world.rows[1]["storage_path"] = "references/moved.png"
    world.rows[1]["embedded_path"] = "references/old.png"
    clear = AsyncMock()
    monkeypatch.setattr(db_service, "clear_reference_embeddings", clear)
    conn = SimpleNamespace(fetchval=AsyncMock(return_value=True), execute=AsyncMock())

    @asynccontextmanager
    async def connection():
        yield conn

    monkeypatch.setattr(db_service, "get_connection", connection)
    out = run(k4.sync_reference_embeddings(limit=1000))
    assert out["toegevoegd"] == 1 and out["bijgewerkt"] == 1 and out["mislukt"] == 0
    assert world.upsert.await_count == 2
    clear.assert_not_called()
    assert all("DELETE" not in str(c) for c in conn.execute.await_args_list)


def test_cap7_sync_busy_lock_is_reported(monkeypatch, k4, world):
    from app.services.database import db_service

    conn = SimpleNamespace(fetchval=AsyncMock(return_value=False), execute=AsyncMock())

    @asynccontextmanager
    async def connection():
        yield conn

    monkeypatch.setattr(db_service, "get_connection", connection)
    with pytest.raises(k4.K4aaError) as e:
        run(k4.sync_reference_embeddings(limit=10))
    assert e.value.klasse == "sync_busy"
    world.upsert.assert_not_called()


def test_cap7_siglip_path_must_be_an_existing_directory(monkeypatch, k4, tmp_path):
    monkeypatch.setenv("K4AA_SIGLIP_PATH", str(tmp_path / "bestaat-niet"))
    monkeypatch.setattr(k4, "_EMBEDDER", None, raising=False)
    with pytest.raises(k4.K4aaError) as e:
        k4.get_embedder()
    assert e.value.klasse == "siglip_model_unavailable"


# --- endpoints ----------------------------------------------------------------


@pytest.fixture
def api(monkeypatch, k4, world):
    route = __import__("app.api.artwork", fromlist=["router"])
    monkeypatch.setattr(route, "_STRICT_TASKS", set())
    app = FastAPI()
    app.include_router(route.router, prefix="/ml")
    return app


async def _post(app, url, body):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        return await c.post(url, json=body)


def test_endpoint_scan_k4aa_ok_and_error_detail(monkeypatch, k4, api):
    b64 = base64.b64encode(png_bytes(800, 600)).decode()
    body = {"image_b64": b64, "strict_runtime": True, "remaining_budget_ms": 60000}
    seen = mock_http(monkeypatch, k4, lambda req, n: httpx.Response(200, json=answer([{"code": "WEIDEMELK", "box_2d": [100, 100, 300, 300]}])))
    r = asyncio.run(_post(api, "/ml/artwork/scan-k4aa", body))
    assert r.status_code == 200, r.text
    assert r.json()["detections"][0]["t3777_code"] == "WEIDEMELK" and len(seen) == 1
    mock_http(monkeypatch, k4, lambda req, n: httpx.Response(404, json={}))
    r = asyncio.run(_post(api, "/ml/artwork/scan-k4aa", body))
    assert r.status_code == 503
    assert r.json()["detail"] == "K4-aa recognition unavailable (no_zdr_provider)"
    r = asyncio.run(_post(api, "/ml/artwork/scan-k4aa", {**body, "strict_runtime": False}))
    assert r.status_code == 422
    r = asyncio.run(_post(api, "/ml/artwork/scan-k4aa", {**body, "remaining_budget_ms": 165001}))
    assert r.status_code == 422


def test_endpoint_sync_validates_limit_and_reports_busy(monkeypatch, k4, api):
    r = asyncio.run(_post(api, "/ml/artwork/k4aa/reference-embeddings/sync", {"limit": 0}))
    assert r.status_code == 422
    monkeypatch.setattr(k4, "sync_reference_embeddings", AsyncMock(side_effect=k4.K4aaError("sync_busy")))
    r = asyncio.run(_post(api, "/ml/artwork/k4aa/reference-embeddings/sync", {"limit": 5}))
    assert r.status_code == 409


def test_legacy_request_and_startup_do_not_load_siglip(monkeypatch, k4, api):
    """A legacy localize request runs while constructing SigLIP would fail: it is never built."""
    import app.main  # noqa: F401

    def boom(*a, **k):
        raise AssertionError("SigLIP must not load for legacy requests")

    monkeypatch.setattr(k4, "_SiglipEmbedder", boom)
    monkeypatch.setattr(k4, "_EMBEDDER", None)
    tpl = base64.b64encode(png_bytes(32, 32, (0, 0, 0, 255))).decode()
    body = {
        "image_b64": base64.b64encode(png_bytes(200, 160)).decode(),
        "templates": [{"t3777_code": "WEIDEMELK", "image_b64": tpl}],
    }
    r = asyncio.run(_post(api, "/ml/artwork/localize", body))
    assert r.status_code == 200, r.text
    assert k4._EMBEDDER is None


# --- review follow-ups ----------------------------------------------------------


def test_reference_set_change_is_followed_and_cache_hit_reports_no_inline(monkeypatch, k4, world):
    for r in world.rows[:2]:
        r["embedding"] = None
    mock_http(
        monkeypatch,
        k4,
        lambda req, n: httpx.Response(200, json=answer([{"code": "FOREST_STEWARDSHIP_COUNCIL_MIX", "box_2d": [100, 100, 300, 300]}])),
    )
    first = run(k4.scan(png_bytes(800, 600), lambda: 120.0))
    assert first["stats"]["inline_embedded"] == 2 and first["detections"] == []  # FSC on place 4
    again = run(k4.scan(png_bytes(800, 600), lambda: 120.0))
    assert again["stats"]["inline_embedded"] == 0  # cache hit
    world.get.return_value = refs_rows([("FOREST_STEWARDSHIP_COUNCIL_MIX", 0.95), ("WEIDEMELK", 0.5)])
    changed = run(k4.scan(png_bytes(800, 600), lambda: 120.0))
    assert changed["stats"]["referenties"] == 2
    assert [d["t3777_code"] for d in changed["detections"]] == ["FOREST_STEWARDSHIP_COUNCIL_MIX"]


def test_cost_sums_over_retried_answers_and_counts_attempts(monkeypatch, k4, world):
    monkeypatch.setattr(k4, "_backoff", lambda attempt: 0)
    mock_http(
        monkeypatch,
        k4,
        lambda req, n: httpx.Response(200, json=answer([], finish="length" if n == 1 else "stop")),
    )
    s = run(k4.scan(png_bytes(800, 600), lambda: 120.0))["stats"]
    assert s["attempts"] == 2 and s["calls"] == 1
    assert s["cost_usd"] == pytest.approx(0.004) and s["tokens_in"] == 2000


def test_answer_without_usage_makes_tokens_and_cost_unknown(monkeypatch, k4, world):
    body = answer([])
    del body["usage"]
    mock_http(monkeypatch, k4, lambda req, n: httpx.Response(200, json=body))
    s = run(k4.scan(png_bytes(800, 600), lambda: 120.0))["stats"]
    assert s["tokens_in"] is None and s["tokens_out"] is None and s["cost_usd"] is None


def test_too_little_budget_fails_before_any_request(monkeypatch, k4, world):
    from fastapi import HTTPException

    seen = mock_http(monkeypatch, k4, lambda req, n: httpx.Response(200, json=answer([])))
    with pytest.raises(k4.K4aaError) as e:
        run(k4.scan(png_bytes(800, 600), lambda: 30.0))
    assert e.value.klasse == "budget_exhausted" and seen == []

    def expired():
        raise HTTPException(status_code=504, detail="Recognition deadline exceeded")

    with pytest.raises(k4.K4aaError) as e:
        run(k4.scan(png_bytes(800, 600), expired))
    assert e.value.klasse == "budget_exhausted" and seen == []


def test_one_window_without_zdr_provider_fails_the_whole_scan(monkeypatch, k4, world):
    refused = []

    def handler(req, n):
        if json.loads(req.content)["messages"][0]["content"] != k4.INSTRUCTIE and not refused:
            refused.append(n)  # the first tile window finds no zero-retention provider
            return httpx.Response(404, json={})
        return httpx.Response(200, json=answer([{"code": "WEIDEMELK", "box_2d": [100, 100, 300, 300]}]))

    mock_http(monkeypatch, k4, handler)
    with pytest.raises(k4.K4aaError) as e:
        run(k4.scan(png_bytes(6000, 4000), lambda: 120.0))
    assert e.value.klasse == "no_zdr_provider" and refused


def _lock_conn(monkeypatch):
    from app.services.database import db_service

    conn = SimpleNamespace(fetchval=AsyncMock(return_value=True), execute=AsyncMock())

    @asynccontextmanager
    async def connection():
        yield conn

    monkeypatch.setattr(db_service, "get_connection", connection)
    return conn


def test_sync_skips_a_failing_file_and_continues(monkeypatch, k4, world):
    _lock_conn(monkeypatch)
    for r in world.rows[:3]:
        r["embedding"] = None
    bad = world.rows[1]["storage_path"]

    def image(path):
        if path == bad:
            raise OSError("gone")
        return Image.new("RGB", (8, 8))

    monkeypatch.setattr(k4, "_reference_image", image)
    out = run(k4.sync_reference_embeddings(limit=1000))
    assert out == {"toegevoegd": 2, "bijgewerkt": 0, "ontbrekend_rest": 0, "mislukt": 1}
    assert world.upsert.await_count == 2


def test_sync_with_nothing_to_do_does_not_load_siglip(monkeypatch, k4, world):
    from unittest.mock import Mock

    _lock_conn(monkeypatch)
    loader = Mock()
    monkeypatch.setattr(k4, "get_embedder", loader)
    out = run(k4.sync_reference_embeddings(limit=1000))
    assert out["toegevoegd"] == out["bijgewerkt"] == out["mislukt"] == 0
    loader.assert_not_called()


def test_empty_image_bytes_are_invalid(k4, world):
    with pytest.raises(k4.K4aaError) as e:
        run(k4.scan(b"", lambda: 120.0))
    assert e.value.klasse == "image_invalid"


def test_endpoint_unexpected_exception_is_503_internal_error(monkeypatch, k4, api):
    monkeypatch.setattr(k4, "scan", AsyncMock(side_effect=RuntimeError("secret answer text")))
    body = {"image_b64": base64.b64encode(png_bytes(8, 8)).decode(), "strict_runtime": True, "remaining_budget_ms": 60000}
    r = asyncio.run(_post(api, "/ml/artwork/scan-k4aa", body))
    assert r.status_code == 503
    assert r.json()["detail"] == "K4-aa recognition unavailable (internal_error)"
