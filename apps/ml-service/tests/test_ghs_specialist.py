"""Specialist/normal-route contracts; generated examples are integration evidence only."""

import asyncio
import base64
import hashlib
import importlib.util
import json
import os
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
    if os.environ.get("GHS_TEST_ARTIFACT_ROOT"):
        specialist.ARTIFACT_ROOT = Path(os.environ["GHS_TEST_ARTIFACT_ROOT"]).resolve()
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
                    "sha256": (
                        "wrong"
                        if failure == "checksum"
                        else hashlib.sha256(data).hexdigest()
                    )
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
    a = training.train(samples, augmentation_count=2, bootstrap_reference_only=True)
    b = training.train(
        list(reversed(samples)), augmentation_count=2, bootstrap_reference_only=True
    )
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
    specialist, reference, _, _ = runtime
    original = cv2.imread(str(ROOT / "app/assets/ghs/EXPLODING_BOMB.png"))
    varied = cv2.erode(original, np.ones((4, 4), np.uint8))
    result = reference.detect_ghs(varied)[0]
    assert (
        result["method"] == "ghs-specialist"
        and result["t3777_code"] == "EXPLODING_BOMB"
    )
    policy = specialist.load_model()[0]["policy"]
    assert policy["uncertaintyScore"] == 0.87
    assert result["uncertain"] == (result["score"] < policy["uncertaintyScore"])
    assert result["support_similarity"] >= policy["minimumSupportSimilarity"]
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


def _shadowed_perspective_skull():
    original = cv2.imread(str(ROOT / "app/assets/ghs/SKULL_AND_CROSSBONES.png"))
    h, w = original.shape[:2]
    corners = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], np.float32)
    target = np.array([[42, 20], [w + 12, 2], [w - 8, h + 12], [2, h + 40]], np.float32)
    warped = cv2.warpPerspective(
        original,
        cv2.getPerspectiveTransform(corners, target),
        (w + 60, h + 60),
        borderValue=(255, 255, 255),
    )
    return (warped * 0.52).astype(np.uint8)


def test_shadowed_perspective_recovery_reaches_real_api(runtime):
    specialist, reference, _, _ = runtime
    bgr = _shadowed_perspective_skull()
    image = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    # Absolute white-interior rule cannot identify the shadowed photograph.
    assert reference.regions(bgr, minimum_white=0.5) == []
    result = reference.detect_ghs(bgr)
    assert len(result) == 1 and result[0]["t3777_code"] == "SKULL_AND_CROSSBONES"
    assert result[0]["reference_version"].endswith(":neutral-quad-v1")
    assert result[0]["model_version"] == specialist.load_model()[0]["version"]
    assert result[0]["confidence"] > 0.99 and not result[0]["uncertain"]
    candidates = reference._photo_candidates(bgr)
    expected_box = candidates[0][0][0]
    assert tuple(result[0]["bbox"].values()) == expected_box
    api = module(ROOT / "app/api/detection.py", "test_photo_recovery_api")
    response = asyncio.run(
        api.detect_logos(
            api.DetectionRequest(image=base64.b64encode(_png(image)).decode())
        )
    )
    assert len(response.detections) == 1 and not response.review_proposals
    detection = response.detections[0]
    assert detection.value == "SKULL_AND_CROSSBONES" and detection.requires_review
    assert detection.reference_version.endswith(":neutral-quad-v1")
    assert detection.model_version == result[0]["model_version"]


@pytest.mark.parametrize("background", [(130, 130, 130), (150, 100, 20)])
def test_photo_recovery_rejects_no_contrast_or_colored_background(runtime, background):
    _, reference, _, _ = runtime
    image = np.full((200, 200, 3), background, np.uint8)
    cv2.polylines(
        image,
        [np.array([[100, 10], [190, 100], [100, 190], [10, 100]])],
        True,
        (0, 0, 200),
        5,
    )
    assert reference.detect_ghs(image) == []


def test_photo_recovery_conflicting_strokes_abstain(runtime, monkeypatch):
    specialist, reference, _, _ = runtime
    group = [((5, 5, 100, 100), None), ((15, 15, 80, 80), None)]
    monkeypatch.setattr(reference, "_photo_candidates", lambda image: [group])
    monkeypatch.setattr(
        reference, "_photo_glyph", lambda *args: np.zeros((128, 128, 3), np.uint8)
    )
    classes = iter(["FLAME", "HEALTH_HAZARD"])
    monkeypatch.setattr(
        specialist,
        "classify",
        lambda image: {
            "t3777_code": next(classes),
            "confidence": 0.99,
            "support_similarity": 0.9,
        },
    )
    assert (
        reference._photo_recovery(
            np.zeros((120, 120, 3), np.uint8), [], {"FLAME", "HEALTH_HAZARD"}
        )
        == []
    )


def test_photo_recovery_does_not_reprocess_strong_existing(runtime, monkeypatch):
    specialist, reference, _, _ = runtime
    box = (5, 5, 100, 100)
    monkeypatch.setattr(reference, "_photo_candidates", lambda image: [[(box, None)]])
    classify = Mock(
        side_effect=AssertionError("Strong result should not be reprocessed")
    )
    monkeypatch.setattr(specialist, "classify", classify)
    existing = [
        {"bbox": dict(zip(["x", "y", "width", "height"], box)), "uncertain": False}
    ]
    assert (
        reference._photo_recovery(
            np.zeros((120, 120, 3), np.uint8), existing, {"FLAME"}
        )
        == []
    )
    classify.assert_not_called()


def test_photo_recovery_failure_preserves_legacy_results(runtime, monkeypatch):
    _, reference, _, _ = runtime
    image = Image.open(ROOT / "app/assets/ghs/FLAME.png")
    before = reference.detect_ghs(image)

    def fail(*args):
        raise ValueError("corrupt recovery artifact")

    monkeypatch.setattr(reference, "_photo_recovery", fail)
    assert reference.detect_ghs(image) == before


def test_photo_candidate_groups_and_strokes_are_bounded(runtime):
    _, reference, _, _ = runtime
    image = np.full((1200, 1200, 3), 130, np.uint8)
    for y in range(20, 1200, 80):
        for x in range(20, 1200, 80):
            quad = np.array(
                [[x + 20, y], [x + 40, y + 20], [x + 20, y + 40], [x, y + 20]]
            )
            cv2.polylines(image, [quad], True, (0, 0, 200), 3)
    groups = reference._photo_candidates(image)
    assert len(groups) == reference.MAX_CANDIDATES
    assert all(1 <= len(group) <= 2 for group in groups)
    assert reference.detect_ghs(image) == []


