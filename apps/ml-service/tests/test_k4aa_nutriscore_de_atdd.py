"""ATDD voor SPEC-nutriscore-k4aa-de (CAP-1, CAP-2, CAP-2b, CAP-4). Geschreven vóór de bouw.
Geen netwerk, geen SigLIP-gewichten; hergebruikt de nep-wereld van test_k4aa_atdd."""

import hashlib
import importlib.util
import io
import pathlib

import httpx
import numpy as np
import pytest
from PIL import Image

from tests.test_k4aa_atdd import (  # noqa: F401  (fixtures + helpers)
    FakeEmbedder,
    answer,
    k4,
    mock_http,
    png_bytes,
    refs_rows,
    run,
    world,
)

OLD_SHEET_SHA = "d39f1905cdaaf4f4998c76c29ae0324707975ca9961f9214b1f6c45c74ab9ad3"
SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts/k4aa_referentieblad.py"


# --- CAP-1: codelijst, prompt, schema, blad --------------------------------------


def test_cap1_codelist_has_17_codes_with_nutriscore_d_and_e(k4):
    assert len(k4.TOP15) == 17
    assert {"NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C", "NUTRISCORE_D", "NUTRISCORE_E"} <= set(k4.TOP15)
    assert k4.TOP15 == sorted(k4.TOP15)
    assert "NUTRISCORE_D" not in k4.BRUIKBAAR and "NUTRISCORE_E" not in k4.BRUIKBAAR


def test_cap1_prompt_and_schema_carry_d_and_e(k4):
    for letter in "ABCDE":
        code = f"NUTRISCORE_{letter}"
        assert f"- {code}:" in k4.INSTRUCTIE
        assert f"letter {letter}" in k4.OMSCHRIJVING[code]
    enum = k4.SCHEMA["properties"]["logos"]["items"]["properties"]["code"]["enum"]
    assert {"NUTRISCORE_D", "NUTRISCORE_E"} <= set(enum) and enum[-1] == "ander"


def test_cap1_c_description_no_longer_sends_d_or_e_to_ander(k4):
    assert "D or E" not in k4.OMSCHRIJVING["NUTRISCORE_C"]
    assert "ander" not in k4.OMSCHRIJVING["NUTRISCORE_C"]


def test_cap1_parse_keeps_d_and_e(k4):
    content = '{"logos":[{"code":"NUTRISCORE_D","box_2d":[0,0,500,500]},{"code":"NUTRISCORE_E","box_2d":[0,500,500,1000]}]}'
    assert [m["code"] for m in k4.parse(content, 0, 0, 100, 100)] == ["NUTRISCORE_D", "NUTRISCORE_E"]


