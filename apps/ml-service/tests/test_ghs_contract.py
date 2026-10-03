import importlib.util
from pathlib import Path

import pytest

from app.symbol_contract import GHS_CODES, normalize_code, normalize_detections

_spec = importlib.util.spec_from_file_location(
    "reference_category",
    Path(__file__).resolve().parents[1] / "app/services/reference_category.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
resolve_reference_category = _mod.resolve_reference_category


@pytest.mark.parametrize(
    "i,name",
    enumerate(
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
        1,
    ),
)
def test_g01_pairs(i, name):
    assert normalize_code(f" ghs{i:02d} ") == name
    assert resolve_reference_category(f"ghs{i:02d}") == (
        name,
        "GHSSymbolDescriptionCode",
        "gHSSymbolDescriptionCode",
    )


def test_g02_explicit_and_dedup():
    raw = [
        {"code": c, "confidence": 0.99, "bbox": {"x": 1}}
        for c in ["GHS02", "FLAME", "GHS03", "MSC"]
    ]
    assert [
        d["code"]
        for d in normalize_detections(
            raw,
            {"codes": [" ghs02 "], "codelists": ["GHSSymbolDescriptionCode"]},
            "v",
            1,
        )
    ] == ["GHS02"]


@pytest.mark.parametrize("code", ["GHS00", "GHS10", "NO_PICTOGRAM"])
def test_g03_invalid_reference(code):
    with pytest.raises(ValueError):
        _mod.assert_positive_reference_code(code)
    assert (
        normalize_detections(
            [{"code": code, "confidence": 1}],
            {"codelists": ["GHSSymbolDescriptionCode"]},
            "v",
            0,
        )
        == []
    )


def test_g06_low_ghs_proposal_preserved_as_uncertain():
    result = normalize_detections(
        [{"code": "FLAME", "confidence": 0.2}],
        {"codelists": ["GHSSymbolDescriptionCode"], "visionThreshold": 0.75},
        "v",
        1,
    )
    assert result[0]["uncertain"] and result[0]["code"] == "GHS02"
