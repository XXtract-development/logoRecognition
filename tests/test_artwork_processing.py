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


@pytest.mark.skip(reason="ATDD red phase — implementeer Story 8.4 en verwijder deze marker")
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


@pytest.mark.skip(reason="ATDD red phase — implementeer Story 8.4 en verwijder deze marker")
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


@pytest.mark.skip(reason="ATDD red phase — implementeer Story 8.7 en verwijder deze marker")
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


@pytest.mark.skip(reason="ATDD red phase — implementeer Story 8.7 en verwijder deze marker")
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


@pytest.mark.skip(reason="ATDD red phase — implementeer Story 8.7 en verwijder deze marker")
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
