"""Specialist/normal-route contracts; generated examples are integration evidence only."""

import asyncio
import base64
import hashlib
import importlib.util
import json
import sys
import types
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import cv2
import numpy as np
import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


@pytest.fixture
def runtime(monkeypatch):
    package = types.ModuleType("app.services")
    package.__path__ = [str(ROOT / "app/services")]
    monkeypatch.setitem(sys.modules, "app.services", package)
    specialist = module(ROOT / "app/services/ghs_specialist.py", "test_specialist")
    monkeypatch.setitem(sys.modules, "app.services.ghs_specialist", specialist)
    reference = module(ROOT / "app/services/ghs_reference.py", "test_reference")
    monkeypatch.setitem(sys.modules, "app.services.ghs_reference", reference)
    for name, attrs in {
        "app.core.config": {
            "settings": types.SimpleNamespace(
                CONFIDENCE_THRESHOLD=0.99, NMS_THRESHOLD=0.5, MAX_DETECTIONS=100
            )
        },
        "app.core.logging": {"logger": Mock()},
        "app.ml.model_manager": {
            "model_manager": Mock(
                model_version="legacy-v1", detect=AsyncMock(return_value=[])
            )
        },
    }.items():
        fake = types.ModuleType(name)
        for key, value in attrs.items():
            setattr(fake, key, value)
        monkeypatch.setitem(sys.modules, name, fake)
    detector = module(ROOT / "app/ml/detector.py", "test_detector")
    monkeypatch.setitem(sys.modules, "app.ml.detector", detector)
    training = module(ROOT / "scripts/train_ghs_specialist.py", "test_training")
    return specialist, reference, detector, training


@pytest.mark.parametrize(
    "code",
    [
        "FLAME",
        "EXPLODING_BOMB",
        "FLAME_OVER_CIRCLE",
        "GAS_CYLINDER",
        "CORROSION",
        "SKULL_AND_CROSSBONES",
        "EXCLAMATION_MARK",
        "HEALTH_HAZARD",
        "ENVIRONMENT",
    ],
)
def test_official_glyph_and_normal_api_integration(runtime, code):
    specialist, reference, detector, _ = runtime
    image = Image.open(ROOT / f"app/assets/ghs/{code}.png").convert("RGB")
    bgr = reference._bgr(image)
    x, y, w, h = max(reference.regions(bgr), key=lambda b: b[2] * b[3])
    learned = specialist.classify(bgr[y : y + h, x : x + w])
    assert learned and learned["t3777_code"] == code
    assert learned["requires_review"]
    assert learned["uncertain"] == (learned["score"] < 0.87)
    manager = Mock(detect=AsyncMock(return_value=[]))
    results = asyncio.run(
        detector.LogoDetector(manager).detect(image, confidence_threshold=0.01)
    )
    assert len(results) == 1 and results[0]["value"] == code
    assert results[0]["category"] == "GHSSymbolDescriptionCode"
    assert results[0]["requires_review"] and results[0]["model_version"]


def test_threshold_proposals_and_no_score_inflation(runtime, monkeypatch):
    _, reference, detector, _ = runtime
    image = Image.new("RGB", (60, 60), "white")
    proposal = {
        "t3777_code": "CORROSION",
        "bbox": {"x": 2, "y": 2, "width": 30, "height": 30},
        "confidence": 0.82,
        "reference_version": "frozen-v1",
        "method": "ghs-specialist",
    }
    monkeypatch.setattr(reference, "detect_ghs", lambda image: [proposal])
    manager = Mock(detect=AsyncMock(return_value=[]))
    service = detector.LogoDetector(manager)
    assert asyncio.run(service.detect(image)) == []
    result = asyncio.run(service.detect(image, include_review_proposals=True))
    assert result[0]["confidence"] == 0.82 and result[0]["uncertain"]
    api = module(ROOT / "app/api/detection.py", "test_detection_api")
    response = asyncio.run(
        api.detect_logos(
            api.DetectionRequest(image=base64.b64encode(_png(image)).decode())
        )
    )
    assert response.detections == [] and len(response.review_proposals) == 1
    assert response.review_proposals[0].confidence == 0.82
    assert response.review_proposals[0].requires_review


