"""Multi-scale lokalisatie — ATDD RED PHASE (Story 8.3R, Epic 8-nazorg).

Failing acceptance tests, generated BEFORE implementation (TDD red phase).
Elke test is geskipt met ``@pytest.mark.skip``; verwijder de marker per test
zodra story 8.3R geïmplementeerd is.

Contract voor de developer (uit de story-ontwerpbeslissingen, NIET heronderhandelen):
  app/services/localization.py
    prepare_scaled_templates(templates, *, scale_min_px=48, scale_max_px=512,
                             scale_step=1.25, tile_size=640) -> list[dict]
      — varianten {t3777_code, image, scale, source_max_dim}; schaalfactor =
        doelgrootte / max(ref_w, ref_h); aspect-ratio behouden; alpha-
        geneutraliseerd (transparant → gemiddelde van opake pixels)
    LOCALIZE_DEGENERATE_STD (default 1.0) — fallback-trigger, ONTKOPPELD van
        LOCALIZE_MIN_VARIANCE (12); alleen écht degenerate templates nemen
        het TM_SQDIFF-pad, al het andere TM_CCOEFF_NORMED [0,1]
    match_templates(tile, templates, min_score) — signatuur BYTE-IDENTIEK
        (de 4 bestaande tests in test_artwork_processing.py blijven ongewijzigd groen)
  app/api/artwork.py
    LocalizeRequest: storage_path?/image_b64? + tile_size?/overlap?/min_score?/
        scale_min_px?/scale_max_px?/scale_step? — image_path VERWIJDERD
    localize_artwork: ladder één keer per request; per (t3777_code, tegel)
        alleen de beste schaal vóór NMS (collapse); time-budget met "truncated"
"""

import asyncio
import base64

import pytest
from unittest.mock import MagicMock

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'ml-service'))


# ---------------------------------------------------------------------------
# Helpers — synthetische, structuurrijke logo's (hoge variantie, deterministisch)
# ---------------------------------------------------------------------------