def test_two_nearby_recovery_diamonds_remain_independent(runtime):
    _, reference, _, _ = runtime
    glyph = _shadowed_perspective_skull()
    h, w = glyph.shape[:2]
    canvas = np.full((h + 40, 2 * w + 55, 3), 133, np.uint8)
    canvas[20 : 20 + h, 20 : 20 + w] = glyph
    canvas[20 : 20 + h, 35 + w : 35 + 2 * w] = glyph
    detections = reference.detect_ghs(canvas)
    assert len(detections) == 2
    assert all(d["t3777_code"] == "SKULL_AND_CROSSBONES" for d in detections)
    boxes = sorted([d["bbox"] for d in detections], key=lambda b: b["x"])
    assert boxes[1]["x"] - boxes[0]["x"] == w + 15


@pytest.mark.parametrize("mode", ["text", "rectangle", "open-border", "low-resolution"])
def test_photo_recovery_rejects_artwork_and_missing_information(runtime, mode):
    _, reference, _, _ = runtime
    image = np.full((200, 200, 3), 130, np.uint8)
    cv2.polylines(
        image,
        [np.array([[100, 10], [190, 100], [100, 190], [10, 100]])],
        True,
        (0, 0, 200),
        5,
    )
    if mode == "rectangle":
        cv2.rectangle(image, (70, 75), (130, 125), (0, 0, 0), 5)
    else:
        cv2.putText(image, "42", (60, 118), cv2.FONT_HERSHEY_SIMPLEX, 1.3, (0, 0, 0), 3)
    if mode == "open-border":
        cv2.rectangle(image, (82, 0), (118, 25), (130, 130, 130), -1)
    if mode == "low-resolution":
        image = cv2.resize(image, (25, 25), interpolation=cv2.INTER_AREA)
        assert reference._photo_candidates(image) == []
    assert reference.detect_ghs(image) == []


def test_photo_recovery_failure_after_first_candidate_is_transactional(
    runtime, monkeypatch
):
    _, reference, _, _ = runtime
    image = Image.open(ROOT / "app/assets/ghs/FLAME.png")
    before = reference.detect_ghs(image)

    def partial_then_fail(*args):
        yield {
            "t3777_code": "SKULL_AND_CROSSBONES",
            "confidence": 0.99,
            "bbox": {"x": 0, "y": 0, "width": 50, "height": 50},
        }
        raise ValueError("second candidate failed")

    monkeypatch.setattr(reference, "_photo_recovery", partial_then_fail)
    assert reference.detect_ghs(image) == before


def test_total_classifier_calls_are_globally_bounded(runtime, monkeypatch):
    specialist, reference, _, _ = runtime
    glyph = _shadowed_perspective_skull()
    h, w = glyph.shape[:2]
    canvas = np.full((h * 10, w * 10, 3), 133, np.uint8)
    for y in range(10):
        for x in range(10):
            canvas[y * h : (y + 1) * h, x * w : (x + 1) * w] = glyph
    classify = Mock(return_value=None)
    monkeypatch.setattr(specialist, "classify", classify)
    assert reference.detect_ghs(canvas) == []
    assert 1 <= classify.call_count <= 3 * reference.MAX_CANDIDATES


def test_large_photo_recovery_restores_independent_original_bbox(runtime):
    _, reference, _, _ = runtime
    glyph = _shadowed_perspective_skull()
    hsv = cv2.cvtColor(glyph, cv2.COLOR_BGR2HSV)
    red = cv2.inRange(hsv, (0, 90, 65), (12, 255, 255)) | cv2.inRange(
        hsv, (165, 90, 65), (180, 255, 255)
    )
    ys, xs = np.where(red > 0)
    # Expected original box uses all known red source pixels, not candidate/scaling helpers.
    expected = {
        "x": 1200 + int(xs.min()),
        "y": 1800 + int(ys.min()),
        "width": int(xs.max() - xs.min() + 1),
        "height": int(ys.max() - ys.min() + 1),
    }
    canvas = np.full((3100, 2900, 3), 133, np.uint8)
    h, w = glyph.shape[:2]
    canvas[1800 : 1800 + h, 1200 : 1200 + w] = glyph
    detections = reference.detect_ghs(canvas)
    assert len(detections) == 1
    result = detections[0]
    assert result["t3777_code"] == "SKULL_AND_CROSSBONES"
    assert result["reference_version"].endswith(":neutral-quad-v1")
    assert not result["uncertain"]
    assert all(abs(result["bbox"][key] - expected[key]) <= 5 for key in expected)


def _qualified_production_fixture(training, tmp_path):
    """Synthetic contract fixture; never actual-production training evidence."""
    image = np.full((170, 230, 3), 255, np.uint8)
    reference = cv2.imread(str(ROOT / "app/assets/ghs/EXCLAMATION_MARK.png"))
    reference = cv2.resize(reference, (80, 80))
    image[20:100, 20:100] = reference
    image[65:145, 125:205] = reference
    path = tmp_path / "unit-fixture-not-production.png"
    cv2.imwrite(str(path), image)
    row = {
        "sourceId": "unit-fixture-not-production",
        "imagePath": str(path),
        "sha256": training.digest(path),
        "familyId": "unit-fixture-family",
        "split": "train",
        "code": "EXCLAMATION_MARK",
        "bbox": {"x": 20, "y": 20, "width": 80, "height": 80},
        "sourceType": "production-product",
        "trainingAllowed": True,
        "labelStatus": "qualified-production-ai-reviewed",
        "provenance": {
            "origin": "mongodb-prod",
            "productIdentity": "00000000000001",
            "sourceURL": "fixture://not-an-actual-production-source",
            "license": "Synthetic unit fixture, no actual-production claim",
            "authorization": {
                "basis": "explicit-user-request",
                "date": "2026-10-05",
                "scope": "internal-ghs-training",
            },
            "qualification": {
                "status": "qualified",
                "sha256": "pending",
                "evidencePath": "pending",
                "reviewerIds": ["unit-review-a", "unit-review-b"],
                "context": "product-symbol",
            },
        },
    }

    return _bind_production_fixture(training, row, tmp_path)


