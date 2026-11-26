"""ATDD voor SPEC-nutriscore-k4aa-letterlezer (CAP-1 t/m CAP-4). Geschreven vóór de bouw.
Geen netwerk, geen SigLIP-gewichten; hergebruikt de nep-wereld van test_k4aa_atdd."""

import json
import logging
from unittest.mock import AsyncMock

import httpx
import numpy as np
import pytest
from PIL import Image

from tests.test_k4aa_atdd import (  # noqa: F401  (fixtures + helpers)
    FakeEmbedder,
    KEY,
    answer,
    k4,
    mock_http,
    png_bytes,
    refs_rows,
    run,
    world,
)


def M(code, vak, orde, conf=0.8):
    return {"code": code, "vak": vak, "orde": orde, "confidence": conf}


def letter_answer(letter, cost=0.001):
    return {
        "choices": [{"finish_reason": "stop", "message": {"content": json.dumps({"letter": letter})}}],
        "usage": {"prompt_tokens": 300, "completion_tokens": 5, "cost": cost},
        "provider": "Google",
        "model": "google/gemini-3.8-flash",
    }


def is_letter_call(req):
    body = json.loads(req.content)
    return len(body["messages"][1]["content"]) == 1


@pytest.fixture
def nsworld(monkeypatch, k4):
    from app.services.database import db_service

    emb = FakeEmbedder([1, 0, 0, 0])
    monkeypatch.setattr(k4, "get_embedder", lambda: emb)
    rows = refs_rows([("NUTRISCORE_B", 0.9), ("NUTRISCORE_C", 0.8), ("NUTRISCORE_D", 0.7)])
    monkeypatch.setattr(db_service, "get_siglip_references", AsyncMock(return_value=rows), raising=False)
    monkeypatch.setattr(k4, "_reference_image", lambda path: Image.new("RGB", (8, 8)))
    monkeypatch.setattr(k4, "read_letter", lambda crop: None)
    return emb


def scan_with(monkeypatch, k4, window_logos, letter_handler, remaining=lambda: 120.0, size=(1000, 800)):
    def handler(req, n):
        if is_letter_call(req):
            return letter_handler(req, n)
        return httpx.Response(200, json=answer(window_logos))

    seen = mock_http(monkeypatch, k4, handler)
    monkeypatch.setattr(k4, "_backoff", lambda attempt: 0, raising=False)
    out = run(k4.scan(png_bytes(*size), remaining))
    return out, seen


BAR = [{"code": "NUTRISCORE_B", "box_2d": [100, 100, 300, 300]}]


# --- CAP-4: pins ------------------------------------------------------------------


def test_cap4_pins(k4):
    # SPEC-nutriscore-k4aa-letterlezer: nieuwe waarden, bewust vastgelegd.
    assert k4.LETTER_MARGIN == 0.15
    assert k4.MAX_LETTER_BARS == 8
    assert (k4.LETTER_MIN_S, k4.LETTER_MAX_S) == (10.0, 30.0)
    assert k4.MIN_LETTER_CROP_PX == 16
    assert k4.READER_MIN_RATIO == 1.18
    assert k4.READER_OVERRIDES is False
    enum = k4.LETTER_SCHEMA["properties"]["letter"]["enum"]
    assert enum == ["A", "B", "C", "D", "E", "ander"]
    assert k4.LETTER_SCHEMA["required"] == ["letter"] and k4.LETTER_SCHEMA["additionalProperties"] is False
    assert "enlarged" in k4.LETTER_INSTRUCTIE and "ander" in k4.LETTER_INSTRUCTIE
    assert "reference sheet" not in k4.LETTER_INSTRUCTIE


# --- CAP-1: balken, uitsnede, toepassen --------------------------------------------


def test_cap1_bars_are_chains_of_overlapping_nutriscore_reports_whatever_the_letter(k4):
    ms = [
        M("NUTRISCORE_B", [0, 0, 100, 100], (0, 0)),
        M("NUTRISCORE_C", [5, 5, 105, 105], (1, 0)),
        M("NUTRISCORE_A", [500, 500, 600, 600], (0, 1)),
        M("WEIDEMELK", [0, 0, 100, 100], (0, 2)),
    ]
    bars = k4.bars(ms)
    assert [sorted(m["code"] for m in b) for b in bars] == [["NUTRISCORE_B", "NUTRISCORE_C"], ["NUTRISCORE_A"]]


def test_cap1_edge_cut_report_with_low_iou_is_its_own_bar(k4):
    # Een op een venstergrens afgekapte balk overlapt < 0,5 met het hele-etiketvak: twee balken.
    ms = [M("NUTRISCORE_B", [0, 0, 100, 100], (0, 0)), M("NUTRISCORE_B", [0, 0, 100, 30], (1, 0))]
    assert len(k4.bars(ms)) == 2