def _structured_logo(size=400, base=255, rgba=False):
    """Deterministisch patroon met hoge variantie: ringen + dambord-kern.

    Overleeft INTER_AREA-downscaling herkenbaar — precies wat een echt
    keurmerk ook doet."""
    import numpy as np

    img = np.full((size, size, 3), base, dtype=np.uint8)
    yy, xx = np.mgrid[0:size, 0:size]
    c = size / 2.0
    r = np.sqrt((xx - c) ** 2 + (yy - c) ** 2)
    img[(r % (size / 5)) < (size / 10)] = (30, 90, 30)  # donkergroene ringen
    block = max(1, size // 8)
    checker = ((xx // block + yy // block) % 2 == 0) & (r < size / 4)
    img[checker] = (200, 40, 40)  # kern-dambord
    if not rgba:
        return img
    alpha = np.where(r <= c, 255, 0).astype(np.uint8)  # ronde dekking, hoeken transparant
    return np.dstack([img, alpha])


def _different_pattern(size=640):
    """Structuurrijk maar ANDERS patroon (diagonale balken) — mag nooit matchen."""
    import numpy as np

    img = np.full((size, size, 3), 230, dtype=np.uint8)
    yy, xx = np.mgrid[0:size, 0:size]
    img[((xx + yy) // 40) % 2 == 0] = (60, 60, 160)
    return img


def _paste_resized(background, logo, target_max_dim, x, y):
    """Plak een naar target_max_dim geschaalde instantie (AR behouden) op (x, y)."""
    import cv2

    h, w = logo.shape[:2]
    f = target_max_dim / max(h, w)
    inst = cv2.resize(logo, (max(1, round(w * f)), max(1, round(h * f))), interpolation=cv2.INTER_AREA)
    ih, iw = inst.shape[:2]
    if inst.shape[2] == 4:  # alpha-composiet
        alpha = inst[:, :, 3:4].astype("float32") / 255.0
        region = background[y : y + ih, x : x + iw].astype("float32")
        background[y : y + ih, x : x + iw] = (
            inst[:, :, :3].astype("float32") * alpha + region * (1 - alpha)
        ).astype("uint8")
    else:
        background[y : y + ih, x : x + iw] = inst
    return background, (iw, ih)


def _b64_png(img) -> str:
    import cv2

    ok, buf = cv2.imencode(".png", img)
    assert ok
    return base64.b64encode(buf.tobytes()).decode()


def _run_localize(source_img, template_img, **body_overrides):
    """Roep de echte endpoint-handler aan met image_b64 + native template."""
    from app.api.artwork import localize_artwork, LocalizeRequest

    req = LocalizeRequest(
        image_b64=_b64_png(source_img),
        templates=[{"t3777_code": "TEST_MARK", "image_b64": _b64_png(template_img)}],
        **body_overrides,
    )
    return asyncio.run(localize_artwork(req))


# ---------------------------------------------------------------------------
# Ontwerpbeslissing 2 — schaal-ladder (prepare_scaled_templates)
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="RED: story 8.3R niet geïmplementeerd")
def test_prepare_scaled_templates_ladder_covers_measured_ratio():
    """De ladder dekt de gemeten ratio 0,11×–0,22×: een 960×644-referentie
    (EU_ORGANIC-formaat) levert varianten van 48px t/m ≤512px max-dim,
    aspect-ratio behouden, mét schaal-metadata."""
    from app.services.localization import prepare_scaled_templates

    template = _structured_logo(size=960)[:644, :, :]  # 644×960 → max-dim 960
    variants = prepare_scaled_templates(
        [{"t3777_code": "EU_ORGANIC_FARMING", "image": template}],
        scale_min_px=48, scale_max_px=512, scale_step=1.25, tile_size=640,
    )

    assert len(variants) >= 8  # 48 → 512 met stap 1,25 ≈ 11 stappen
    max_dims = sorted(max(v["image"].shape[:2]) for v in variants)
    assert max_dims[0] <= 50  # onderkant van de ladder bereikt ~48px
    assert max_dims[-1] <= 640  # nooit groter dan de tile
    # 110px-instanties (gemeten) vallen tussen twee ladder-stappen ≤ 25% uiteen
    assert any(94 <= d <= 118 for d in max_dims)
    for v in variants:
        h, w = v["image"].shape[:2]
        assert abs((w / h) - (960 / 644)) < 0.05  # AR behouden
        assert v["t3777_code"] == "EU_ORGANIC_FARMING"
        assert "scale" in v


# ---------------------------------------------------------------------------
# AC5 (i) — instance op ~0,15× van template-grootte wordt via de flow gevonden
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="RED: story 8.3R niet geïmplementeerd")
def test_localize_flow_finds_instance_at_15_percent_scale():
    """Een 400px-referentie waarvan de instantie op 60px (0,15×) op het artwork
    staat, wordt gevonden mét native-size referentie als input — de kern van
    de remediatie (huidig gedrag: 0 detecties)."""
    import numpy as np

    logo = _structured_logo(size=400)
    source = np.full((800, 800, 3), 255, dtype=np.uint8)
    source, (iw, ih) = _paste_resized(source, logo, target_max_dim=60, x=300, y=400)

    resp = _run_localize(source, logo)

    marks = [d for d in resp.detections if d["t3777_code"] == "TEST_MARK"]
    assert len(marks) >= 1
    best = max(marks, key=lambda d: d["score"])
    assert abs(best["bbox"]["x"] - 300) <= 8
    assert abs(best["bbox"]["y"] - 400) <= 8
    assert abs(best["bbox"]["width"] - iw) <= 12  # bbox = geschaalde grootte


# ---------------------------------------------------------------------------
# AC5 (ii) — template groter dan tile wordt gedownscaled, niet geskipt
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="RED: story 8.3R niet geïmplementeerd")
def test_template_larger_than_tile_is_downscaled_not_skipped():
    """Een 960×960-referentie (groter dan de 640-tile) mag NIET worden
    geskipt ('Template larger than tile') — de productie-failure uit fase B."""
    import numpy as np

    logo = _structured_logo(size=960)
    source = np.full((640, 640, 3), 255, dtype=np.uint8)  # exact één tile
    source, _ = _paste_resized(source, logo, target_max_dim=117, x=200, y=150)

    resp = _run_localize(source, logo)

    marks = [d for d in resp.detections if d["t3777_code"] == "TEST_MARK"]
    assert len(marks) >= 1
    best = max(marks, key=lambda d: d["score"])
    assert abs(best["bbox"]["x"] - 200) <= 10
    assert abs(best["bbox"]["y"] - 150) <= 10


# ---------------------------------------------------------------------------
# AC5 (iii) — score-herijking: discriminatie + metric-takken + alpha
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="RED: story 8.3R niet geïmplementeerd")
def test_score_discriminates_nonmatching_content():
    """FP-guard (de 1446-les): een structuurrijk template tegen een ANDERS
    structuurrijk beeld mag op geen enkele ladder-schaal boven min_score=0.8
    komen. De oude 1−min/max-normalisatie faalt hier berucht."""
    logo = _structured_logo(size=400)
    source = _different_pattern(size=640)

    resp = _run_localize(source, logo, min_score=0.8)

    assert resp.detections == []


@pytest.mark.skip(reason="RED: story 8.3R niet geïmplementeerd")
def test_degenerate_fallback_trigger_is_decoupled_from_variance_guard():
    """Ontwerpbeslissing 3: de fallback-trigger is LOCALIZE_DEGENERATE_STD
    (1,0), ontkoppeld van LOCALIZE_MIN_VARIANCE (12). Gemeten: echte
    referenties zitten op 48px op stddev ≥14 — een trigger op 12 zou de
    metric midden in de ladder doen omslaan (onvergelijkbare collapse)."""
    from app.services.localization import LOCALIZE_DEGENERATE_STD, LOCALIZE_MIN_VARIANCE

    assert LOCALIZE_DEGENERATE_STD == pytest.approx(1.0)
    assert LOCALIZE_DEGENERATE_STD < LOCALIZE_MIN_VARIANCE  # écht ontkoppeld én lager


@pytest.mark.skip(reason="RED: story 8.3R niet geïmplementeerd")
def test_low_contrast_template_still_matches_via_ccoeff_path():
    """Een laag-contrast (maar niet-degenerate) donker template — stddev tussen
    de degenerate-trigger (1) en de bright-guard-variantie (12) — wordt NIET
    stilletjes geweigerd en matcht op de juiste plek (EU_ORGANIC-scenario)."""
    import numpy as np

    # Donkere basis (mean ≪ 200 → bright-guard niet van toepassing), zwak patroon
    logo = np.full((400, 400, 3), 120, dtype=np.uint8)
    yy, xx = np.mgrid[0:400, 0:400]
    logo[((xx // 50 + yy // 50) % 2 == 0)] = 110  # stddev ≈ 5: laag maar reëel
    source = np.full((640, 640, 3), 70, dtype=np.uint8)
    source, _ = _paste_resized(source, logo, target_max_dim=75, x=120, y=320)

    resp = _run_localize(source, logo, min_score=0.7)

    marks = [d for d in resp.detections if d["t3777_code"] == "TEST_MARK"]
    assert len(marks) >= 1
    best = max(marks, key=lambda d: d["score"])
    assert abs(best["bbox"]["x"] - 120) <= 10
    assert abs(best["bbox"]["y"] - 320) <= 10


@pytest.mark.skip(reason="RED: story 8.3R niet geïmplementeerd")
def test_localize_flow_matches_transparent_round_logo():
    """Ontwerpbeslissing 4 (GREEN_DOT-scenario): een rond RGBA-logo met
    transparante hoeken wordt gevonden op een grijze achtergrond. Zonder
    alpha-neutralisatie matcht de geplatte spookrechthoek (zwarte hoeken)
    nergens op."""
    import numpy as np

    logo_rgba = _structured_logo(size=400, rgba=True)
    source = np.full((640, 640, 3), 150, dtype=np.uint8)
    source, _ = _paste_resized(source, logo_rgba, target_max_dim=94, x=250, y=180)

    resp = _run_localize(source, logo_rgba)

    marks = [d for d in resp.detections if d["t3777_code"] == "TEST_MARK"]
    assert len(marks) >= 1
    best = max(marks, key=lambda d: d["score"])
    assert abs(best["bbox"]["x"] - 250) <= 10
    assert abs(best["bbox"]["y"] - 180) <= 10


# ---------------------------------------------------------------------------
# AC5 (iv) — beste-schaal-collapse per (code, tegel) vóór NMS
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="RED: story 8.3R niet geïmplementeerd")
def test_best_scale_collapse_yields_single_detection_per_mark():
    """Eén geplante instantie mag bij een lage drempel (waar buur-schalen óók
    boven komen) precies ÉÉN detectie opleveren — IoU-NMS alleen redt dit
    niet (48px- vs 286px-box op zelfde centrum heeft IoU ≈ 0,03)."""
    import numpy as np

    logo = _structured_logo(size=400)
    source = np.full((640, 640, 3), 255, dtype=np.uint8)
    source, _ = _paste_resized(source, logo, target_max_dim=94, x=220, y=260)

    resp = _run_localize(source, logo, min_score=0.5)

    marks = [d for d in resp.detections if d["t3777_code"] == "TEST_MARK"]
    assert len(marks) == 1  # collapse + NMS: geen duplicaten op andere schalen


# ---------------------------------------------------------------------------
# AC5 (v) + AC3 — endpoint-contract: storage_path, 4xx, image_path weg
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="RED: story 8.3R niet geïmplementeerd")
def test_localize_endpoint_reads_storage_path_from_minio():
    """AC3: localize haalt het bronbeeld als MinIO-objectkey op via
    storage_service.get_training_image — zelfde semantiek als classify."""
    import cv2
    import numpy as np
    from app.api.artwork import localize_artwork, LocalizeRequest
    from app.services import storage as storage_module

    logo = _structured_logo(size=400)
    source = np.full((800, 800, 3), 255, dtype=np.uint8)
    source, _ = _paste_resized(source, logo, target_max_dim=60, x=300, y=400)
    png_bytes = cv2.imencode(".png", source)[1].tobytes()

    storage_module.storage_service.get_training_image = MagicMock(return_value=png_bytes)

    req = LocalizeRequest(
        storage_path="artwork/08710679005795/label.page-1.png",
        templates=[{"t3777_code": "TEST_MARK", "image_b64": _b64_png(logo)}],
    )
    resp = asyncio.run(localize_artwork(req))

    storage_module.storage_service.get_training_image.assert_called_once_with(
        "artwork/08710679005795/label.page-1.png"
    )
    assert len(resp.detections) >= 1


@pytest.mark.skip(reason="RED: story 8.3R niet geïmplementeerd")
def test_localize_endpoint_4xx_when_storage_fetch_fails():
    """AC3: onvindbare storage_path ⇒ duidelijke 4xx, geen stille lege lijst."""
    from fastapi import HTTPException
    from app.api.artwork import localize_artwork, LocalizeRequest
    from app.services import storage as storage_module

    storage_module.storage_service.get_training_image = MagicMock(
        side_effect=RuntimeError("not found")
    )

    req = LocalizeRequest(
        storage_path="artwork/missing/none.png",
        templates=[{"t3777_code": "X", "image_b64": _b64_png(_structured_logo(64))}],
    )
    try:
        asyncio.run(localize_artwork(req))
        assert False, "expected HTTPException(4xx)"
    except HTTPException as exc:
        assert 400 <= exc.status_code < 500


@pytest.mark.skip(reason="RED: story 8.3R niet geïmplementeerd")
def test_localize_request_no_longer_accepts_image_path():
    """AC3: het bestandssysteem-pad (`image_path`) is uit het contract
    verwijderd — MinIO-key of inline b64, niets anders."""
    from app.api.artwork import LocalizeRequest

    assert "image_path" not in LocalizeRequest.model_fields
    for tunable in ("tile_size", "overlap", "min_score"):
        assert tunable in LocalizeRequest.model_fields  # tunables ín het contract
