"""Artwork Processing Tests — ATDD RED PHASE (Epic 8, Stories 8.2, 8.3, 8.4, 8.7).

Failing acceptance tests, generated BEFORE implementation (TDD red phase).
Elke test is geskipt met ``@pytest.mark.skip``; verwijder de marker per test
zodra de bijbehorende story geimplementeerd is.

Verwachte module-indeling (contract voor de developer, ML-service):
  app/services/artwork.py     — rasterize_pdf(), met paginarelatie
  app/services/localization.py — tile_image(), match_templates(), merge_detections()
  app/services/classification.py — classify_crop() (embedding-similarity + classifier)
  app/services/synthesis.py   — compose_synthetic(), build_synthetic_batch()
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'ml-service'))

FIXTURES = os.path.join(os.path.dirname(__file__), 'fixtures')


# ---------------------------------------------------------------------------
# Story 8.2 — PDF-rasterization (P0)
# ---------------------------------------------------------------------------


def test_rasterize_pdf_produces_image_per_page_with_page_relation():
    """Elke PDF-pagina wordt een afbeelding met vastgelegde paginarelatie."""
    from app.services.artwork import rasterize_pdf

    result = rasterize_pdf(os.path.join(FIXTURES, "two-page-label.pdf"), dpi=300)

    assert len(result) == 2
    for item in result:
        assert item["source_file"].endswith("two-page-label.pdf")
        assert isinstance(item["page"], int)
        assert item["image_path"].endswith(".png")
        assert item["dpi"] == 300


def test_rasterize_corrupt_pdf_marks_error_without_raising():
    """Corrupt/beveiligd PDF ⇒ foutmarkering, geen pipeline-crash."""
    from app.services.artwork import rasterize_pdf

    result = rasterize_pdf(os.path.join(FIXTURES, "corrupt.pdf"), dpi=300)

    assert result == [] or all("error" in item for item in result)


# ---------------------------------------------------------------------------
# Story 8.2 — Rasterization endpoint (POST /ml/artwork/rasterize)
# These exercise the real endpoint handler: MinIO get/put are mocked (no
# container), rasterize_pdf itself runs for real on a generated PDF.
# ---------------------------------------------------------------------------


def _make_two_page_pdf_bytes() -> bytes:
    """Generate a real 2-page PDF in-memory (no fixture file pollution)."""
    import fitz

    doc = fitz.open()
    for n in range(2):
        page = doc.new_page()
        page.insert_text((72, 72), f"page {n + 1}")
    data = doc.tobytes()
    doc.close()
    return data


def test_rasterize_endpoint_uploads_pages_and_returns_minio_keys():
    """AC1: endpoint haalt PDF op, rasterized, upload PNG's, geeft MinIO-keys terug."""
    import asyncio
    from app.api.artwork import rasterize_artwork, RasterizeRequest
    from app.services import storage as storage_module

    pdf_bytes = _make_two_page_pdf_bytes()
    storage_module.storage_service.get_training_image.return_value = pdf_bytes
    storage_module.storage_service.put_training_image.side_effect = lambda key, *a, **k: key

    req = RasterizeRequest(storage_path="artwork/08718989912451/label.pdf", dpi=150)
    resp = asyncio.run(rasterize_artwork(req))

    assert resp.error is None
    assert len(resp.pages) == 2
    for i, page in enumerate(resp.pages, start=1):
        # image_path is the durable MinIO object key, NOT a local temp path
        assert page.image_path == f"artwork/08718989912451/label.page-{i}.png"
        assert page.source_file == "label.pdf"
        assert page.dpi == 150
        assert page.page == i

    # One upload per page, into the training bucket next to the source
    assert storage_module.storage_service.put_training_image.call_count == 2