def _png(image):
    import io

    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_other_logos_unchanged_and_ghs_duplicate_only(runtime, monkeypatch):
    _, reference, detector, _ = runtime
    box = {"x": 2, "y": 2, "width": 30, "height": 30}
    legacy = {"category": "brand", "value": "OTHER", "confidence": 0.96, "bbox": box}
    duplicate = {
        "category": "GHSSymbolDescriptionCode",
        "value": "GHS05",
        "confidence": 0.94,
        "bbox": {**box, "x": 3},
    }
    manager = Mock(
        detect=AsyncMock(return_value=[legacy.copy(), duplicate]),
        generate_embedding=AsyncMock(return_value=np.ones(4)),
    )
    reference_proposal = {
        "t3777_code": "CORROSION",
        "bbox": box,
        "confidence": 0.95,
        "reference_version": "frozen-v1",
    }
    monkeypatch.setattr(reference, "detect_ghs", lambda image: [reference_proposal])
    results = asyncio.run(
        detector.LogoDetector(manager).detect(
            Image.new("RGB", (60, 60)), confidence_threshold=0.9
        )
    )
    assert results[0] == legacy
    assert len(results) == 2 and results[1]["value"] == "CORROSION"
    from app.symbol_contract import normalize_detections

    normalized = normalize_detections(
        [duplicate, results[1]],
        {"codelists": ["GHSSymbolDescriptionCode"]},
        "legacy",
        1,
    )
    assert len(normalized) == 1


@pytest.mark.parametrize("threshold", [float("nan"), float("inf"), -0.1, 1.1])
def test_invalid_threshold_rejected_before_detection(runtime, threshold):
    _, _, detector, _ = runtime
    manager = Mock(detect=AsyncMock(return_value=[]))
    with pytest.raises(ValueError, match="finite"):
        asyncio.run(
            detector.LogoDetector(manager).detect(
                Image.new("RGB", (60, 60)), confidence_threshold=threshold
            )
        )
    manager.detect.assert_not_called()


def test_zero_threshold_preserves_explicit_zero(runtime):
    _, _, detector, _ = runtime
    result = {
        "category": "brand",
        "value": "low",
        "confidence": 0.1,
        "bbox": {"x": 2, "y": 2, "width": 20, "height": 20},
    }
    manager = Mock(detect=AsyncMock(return_value=[result]))
    assert asyncio.run(
        detector.LogoDetector(manager).detect(
            Image.new("RGB", (60, 60)), confidence_threshold=0
        )
    ) == [result]


def test_same_word_brand_is_not_removed(runtime, monkeypatch):
    _, reference, detector, _ = runtime
    box = {"x": 2, "y": 2, "width": 30, "height": 30}
    legacy = {"category": "brand", "value": "FLAME", "confidence": 0.96, "bbox": box}
    proposal = {
        "t3777_code": "FLAME",
        "bbox": box,
        "confidence": 0.95,
        "reference_version": "frozen",
    }
    monkeypatch.setattr(reference, "detect_ghs", lambda image: [proposal])
    results = asyncio.run(
        detector.LogoDetector(Mock(detect=AsyncMock(return_value=[legacy]))).detect(
            Image.new("RGB", (60, 60)), confidence_threshold=0.9
        )
    )
    assert results[0] == legacy and len(results) == 2


def test_stronger_legacy_ghs_is_not_demoted(runtime, monkeypatch):
    _, reference, detector, _ = runtime
    box = {"x": 2, "y": 2, "width": 30, "height": 30}
    legacy = {
        "category": "GHSSymbolDescriptionCode",
        "value": "GHS02",
        "confidence": 0.995,
        "bbox": box,
    }
    proposal = {
        "t3777_code": "FLAME",
        "bbox": box,
        "confidence": 0.82,
        "reference_version": "frozen",
    }
    monkeypatch.setattr(reference, "detect_ghs", lambda image: [proposal])
    results = asyncio.run(
        detector.LogoDetector(
            Mock(detect=AsyncMock(return_value=[legacy]), model_version="old")
        ).detect(Image.new("RGB", (60, 60)), include_review_proposals=True)
    )
    assert len(results) == 1 and results[0]["confidence"] == 0.995
    assert results[0]["value"] == "GHS02" and results[0]["requires_review"]


