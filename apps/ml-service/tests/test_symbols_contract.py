import importlib.util
from pathlib import Path


module_path = Path(__file__).resolve().parents[1] / "app" / "symbol_contract.py"
spec = importlib.util.spec_from_file_location("symbol_contract", module_path)
symbol_contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(symbol_contract)
normalize_detections = symbol_contract.normalize_detections


def test_detect_symbols_contract_filters_unknown_codes_and_preserves_unknown_signal():
    profile = {"codes": ["EU_ORGANIC_FARMING"], "visionThreshold": 0.75}
    detections = normalize_detections(
        [
            {"code": "EU_ORGANIC_FARMING", "confidence": 0.91, "bbox": {"x": 1, "y": 2, "width": 3, "height": 4}, "method": "embedding"},
            {"code": "NOT_IN_T3777", "confidence": 0.99},
            {"code": "UNKNOWN", "confidence": 0.20, "bbox": {"x": 5, "y": 6, "width": 7, "height": 8}},
        ],
        profile,
        "embedding-v1+classifier-v1+refs-2026",
        12,
    )

    assert [item["code"] for item in detections] == ["EU_ORGANIC_FARMING", "UNKNOWN"]
    assert detections[0]["codelist"] == "T3777"
    assert detections[0]["modelVersion"] == "embedding-v1+classifier-v1+refs-2026"
    assert detections[1]["uncertain"] is True


def test_detect_symbols_contract_supports_ghs_and_nutriscore_tracks():
    profile = {"codelists": ["GHSSymbolDescriptionCode", "NutritionalScore"], "visionThreshold": 0.75}
    detections = normalize_detections(
        [
            {"code": "GHS02", "confidence": 0.94, "method": "classifier"},
            {"code": "A", "confidence": 0.92, "method": "embedding"},
            {"code": "NO_PICTOGRAM", "confidence": 0.99},
        ],
        profile,
        "model-v1",
        3,
    )

    assert [(item["code"], item["codelist"]) for item in detections] == [
        ("GHS02", "GHSSymbolDescriptionCode"),
        ("A", "NutritionalScore"),
    ]