def test_cap1_letter_box_is_lowest_orde_member_plus_15_percent_clamped(k4):
    bar = [M("NUTRISCORE_C", [500, 400, 700, 500], (1, 0)), M("NUTRISCORE_B", [100, 100, 300, 200], (0, 0))]
    assert k4.letter_box(bar, 1000, 800) == (70, 85, 330, 215)  # 200x100 + 15% = 30/15
    bar = [M("NUTRISCORE_B", [0, 0, 200, 100], (0, 0))]
    assert k4.letter_box(bar, 1000, 800) == (0, 0, 230, 115)  # begrensd op het beeld


def test_cap1_tiny_crop_gets_no_call(k4):
    assert k4.letter_box([M("NUTRISCORE_B", [10, 10, 20, 15], (0, 0))], 1000, 800) is None


def test_cap1_apply_letters_sets_code_confidence_and_box_of_lowest_orde(k4):
    ms = [
        M("NUTRISCORE_B", [0, 0, 100, 100], (0, 0), 0.7),
        M("NUTRISCORE_C", [5, 5, 105, 105], (1, 0), 0.9),
        M("WEIDEMELK", [0, 0, 100, 100], (0, 2), 0.1),
    ]
    out = k4.apply_letters(ms, {0: "C"})
    ns = [m for m in out if m["code"].startswith("NUTRISCORE_")]
    assert len(ns) == 1 and ns[0]["code"] == "NUTRISCORE_C"
    assert ns[0]["vak"] == [0, 0, 100, 100] and ns[0]["orde"] == (0, 0) and ns[0]["confidence"] == pytest.approx(0.9)
    assert [m["code"] for m in out if m["code"] == "WEIDEMELK"] == ["WEIDEMELK"]


def test_cap1_apply_letters_ander_drops_the_bar_and_missing_keeps_it_for_one_letter(k4):
    ms = [M("NUTRISCORE_B", [0, 0, 100, 100], (0, 0)), M("NUTRISCORE_A", [500, 500, 600, 600], (0, 1))]
    out = k4.apply_letters(ms, {0: "ander"})
    assert [m["code"] for m in out] == ["NUTRISCORE_A"]  # bar 1 niet beantwoord: ongemoeid


def test_cap1_one_call_per_bar_with_the_letter_decided_by_the_reader_answer(monkeypatch, k4, nsworld):
    out, seen = scan_with(monkeypatch, k4, BAR * 2, lambda req, n: httpx.Response(200, json=letter_answer("C")))
    assert [d["t3777_code"] for d in out["detections"]] == ["NUTRISCORE_C"]
    letter_calls = [r for r in seen if is_letter_call(r)]
    assert len(seen) == 2 and len(letter_calls) == 1  # 1 venster + 1 balk, ook bij twee meldingen
    s = out["stats"]
    assert s["letter_calls"] == 1 and s["letter_changed"] == 1 and s["letter_failed"] == 0
    assert s["calls"] == 1 and s["tokens_in"] == 1300 and s["cost_usd"] == pytest.approx(0.003)


def test_cap1_letter_request_has_one_crop_no_sheet_and_the_same_provider_rules(monkeypatch, k4, nsworld):
    out, seen = scan_with(monkeypatch, k4, BAR, lambda req, n: httpx.Response(200, json=letter_answer("B")))
    body = json.loads([r for r in seen if is_letter_call(r)][0].content)
    assert body["model"] == k4.MODEL and body["temperature"] == 0
    assert body["provider"] == {"zdr": True, "data_collection": "deny"}
    assert body["response_format"]["json_schema"]["schema"] == k4.LETTER_SCHEMA
    assert body["messages"][0]["content"] == k4.LETTER_INSTRUCTIE
    url = body["messages"][1]["content"][0]["image_url"]["url"]
    assert url.startswith("data:image/jpeg;base64,")


def test_cap1_ander_answer_drops_the_bar(monkeypatch, k4, nsworld):
    out, _ = scan_with(monkeypatch, k4, BAR, lambda req, n: httpx.Response(200, json=letter_answer("ander")))
    assert out["detections"] == [] and out["stats"]["letter_ander"] == 1


def test_cap1_invalid_letter_answer_is_a_failure_not_a_letter(monkeypatch, k4, nsworld):
    out, _ = scan_with(monkeypatch, k4, BAR, lambda req, n: httpx.Response(200, json=letter_answer("Z")))
    assert [d["t3777_code"] for d in out["detections"]] == ["NUTRISCORE_B"]
    assert out["stats"]["letter_failed"] == 1