def _bind_production_fixture(training, row, tmp_path, *, crop=False):
    import copy

    row = copy.deepcopy(row)
    folder = tmp_path / f"qualification-{len(list(tmp_path.glob('qualification-*')))}"
    folder.mkdir()
    q = row["provenance"]["qualification"]
    image = {"path": row["imagePath"], "sha256": row["sha256"]}
    raw_bbox = row["bbox"]
    source = cv2.imread(row["imagePath"])
    if crop:
        x, y, w, h = (int(row["bbox"][k]) for k in ("x", "y", "width", "height"))
        source = source[y : y + h, x : x + w]
        crop_path = folder / "raw-crop.png"
        cv2.imwrite(str(crop_path), source)
        image.update(
            path=str(crop_path), sha256=training.digest(crop_path), cropBbox=row["bbox"]
        )
        raw_bbox = {"x": 0, "y": 0, "width": w, "height": h}
    raw = {
        "httpStatus": 200,
        "imageSha256": image["sha256"],
        "response": {
            "status": "ai-reviewed",
            "image": {
                "sha256": image["sha256"],
                "width": source.shape[1],
                "height": source.shape[0],
            },
            "reviews": [
                {
                    "reviewId": reviewer,
                    "status": "succeeded",
                    "projectedAnnotations": [
                        {"code": row["code"], "bbox": raw_bbox, "uncertain": False}
                    ],
                }
                for reviewer in q["reviewerIds"]
            ],
        },
    }
    raw_path = folder / "synthetic-unit-raw-review.json"
    raw_path.write_text(json.dumps(raw))
    record = {
        "schema": "ghs-production-qualification-v1",
        "status": "qualified",
        "context": "product-symbol",
        "humanGold": False,
        "sourceHintsSent": False,
        "sourceSha256": row["sha256"],
        "code": row["code"],
        "bbox": row["bbox"],
        "productIdentity": row["provenance"]["productIdentity"],
        "reviewerIds": q["reviewerIds"],
        "reviewEvidence": {"path": str(raw_path), "sha256": training.digest(raw_path)},
        "reviewingImage": image,
    }
    record_path = folder / "synthetic-unit-qualification.json"
    record_path.write_text(json.dumps(record))
    q.update(evidencePath=str(record_path), sha256=training.digest(record_path))
    return row


def test_normal_training_requires_production_and_explicit_bootstrap(runtime):
    _, _, _, training = runtime
    samples = training.official_samples(ROOT / "app/assets/ghs")
    with pytest.raises(ValueError, match="requires qualified production"):
        training.train(samples, augmentation_count=2)
    bootstrap = training.train(
        samples, augmentation_count=2, bootstrap_reference_only=True
    )
    assert bootstrap["provenance"]["bootstrapReferenceOnly"]
    assert bootstrap["provenance"]["usedProductionExamples"] == 0


def test_production_contributes_actual_rows_and_crop_order_is_deterministic(
    runtime, tmp_path
):
    _, _, _, training = runtime
    official = training.official_samples(ROOT / "app/assets/ghs")
    a = _qualified_production_fixture(training, tmp_path)
    b = {
        **a,
        "sourceId": "second-crop",
        "bbox": {"x": 125, "y": 65, "width": 80, "height": 80},
    }
    b = _bind_production_fixture(training, b, tmp_path)
    first = training.train(official + [a, b], augmentation_count=2)
    second = training.train(list(reversed(official + [a, b])), augmentation_count=2)
    assert first == second
    p = first["provenance"]
    assert not p["bootstrapReferenceOnly"]
    assert p["productionExamples"] == p["usedProductionExamples"] == 2
    assert p["productionFamilies"] == p["usedProductionFamilies"] == 1
    assert p["productionImages"] == p["usedProductionImages"] == 1
    assert p["productionTrainingRows"] == 6 and p["productionAugmentedRows"] == 4
    assert (
        p["trainingRows"]
        == p["productionTrainingRows"]
        + p["officialReferenceTrainingRows"]
        + p["otherTrainingRows"]
        + 400
    )
    bootstrap = training.train(
        official, augmentation_count=2, bootstrap_reference_only=True
    )
    assert first["weights"] != bootstrap["weights"]
    assert first["policy"] == bootstrap["policy"]


def test_production_metadata_without_feature_contribution_fails(
    runtime, monkeypatch, tmp_path
):
    _, _, _, training = runtime
    a = _qualified_production_fixture(training, tmp_path)
    # Only train split is decoded; constant blank annotations yield no usable features.
    blank = np.full((100, 100, 3), 255, np.uint8)
    path = tmp_path / "blank.png"
    cv2.imwrite(str(path), blank)
    a.update(
        imagePath=str(path),
        sha256=training.digest(path),
        bbox={"x": 0, "y": 0, "width": 100, "height": 100},
    )
    a = _bind_production_fixture(training, a, tmp_path)
    with pytest.raises(ValueError, match="contributed feature vectors"):
        training.train(
            training.official_samples(ROOT / "app/assets/ghs") + [a],
            augmentation_count=2,
        )


@pytest.mark.parametrize("field", ["authorization", "qualification", "productIdentity"])
def test_unqualified_production_cannot_be_silently_trained(runtime, tmp_path, field):
    _, _, _, training = runtime
    a = _qualified_production_fixture(training, tmp_path)
    a["provenance"].pop(field)
    with pytest.raises(ValueError, match="qualified visible|canonical 14-digit"):
        training.train(
            training.official_samples(ROOT / "app/assets/ghs") + [a],
            augmentation_count=2,
        )


def test_same_production_product_cannot_escape_family_guard(runtime, tmp_path):
    _, _, _, training = runtime
    a = _qualified_production_fixture(training, tmp_path)
    b = {
        **a,
        "familyId": "fake-other-family",
        "bbox": {"x": 125, "y": 65, "width": 80, "height": 80},
    }
    b = _bind_production_fixture(training, b, tmp_path)
    with pytest.raises(ValueError, match="identity crosses"):
        training.validate_samples([a, b])
    a["split"] = "validation"
    with pytest.raises(ValueError, match="requires qualified production"):
        training.train(
            training.official_samples(ROOT / "app/assets/ghs") + [a],
            augmentation_count=2,
        )


@pytest.mark.parametrize("coordinate", [float("nan"), float("inf"), -0.1, 9999])
def test_training_bbox_is_finite_and_inside_real_image(runtime, tmp_path, coordinate):
    _, _, _, training = runtime
    a = _qualified_production_fixture(training, tmp_path)
    a["bbox"]["x"] = coordinate
    if np.isfinite(coordinate) and coordinate >= 0:
        a = _bind_production_fixture(training, a, tmp_path)
    with pytest.raises(ValueError, match="Source box"):
        training.train(
            training.official_samples(ROOT / "app/assets/ghs") + [a],
            augmentation_count=2,
        )