def test_specialist_failure_is_transactional(runtime, monkeypatch):
    _, reference, detector, _ = runtime
    box = {"x": 2, "y": 2, "width": 30, "height": 30}
    legacy = {"category": "brand", "value": "OTHER", "confidence": 0.96, "bbox": box}
    proposal = {
        "t3777_code": "FLAME",
        "bbox": box,
        "confidence": 0.95,
        "reference_version": "frozen",
    }
    monkeypatch.setattr(
        reference,
        "detect_ghs",
        lambda image: [proposal, {**proposal, "confidence": float("nan")}],
    )
    results = asyncio.run(
        detector.LogoDetector(Mock(detect=AsyncMock(return_value=[legacy]))).detect(
            Image.new("RGB", (60, 60)), confidence_threshold=0.9
        )
    )
    assert results == [legacy]


def test_unknown_and_empty_glyphs_abstain(runtime):
    specialist, reference, _, _ = runtime
    blank = np.full((128, 128, 3), 255, np.uint8)
    assert specialist.classify(blank) is None
    for mode in ["circle", "rectangle", "text"]:
        image = blank.copy()
        if mode == "circle":
            cv2.circle(image, (64, 64), 22, (0, 0, 0), 3)
        elif mode == "rectangle":
            cv2.rectangle(image, (42, 45), (82, 78), (0, 0, 0), 4)
        else:
            cv2.putText(
                image, "42", (40, 78), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2
            )
        assert specialist.classify(image) is None
    assert reference.detect_ghs(Image.new("RGB", (200, 200), "red")) == []


@pytest.mark.parametrize("failure", ["missing", "checksum", "nonfinite"])
def test_broken_artifact_falls_back_to_template(
    runtime, monkeypatch, tmp_path, failure
):
    specialist, reference, _, _ = runtime
    data = (specialist.ARTIFACT_ROOT / "model.json").read_bytes()
    if failure != "missing":
        if failure == "nonfinite":
            model = json.loads(data)
            model["weights"][0][0] = float("nan")
            data = json.dumps(model).encode()
        (tmp_path / "model.json").write_bytes(data)
        (tmp_path / "manifest.json").write_text(
            json.dumps(
                {
                    "sha256": "wrong"
                    if failure == "checksum"
                    else hashlib.sha256(data).hexdigest()
                }
            )
        )
    monkeypatch.setattr(specialist, "ARTIFACT_ROOT", tmp_path)
    specialist.load_model.cache_clear()
    with pytest.raises((ValueError, FileNotFoundError)):
        specialist.classify(cv2.imread(str(ROOT / "app/assets/ghs/FLAME.png")))
    image = Image.open(ROOT / "app/assets/ghs/FLAME.png")
    assert reference.detect_ghs(image)[0]["t3777_code"] == "FLAME"


def test_training_split_guards_and_source_authorisation(runtime):
    _, _, _, training = runtime
    samples = training.official_samples(ROOT / "app/assets/ghs")
    training.validate_samples(samples)
    duplicate = {**samples[0], "split": "validation", "officialReference": False}
    with pytest.raises(ValueError, match="crosses"):
        training.validate_samples(samples + [duplicate])
    with pytest.raises(ValueError, match="authorised"):
        training.validate_samples([{**samples[0], "trainingAllowed": False}])


def test_training_deterministic_order_and_provenance(runtime):
    _, _, _, training = runtime
    samples = training.official_samples(ROOT / "app/assets/ghs")
    a = training.train(samples, augmentation_count=2)
    b = training.train(list(reversed(samples)), augmentation_count=2)
    assert a == b
    assert a["provenance"]["independentFieldGroups"] == 0
    assert not a["provenance"]["fieldCalibration"]


def test_candidate_limit_preserves_pixel_boxes(runtime):
    _, reference, _, _ = runtime
    original = Image.open(ROOT / "app/assets/ghs/FLAME.png").convert("RGBA")
    canvas = Image.new("RGB", (2700, 2700), "white")
    for y in range(0, 2700, 300):
        for x in range(0, 2700, 300):
            canvas.paste(original, (x, y), original)
    results = reference.detect_ghs(canvas)
    assert 1 <= len(results) <= reference.MAX_CANDIDATES
    for result in results:
        box = result["bbox"]
        assert 0 <= box["x"] < canvas.width and box["x"] + box["width"] <= canvas.width
        assert (
            0 <= box["y"] < canvas.height and box["y"] + box["height"] <= canvas.height
        )