# --- CAP-2: kleur-lezer alleen vastleggen -------------------------------------------


@pytest.mark.parametrize("read,key", [("C", "letter_reader_agree"), ("A", "letter_reader_disagree"), (None, "letter_reader_none")])
def test_cap2_reader_only_counts_and_never_changes_the_letter(monkeypatch, k4, nsworld, read, key):
    monkeypatch.setattr(k4, "read_letter", lambda crop: read)
    out, _ = scan_with(monkeypatch, k4, BAR, lambda req, n: httpx.Response(200, json=letter_answer("C")))
    assert [d["t3777_code"] for d in out["detections"]] == ["NUTRISCORE_C"]
    assert out["stats"][key] == 1


def test_cap2_reader_wins_on_disagreement_only_when_the_switch_is_on(monkeypatch, k4, nsworld):
    monkeypatch.setattr(k4, "READER_OVERRIDES", True)
    monkeypatch.setattr(k4, "read_letter", lambda crop: "A")
    out, _ = scan_with(monkeypatch, k4, BAR, lambda req, n: httpx.Response(200, json=letter_answer("C")))
    assert [d["t3777_code"] for d in out["detections"]] == ["NUTRISCORE_A"]
    out, _ = scan_with(monkeypatch, k4, BAR, lambda req, n: httpx.Response(200, json=letter_answer("ander")))
    assert out["detections"] == []  # de lezer voegt nooit een balk toe


def test_cap2_reader_is_called_with_the_pinned_ratio(monkeypatch, k4):
    seen = {}
    import app.services.nutriscore_reader as nr

    def fake(img, full_page=False, min_ratio=None):
        seen.update(full_page=full_page, min_ratio=min_ratio)
        return "B", {}

    monkeypatch.setattr(nr, "read_nutriscore", fake)
    assert k4.read_letter(np.zeros((40, 100, 3), np.uint8)) == "B"
    assert seen == {"full_page": False, "min_ratio": 1.18}


# --- CAP-3: terugval, budget, kosten --------------------------------------------------


def test_cap3_failing_letter_call_falls_back_to_round_2_and_scan_does_not_fail(monkeypatch, k4, nsworld):
    out, _ = scan_with(monkeypatch, k4, BAR, lambda req, n: httpx.Response(500, json={}))
    assert [d["t3777_code"] for d in out["detections"]] == ["NUTRISCORE_B"]
    assert out["stats"]["letter_failed"] == 1


def test_cap3_one_failing_bar_does_not_cancel_another(monkeypatch, k4, nsworld):
    two = [
        {"code": "NUTRISCORE_B", "box_2d": [100, 100, 300, 300]},
        {"code": "NUTRISCORE_D", "box_2d": [600, 600, 800, 800]},
    ]

    def handler(req, n):
        # eerste balk: serverfout; tweede balk: antwoord E
        return httpx.Response(500, json={}) if n == 2 else httpx.Response(200, json=letter_answer("E"))

    monkeypatch.setattr(k4, "_backoff", lambda attempt: 0, raising=False)
    out, _ = scan_with(monkeypatch, k4, two, handler)
    codes = sorted(d["t3777_code"] for d in out["detections"])
    assert "NUTRISCORE_E" in codes and len(codes) == 2
    assert out["stats"]["letter_failed"] == 1 and out["stats"]["letter_calls"] == 2


def test_cap3_no_budget_means_no_letter_call_and_round_2_result(monkeypatch, k4, nsworld):
    out, seen = scan_with(
        monkeypatch, k4, BAR, lambda req, n: httpx.Response(200, json=letter_answer("C")),
        remaining=lambda: 5.0 if nsworld.seen else 120.0,
    )
    assert [d["t3777_code"] for d in out["detections"]] == ["NUTRISCORE_B"]
    assert not any(is_letter_call(r) for r in seen)
    assert out["stats"]["letter_budget_fallback"] == 1 and out["stats"]["letter_calls"] == 0


def test_cap3_deadline_signal_passes_through(monkeypatch, k4, nsworld):
    from fastapi import HTTPException

    def boom(req, n):
        raise HTTPException(status_code=504, detail="deadline")

    monkeypatch.setattr(k4, "_backoff", lambda attempt: 0, raising=False)
    with pytest.raises(HTTPException) as exc:
        scan_with(monkeypatch, k4, BAR, boom)
    assert exc.value.status_code == 504


def test_cap3_at_most_8_bars_get_a_call_the_rest_use_one_letter(monkeypatch, k4, nsworld):
    logos = [{"code": "NUTRISCORE_B", "box_2d": [i * 100, 0, i * 100 + 90, 90]} for i in range(10)]
    out, seen = scan_with(monkeypatch, k4, logos, lambda req, n: httpx.Response(200, json=letter_answer("C")))
    assert sum(is_letter_call(r) for r in seen) == 8
    codes = [d["t3777_code"] for d in out["detections"]]
    assert codes.count("NUTRISCORE_C") == 8 and codes.count("NUTRISCORE_B") == 2