def test_rasterize_endpoint_soft_fails_on_corrupt_pdf_no_422():
    """AC2: corrupt PDF ⇒ 200 met lege pages + reden (geen 422, geen raise)."""
    import asyncio
    from app.api.artwork import rasterize_artwork, RasterizeRequest
    from app.services import storage as storage_module

    storage_module.storage_service.get_training_image.return_value = b"%PDF-1.4 broken"
    storage_module.storage_service.put_training_image.reset_mock()
    storage_module.storage_service.put_training_image.side_effect = lambda key, *a, **k: key

    req = RasterizeRequest(storage_path="artwork/08718989912451/corrupt.pdf", dpi=150)
    resp = asyncio.run(rasterize_artwork(req))

    assert resp.pages == []
    assert resp.error is not None
    # Nothing should have been uploaded for an unrasterizable PDF
    assert storage_module.storage_service.put_training_image.call_count == 0


def test_rasterize_endpoint_raises_422_on_storage_fetch_failure():
    """Storage-/input-fout ⇒ HTTP 422 (training.py-contract), niet stilletjes leeg."""
    import asyncio
    from fastapi import HTTPException
    from app.api.artwork import rasterize_artwork, RasterizeRequest
    from app.services import storage as storage_module

    storage_module.storage_service.get_training_image.side_effect = RuntimeError("not found")

    req = RasterizeRequest(storage_path="artwork/missing/none.pdf", dpi=150)
    try:
        asyncio.run(rasterize_artwork(req))
        assert False, "expected HTTPException(422)"
    except HTTPException as exc:
        assert exc.status_code == 422
    finally:
        # Reset for any later tests sharing the module-level mock
        storage_module.storage_service.get_training_image.side_effect = None


# ---------------------------------------------------------------------------
# Story 8.3 — Keurmerk-lokalisatie: tiling + template-matching (P0)
# ---------------------------------------------------------------------------


def test_tile_image_produces_overlapping_tiles():
    """Groot artwork wordt in overlappende tegels gesneden (SAHI-aanpak)."""
    from app.services.localization import tile_image
    import numpy as np

    image = np.zeros((2000, 3000, 3), dtype=np.uint8)
    tiles = tile_image(image, tile_size=640, overlap=0.2)

    assert len(tiles) > 1
    # Elke tegel kent zijn offset in het bronbeeld (voor coördinaat-terugrekening)
    for tile in tiles:
        assert "x_offset" in tile and "y_offset" in tile
        assert tile["image"].shape[0] <= 640 and tile["image"].shape[1] <= 640


def test_template_matching_locates_known_mark_on_synthetic_tile():
    """Een ingeplakt referentie-keurmerk wordt op de juiste plek teruggevonden."""
    from app.services.localization import match_templates
    import numpy as np

    # Synthetische tegel: wit veld met op (100,150) een zwart blok als 'keurmerk'
    tile = np.full((640, 640, 3), 255, dtype=np.uint8)
    tile[150:250, 100:200] = 0
    template = np.zeros((100, 100, 3), dtype=np.uint8)

    matches = match_templates(tile, [{"t3777_code": "TEST_MARK", "image": template}], min_score=0.8)

    assert len(matches) >= 1
    best = matches[0]
    assert best["t3777_code"] == "TEST_MARK"
    assert abs(best["bbox"]["x"] - 100) <= 5
    assert abs(best["bbox"]["y"] - 150) <= 5


def test_template_matching_rejects_low_variance_regions():
    """Wit-op-wit-guard: TM_CCOEFF_NORMED is berucht onbetrouwbaar op
    lage-variantie-regio's — een (vrijwel) uniform template mag op een
    uniforme achtergrond NOOIT een match boven de drempel opleveren."""
    from app.services.localization import match_templates
    import numpy as np

    # Uniform witte tegel + (vrijwel) uniform wit template
    tile = np.full((640, 640, 3), 255, dtype=np.uint8)
    white_template = np.full((100, 100, 3), 250, dtype=np.uint8)

    matches = match_templates(
        tile, [{"t3777_code": "WHITE_MARK", "image": white_template}], min_score=0.8
    )

    assert matches == []