def test_cap1_reference_sheet_is_rebuilt_with_15_tiles_and_a_repo_builder(k4):
    assert SCRIPT.is_file(), "bouwscript naast het blad ontbreekt"
    spec = importlib.util.spec_from_file_location("k4aa_referentieblad", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert "NUTRISCORE_D" in mod.TILES and "NUTRISCORE_E" in mod.TILES and len(mod.TILES) == 15
    assert mod.TILES == sorted(mod.TILES)
    sheet = k4.referentieblad_bytes()
    assert hashlib.sha256(sheet).hexdigest() != OLD_SHEET_SHA
    assert Image.open(io.BytesIO(sheet)).size == (1440, 1176)


# --- CAP-2: letterpoort ---------------------------------------------------------


def _g(code, score_by_code, k4):
    top = sorted(score_by_code.items(), key=lambda kv: -kv[1])
    return k4.gate([{"code": code, "vak": [0, 0, 10, 10], "orde": (0, 0)}], [top])


def test_cap2_letter_behind_another_letter_stays_when_a_letter_is_in_the_top(k4):
    # Ronde 2: SigLIP kan de letters niet scheiden (spreiding < 0,03); de letter komt van Gemini.
    kept = _g("NUTRISCORE_C", {"NUTRISCORE_B": 0.9, "NUTRISCORE_C": 0.8, "WEIDEMELK": 0.5}, k4)
    assert [m["code"] for m in kept] == ["NUTRISCORE_C"]


def test_cap2_letter_missing_from_top3_stays_when_another_letter_is_in_it(k4):
    # E staat niet in de top-3 (alleen D, C, A), maar het uitsnede is wel een Nutri-Score.
    top = {"NUTRISCORE_D": 0.9, "NUTRISCORE_C": 0.89, "NUTRISCORE_A": 0.88}
    assert [m["code"] for m in _g("NUTRISCORE_E", top, k4)] == ["NUTRISCORE_E"]


def test_cap2_confidence_is_the_best_nutriscore_score_in_the_top(k4):
    kept = _g("NUTRISCORE_C", {"NUTRISCORE_B": 0.9, "NUTRISCORE_C": 0.8, "WEIDEMELK": 0.5}, k4)
    assert kept[0]["confidence"] == pytest.approx(0.9)


def test_cap2_equal_scores_keep_both_letters(k4):
    top = [("NUTRISCORE_B", 0.8), ("NUTRISCORE_C", 0.8), ("WEIDEMELK", 0.5)]
    ms = [{"code": c, "vak": [0, 0, 10, 10], "orde": (0, i)} for i, c in enumerate(["NUTRISCORE_B", "NUTRISCORE_C"])]
    assert [m["code"] for m in k4.gate(ms, [top, top])] == ["NUTRISCORE_B", "NUTRISCORE_C"]


def test_cap2_nutriscore_without_any_letter_in_the_top3_is_dropped(k4):
    top = [("WEIDEMELK", 0.9), ("EU_ORGANIC_FARMING", 0.8), ("GREEN_DOT", 0.7)]
    assert _g("NUTRISCORE_A", dict(top), k4) == []



def test_cap2_other_codes_are_unchanged_by_nutriscore_neighbours(k4):
    kept = _g("WEIDEMELK", {"NUTRISCORE_A": 0.95, "WEIDEMELK": 0.9, "NUTRISCORE_B": 0.8}, k4)
    assert [m["code"] for m in kept] == ["WEIDEMELK"]


# --- CAP-2b: één balk, één letter -------------------------------------------------


def test_cap2b_overlapping_different_letters_keep_the_lowest_orde_on_equal_votes(k4):
    ms = [
        {"code": "NUTRISCORE_B", "vak": [0, 0, 100, 100], "orde": (0, 0), "confidence": 0.7},
        {"code": "NUTRISCORE_C", "vak": [5, 5, 105, 105], "orde": (1, 0), "confidence": 0.9},
        {"code": "NUTRISCORE_A", "vak": [500, 500, 600, 600], "orde": (0, 1), "confidence": 0.5},
        {"code": "WEIDEMELK", "vak": [0, 0, 100, 100], "orde": (0, 2), "confidence": 0.1},
    ]
    out = k4.one_letter(ms)
    assert sorted((m["code"], m["orde"]) for m in out) == [
        ("NUTRISCORE_A", (0, 1)),
        ("NUTRISCORE_B", (0, 0)),
        ("WEIDEMELK", (0, 2)),
    ]


def test_cap2b_letter_with_most_overlapping_reports_wins_whatever_the_gate_score(k4):
    ms = [
        {"code": "NUTRISCORE_C", "vak": [0, 0, 100, 100], "orde": (0, 0), "confidence": 0.95},
        {"code": "NUTRISCORE_B", "vak": [0, 0, 100, 100], "orde": (1, 0), "confidence": 0.90},
        {"code": "NUTRISCORE_B", "vak": [2, 2, 98, 98], "orde": (2, 0), "confidence": 0.90},
    ]
    assert {m["code"] for m in k4.one_letter(ms)} == {"NUTRISCORE_B"}


def test_cap2_nutriscore_on_rank_2_or_3_of_the_top_stays_with_its_own_score(k4):
    top = {"WEIDEMELK": 0.9, "GREEN_DOT": 0.8, "NUTRISCORE_D": 0.7}  # letter op plek 3, andere letter gemeld
    kept = _g("NUTRISCORE_A", top, k4)
    assert [m["code"] for m in kept] == ["NUTRISCORE_A"] and kept[0]["confidence"] == pytest.approx(0.7)
    top = {"WEIDEMELK": 0.9, "NUTRISCORE_D": 0.8, "GREEN_DOT": 0.7}  # plek 2
    assert [m["code"] for m in _g("NUTRISCORE_A", top, k4)] == ["NUTRISCORE_A"]


def test_cap2b_votes_need_overlap_a_far_away_same_letter_gives_no_vote(k4):
    ms = [
        {"code": "NUTRISCORE_B", "vak": [0, 0, 100, 100], "orde": (0, 0), "confidence": 0.9},
        {"code": "NUTRISCORE_C", "vak": [0, 0, 100, 100], "orde": (1, 0), "confidence": 0.9},
        {"code": "NUTRISCORE_C", "vak": [900, 900, 1000, 1000], "orde": (2, 0), "confidence": 0.9},
    ]
    assert sorted(m["code"] for m in k4.one_letter(ms)) == ["NUTRISCORE_B", "NUTRISCORE_C"]
    assert [m["orde"] for m in k4.one_letter(ms) if m["vak"][0] == 0] == [(0, 0)]


def test_cap2b_vote_overlap_of_exactly_half_counts(k4):
    # IoU precies 0,5: [0,0,100,100] en [0,0,100,50]; moet meetellen als stem (>=, zoals merge).
    ms = [
        {"code": "NUTRISCORE_C", "vak": [0, 0, 100, 100], "orde": (0, 0), "confidence": 0.9},
        {"code": "NUTRISCORE_B", "vak": [0, 0, 100, 100], "orde": (1, 0), "confidence": 0.9},
        {"code": "NUTRISCORE_B", "vak": [0, 0, 100, 50], "orde": (2, 0), "confidence": 0.9},
    ]
    assert {m["code"] for m in k4.one_letter(ms)} == {"NUTRISCORE_B"}


def test_cap2_rank_4_nutriscore_via_top_codes_is_dropped(k4):
    R = np.array([[1, 0, 0, 0], [0.9, 0.1, 0, 0], [0.8, 0.2, 0, 0], [0.7, 0.3, 0, 0]], np.float32)
    codes = ["WEIDEMELK", "EU_ORGANIC_FARMING", "GREEN_DOT", "NUTRISCORE_A"]
    top = k4.top_codes(np.array([[1, 0, 0, 0]], np.float32), R, codes)
    assert [c for c, _ in top[0]] == ["WEIDEMELK", "EU_ORGANIC_FARMING", "GREEN_DOT"]
    m = {"code": "NUTRISCORE_A", "vak": [0, 0, 10, 10], "orde": (0, 0)}
    assert k4.gate([m], top) == []


def test_cap2b_same_letter_and_distant_boxes_are_untouched(k4):
    ms = [
        {"code": "NUTRISCORE_B", "vak": [0, 0, 100, 100], "orde": (0, 0), "confidence": 0.7},
        {"code": "NUTRISCORE_B", "vak": [5, 5, 105, 105], "orde": (1, 0), "confidence": 0.9},
        {"code": "NUTRISCORE_C", "vak": [900, 900, 1000, 1000], "orde": (0, 1), "confidence": 0.8},
    ]
    assert len(k4.one_letter(ms)) == 3


def test_cap2_cap2b_scan_end_to_end_one_balk_one_letter(monkeypatch, k4):
    from app.services.database import db_service
    from unittest.mock import AsyncMock

    monkeypatch.setattr(k4, "get_embedder", lambda: FakeEmbedder([1, 0, 0, 0]))
    rows = refs_rows([("NUTRISCORE_B", 0.9), ("NUTRISCORE_C", 0.8), ("NUTRISCORE_D", 0.7)])
    monkeypatch.setattr(db_service, "get_siglip_references", AsyncMock(return_value=rows), raising=False)
    mock_http(
        monkeypatch,
        k4,
        lambda req, n: httpx.Response(
            200,
            json=answer(
                [
                    {"code": "NUTRISCORE_C", "box_2d": [100, 100, 300, 300]},
                    {"code": "NUTRISCORE_B", "box_2d": [100, 100, 300, 300]},
                ]
            ),
        ),
    )
    out = run(k4.scan(png_bytes(1000, 800), lambda: 120.0))
    # Gelijke stemmen, en de familiescore zegt niets over de letter: eerst gemelde (C) blijft.
    assert [d["t3777_code"] for d in out["detections"]] == ["NUTRISCORE_C"]
    assert out["detections"][0]["uncertain"] is True


def test_cap2b_chain_a_b_c_keeps_a_and_c_is_judged_against_kept_only(k4):
    ms = [
        {"code": "NUTRISCORE_A", "vak": [0, 0, 100, 100], "orde": (0, 0), "confidence": 0.9},
        {"code": "NUTRISCORE_B", "vak": [0, 0, 100, 65], "orde": (0, 1), "confidence": 0.8},  # IoU met A 0,65
        {"code": "NUTRISCORE_C", "vak": [0, 40, 100, 100], "orde": (0, 2), "confidence": 0.7},  # IoU met B 0,6; met A 0,6
    ]
    assert [m["code"] for m in k4.one_letter(ms)] == ["NUTRISCORE_A"]


def test_cap2b_equal_scores_keep_the_lowest_orde(k4):
    ms = [
        {"code": "NUTRISCORE_C", "vak": [0, 0, 100, 100], "orde": (1, 0), "confidence": 0.8},
        {"code": "NUTRISCORE_B", "vak": [0, 0, 100, 100], "orde": (0, 3), "confidence": 0.8},
    ]
    assert [m["code"] for m in k4.one_letter(ms)] == ["NUTRISCORE_B"]


class CropEmbedder:
    """Vector hangt af van de uitsnede: breedte 200 px = het B-vak, anders het C-vak."""

    def embed(self, images):
        out = np.array(
            [[1, 0, 0, 0] if im.size[0] == 200 else [0, 1, 0, 0] for im in images],
            np.float32,
        )
        return out


def test_cap2b_scan_calls_one_letter_and_counts_what_it_drops(monkeypatch, k4):
    from unittest.mock import AsyncMock

    from app.services.database import db_service

    monkeypatch.setattr(k4, "get_embedder", lambda: CropEmbedder())
    rows = []
    for i, (code, vec) in enumerate(
        [("NUTRISCORE_B", [1, 0, 0, 0]), ("NUTRISCORE_C", [0, 1, 0, 0]), ("WEIDEMELK", [0, 0, 1, 0])]
    ):
        rows.append(
            {
                "id": f"00000000-0000-0000-0000-{i:012d}",
                "t3777_code": code,
                "storage_path": f"r/{i}.png",
                "embedding": vec,
                "embedded_path": f"r/{i}.png",
            }
        )
    monkeypatch.setattr(db_service, "get_siglip_references", AsyncMock(return_value=rows), raising=False)
    # B-vak 200 px breed, C-vak 220 px breed, bijna dezelfde plek: elke letter wint in zijn eigen uitsnede.
    mock_http(
        monkeypatch,
        k4,
        lambda req, n: httpx.Response(
            200,
            json=answer(
                [
                    {"code": "NUTRISCORE_B", "box_2d": [100, 100, 300, 300]},
                    {"code": "NUTRISCORE_C", "box_2d": [100, 100, 300, 320]},
                ]
            ),
        ),
    )
    out = run(k4.scan(png_bytes(1000, 800), lambda: 120.0))
    assert len(out["detections"]) == 1
    assert out["stats"]["letter_dropped"] == 1 and out["stats"]["na_poort"] == 1
