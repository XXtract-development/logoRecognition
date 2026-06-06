"""Precisie-kalibratie lokalisatie — ATDD RED PHASE (Story 8-3P, Epic 8-nazorg).

Failing acceptance tests, generated BEFORE implementation (TDD red phase).
Elke test is geskipt met ``@pytest.mark.skip``; verwijder de marker per test
zodra story 8-3P geïmplementeerd is.

Contract (uit de bevroren ontwerpbeslissingen ná adversarial review P1–P5/S1):
  app/services/localization.py
    LOCALIZE_SCALE_MIN_PX default 48 → 64 (P3: géén aparte min-instance-var)
    LOCALIZE_CLASS_THRESHOLDS — env-JSON {code: drempel}, ML-side geresolved:
        per-klasse → request-min_score → LOCALIZE_MIN_SCORE; ongeldig JSON =
        opstart-warning + lege map (geen crash)
    Multi-peak (P2): CCOEFF-tak extraheert tot LOCALIZE_PEAKS_PER_VARIANT (3)
        lokale maxima per variant-map met onderdrukkingsradius = variant-max-dim;
        match_templates-signatuur BYTE-IDENTIEK (lijst krijgt meer entries,
        score-aflopend); degenerate-SQDIFF-fallback blijft single-peak
  app/api/artwork.py
    collapse per (code, tegel) wordt top-k locatie-distinct
        (LOCALIZE_COLLAPSE_TOP_K, default 3); detecties vermelden de
        toegepaste drempel (veld "threshold")
"""

import asyncio
import base64

import pytest

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'ml-service'))