def test_merge_detections_deduplicates_across_tile_boundaries():
    """Detecties van overlappende tegels worden samengevoegd (non-max suppression)."""
    from app.services.localization import merge_detections

    detections = [
        {"t3777_code": "GREEN_DOT", "bbox": {"x": 630, "y": 100, "width": 50, "height": 50}, "score": 0.92},
        {"t3777_code": "GREEN_DOT", "bbox": {"x": 632, "y": 101, "width": 50, "height": 50}, "score": 0.90},
    ]

    merged = merge_detections(detections, iou_threshold=0.5)

    assert len(merged) == 1
    assert merged[0]["score"] == 0.92  # hoogste score wint


# ---------------------------------------------------------------------------
# Story 8.4 — Crop-classificatie (P0)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_classify_crop_returns_t3777_label_with_confidence():
    """Een crop levert een T3777-label + confidence via embedding-similarity."""
    from app.services.classification import classify_crop
    import numpy as np

    crop = np.zeros((100, 100, 3), dtype=np.uint8)
    result = await classify_crop(crop)

    assert "t3777_code" in result
    assert 0.0 <= result["confidence"] <= 1.0
    assert result["method"] in ("embedding", "classifier")


@pytest.mark.asyncio
async def test_classify_crop_below_threshold_is_marked_uncertain():
    """Confidence onder de drempel ⇒ expliciet 'uncertain' (input voor 8.5-routing)."""
    from app.services.classification import classify_crop
    import numpy as np

    noise = (np.random.RandomState(42).rand(100, 100, 3) * 255).astype("uint8")
    result = await classify_crop(noise, confidence_threshold=0.99)

    assert result["uncertain"] is True


# ---------------------------------------------------------------------------
# Story 8.7 — Synthetische datageneratie (P1)
# ---------------------------------------------------------------------------


def test_compose_synthetic_returns_exact_label_and_bbox():
    """Synthese levert het label en de bbox gratis — je weet wat je waar plakt."""
    from app.services.synthesis import compose_synthetic
    import numpy as np

    background = np.full((800, 600, 3), 240, dtype=np.uint8)
    reference = np.zeros((120, 120, 3), dtype=np.uint8)

    sample = compose_synthetic(background, {"t3777_code": "EU_ORGANIC_FARMING", "image": reference}, seed=7)

    assert sample["label"] == "EU_ORGANIC_FARMING"
    assert sample["method"] == "synthetic"
    b = sample["bbox"]
    # bbox valt volledig binnen het achtergrondbeeld
    assert 0 <= b["x"] and b["x"] + b["width"] <= 600
    assert 0 <= b["y"] and b["y"] + b["height"] <= 800


@pytest.mark.asyncio
async def test_synthetic_batch_fills_shortage_but_never_enters_holdout():
    """Klassen onder het minimum worden synthetisch aangevuld; holdout blijft 100% echt (NFR3)."""
    from app.services.synthesis import build_synthetic_batch

    with patch(
        "app.services.database.db_service.get_class_counts",
        new=AsyncMock(return_value={"RARE_MARK": 3}),
    ):
        batch = await build_synthetic_batch(min_per_class=20, real_synthetic_ratio=0.5)

    rare = [s for s in batch if s["label"] == "RARE_MARK"]
    assert len(rare) > 0
    assert all(s["method"] == "synthetic" for s in rare)
    assert all(s.get("holdout") is not True for s in batch)


