"""Official-template integration smoke, never independent holdout quality evidence."""

import asyncio
import base64
import importlib
import io
import sys
import types
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import numpy as np
import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def runtime(monkeypatch):
    package = types.ModuleType("app.services")
    package.__path__ = [str(ROOT / "app/services")]
    monkeypatch.setitem(sys.modules, "app.services", package)
    for name, attrs in {
        "app.core.logging": {"logger": Mock()},
        "app.ml.model_manager": {"model_manager": Mock(model_version="offline")},
        "app.ml.detector": {
            "LogoDetector": Mock(return_value=Mock(detect=AsyncMock(return_value=[])))
        },
        "app.services.database": {"db_service": Mock()},
        "app.services.storage": {"storage_service": Mock()},
        "app.services.artwork": {"DEFAULT_DPI": 150, "rasterize_pdf": Mock()},
    }.items():
        mod = types.ModuleType(name)
        for k, v in attrs.items():
            setattr(mod, k, v)
        monkeypatch.setitem(sys.modules, name, mod)
    for name in [
        "app.api.symbols",
        "app.api.artwork",
        "app.services.ghs_reference",
        "app.services.localization",
    ]:
        monkeypatch.delitem(sys.modules, name, raising=False)
    ref = importlib.import_module("app.services.ghs_reference")
    symbols = importlib.import_module("app.api.symbols")
    art = importlib.import_module("app.api.artwork")
    monkeypatch.setattr(
        art, "_get_reference_templates_cached", AsyncMock(return_value=[])
    )
    yield ref, symbols, art
    for name in [
        "app.api.symbols",
        "app.api.artwork",
        "app.services.ghs_reference",
        "app.services.localization",
    ]:
        sys.modules.pop(name, None)


@pytest.mark.parametrize(
    "code",
    [
        "EXPLODING_BOMB",
        "FLAME",
        "FLAME_OVER_CIRCLE",
        "GAS_CYLINDER",
        "CORROSION",
        "SKULL_AND_CROSSBONES",
        "EXCLAMATION_MARK",
        "HEALTH_HAZARD",
        "ENVIRONMENT",
    ],
)
def test_real_official_template_both_image_routes(runtime, code):
    ref, symbols, art = runtime
    b64 = base64.b64encode((ROOT / f"app/assets/ghs/{code}.png").read_bytes()).decode()
    symbol = asyncio.run(
        symbols.detect_symbols(
            symbols.SymbolRequest(
                image=b64, profile={"codelists": ["GHSSymbolDescriptionCode"]}
            )
        )
    )
    from app.symbol_contract import GHS_LEGACY

    assert [d.code for d in symbol.detections] == [GHS_LEGACY[code]]
    assert symbol.detections[0].method == "classifier"
    assert symbol.detections[0].modelVersion == "ccohs-ghs-v1"
    local = asyncio.run(art.localize_artwork(art.LocalizeRequest(image_b64=b64)))
    assert [d["t3777_code"] for d in local.detections] == [code]
    classified = ref.classify_ghs(Image.open(ROOT / f"app/assets/ghs/{code}.png"))
    assert classified["t3777_code"] == code and classified["requires_review"]
    response = asyncio.run(art.classify_artwork(art.ClassifyRequest(image_b64=b64)))
    assert (
        response.results[0].t3777_code == code
        and response.results[0].method == "ghs-reference"
        and response.results[0].reference_version == "ccohs-ghs-v1"
        and response.results[0].requires_review is True
    )


def test_g13_url_only_explicit_unsupported(runtime):
    _, symbols, _ = runtime
    from fastapi import HTTPException

    with pytest.raises(HTTPException, match="unsupported"):
        asyncio.run(
            symbols.detect_symbols(
                symbols.SymbolRequest(imageUrl="https://example.org/a.png")
            )
        )


