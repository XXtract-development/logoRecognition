"""Small offline-trained GHS glyph classifier. Scores are not field probabilities."""

import hashlib
import json
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from app.symbol_contract import GHS_CODES

ARTIFACT_ROOT = Path(__file__).resolve().parents[1] / "assets/ghs/specialist"
FEATURE_VERSION = "ghs-glyph-hog-v1"
FEATURE_SIZE = 2020


def glyph(crop):
    """Remove shared red outline, centre the dark glyph without modifying sources."""
    if crop.ndim != 3 or crop.shape[2] != 3 or crop.dtype != np.uint8:
        raise ValueError("Expected RGB/BGR uint8 crop")
    resized = cv2.resize(crop, (128, 128), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    yy, xx = np.indices(gray.shape)
    interior = abs(xx / 127 - 0.5) + abs(yy / 127 - 0.5) < 0.405
    dark = (gray < 150) & (hsv[:, :, 1] < 130) & interior
    if dark.sum() < 10:
        return None
    ys, xs = np.where(dark)
    symbol = (
        dark[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].astype(np.uint8) * 255
    )
    height, width = symbol.shape
    side = max(height, width)
    square = np.zeros((side + 8, side + 8), np.uint8)
    y, x = (side - height) // 2 + 4, (side - width) // 2 + 4
    square[y : y + height, x : x + width] = symbol
    return cv2.resize(square, (64, 64), interpolation=cv2.INTER_AREA)


def features(crop):
    symbol = glyph(crop)
    if symbol is None:
        return None
    hog = cv2.HOGDescriptor((64, 64), (16, 16), (8, 8), (8, 8), 9)
    vector = np.concatenate(
        [
            hog.compute(symbol).reshape(-1),
            cv2.resize(symbol, (16, 16), interpolation=cv2.INTER_AREA).reshape(-1)
            / 255.0,
        ]
    ).astype(np.float64)
    norm = np.linalg.norm(vector)
    return vector / norm if norm else None


@lru_cache(maxsize=1)
def load_model():
    manifest = json.loads((ARTIFACT_ROOT / "manifest.json").read_text())
    path = ARTIFACT_ROOT / "model.json"
    if path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("GHS specialist artifact exceeds size limit")
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != manifest["sha256"]:
        raise ValueError("GHS specialist checksum mismatch")
    model = json.loads(data)
    labels = model["labels"]
    if (
        set(labels) != GHS_CODES | {"UNKNOWN"}
        or len(labels) != 10
        or model["featureVersion"] != FEATURE_VERSION
    ):
        raise ValueError("Invalid specialist label map/features")
    weights = np.asarray(model["weights"], dtype=np.float64)
    bias = np.asarray(model["bias"], dtype=np.float64)
    support = np.asarray(model["support"], dtype=np.float64)
    if (
        weights.shape != (10, FEATURE_SIZE)
        or bias.shape != (10,)
        or support.ndim != 2
        or not 1 <= support.shape[0] <= 1000
        or support.shape[1] != FEATURE_SIZE
        or not all(np.isfinite(a).all() for a in [weights, bias, support])
        or np.abs(weights).max() > 1000
        or np.abs(bias).max() > 1000
        or np.abs(support).max() > 1.001
    ):
        raise ValueError("Invalid specialist numeric arrays")
    for key in [
        "minimumScore",
        "minimumMargin",
        "minimumSupportSimilarity",
        "uncertaintyScore",
    ]:
        value = model["policy"][key]
        if (
            not isinstance(value, (int, float))
            or not np.isfinite(value)
            or not 0 <= value <= 1
        ):
            raise ValueError("Invalid specialist abstention policy")
    return model, weights, bias, support


def classify(crop):
    vector = features(crop)
    if vector is None:
        return None
    model, weights, bias, support = load_model()
    logits = weights @ vector + bias
    probabilities = np.exp(logits - logits.max())
    probabilities /= probabilities.sum()
    order = probabilities.argsort()[::-1]
    idx = int(order[0])
    score = float(probabilities[idx])
    similarity = float((support @ vector).max())
    policy = model["policy"]
    if (
        model["labels"][idx] == "UNKNOWN"
        or score < policy["minimumScore"]
        or score - float(probabilities[order[1]]) < policy["minimumMargin"]
        or similarity < policy["minimumSupportSimilarity"]
    ):
        return None
    return {
        "t3777_code": model["labels"][idx],
        "confidence": score,
        "score": score,
        "method": "ghs-specialist",
        "uncertain": score < policy["uncertaintyScore"],
        "requires_review": True,
        "reference_version": model["version"],
        "model_version": model["version"],
        "confidence_kind": "uncalibrated-classifier-score",
        "support_similarity": similarity,
    }