def test_real_learned_recovery_reaches_normal_api(runtime):
    specialist, reference, _, _ = runtime
    original = cv2.imread(str(ROOT / "app/assets/ghs/SKULL_AND_CROSSBONES.png"))
    varied = cv2.erode(original, np.ones((2, 2), np.uint8))
    image = Image.fromarray(cv2.cvtColor(varied, cv2.COLOR_BGR2RGB))
    detections = reference.detect_ghs(image)
    assert len(detections) == 1
    result = detections[0]
    assert (
        result["t3777_code"] == "SKULL_AND_CROSSBONES"
        and result["method"] == "ghs-specialist"
    )
    assert result["requires_review"] and not result["uncertain"]
    assert result["reference_version"] == specialist.load_model()[0]["version"]
    assert 0.99 <= result["confidence"] <= 1
    api = module(ROOT / "app/api/detection.py", "test_recovery_api")
    response = asyncio.run(
        api.detect_logos(
            api.DetectionRequest(image=base64.b64encode(_png(image)).decode())
        )
    )
    assert len(response.detections) == 1 and response.review_proposals == []
    assert response.detections[0].method == "ghs-specialist"
    assert response.detections[0].value == "SKULL_AND_CROSSBONES"
    assert response.detections[0].requires_review
    assert response.detections[0].model_version == result["reference_version"]


def test_uncertainty_means_low_score_not_uncalibrated(runtime):
    _, reference, _, _ = runtime
    original = cv2.imread(str(ROOT / "app/assets/ghs/EXPLODING_BOMB.png"))
    varied = cv2.erode(original, np.ones((4, 4), np.uint8))
    result = reference.detect_ghs(varied)[0]
    assert (
        result["method"] == "ghs-specialist"
        and result["t3777_code"] == "EXPLODING_BOMB"
    )
    assert 0.70 <= result["score"] < 0.87 and result["uncertain"]
    assert result["confidence_kind"] == "uncalibrated-classifier-score"
    assert result["requires_review"]


def test_large_image_restores_known_original_coordinates(runtime):
    _, reference, _, _ = runtime
    original = Image.open(ROOT / "app/assets/ghs/FLAME.png").convert("RGBA")
    x, y, w, h = max(
        reference.regions(reference._bgr(original)), key=lambda b: b[2] * b[3]
    )
    canvas = Image.new("RGB", (2700, 2700), "white")
    canvas.paste(original, (1100, 1500), original)
    result = reference.detect_ghs(canvas)
    assert len(result) == 1 and result[0]["t3777_code"] == "FLAME"
    box = result[0]["bbox"]
    assert abs(box["x"] - (1100 + x)) <= 4
    assert abs(box["y"] - (1500 + y)) <= 4
    assert abs(box["width"] - w) <= 6 and abs(box["height"] - h) <= 6


def test_weight_change_invalidates_frozen_protocol_before_exposure(tmp_path):
    import shutil
    import subprocess

    service = tmp_path / "service"
    for relative in [
        "scripts/ghs_eval.py",
        "app/symbol_contract.py",
        "app/ghs_dataset.py",
        "app/ghs_evaluation.py",
        "app/services/ghs_reference.py",
        "app/services/ghs_specialist.py",
        "app/services/reference_category.py",
    ]:
        destination = service / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, destination)
    shutil.copytree(ROOT / "app/assets/ghs", service / "app/assets/ghs")
    shutil.copyfile(
        ROOT.parent / "api/src/services/reference-code-mapping.json",
        service / "reference-code-mapping.json",
    )
    manifest = tmp_path / "data.json"
    manifest.write_text(
        json.dumps({"version": "empty", "annotationVersion": "1", "samples": []})
    )
    protocol = tmp_path / "protocol.json"
    command = [
        sys.executable,
        str(service / "scripts/ghs_eval.py"),
        "freeze",
        "--manifest",
        str(manifest),
        "--protocol",
        str(protocol),
        "--output",
        str(tmp_path / "result.json"),
    ]
    assert subprocess.run(command, capture_output=True).returncode == 0
    weights = service / "app/assets/ghs/specialist/model.json"
    weights.write_bytes(weights.read_bytes() + b" ")
    command[2] = "evaluate"
    result = subprocess.run(command, capture_output=True)
    assert result.returncode != 0 and b"Frozen protocol changed" in result.stderr
    assert not (tmp_path / "result.json").exists()