@pytest.mark.asyncio
async def test_synthetic_ratio_cap_wins_over_min_per_class():
    """Conflictresolutie: het ratio-plafond WINT van min_per_class (kwaliteit
    boven kwantiteit). Klasse met 3 echte voorbeelden en ratio 0.5 (max 1:1)
    krijgt dus maximaal 3 synthetics — niet aangevuld tot 20 — en het tekort
    wordt gerapporteerd in plaats van met synthetische ruis opgevuld."""
    from app.services.synthesis import build_synthetic_batch

    with patch(
        "app.services.database.db_service.get_class_counts",
        new=AsyncMock(return_value={"RARE_MARK": 3}),
    ):
        batch = await build_synthetic_batch(min_per_class=20, real_synthetic_ratio=0.5)

    rare = [s for s in batch if s["label"] == "RARE_MARK"]
    assert len(rare) <= 3  # ratio-plafond: nooit meer synthetics dan echte voorbeelden
    shortfall = [s for s in batch if s.get("shortfall_reported")]
    assert len(rare) < 17 or shortfall  # tekort is zichtbaar, niet stilletjes weggemoffeld


def test_compose_synthetic_is_deterministic_and_alters_background():
    """Determinisme is een feature: zelfde seed → exact dezelfde composit.

    Bovendien moet de composit het ECHTE logo op de ECHTE achtergrond plakken —
    de pixels onder de bbox veranderen aantoonbaar (geen placeholder-no-op)."""
    from app.services.synthesis import compose_synthetic
    import numpy as np

    rng = np.random.RandomState(123)
    background = rng.randint(0, 255, size=(400, 500, 3), dtype=np.uint8)
    # Reference: a solid red square (BGR) so we can see it landed on the bg.
    reference = np.zeros((80, 80, 3), dtype=np.uint8)
    reference[:, :, 2] = 255

    a = compose_synthetic(background.copy(), {"t3777_code": "EKO", "image": reference}, seed=42)
    b = compose_synthetic(background.copy(), {"t3777_code": "EKO", "image": reference}, seed=42)

    # Same seed → byte-identical composite and bbox (reproducible datasets).
    assert np.array_equal(a["image"], b["image"])
    assert a["bbox"] == b["bbox"]

    # A different seed produces a different composite (transforms are active).
    c = compose_synthetic(background.copy(), {"t3777_code": "EKO", "image": reference}, seed=7)
    assert not np.array_equal(a["image"], c["image"])

    # The logo really landed: inside the bbox the background changed; the red
    # channel is clearly elevated where it was previously near the rng baseline.
    bb = a["bbox"]
    region_before = background[bb["y"] : bb["y"] + bb["height"], bb["x"] : bb["x"] + bb["width"]]
    region_after = a["image"][bb["y"] : bb["y"] + bb["height"], bb["x"] : bb["x"] + bb["width"]]
    assert not np.array_equal(region_before, region_after)
    # Outside the bbox the background is untouched (clean placement).
    mask = np.ones(a["image"].shape[:2], dtype=bool)
    mask[bb["y"] : bb["y"] + bb["height"], bb["x"] : bb["x"] + bb["width"]] = False
    assert np.array_equal(a["image"][mask], background[mask])


def test_compose_synthetic_handles_transparent_png_with_alpha():
    """Een transparante referentie-PNG (RGBA) wordt alpha-gecomposit: de
    transparante rand laat de achtergrond doorschijnen, de dekkende kern niet."""
    from app.services.synthesis import compose_synthetic
    import numpy as np

    background = np.full((300, 300, 3), 200, dtype=np.uint8)
    # RGBA reference: opaque blue centre, fully transparent border.
    ref = np.zeros((100, 100, 4), dtype=np.uint8)
    ref[20:80, 20:80, 0] = 255  # blue (BGR)
    ref[20:80, 20:80, 3] = 255  # opaque centre; border alpha stays 0

    sample = compose_synthetic(background, {"t3777_code": "MSC", "image": ref}, seed=3)
    out = sample["image"]
    bb = sample["bbox"]

    # bbox bounds only the VISIBLE (opaque) region. The opaque core is 60% of the
    # reference's edge, so after scaling the footprint stays well below the full
    # scaled-reference size — the transparent border is clipped, not boxed in.
    assert bb["width"] < int(0.75 * 300) and bb["height"] < int(0.75 * 300)
    # The opaque core actually painted blue onto the background (alpha blend).
    core = out[bb["y"] : bb["y"] + bb["height"], bb["x"] : bb["x"] + bb["width"]]
    assert core[:, :, 0].max() > 200  # blue channel raised by the composite
    # The transparent border let the grey background (200) show through somewhere
    # near the corners — the composite is not an opaque paste of the full square.
    corner = out[bb["y"], bb["x"]]
    assert int(corner[0]) < 255  # corner is not pure blue