def test_cli_refuses_missing_production_and_preserves_frozen_output(tmp_path):
    import subprocess

    output = tmp_path / "output"
    command = [
        sys.executable,
        str(ROOT / "scripts/train_ghs_specialist.py"),
        "--output",
        str(output),
        "--augmentations",
        "2",
    ]
    result = subprocess.run(command, capture_output=True)
    assert result.returncode != 0 and b"qualified production manifest" in result.stderr
    assert not output.exists()
    output.mkdir()
    frozen = output / "model.json"
    frozen.write_bytes(b"unchanged frozen output")
    result = subprocess.run(
        command + ["--bootstrap-reference-only"], capture_output=True
    )
    assert result.returncode != 0 and b"Refusing to overwrite" in result.stderr
    assert frozen.read_bytes() == b"unchanged frozen output"


def test_production_training_does_not_decode_validation_family(
    runtime, tmp_path, monkeypatch
):
    _, _, _, training = runtime
    train_row = _qualified_production_fixture(training, tmp_path)
    validation = _qualified_production_fixture(training, tmp_path)
    validation_path = tmp_path / "validation.png"
    image = cv2.imread(validation["imagePath"])
    image[0, 0] = (1, 2, 3)
    cv2.imwrite(str(validation_path), image)
    validation.update(
        imagePath=str(validation_path),
        sha256=training.digest(validation_path),
        familyId="validation-family",
        split="validation",
        trainingAllowed=False,
    )
    validation["provenance"]["productIdentity"] = "00000000000002"
    validation = _bind_production_fixture(training, validation, tmp_path)
    original = training.cv2.imread
    decoded = []

    def record(path):
        decoded.append(path)
        assert path != str(
            validation_path
        ), "Validation family must not be decoded during training"
        return original(path)

    monkeypatch.setattr(training.cv2, "imread", record)
    result = training.train(
        training.official_samples(ROOT / "app/assets/ghs") + [train_row, validation],
        augmentation_count=2,
    )
    assert str(train_row["imagePath"]) in decoded
    assert result["provenance"]["usedProductionExamples"] == 1
    assert result["provenance"]["productionFamilies"] == 1


def test_qualification_hash_or_disputed_context_cannot_train(runtime, tmp_path):
    _, _, _, training = runtime
    row = _qualified_production_fixture(training, tmp_path)
    row["provenance"]["qualification"]["context"] = "ingredient"
    with pytest.raises(ValueError, match="qualified visible"):
        training.validate_samples([row])
    row["provenance"]["qualification"]["context"] = "product-symbol"
    Path(row["provenance"]["qualification"]["evidencePath"]).write_text(
        "changed qualification evidence"
    )
    with pytest.raises(ValueError, match="evidence checksum"):
        training.validate_samples([row])


def test_same_production_annotation_cannot_inflate_example_count(runtime, tmp_path):
    _, _, _, training = runtime
    row = _qualified_production_fixture(training, tmp_path)
    with pytest.raises(ValueError, match="Duplicate production annotation"):
        training.validate_samples(
            [row, {**row, "sourceId": "different-id-same-annotation"}]
        )


@pytest.mark.parametrize(
    "target_score,expected_uncertain",
    [
        (0.82, True),
        (np.nextafter(0.87, 0), True),
        (np.nextafter(0.87, 1), False),
        (0.92, False),
    ],
)
def test_actual_classifier_uncertainty_boundary_with_controlled_logits(
    runtime, monkeypatch, target_score, expected_uncertain
):
    specialist, reference, _, _ = runtime
    image = cv2.imread(str(ROOT / "app/assets/ghs/FLAME.png"))
    x, y, w, h = max(reference.regions(image), key=lambda box: box[2] * box[3])
    crop = image[y : y + h, x : x + w]
    vector = specialist.features(crop)
    model, weights, bias, support = specialist.load_model()
    controlled = np.full(10, np.log((1 - target_score) / 9))
    controlled[model["labels"].index("FLAME")] = np.log(target_score)
    monkeypatch.setattr(
        specialist,
        "load_model",
        lambda: (model, np.zeros_like(weights), controlled, np.asarray([vector])),
    )
    learned = specialist.classify(crop)
    assert learned["t3777_code"] == "FLAME"
    assert learned["score"] == pytest.approx(target_score)
    assert learned["uncertain"] is expected_uncertain
    assert learned["confidence_kind"] == "uncalibrated-classifier-score"
    assert learned["requires_review"]


def test_noncanonical_production_gtin_cannot_hide_shared_family(runtime, tmp_path):
    _, _, _, training = runtime
    row = _qualified_production_fixture(training, tmp_path)
    row["provenance"]["productIdentity"] = "8720065008323"
    with pytest.raises(ValueError, match="canonical 14-digit GTIN"):
        training.validate_samples([row])


def test_equivalent_numeric_bboxes_cannot_inflate_production_training(
    runtime, tmp_path
):
    _, _, _, training = runtime
    row = _qualified_production_fixture(training, tmp_path)
    alias = {
        **row,
        "sourceId": "float-alias",
        "bbox": {key: float(value) for key, value in row["bbox"].items()},
    }
    with pytest.raises(ValueError, match="Duplicate production annotation"):
        training.validate_samples([row, alias])


@pytest.mark.parametrize("target_score", [0.82, 0.92])
def test_real_normal_api_respects_controlled_classifier_low_score(
    runtime, monkeypatch, target_score
):
    specialist, reference, _, _ = runtime
    bgr = cv2.erode(
        cv2.imread(str(ROOT / "app/assets/ghs/EXPLODING_BOMB.png")),
        np.ones((4, 4), np.uint8),
    )
    x, y, w, h = max(reference.regions(bgr), key=lambda box: box[2] * box[3])
    vector = specialist.features(bgr[y : y + h, x : x + w])
    model, weights, _, _ = specialist.load_model()
    logits = np.full(10, np.log((1 - target_score) / 9))
    logits[model["labels"].index("EXPLODING_BOMB")] = np.log(target_score)
    monkeypatch.setattr(
        specialist,
        "load_model",
        lambda: (model, np.zeros_like(weights), logits, np.asarray([vector])),
    )
    image = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    api = module(ROOT / "app/api/detection.py", "test_controlled_uncertainty_api")
    response = asyncio.run(
        api.detect_logos(
            api.DetectionRequest(
                image=base64.b64encode(_png(image)).decode(), confidence_threshold=0.87
            )
        )
    )
    results = response.review_proposals if target_score < 0.87 else response.detections
    assert len(results) == 1
    assert results[0].value == "EXPLODING_BOMB"
    assert results[0].method == "ghs-specialist"
    assert results[0].confidence == pytest.approx(target_score)
    assert results[0].uncertain is (target_score < 0.87)
    assert results[0].requires_review
    assert results[0].confidence_kind == "uncalibrated-classifier-score"
    assert (
        (not response.detections)
        if target_score < 0.87
        else (not response.review_proposals)
    )


