#!/usr/bin/env python3
"""Deterministic local-only glyph training. No uploads, database or service actions."""

import argparse
import hashlib
import importlib.util
import json
import platform
import sys
from pathlib import Path

import cv2
import numpy as np
from sklearn.linear_model import LogisticRegression
import sklearn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.symbol_contract import GHS_CODES  # noqa: E402

# Import pure modules without app.services' runtime database/trainer initializers.
SERVICE_ROOT = Path(__file__).resolve().parents[1] / "app/services"
_spec = importlib.util.spec_from_file_location(
    "offline_ghs_specialist", SERVICE_ROOT / "ghs_specialist.py"
)
_specialist = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_specialist)
FEATURE_VERSION, features = _specialist.FEATURE_VERSION, _specialist.features


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_samples(samples):
    families, hashes = {}, {}
    for row in samples:
        split = row["split"]
        if split not in {"train", "validation", "holdout", "reference"}:
            raise ValueError("Invalid split")
        group = "train" if split == "reference" else split
        for key, mapping in [(row["familyId"], families), (row["sha256"], hashes)]:
            if key in mapping and mapping[key] != group:
                raise ValueError("Family/hash crosses dataset splits")
            mapping[key] = group
        if row["code"] not in GHS_CODES | {"UNKNOWN"}:
            raise ValueError("Invalid training code")
        if not row.get("provenance") or not row.get("labelStatus"):
            raise ValueError("Missing source/annotation provenance")
        if (
            not row.get("familyId")
            or not isinstance(row["sha256"], str)
            or len(row["sha256"]) != 64
        ):
            raise ValueError("Invalid family/checksum identity")
        if group == "train" and row.get("trainingAllowed") is not True:
            raise ValueError("Training reuse not authorised for source")
        if row.get("officialReference") and split in {"validation", "holdout"}:
            raise ValueError("Official reference cannot be independent evaluation")
        # Hash bytes across every split without decoding sealed final images.
        if digest(Path(row["imagePath"])) != row["sha256"]:
            raise ValueError("Source checksum mismatch")


def official_samples(root):
    source = json.loads((root / "manifest.json").read_text())
    return [
        {
            "imagePath": str(root / e["file"]),
            "sha256": e["sha256"],
            "familyId": e["source_family"],
            "split": "reference",
            "code": e["code"],
            "provenance": {"sourceURL": e["source_url"], "license": e["license"]},
            "labelStatus": "official-reference-not-field-truth",
            "trainingAllowed": True,
            "officialReference": True,
        }
        for e in source["templates"]
    ]


def augment(image, rng, count):
    image = cv2.resize(image, (128, 128), interpolation=cv2.INTER_AREA)
    yield image
    for _ in range(count):
        angle = float(rng.uniform(-10, 10))
        matrix = cv2.getRotationMatrix2D(
            (63.5, 63.5), angle, float(rng.uniform(0.83, 1.10))
        )
        matrix[:, 2] += rng.uniform(-4, 4, 2)
        sample = cv2.warpAffine(image, matrix, (128, 128), borderValue=(255, 255, 255))
        small = int(rng.choice([24, 32, 48, 64, 96, 128]))
        sample = cv2.resize(
            cv2.resize(sample, (small, small), interpolation=cv2.INTER_AREA), (128, 128)
        )
        if rng.random() < 0.35:
            sample = cv2.GaussianBlur(sample, (3, 3), float(rng.uniform(0.2, 0.9)))
        if rng.random() < 0.4:
            k = np.ones((2, 2), np.uint8)
            sample = (
                cv2.erode(sample, k) if rng.random() < 0.5 else cv2.dilate(sample, k)
            )
        yield sample


def unknowns(rng, count):
    for index in range(count):
        image = np.full((128, 128, 3), 255, np.uint8)
        mode = index % 4
        if mode == 0:
            cv2.putText(
                image,
                str(int(rng.integers(0, 100))),
                (35, 80),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 0, 0),
                2,
            )
        elif mode == 1:
            cv2.circle(image, (64, 64), int(rng.integers(10, 35)), (0, 0, 0), 2)
        elif mode == 2:
            cv2.rectangle(image, (35, 45), (90, 83), (0, 0, 0), int(rng.integers(1, 6)))
        else:
            for _ in range(int(rng.integers(2, 8))):
                a, b = rng.integers(32, 96, (2, 2)).tolist()
                cv2.line(image, tuple(a), tuple(b), (0, 0, 0), 2)
        yield image