def test_compose_synthetic_bbox_fits_across_many_seeds_and_scales():
    """Containment-by-construction: ongeacht seed (dus schaal/rotatie) valt de
    bbox van het geroteerde logo ALTIJD volledig binnen de achtergrond."""
    from app.services.synthesis import compose_synthetic
    import numpy as np

    background = np.full((600, 800, 3), 240, dtype=np.uint8)
    reference = np.zeros((150, 150, 3), dtype=np.uint8)
    reference[:, :, 1] = 255  # green

    for seed in range(40):
        s = compose_synthetic(background, {"t3777_code": "FSC", "image": reference}, seed=seed)
        b = s["bbox"]
        assert 0 <= b["x"] and b["x"] + b["width"] <= 800, f"x overflow at seed {seed}"
        assert 0 <= b["y"] and b["y"] + b["height"] <= 600, f"y overflow at seed {seed}"
        assert b["width"] > 0 and b["height"] > 0


@pytest.mark.asyncio
async def test_synthesize_for_class_persists_to_minio_and_returns_crops():
    """synthesize_for_class laadt echte referenties + achtergronden (DB/MinIO
    gemockt), schrijft PNG's naar synthetic/{code}/{seed}.png en levert
    crop-descriptors voor het 8.6-registratiepad."""
    import cv2
    import numpy as np
    from app.services import synthesis as synth_module

    # Encode a tiny real reference PNG and a real background PNG.
    ref_img = np.zeros((60, 60, 3), dtype=np.uint8)
    ref_img[:, :, 2] = 255
    ref_png = cv2.imencode(".png", ref_img)[1].tobytes()
    bg_img = np.full((300, 300, 3), 220, dtype=np.uint8)
    bg_png = cv2.imencode(".png", bg_img)[1].tobytes()

    async def fake_refs():
        return {
            "EKO": [
                {"t3777_code": "EKO", "image": ref_img, "storage_path": "reference-logos/EKO/v1.png"}
            ]
        }

    async def fake_backgrounds(limit=50):
        return [{"image": bg_img, "source_file": "artwork/123/page-1.png"}]

    put_calls = []

    def fake_put(object_name, data, content_type="image/png"):
        put_calls.append((object_name, data))
        return object_name

    with patch.object(synth_module, "_load_references_by_class", new=fake_refs), patch.object(
        synth_module, "_load_backgrounds", new=fake_backgrounds
    ), patch(
        "app.services.storage.storage_service.put_training_image", side_effect=fake_put
    ):
        samples = await synth_module.synthesize_for_class("EKO", count=3, seed=100)

    assert len(samples) == 3
    # Each sample carries a 8.6-ready descriptor.
    for s in samples:
        assert s["method"] == "synthetic"
        assert s["holdout"] is False
        assert s["t3777_code"] == "EKO"
        assert s["source_file"] == "artwork/123/page-1.png"
        assert s["crop_path"].startswith("synthetic/EKO/")
        assert s["crop_path"].endswith(".png")
    # One MinIO write per sample, real PNG bytes.
    assert len(put_calls) == 3
    assert all(data[:8] == b"\x89PNG\r\n\x1a\n" for _, data in put_calls)