def test_cap3_logs_counts_only(monkeypatch, k4, nsworld, caplog):
    caplog.set_level(logging.DEBUG)
    scan_with(monkeypatch, k4, BAR, lambda req, n: httpx.Response(200, json=letter_answer("C")))
    log = caplog.text
    assert KEY not in log and k4.LETTER_INSTRUCTIE[:40] not in log and "base64" not in log
    for part in ("letter_calls=1", "letter_changed=1", "letter_ander=0", "letter_failed=0",
                 "letter_budget_fallback=0", "reader_none=1", "cost="):
        assert part in log


# --- review 25-11: extra gevallen ----------------------------------------------------


def _raw(content, finish="stop"):
    return {"choices": [{"finish_reason": finish, "message": {"content": content}}], "usage": {}, "provider": "Google"}


@pytest.mark.parametrize(
    "payload",
    [_raw("niet json"), _raw('{"letter":"C"}', finish="length"), {"choices": ["x"], "usage": {}}, _raw('{"fout":1}')],
)
def test_cap3_malformed_letter_answers_fall_back(monkeypatch, k4, nsworld, payload):
    out, _ = scan_with(monkeypatch, k4, BAR, lambda req, n: httpx.Response(200, json=payload))
    assert [d["t3777_code"] for d in out["detections"]] == ["NUTRISCORE_B"]
    assert out["stats"]["letter_failed"] == 1


def test_cap3_slow_provider_is_cut_off_by_the_overall_limit(monkeypatch, k4, nsworld):
    import asyncio

    async def hang(*a, **kw):
        await asyncio.sleep(5)

    monkeypatch.setattr(k4, "_letter_call", hang)
    out, _ = scan_with(
        monkeypatch, k4, BAR, lambda req, n: httpx.Response(200, json=letter_answer("C")),
        remaining=lambda: 1.05 if nsworld.seen else 120.0,  # na de embedding: 0,05 s ruimte
    )
    assert [d["t3777_code"] for d in out["detections"]] == ["NUTRISCORE_B"]
    assert out["stats"]["letter_budget_fallback"] == 1


def test_cap1_crop_reaches_the_reader_in_bgr(monkeypatch, k4):
    got = {}

    async def fixed(*a, **kw):
        return "C"

    monkeypatch.setattr(k4, "_letter_call", fixed)
    monkeypatch.setattr(k4, "read_letter", lambda crop: got.setdefault("crop", crop) is None or "C")
    ms = [M("NUTRISCORE_B", [100, 80, 300, 240], (0, 0))]
    totals = {"letter_calls": 0, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0, "attempts": 0}
    letters, counts = run(k4._letter_stage(ms, Image.new("RGB", (1000, 800), (255, 0, 0)), k4.OPENROUTER, "k", lambda: 120.0, totals))
    assert letters == {0: "C"} and counts["letter_reader_agree"] == 1
    assert tuple(got["crop"][0, 0]) == (0, 0, 255)  # rood in RGB = (0,0,255) in BGR


def test_cap3_the_8_bars_are_the_lowest_orde_and_tiny_bars_take_no_place(monkeypatch, k4, nsworld):
    tiny = {"code": "NUTRISCORE_D", "box_2d": [900, 900, 905, 905]}
    logos = [{"code": "NUTRISCORE_B", "box_2d": [i * 100, 0, i * 100 + 90, 90]} for i in range(9)]
    out, seen = scan_with(monkeypatch, k4, [tiny] + logos, lambda req, n: httpx.Response(200, json=letter_answer("C")))
    assert sum(is_letter_call(r) for r in seen) == 8  # de piepkleine balk (orde 0) telt niet mee
    codes = [d["t3777_code"] for d in out["detections"]]
    assert codes.count("NUTRISCORE_C") == 8 and "NUTRISCORE_D" in codes


def test_review_env_letter_stage_uses_the_own_key_not_the_ghs_key(monkeypatch, k4, nsworld):
    from tests.test_k4aa_atdd import BASE, G1, GOOGLE, K1, _pairs

    _pairs(monkeypatch, BASE, K1, GOOGLE, G1)
    out, seen = scan_with(monkeypatch, k4, BAR, lambda req, n: httpx.Response(200, json=letter_answer("B")))
    letters = [r for r in seen if is_letter_call(r)]
    assert letters and all(r.headers["authorization"] == "Bearer " + K1 for r in seen)