def train(samples, seed=1729, augmentation_count=160):
    validate_samples(samples)
    rng = np.random.default_rng(seed)
    X, y, support = [], [], []
    for row in sorted(samples, key=lambda r: (r["familyId"], r["sha256"], r["code"])):
        if row["split"] not in {"train", "reference"}:
            continue
        path = Path(row["imagePath"])
        if digest(path) != row["sha256"]:
            raise ValueError("Source checksum mismatch")
        image = cv2.imread(str(path))
        if image is None:
            raise ValueError("Source image unreadable")
        if "bbox" in row:
            box = row["bbox"]
            x, y0, w, h = [int(box[k]) for k in ["x", "y", "width", "height"]]
            if (
                min(x, y0) < 0
                or min(w, h) < 1
                or x + w > image.shape[1]
                or y0 + h > image.shape[0]
            ):
                raise ValueError("Source box out of bounds")
            image = image[y0 : y0 + h, x : x + w]
        else:
            # Official bitmap contains whitespace: use its closed diamond box.
            ref_spec = importlib.util.spec_from_file_location(
                "offline_ghs_reference", SERVICE_ROOT / "ghs_reference.py"
            )
            reference = importlib.util.module_from_spec(ref_spec)
            ref_spec.loader.exec_module(reference)
            boxes = reference.regions(image)
            if not boxes:
                raise ValueError("Unboxed source has no GHS diamond")
            x, y0, w, h = max(boxes, key=lambda b: b[2] * b[3])
            image = image[y0 : y0 + h, x : x + w]
        for idx, augmented in enumerate(augment(image, rng, augmentation_count)):
            vector = features(augmented)
            if vector is not None:
                X.append(vector)
                y.append(row["code"])
                if idx == 0 and row["code"] != "UNKNOWN":
                    support.append(vector)
    for image in unknowns(rng, 400):
        vector = features(image)
        if vector is not None:
            X.append(vector)
            y.append("UNKNOWN")
    if set(y) != GHS_CODES | {"UNKNOWN"}:
        raise ValueError("Nine GHS classes plus UNKNOWN required")
    clf = LogisticRegression(C=30, solver="lbfgs", max_iter=400, random_state=seed)
    clf.fit(np.asarray(X), y)
    source = [
        {k: v for k, v in r.items() if k != "imagePath"}
        for r in sorted(samples, key=lambda r: (r["familyId"], r["sha256"], r["code"]))
    ]
    payload = {
        "featureVersion": FEATURE_VERSION,
        "labels": clf.classes_.tolist(),
        "weights": np.round(clf.coef_, 10).tolist(),
        "bias": np.round(clf.intercept_, 10).tolist(),
        "support": np.round(support, 10).tolist(),
        "policy": {
            "minimumScore": 0.70,
            "minimumMargin": 0.20,
            "minimumSupportSimilarity": 0.60,
            "uncertaintyScore": 0.87,
        },
        "provenance": {
            "seed": seed,
            "augmentationCountPerSource": augmentation_count,
            "trainingRows": len(y),
            "sources": source,
            "syntheticUnknowns": 400,
            "independentFieldGroups": 0,
            "fieldCalibration": False,
            "numpy": np.__version__,
            "opencv": cv2.__version__,
            "sklearn": sklearn.__version__,
            "python": platform.python_version(),
        },
    }
    identity = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    payload["version"] = f"ghs-glyph-v1-{identity[:12]}"
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", help="Optional explicit local samples manifest")
    parser.add_argument("--output", required=True)
    parser.add_argument("--seed", type=int, default=1729)
    parser.add_argument("--augmentations", type=int, default=160)
    args = parser.parse_args()
    if not 1 <= args.augmentations <= 1000:
        raise ValueError("Augmentations outside bounded range")
    root = Path(__file__).resolve().parents[1] / "app/assets/ghs"
    samples = (
        json.loads(Path(args.manifest).read_text())["samples"]
        if args.manifest
        else official_samples(root)
    )
    payload = train(samples, args.seed, args.augmentations)
    output = Path(args.output)
    if output.exists() and any(output.iterdir()):
        raise ValueError("Refusing to overwrite frozen artifact directory")
    output.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n").encode()
    (output / "model.json").write_bytes(data)
    manifest = {
        "version": payload["version"],
        "sha256": hashlib.sha256(data).hexdigest(),
        "purpose": "Offline trained reference augmentation; not independent field accuracy",
        "featureVersion": FEATURE_VERSION,
        "trainingPerformed": True,
        "requiresReview": True,
        "provenance": payload["provenance"],
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(
        json.dumps(
            {
                "version": manifest["version"],
                "sha256": manifest["sha256"],
                "trainingRows": payload["provenance"]["trainingRows"],
                "independentFieldGroups": 0,
            }
        )
    )


if __name__ == "__main__":
    main()