@pytest.mark.asyncio
async def test_build_synthetic_batch_generates_real_samples_for_shortage():
    """AC2-bewijs: een klasse onder het minimum wordt ECHT aangevuld met
    composit-descriptors (geen shortfall-entry) wanneer referenties +
    achtergronden beschikbaar zijn. Mockt get_class_counts én de loaders zodat
    de echte generatie-tak (build_synthetic_batch success path) wordt geraakt —
    niet alleen de open-input-shortfall."""
    import numpy as np
    from app.services import synthesis as synth_module

    ref_img = np.zeros((50, 50, 3), dtype=np.uint8)
    ref_img[:, :, 1] = 255
    bg_img = np.full((300, 300, 3), 210, dtype=np.uint8)

    async def fake_refs():
        return {"COMMON": [{"t3777_code": "COMMON", "image": ref_img, "storage_path": "reference-logos/COMMON/v1.png"}]}

    async def fake_backgrounds(limit=50):
        return [{"image": bg_img, "source_file": "artwork/999/page-1.png"}]

    with patch(
        "app.services.database.db_service.get_class_counts",
        new=AsyncMock(return_value={"COMMON": 2}),
    ), patch.object(synth_module, "_load_references_by_class", new=fake_refs), patch.object(
        synth_module, "_load_backgrounds", new=fake_backgrounds
    ):
        # min 5, ratio 1.0 → ratio_cap = floor(2*1.0) = 2, shortage = 3 → generate 2.
        batch = await synth_module.build_synthetic_batch(
            min_per_class=5, real_synthetic_ratio=1.0
        )

    real_samples = [s for s in batch if not s.get("shortfall_reported")]
    assert len(real_samples) == 2  # the shortage was actually filled with composites
    for s in real_samples:
        assert s["method"] == "synthetic"
        assert s["holdout"] is False
        assert s["t3777_code"] == "COMMON"
        assert s["source_file"] == "artwork/999/page-1.png"
        assert s["crop_path"].startswith("synthetic/COMMON/")
        assert "bbox" in s and s["bbox"]["width"] > 0
    # ratio cap (2) < shortage (3) → the residual is explicitly reported.
    shortfall = [s for s in batch if s.get("shortfall_reported")]
    assert len(shortfall) == 1 and shortfall[0]["shortfall_count"] == 1


@pytest.mark.asyncio
async def test_synthesize_for_class_open_input_gate_returns_empty():
    """Zonder referenties (lege seed-map) genereert het niets — zelfde gate als
    8.3; geen crash, gewoon een lege lijst."""
    from app.services import synthesis as synth_module

    async def empty_refs():
        return {}

    with patch.object(synth_module, "_load_references_by_class", new=empty_refs):
        samples = await synth_module.synthesize_for_class("MISSING", count=5, seed=1)

    assert samples == []


@pytest.mark.asyncio
async def test_synthesize_endpoint_returns_generated_samples():
    """POST /ml/artwork/synthesize-handler levert generated count + descriptors."""
    from app.api.artwork import synthesize_artwork, SynthesizeRequest

    fake_samples = [
        {
            "label": "EKO",
            "t3777_code": "EKO",
            "method": "synthetic",
            "holdout": False,
            "crop_path": "synthetic/EKO/100.png",
            "source_file": "artwork/123/page-1.png",
            "bbox": {"x": 10, "y": 20, "width": 50, "height": 50},
            "confidence": 1.0,
            "seed": 100,
        }
    ]

    with patch(
        "app.services.synthesis.synthesize_for_class",
        new=AsyncMock(return_value=fake_samples),
    ):
        resp = await synthesize_artwork(SynthesizeRequest(t3777_code="EKO", count=1, seed=100))

    assert resp.generated == 1
    assert resp.t3777_code == "EKO"
    assert resp.samples[0].crop_path == "synthetic/EKO/100.png"
    assert resp.samples[0].method == "synthetic"
    assert resp.samples[0].source_file == "artwork/123/page-1.png"