def _small_gap_corrosion():
    image = cv2.imread(str(ROOT / "app/assets/ghs/CORROSION.png"))
    # A blue artwork guide interrupts a small part of one real red side.
    # The source glyph stays intact; no guide removal is performed by inference.
    cv2.rectangle(image, (74, 74), (88, 88), (255, 100, 0), -1)
    return image


def test_physically_nearly_complete_red_border_reaches_normal_api(runtime):
    specialist, reference, _, _ = runtime
    bgr = _small_gap_corrosion()
    assert reference.regions(bgr, 0.5) == []
    detection = reference.detect_ghs(bgr)
    assert len(detection) == 1
    result = detection[0]
    assert result["t3777_code"] == "CORROSION"
    assert result["reference_version"].endswith(":partial-quad-v1")
    assert result["model_version"] == specialist.load_model()[0]["version"]
    assert result["bbox"] == {"x": 7, "y": 10, "width": 276, "height": 276}
    assert result["confidence"] >= 0.87 and result["requires_review"]
    image = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    api = module(ROOT / "app/api/detection.py", "test_partial_border_api")
    response = asyncio.run(
        api.detect_logos(
            api.DetectionRequest(image=base64.b64encode(_png(image)).decode())
        )
    )
    matches = response.detections + response.review_proposals
    assert len(matches) == 1
    match = matches[0]
    assert match.value == "CORROSION" and match.requires_review
    assert match.confidence == pytest.approx(result["confidence"])
    assert match.reference_version.endswith(":partial-quad-v1")
    assert match.bbox.model_dump() == result["bbox"]
    assert bool(response.detections) is (result["confidence"] >= 0.99)
    assert bool(response.review_proposals) is (result["confidence"] < 0.99)
    at_review_threshold = asyncio.run(
        api.detect_logos(
            api.DetectionRequest(
                image=base64.b64encode(_png(image)).decode(), confidence_threshold=0.87
            )
        )
    )
    assert (
        len(at_review_threshold.detections) == 1
        and not at_review_threshold.review_proposals
    )
    assert at_review_threshold.detections[0].value == "CORROSION"
    assert at_review_threshold.detections[0].confidence == pytest.approx(
        result["confidence"]
    )
    assert not at_review_threshold.detections[0].uncertain


@pytest.mark.parametrize("mode", ["missing-side", "large-gap", "partial-artwork"])
def test_partial_border_does_not_invent_missing_edges_or_glyphs(runtime, mode):
    _, reference, _, _ = runtime
    image = np.full((200, 200, 3), 255, np.uint8)
    quad = np.array([[100, 10], [190, 100], [100, 190], [10, 100]])
    if mode == "missing-side":
        cv2.polylines(image, [quad], False, (0, 0, 220), 4)
    else:
        cv2.polylines(image, [quad], True, (0, 0, 220), 4)
        cv2.rectangle(image, (42, 42), (60, 60), (255, 255, 255), -1)
        if mode == "large-gap":
            cv2.rectangle(image, (25, 25), (78, 78), (255, 255, 255), -1)
    cv2.putText(image, "42", (60, 118), cv2.FONT_HERSHEY_SIMPLEX, 1.3, (0, 0, 0), 3)
    assert reference.detect_ghs(image) == []


def test_large_partial_border_preserves_original_source_coordinates(runtime):
    _, reference, _, _ = runtime
    image = _small_gap_corrosion()
    h, w = image.shape[:2]
    canvas = np.full((3100, 2900, 3), 255, np.uint8)
    canvas[1700 : 1700 + h, 1200 : 1200 + w] = image
    results = reference.detect_ghs(canvas)
    assert len(results) == 1
    assert results[0]["t3777_code"] == "CORROSION"
    assert results[0]["reference_version"].endswith(":partial-quad-v1")
    expected = {"x": 1207, "y": 1710, "width": 276, "height": 276}
    assert all(
        abs(results[0]["bbox"][key] - value) <= 5 for key, value in expected.items()
    )


def test_production_reference_cannot_supply_training_features(runtime, tmp_path):
    _, _, _, training = runtime
    row = _qualified_production_fixture(training, tmp_path)
    row["split"] = "reference"
    with pytest.raises(ValueError, match="cannot use the reference split"):
        training.train(
            training.official_samples(ROOT / "app/assets/ghs") + [row],
            augmentation_count=2,
        )


def test_concurrent_publication_claim_preserves_both_artifacts(
    runtime, tmp_path, monkeypatch
):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    _, _, _, training = runtime
    output = tmp_path / "concurrent-artifact"
    barrier = Barrier(2)
    payload = {
        "version": "concurrency-unit-fixture",
        "featureVersion": training.FEATURE_VERSION,
        "provenance": {
            "trainingRows": 1,
            "productionExamples": 1,
            "productionFamilies": 1,
        },
    }

    def simultaneous_training(*args, **kwargs):
        barrier.wait(timeout=10)
        return payload

    monkeypatch.setattr(training, "train", simultaneous_training)
    monkeypatch.setattr(
        sys, "argv", ["trainer", "--bootstrap-reference-only", "--output", str(output)]
    )
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(training.main) for _ in range(2)]
        failures = [f.exception(timeout=20) for f in futures]
    assert sum(error is None for error in failures) == 1
    assert sum(isinstance(error, FileExistsError) for error in failures) == 1
    frozen_model = (output / "model.json").read_bytes()
    frozen_manifest = (output / "manifest.json").read_bytes()
    assert json.loads(frozen_model) == payload
    assert (
        json.loads(frozen_manifest)["sha256"]
        == hashlib.sha256(frozen_model).hexdigest()
    )
    with pytest.raises(ValueError, match="Refusing to overwrite"):
        training.main()
    assert (output / "model.json").read_bytes() == frozen_model
    assert (output / "manifest.json").read_bytes() == frozen_manifest