def _structured_logo(size=400):
    """Zelfde deterministische fixture-stijl als test_localization_multiscale."""
    import numpy as np

    img = np.full((size, size, 3), 255, dtype=np.uint8)
    yy, xx = np.mgrid[0:size, 0:size]
    c = size / 2.0
    r = np.sqrt((xx - c) ** 2 + (yy - c) ** 2)
    img[(r % (size / 5)) < (size / 10)] = (30, 90, 30)
    block = max(1, size // 8)
    img[((xx // block + yy // block) % 2 == 0) & (r < size / 4)] = (200, 40, 40)
    return img


def _paste(background, logo, target_max_dim, x, y):
    import cv2

    h, w = logo.shape[:2]
    f = target_max_dim / max(h, w)
    inst = cv2.resize(logo, (max(1, round(w * f)), max(1, round(h * f))), interpolation=cv2.INTER_AREA)
    ih, iw = inst.shape[:2]
    background[y : y + ih, x : x + iw] = inst
    return background


def _b64_png(img) -> str:
    import cv2

    return base64.b64encode(cv2.imencode(".png", img)[1].tobytes()).decode()


def _localize(source, logo, **body):
    from app.api.artwork import localize_artwork, LocalizeRequest

    req = LocalizeRequest(
        image_b64=_b64_png(source),
        templates=[{"t3777_code": "TEST_MARK", "image_b64": _b64_png(logo)}],
        **body,
    )
    return asyncio.run(localize_artwork(req))


# ---------------------------------------------------------------------------
# AC1 — min-instance-floor via verhoogde LOCALIZE_SCALE_MIN_PX-default (P3)
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="RED: story 8-3P niet geïmplementeerd")
def test_default_ladder_floor_is_64px():
    """AC1: de default-ladder genereert geen varianten < 64px max-dim (de
    FP-fabriek uit het 8-3R-meetrapport zat op 48px); expliciet lager blijft
    mogelijk voor metingen."""
    from app.services.localization import LOCALIZE_SCALE_MIN_PX, prepare_scaled_templates

    assert LOCALIZE_SCALE_MIN_PX == 64  # nieuwe default (kalibratie-output)

    variants = prepare_scaled_templates([{"t3777_code": "X", "image": _structured_logo(960)}])
    assert min(max(v["image"].shape[:2]) for v in variants) >= 64

    explicit = prepare_scaled_templates(
        [{"t3777_code": "X", "image": _structured_logo(960)}], scale_min_px=48
    )
    assert min(max(v["image"].shape[:2]) for v in explicit) < 64  # expliciete override werkt


# ---------------------------------------------------------------------------
# AC2 — per-klasse drempels (ML-side env-map) + drempel in response
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="RED: story 8-3P niet geïmplementeerd")
def test_class_threshold_resolution_three_levels(monkeypatch):
    """AC2: per-klasse env-drempel wint van request-min_score; codes zonder
    entry volgen de bestaande resolutie; elke detectie vermeldt de toegepaste
    drempel."""
    import numpy as np
    from app.services import localization as loc

    monkeypatch.setattr(loc, "LOCALIZE_CLASS_THRESHOLDS", {"TEST_MARK": 0.95}, raising=False)

    logo = _structured_logo(400)
    source = np.full((640, 640, 3), 255, dtype=np.uint8)
    source = _paste(source, logo, 94, 200, 200)

    # Exacte match scoort ~0,65–0,9 — de per-klasse drempel 0,95 moet hem WEREN,
    # ook al staat request-min_score op 0,3.
    resp = _localize(source, logo, min_score=0.3)
    assert all(d["t3777_code"] != "TEST_MARK" for d in resp.detections)


@pytest.mark.skip(reason="RED: story 8-3P niet geïmplementeerd")
def test_detections_report_applied_threshold():
    """AC2: de response vermeldt per detectie de toegepaste drempel."""
    import numpy as np

    logo = _structured_logo(400)
    source = np.full((640, 640, 3), 255, dtype=np.uint8)
    source = _paste(source, logo, 94, 200, 200)

    resp = _localize(source, logo, min_score=0.5)
    marks = [d for d in resp.detections if d["t3777_code"] == "TEST_MARK"]
    assert len(marks) >= 1
    assert marks[0].get("threshold") == pytest.approx(0.5)


@pytest.mark.skip(reason="RED: story 8-3P niet geïmplementeerd")
def test_invalid_class_thresholds_json_is_warning_not_crash(monkeypatch):
    """AC2: ongeldig JSON in LOCALIZE_CLASS_THRESHOLDS ⇒ lege map + warning,
    geen import-crash (parser is een aanroepbare functie)."""
    from app.services.localization import _parse_class_thresholds

    assert _parse_class_thresholds("{niet json") == {}
    assert _parse_class_thresholds("") == {}
    assert _parse_class_thresholds('{"A": 0.7}') == {"A": 0.7}


# ---------------------------------------------------------------------------
# AC3 — multi-peak + top-k-collapse, locatie-distinct (P2)
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="RED: story 8-3P niet geïmplementeerd")
def test_two_instances_same_mark_in_one_tile_both_found():
    """AC3: twee instanties van hetzelfde keurmerk in ÉÉN tegel overleven
    beide, met aantoonbaar verschillende centra op de verwachte posities —
    niet alleen count≥2 (facade-guard uit de review)."""
    import numpy as np

    logo = _structured_logo(400)
    source = np.full((640, 640, 3), 255, dtype=np.uint8)  # exact één tegel
    source = _paste(source, logo, 94, 80, 80)
    source = _paste(source, logo, 94, 400, 380)

    resp = _localize(source, logo, min_score=0.5)
    marks = [d for d in resp.detections if d["t3777_code"] == "TEST_MARK"]
    assert len(marks) == 2

    centra = sorted((d["bbox"]["x"] + d["bbox"]["width"] // 2, d["bbox"]["y"] + d["bbox"]["height"] // 2) for d in marks)
    (x1, y1), (x2, y2) = centra
    assert abs(x1 - (80 + 47)) <= 10 and abs(y1 - (80 + 47)) <= 10
    assert abs(x2 - (400 + 47)) <= 10 and abs(y2 - (380 + 47)) <= 10


@pytest.mark.skip(reason="RED: story 8-3P niet geïmplementeerd")
def test_multi_peak_entries_are_score_descending_per_template():
    """P2-contract: match_templates retourneert bij meerdere pieken extra
    entries, score-aflopend per template (signatuur ongewijzigd)."""
    import numpy as np
    from app.services.localization import match_templates, prepare_scaled_templates

    logo = _structured_logo(400)
    tile = np.full((640, 640, 3), 255, dtype=np.uint8)
    tile = _paste(tile, logo, 94, 80, 80)
    tile = _paste(tile, logo, 94, 400, 380)

    variants = prepare_scaled_templates([{"t3777_code": "M", "image": logo}], scale_min_px=90, scale_max_px=98, scale_step=1.05, tile_size=640)
    matches = match_templates(tile, variants, min_score=0.5)

    assert len(matches) >= 2  # twee pieken voor dezelfde variant-familie
    scores = [m["score"] for m in matches]
    # per template aflopend — globaal volstaat hier: eerste entry is de beste
    assert scores[0] == max(scores)


# ---------------------------------------------------------------------------
# AC5 (iv) — endpoint-doorgifte nieuwe tunables
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="RED: story 8-3P niet geïmplementeerd")
def test_endpoint_exposes_new_precision_tunables():
    """Nieuwe tunables zitten in het request-contract; defaults uit env."""
    from app.api.artwork import LocalizeRequest
    from app.services.localization import LOCALIZE_COLLAPSE_TOP_K, LOCALIZE_PEAKS_PER_VARIANT

    assert LOCALIZE_PEAKS_PER_VARIANT == 3
    assert LOCALIZE_COLLAPSE_TOP_K == 3
    for tunable in ("collapse_top_k", "peaks_per_variant"):
        assert tunable in LocalizeRequest.model_fields