def test_multi_official_composition_is_integration_only(runtime):
    ref, symbols, art = runtime
    canvas = Image.new("RGB", (650, 350), "white")
    for code, x in [("FLAME", 10), ("FLAME_OVER_CIRCLE", 335)]:
        image = Image.open(ROOT / f"app/assets/ghs/{code}.png").convert("RGBA")
        canvas.paste(image, (x, 20), image)
    output = io.BytesIO()
    canvas.save(output, format="PNG")
    b64 = base64.b64encode(output.getvalue()).decode()
    response = asyncio.run(art.localize_artwork(art.LocalizeRequest(image_b64=b64)))
    assert {d["t3777_code"] for d in response.detections} == {
        "FLAME",
        "FLAME_OVER_CIRCLE",
    }
    response2 = asyncio.run(
        symbols.detect_symbols(
            symbols.SymbolRequest(
                image=b64, profile={"codelists": ["GHSSymbolDescriptionCode"]}
            )
        )
    )
    assert {d.code for d in response2.detections} == {"GHS02", "GHS03"}


def test_nested_ghs_diamond_inside_larger_red_label_frame(runtime):
    ref, _, _ = runtime
    from PIL import ImageDraw

    image = Image.new("RGB", (600, 700), "white")
    ImageDraw.Draw(image).rectangle((5, 5, 595, 695), outline="red", width=12)
    symbol = Image.open(ROOT / "app/assets/ghs/EXCLAMATION_MARK.png").convert("RGBA")
    image.paste(symbol, (140, 190), symbol)
    assert [d["t3777_code"] for d in ref.detect_ghs(image)] == ["EXCLAMATION_MARK"]


def test_colored_artwork_holes_and_flower_shapes_are_not_ghs(runtime):
    ref, _, _ = runtime
    from PIL import ImageDraw

    for background in ["crimson", "orange", "purple"]:
        image = Image.new("RGB", (200, 200), background)
        draw = ImageDraw.Draw(image)
        draw.polygon(
            [(100, 15), (185, 100), (100, 185), (15, 100)],
            fill="orange",
            outline="red",
            width=8,
        )
        draw.text((90, 85), "!", fill="black")
        assert ref.detect_ghs(image) == []


@pytest.mark.parametrize(
    "profile", [{"codelists": ["GHSSymbolDescriptionCode"]}, {"codes": ["MSC"]}]
)
def test_legacy_detector_failure_is_explicit_even_with_real_ghs(runtime, profile):
    _, symbols, _ = runtime
    from fastapi import HTTPException

    symbols.LogoDetector.return_value.detect.side_effect = RuntimeError(
        "legacy detector unavailable"
    )
    b64 = base64.b64encode((ROOT / "app/assets/ghs/FLAME.png").read_bytes()).decode()
    with pytest.raises(HTTPException, match="legacy detector unavailable"):
        asyncio.run(
            symbols.detect_symbols(symbols.SymbolRequest(image=b64, profile=profile))
        )


@pytest.mark.parametrize("failure", ["missing", "corrupt"])
def test_broken_ghs_references_preserve_legacy_classification(
    runtime, monkeypatch, tmp_path, failure
):
    ref, _, _ = runtime
    import json

    classification = importlib.import_module("app.services.classification")
    ref.references.cache_clear()
    monkeypatch.setattr(ref, "ASSET_ROOT", tmp_path)
    if failure == "corrupt":
        manifest = json.loads((ROOT / "app/assets/ghs/manifest.json").read_text())
        (tmp_path / "manifest.json").write_text(json.dumps(manifest))
        (tmp_path / manifest["templates"][0]["file"]).write_bytes(b"corrupt image")
    legacy = {"t3777_code": "MSC", "confidence": 0.95, "method": "embedding"}
    monkeypatch.setattr(
        classification, "_classify_via_embedding", AsyncMock(return_value=legacy)
    )
    monkeypatch.setattr(classification, "logger", Mock())
    assert (
        asyncio.run(classification.classify_crop(Image.new("RGB", (80, 80), "white")))
        == legacy
    )
    classification.logger.warning.assert_called()
    ref.references.cache_clear()


@pytest.mark.parametrize(
    "crop",
    [
        np.zeros(5, dtype=np.uint8),
        np.zeros((10, 10), dtype=np.uint8),
        np.zeros((10, 10, 3), dtype=np.float32),
    ],
)
def test_unsupported_ghs_array_preserves_legacy_route(runtime, monkeypatch, crop):
    _, _, _ = runtime
    classification = importlib.import_module("app.services.classification")
    legacy = {"t3777_code": "MSC", "confidence": 0.95, "method": "embedding"}
    monkeypatch.setattr(
        classification, "_classify_via_embedding", AsyncMock(return_value=legacy)
    )
    assert asyncio.run(classification.classify_crop(crop)) == legacy