@pytest.mark.parametrize("mode", ["missing-side", "large-gap"])
def test_physical_coverage_rejects_even_a_recognizable_real_glyph(runtime, mode):
    specialist, reference, _, _ = runtime
    image = cv2.imread(str(ROOT / "app/assets/ghs/CORROSION.png"))
    box = max(reference.regions(image), key=lambda b: b[2] * b[3])
    x, y, w, h = box
    if mode == "missing-side":
        cv2.line(image, (x + w // 2, y + h - 1), (x, y + h // 2), (255, 255, 255), 32)
    else:
        cv2.rectangle(image, (25, 25), (105, 105), (255, 255, 255), -1)
    learned = specialist.classify(image[y : y + h, x : x + w])
    assert learned and learned["t3777_code"] == "CORROSION"
    assert learned["score"] >= 0.87 and not learned["uncertain"]
    assert reference.detect_ghs(image) == []


@pytest.mark.parametrize(
    "field", ["code", "bbox", "sourceSha256", "productIdentity", "reviewerIds"]
)
def test_qualification_record_binds_exact_source_annotation(runtime, tmp_path, field):
    _, _, _, training = runtime
    row = _qualified_production_fixture(training, tmp_path)
    if field == "code":
        row["code"] = "GAS_CYLINDER"
    elif field == "bbox":
        row["bbox"]["x"] += 1
    elif field == "sourceSha256":
        row["sha256"] = "0" * 64
    elif field == "productIdentity":
        row["provenance"]["productIdentity"] = "00000000000002"
    else:
        row["provenance"]["qualification"]["reviewerIds"] = [
            "different-a",
            "different-b",
        ]
    with pytest.raises(ValueError, match="does not bind"):
        training.validate_samples([row])


@pytest.mark.parametrize(
    "mutation",
    [
        "wrong-code",
        "wrong-box",
        "uncertain",
        "failed-review",
        "wrong-id",
        "wrong-image",
        "http-failed",
        "raw-hash",
    ],
)
def test_qualification_requires_matching_successful_actual_raw_reviews(
    runtime, tmp_path, mutation
):
    _, _, _, training = runtime
    row = _qualified_production_fixture(training, tmp_path)
    q = row["provenance"]["qualification"]
    record_path = Path(q["evidencePath"])
    record = json.loads(record_path.read_text())
    raw_path = Path(record["reviewEvidence"]["path"])
    raw = json.loads(raw_path.read_text())
    review = raw["response"]["reviews"][1]
    if mutation == "wrong-code":
        review["projectedAnnotations"][0]["code"] = "GAS_CYLINDER"
    elif mutation == "wrong-box":
        review["projectedAnnotations"][0]["bbox"]["x"] = 9999
    elif mutation == "uncertain":
        review["projectedAnnotations"][0]["uncertain"] = True
    elif mutation == "failed-review":
        review["status"] = "failed"
    elif mutation == "wrong-id":
        review["reviewId"] = "someone-else"
    elif mutation == "wrong-image":
        raw["response"]["image"]["sha256"] = "0" * 64
    elif mutation == "http-failed":
        raw["httpStatus"] = 500
    if mutation == "raw-hash":
        raw["tampered"] = True
    raw_path.write_text(json.dumps(raw))
    if mutation != "raw-hash":
        record["reviewEvidence"]["sha256"] = training.digest(raw_path)
        record_path.write_text(json.dumps(record))
        q["sha256"] = training.digest(record_path)
    with pytest.raises(ValueError, match="Production"):
        training.validate_samples([row])


def test_reviewed_raw_crop_is_bound_to_original_source_pixels(runtime, tmp_path):
    _, _, _, training = runtime
    row = _qualified_production_fixture(training, tmp_path)
    row = _bind_production_fixture(training, row, tmp_path, crop=True)
    official = training.official_samples(ROOT / "app/assets/ghs")
    result = training.train(official + [row], augmentation_count=1)
    assert result["provenance"]["usedProductionExamples"] == 1
    q = row["provenance"]["qualification"]
    record_path = Path(q["evidencePath"])
    record = json.loads(record_path.read_text())
    crop_path = Path(record["reviewingImage"]["path"])
    crop = cv2.imread(str(crop_path))
    crop[0, 0] = (1, 2, 3)
    cv2.imwrite(str(crop_path), crop)
    altered_sha = training.digest(crop_path)
    record["reviewingImage"]["sha256"] = altered_sha
    raw_path = Path(record["reviewEvidence"]["path"])
    raw = json.loads(raw_path.read_text())
    raw["imageSha256"] = raw["response"]["image"]["sha256"] = altered_sha
    raw_path.write_text(json.dumps(raw))
    record["reviewEvidence"]["sha256"] = training.digest(raw_path)
    record_path.write_text(json.dumps(record))
    q["sha256"] = training.digest(record_path)
    with pytest.raises(ValueError, match="crop pixels differ"):
        training.train(official + [row], augmentation_count=1)


def test_production_imbalance_is_actually_balanced_in_fitting(
    runtime, tmp_path, monkeypatch
):
    _, _, _, training = runtime
    real = training.LogisticRegression
    calls = []

    def record(**kwargs):
        calls.append(kwargs)
        return real(**kwargs)

    monkeypatch.setattr(training, "LogisticRegression", record)
    row = _qualified_production_fixture(training, tmp_path)
    model = training.train(
        training.official_samples(ROOT / "app/assets/ghs") + [row], augmentation_count=2
    )
    assert calls[0]["class_weight"] == "balanced"
    p = model["provenance"]
    assert p["classWeightStrategy"] == "balanced"
    assert (
        p["classTrainingRows"]["EXCLAMATION_MARK"]
        > p["classTrainingRows"]["FLAME_OVER_CIRCLE"]
    )
    assert sum(p["classTrainingRows"].values()) == p["trainingRows"]
    for label, count in p["classTrainingRows"].items():
        assert count * p["effectiveClassWeights"][label] == pytest.approx(
            p["trainingRows"] / 10
        )
    assert p["usedProductionExamples"] == 1 and p["productionTrainingRows"] == 3


def test_projection_augmentation_preserves_original_and_deterministic_views(
    runtime, monkeypatch
):
    _, _, _, training = runtime
    image = cv2.imread(str(ROOT / "app/assets/ghs/FLAME_OVER_CIRCLE.png"))
    real_warp = training.cv2.warpAffine
    aspect_ratios = []

    def record_projection(image, matrix, *args, **kwargs):
        singular_values = np.linalg.svd(matrix[:, :2], compute_uv=False)
        aspect_ratios.append(singular_values.min() / singular_values.max())
        return real_warp(image, matrix, *args, **kwargs)

    monkeypatch.setattr(training.cv2, "warpAffine", record_projection)
    first = list(training.augment(image, np.random.default_rng(1729), 12))
    second = list(training.augment(image, np.random.default_rng(1729), 12))
    assert len(first) == 13
    assert (
        min(aspect_ratios) < 0.8
    ), "Uniform scale/rotation cannot cover curved-label compression"
    assert np.array_equal(
        first[0], cv2.resize(image, (128, 128), interpolation=cv2.INTER_AREA)
    )
    assert all(np.array_equal(a, b) for a, b in zip(first, second))
    assert all(
        a.shape == (128, 128, 3) and training.features(a) is not None for a in first
    )
    assert any(
        not np.allclose(training.features(a), training.features(first[0]))
        for a in first[1:]
    )


def _dense_public_fixture(ident):
    directory = ROOT / "tests/fixtures/ghs-dense-public"
    manifest = json.loads((directory / "attribution.json").read_text())
    row = next(row for row in manifest["images"] if row["id"] == ident)
    path = directory / row["file"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == row["sha256"]
    return cv2.imread(str(path)), row


@pytest.mark.parametrize(
    "ident", ["public-dev-009", "public-dev-011", "public-dev-018"]
)
def test_dense_public_health_has_white_edge_paper_and_reaches_api(
    runtime, monkeypatch, ident
):
    specialist, reference, _, _ = runtime
    image, row = _dense_public_fixture(ident)
    annotation = next(a for a in row["annotations"] if a["code"] == "HEALTH_HAZARD")
    expected = tuple(annotation["bbox"][k] for k in ["x", "y", "width", "height"])
    candidates = [
        c
        for g in reference._photo_candidates(image)
        for c in g
        if reference._overlap(c[0], expected) >= 0.5
    ]
    captured = []
    warp = cv2.warpPerspective

    def capture(*args, **kwargs):
        result = warp(*args, **kwargs)
        captured.append(result)
        return result

    monkeypatch.setattr(cv2, "warpPerspective", capture)
    accepted = []
    for box, quad, _ in candidates:
        diagnostics = {}
        glyph = reference._photo_glyph(image, box, quad, diagnostics)
        if (
            glyph is not None
            and diagnostics.get("preprocessing") == "edge-paper-ring-v1"
        ):
            accepted.append((glyph, captured[-1]))
    assert accepted
    glyph, rectified = accepted[0]
    gray = cv2.cvtColor(rectified, cv2.COLOR_BGR2GRAY)
    neutral = cv2.cvtColor(rectified, cv2.COLOR_BGR2HSV)[:, :, 1] < 85
    yy, xx = np.indices((128, 128))
    radius = abs(xx / 127 - 0.5) + abs(yy / 127 - 0.5)
    threshold, _ = cv2.threshold(
        gray[neutral & (radius < 0.4)], 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )
    white = neutral & (gray > threshold)
    assert white[(radius > 0.3) & (radius < 0.4)].mean() < 0.5
    ring = (radius > 0.4) & (radius < 0.46)
    for sector in [
        (xx >= 64) & (yy < 64),
        (xx >= 64) & (yy >= 64),
        (xx < 64) & (yy >= 64),
        (xx < 64) & (yy < 64),
    ]:
        assert white[ring & sector].mean() >= 0.65
    assert specialist.classify(glyph)["t3777_code"] == "HEALTH_HAZARD"
    api = module(ROOT / "app/api/detection.py", "test_dense_health_api")
    response = asyncio.run(
        api.detect_logos(
            api.DetectionRequest(
                image=base64.b64encode(
                    _png(Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB)))
                ).decode(),
                confidence_threshold=0.87,
            )
        )
    )
    predictions = response.detections + response.review_proposals
    health = [p for p in predictions if p.value == "HEALTH_HAZARD"]
    assert len(health) == 1
    assert (
        reference._overlap(tuple(health[0].bbox.model_dump().values()), expected) >= 0.5
    )
    assert health[0].reference_version.endswith(":edge-paper-ring-v1")
    assert health[0].model_version == specialist.load_model()[0]["version"]
    assert health[0].requires_review
    assert len(predictions) == len(row["annotations"])
    assert {p.value for p in predictions} == {a["code"] for a in row["annotations"]}


@pytest.mark.parametrize("color", [(0, 0, 0), (255, 80, 0)])
@pytest.mark.parametrize("sector_index", range(4))
def test_dense_edge_paper_requires_each_neutral_white_sector(
    runtime, color, sector_index
):
    _, reference, _, _ = runtime
    yy, xx = np.indices((128, 128))
    radius = abs(xx / 127 - 0.5) + abs(yy / 127 - 0.5)
    image = np.full((128, 128, 3), 255, np.uint8)
    image[(radius > 0.28) & (radius < 0.4)] = 0
    image[radius < 0.15] = 0
    sectors = [
        (xx >= 64) & (yy < 64),
        (xx >= 64) & (yy >= 64),
        (xx < 64) & (yy >= 64),
        (xx < 64) & (yy < 64),
    ]
    quad = np.array([[64, 0], [127, 64], [64, 127], [0, 64]], np.float32)
    diagnostics = {}
    assert (
        reference._photo_glyph(image, (0, 0, 128, 128), quad, diagnostics) is not None
    )
    assert diagnostics["preprocessing"] == "edge-paper-ring-v1"
    image[(radius > 0.4) & (radius < 0.46) & sectors[sector_index]] = color
    assert reference._photo_glyph(image, (0, 0, 128, 128), quad) is None


def test_dense_non_ghs_pattern_still_abstains(runtime):
    specialist, reference, _, _ = runtime
    yy, xx = np.indices((128, 128))
    radius = abs(xx / 127 - 0.5) + abs(yy / 127 - 0.5)
    image = np.full((128, 128, 3), 255, np.uint8)
    image[(radius > 0.28) & (radius < 0.4)] = 0
    image[radius < 0.15] = 0
    cv2.polylines(
        image,
        [np.array([[64, 0], [127, 64], [64, 127], [0, 64]])],
        True,
        (0, 0, 220),
        3,
    )
    quads = reference._photo_candidates(image)
    glyphs = [
        reference._photo_glyph(image, box, quad)
        for group in quads
        for box, quad, _ in group
    ]
    assert any(glyph is not None for glyph in glyphs)
    # Segmentation alone does not adjudicate semantics. This known artwork
    # obtains an uncertain classifier suggestion; the new route must reject it.
    learned = [specialist.classify(glyph) for glyph in glyphs if glyph is not None]
    assert all(result is None or result["uncertain"] for result in learned)
    assert reference.detect_ghs(image) == []
    api = module(ROOT / "app/api/detection.py", "test_dense_artwork_api")
    response = asyncio.run(
        api.detect_logos(
            api.DetectionRequest(
                image=base64.b64encode(
                    _png(Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB)))
                ).decode(),
                confidence_threshold=0.87,
            )
        )
    )
    assert not response.detections and not response.review_proposals


@pytest.mark.parametrize("mode", ["checker", "bars"])
def test_dense_unrelated_patterns_are_rejected_by_classifier(runtime, mode):
    specialist, reference, _, _ = runtime
    yy, xx = np.indices((128, 128))
    radius = abs(xx / 127 - 0.5) + abs(yy / 127 - 0.5)
    image = np.full((128, 128, 3), 255, np.uint8)
    pattern = ((xx // 7 + yy // 7) % 3 != 0) if mode == "checker" else (xx % 10 < 7)
    image[(radius < 0.4) & pattern] = 0
    cv2.polylines(
        image,
        [np.array([[64, 0], [127, 64], [64, 127], [0, 64]])],
        True,
        (0, 0, 220),
        3,
    )
    glyphs = []
    for group in reference._photo_candidates(image):
        for box, quad, _ in group:
            diagnostics = {}
            glyph = reference._photo_glyph(image, box, quad, diagnostics)
            if glyph is not None:
                assert diagnostics["preprocessing"] == "edge-paper-ring-v1"
                glyphs.append(glyph)
    assert glyphs
    assert all(specialist.classify(glyph) is None for glyph in glyphs)
    assert reference.detect_ghs(image) == []


@pytest.mark.parametrize("edge_route", [True, False])
@pytest.mark.parametrize("uncertain", [False, True, None])
def test_only_new_edge_paper_route_requires_existing_classifier_certainty(
    runtime, monkeypatch, edge_route, uncertain
):
    specialist, reference, _, _ = runtime
    monkeypatch.setattr(
        reference, "_photo_candidates", lambda image: [[((0, 0, 128, 128), None)]]
    )

    def glyph(image, box, quad, diagnostics):
        if edge_route:
            diagnostics["preprocessing"] = "edge-paper-ring-v1"
        return np.zeros((128, 128, 3), np.uint8)

    monkeypatch.setattr(reference, "_photo_glyph", glyph)
    learned = {
        "t3777_code": "HEALTH_HAZARD",
        "support_similarity": 0.8,
        "reference_version": "unit-fixture",
        "confidence": 0.95,
    }
    if uncertain is not None:
        learned["uncertain"] = uncertain
    monkeypatch.setattr(specialist, "classify", lambda image: learned)
    results = reference._photo_recovery(
        np.zeros((128, 128, 3), np.uint8), [], {"HEALTH_HAZARD"}
    )
    assert bool(results) is (not edge_route or uncertain is False)


def test_normal_paper_route_does_not_consult_contaminated_edge_ring(runtime):
    _, reference, _, _ = runtime
    yy, xx = np.indices((128, 128))
    radius = abs(xx / 127 - 0.5) + abs(yy / 127 - 0.5)
    image = np.full((128, 128, 3), 255, np.uint8)
    image[radius < 0.2] = 0
    image[(radius > 0.4) & (radius < 0.46)] = (255, 80, 0)
    quad = np.array([[64, 0], [127, 64], [64, 127], [0, 64]], np.float32)
    diagnostics = {}
    assert (
        reference._photo_glyph(image, (0, 0, 128, 128), quad, diagnostics) is not None
    )
    assert diagnostics == {}


@pytest.mark.parametrize("reverse", [False, True])
@pytest.mark.parametrize("routes", [(True, True), (True, False), (False, True)])
@pytest.mark.parametrize("conflict", [False, True])
def test_edge_certainty_preserves_all_stroke_conflicts_before_selection(
    runtime, monkeypatch, reverse, routes, conflict
):
    specialist, reference, _, _ = runtime
    uncertain_edge, confident_edge = routes
    strokes = [
        ((0, 0, 128, 128), (True, uncertain_edge)),
        ((10, 10, 108, 108), (False, confident_edge)),
    ]
    if reverse:
        strokes.reverse()
    monkeypatch.setattr(reference, "_photo_candidates", lambda image: [strokes])

    def glyph(image, box, quad, diagnostics):
        uncertain, edge = quad
        if edge:
            diagnostics["preprocessing"] = "edge-paper-ring-v1"
        return np.full((128, 128, 3), int(uncertain), np.uint8)

    def classify(image):
        uncertain = bool(image[0, 0, 0])
        return {
            "t3777_code": "HEALTH_HAZARD" if uncertain or not conflict else "FLAME",
            "support_similarity": 0.95 if uncertain else 0.75,
            "reference_version": "unit-fixture",
            "confidence": 0.75 if uncertain else 0.95,
            "uncertain": uncertain,
        }

    monkeypatch.setattr(reference, "_photo_glyph", glyph)
    monkeypatch.setattr(specialist, "classify", classify)
    results = reference._photo_recovery(
        np.zeros((128, 128, 3), np.uint8), [], {"HEALTH_HAZARD", "FLAME"}
    )
    if conflict:
        assert results == []
    else:
        assert len(results) == 1
        # An uncertain old-route result remains eligible; an uncertain new-route
        # result cannot win merely because its support is higher.
        assert results[0]["uncertain"] is (not uncertain_edge)
        assert results[0]["support_similarity"] == (0.75 if uncertain_edge else 0.95)


@pytest.mark.parametrize("sector_index", range(4))
@pytest.mark.parametrize("white_pixels", [283, 284])
def test_edge_paper_integer_pixel_boundary_with_local_contamination(
    runtime, sector_index, white_pixels
):
    _, reference, _, _ = runtime
    yy, xx = np.indices((128, 128))
    radius = abs(xx / 127 - 0.5) + abs(yy / 127 - 0.5)
    sectors = [
        (xx >= 64) & (yy < 64),
        (xx >= 64) & (yy >= 64),
        (xx < 64) & (yy >= 64),
        (xx < 64) & (yy < 64),
    ]
    ring = (radius > 0.4) & (radius < 0.46)
    affected = np.argwhere(ring & sectors[sector_index])
    assert len(affected) == 436
    image = np.full((128, 128, 3), 255, np.uint8)
    image[(radius > 0.28) & (radius < 0.4)] = 0
    image[radius < 0.15] = 0
    # Contaminate one local section of one side; the other sides stay all white.
    contaminated = affected[: len(affected) - white_pixels]
    image[contaminated[:, 0], contaminated[:, 1]] = 0
    white = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) > 0
    assert np.count_nonzero(white[ring & sectors[sector_index]]) == white_pixels
    for index, sector in enumerate(sectors):
        if index != sector_index:
            assert white[ring & sector].all()
    assert (white_pixels / len(affected) >= 0.65) is (white_pixels == 284)
    quad = np.array([[64, 0], [127, 64], [64, 127], [0, 64]], np.float32)
    diagnostics = {}
    glyph = reference._photo_glyph(image, (0, 0, 128, 128), quad, diagnostics)
    assert (glyph is not None) is (white_pixels == 284)
    assert bool(diagnostics) is (white_pixels == 284)
