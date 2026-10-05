#!/usr/bin/env python3
"""Deterministic local-only glyph training. No uploads, database or service actions."""

import argparse
import hashlib
import importlib.util
import json
import platform
import sys
from datetime import date
from pathlib import Path

import cv2
import numpy as np
import sklearn
from sklearn.linear_model import LogisticRegression

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


def sample_key(row):
    """A full annotation tie-breaker makes multiple crops of one image reproducible."""
    return (
        row["familyId"],
        row["sha256"],
        row["code"],
        json.dumps(
            {k: v for k, v in row.items() if k != "imagePath"},
            sort_keys=True,
            separators=(",", ":"),
        ),
    )


def numeric_box(box):
    try:
        values = tuple(box[k] for k in ("x", "y", "width", "height"))
        if not all(
            isinstance(v, (int, float)) and not isinstance(v, bool) and np.isfinite(v)
            for v in values
        ):
            raise ValueError
        if min(values[:2]) < 0 or min(values[2:]) <= 0:
            raise ValueError
        return tuple(float(v) for v in values)
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(
            "Source box must contain finite positive numeric coordinates"
        ) from exc


def box_iou(a, b):
    x, y, w, h = a
    ox, oy, ow, oh = b
    intersection = max(0, min(x + w, ox + ow) - max(x, ox)) * max(
        0, min(y + h, oy + oh) - max(y, oy)
    )
    return intersection / (w * h + ow * oh - intersection)


def validate_qualification(row, qualification):
    """Bind a qualified annotation to successful raw reviews of these exact pixels."""
    record = json.loads(Path(qualification["evidencePath"]).read_text())
    reviewers = qualification["reviewerIds"]
    if (
        record.get("schema") != "ghs-production-qualification-v1"
        or record.get("status") != "qualified"
        or record.get("context") != "product-symbol"
        or record.get("humanGold") is not False
        or record.get("sourceHintsSent") is not False
        or record.get("sourceSha256") != row["sha256"]
        or record.get("code") != row["code"]
        or numeric_box(record.get("bbox")) != numeric_box(row["bbox"])
        or record.get("productIdentity") != row["provenance"]["productIdentity"]
        or record.get("reviewerIds") != reviewers
        or len(reviewers) != len(set(reviewers))
    ):
        raise ValueError(
            "Production qualification record does not bind this annotation"
        )
    evidence = record.get("reviewEvidence", {})
    image = record.get("reviewingImage", {})
    if not isinstance(evidence, dict) or not isinstance(image, dict):
        raise ValueError("Production qualification review/image binding required")
    try:
        if (
            digest(Path(evidence["path"])) != evidence["sha256"]
            or digest(Path(image["path"])) != image["sha256"]
        ):
            raise ValueError("Production raw review/image checksum mismatch")
        raw = json.loads(Path(evidence["path"]).read_text())
        response = raw["response"]
        if (
            raw["httpStatus"] != 200
            or response["status"] != "ai-reviewed"
            or raw["imageSha256"] != image["sha256"]
            or response["image"]["sha256"] != image["sha256"]
        ):
            raise ValueError(
                "Production raw review did not succeed for reviewing image"
            )
        reviews = response["reviews"]
        ids = [r["reviewId"] for r in reviews]
        if (
            len(ids) != len(reviewers)
            or set(ids) != set(reviewers)
            or any(r["status"] != "succeeded" for r in reviews)
        ):
            raise ValueError("Production raw reviewer identities/status do not match")
        if "cropBbox" in image:
            if numeric_box(image["cropBbox"]) != numeric_box(row["bbox"]):
                raise ValueError(
                    "Production reviewing crop bounds do not match source annotation"
                )
            x, y, w, h = numeric_box(row["bbox"])
            width, height = int(np.ceil(x + w)) - int(np.floor(x)), int(
                np.ceil(y + h)
            ) - int(np.floor(y))
            if (response["image"]["width"], response["image"]["height"]) != (
                width,
                height,
            ):
                raise ValueError(
                    "Production reviewing crop dimensions do not match source bounds"
                )
            expected = (0, 0, width, height)
        else:
            if image["sha256"] != row["sha256"]:
                raise ValueError("Production full reviewing image differs from source")
            expected = numeric_box(row["bbox"])
        for review in reviews:
            if not any(
                a.get("code") == row["code"]
                and a.get("uncertain") is False
                and box_iou(numeric_box(a.get("bbox")), expected) >= 0.5
                for a in review["projectedAnnotations"]
            ):
                raise ValueError(
                    "Production raw reviews do not agree with qualified code/bbox"
                )
    except (KeyError, TypeError) as exc:
        raise ValueError(
            "Production typed/raw qualification evidence incomplete"
        ) from exc
    return image


def validate_samples(samples):
    families, hashes, products = {}, {}, {}
    production_annotations = set()
    official_hashes = {r["sha256"] for r in samples if r.get("officialReference")}
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
        if not isinstance(row.get("provenance"), dict) or not row.get("labelStatus"):
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
        if row.get("sourceType") == "production-product":
            if split == "reference":
                raise ValueError("Production sources cannot use the reference split")
            provenance = row["provenance"]
            authorization = provenance.get("authorization", {})
            qualification = provenance.get("qualification", {})
            if not isinstance(authorization, dict) or not isinstance(
                qualification, dict
            ):
                raise ValueError(
                    "Production qualification/authorisation must be objects"
                )
            evidence_hash = qualification.get(
                "sha256", qualification.get("evidenceSha256")
            )
            reviewers = qualification.get("reviewerIds", [])
            product = provenance.get("productIdentity")
            if (
                not isinstance(product, str)
                or len(product) != 14
                or not product.isascii()
                or not product.isdigit()
            ):
                raise ValueError(
                    "Production product identity must be a canonical 14-digit GTIN"
                )
            if (
                row.get("officialReference")
                or row["code"] not in GHS_CODES
                or "bbox" not in row
                or provenance.get("origin") != "mongodb-prod"
                or not product
                or not provenance.get("sourceURL")
                or row["labelStatus"] != "qualified-production-ai-reviewed"
                or qualification.get("status") != "qualified"
                or qualification.get("context") != "product-symbol"
                or not qualification.get("evidencePath")
                or not isinstance(evidence_hash, str)
                or len(evidence_hash) != 64
                or not isinstance(reviewers, list)
                or not all(isinstance(r, str) and r for r in reviewers)
                or len(set(reviewers)) < 2
                or authorization.get("basis") != "explicit-user-request"
                or authorization.get("scope") != "internal-ghs-training"
            ):
                raise ValueError(
                    "Production source requires qualified visible product glyph and authorisation"
                )
            if digest(Path(qualification["evidencePath"])) != evidence_hash:
                raise ValueError("Production qualification evidence checksum mismatch")
            if row["sha256"] in official_hashes:
                raise ValueError(
                    "Production source duplicates an official reference image"
                )
            box_values = numeric_box(row["bbox"])
            if not all(
                isinstance(v, (int, float)) and np.isfinite(v) for v in box_values
            ):
                raise ValueError("Source box must contain finite numeric coordinates")
            annotation = (
                row["sha256"],
                row["code"],
                tuple(float(v) for v in box_values),
            )
            if annotation in production_annotations:
                raise ValueError("Duplicate production annotation")
            production_annotations.add(annotation)
            validate_qualification(row, qualification)
            try:
                date.fromisoformat(authorization["date"])
            except (ValueError, TypeError, KeyError) as exc:
                raise ValueError("Production authorisation date required") from exc
            identity = (row["familyId"], group)
            if product in products and products[product] != identity:
                raise ValueError("Production product identity crosses families/splits")
            products[product] = identity
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
        # Curved/perspective label views compress a glyph horizontally. Preserve
        # source identity and all glyph pixels within the canvas; this is one
        # augmented view, never another independent source or annotation.
        aspect = float(rng.uniform(0.65, 1.0))
        shear = float(rng.uniform(-0.12, 0.12))
        projection = np.array(
            [[aspect, shear, (1 - aspect - shear) * 63.5], [0, 1, 0], [0, 0, 1]]
        )
        homogeneous = np.vstack([matrix, [0, 0, 1]])
        matrix = (projection @ homogeneous)[:2]
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


def train(
    samples, seed=1729, augmentation_count=160, *, bootstrap_reference_only=False
):
    validate_samples(samples)
    production = [
        row
        for row in samples
        if row.get("sourceType") == "production-product" and row["split"] == "train"
    ]
    if bootstrap_reference_only:
        if production or any(
            not row.get("officialReference")
            for row in samples
            if row["split"] in {"train", "reference"}
        ):
            raise ValueError("Bootstrap mode only permits explicit official references")
    elif not production:
        raise ValueError(
            "Normal GHS training requires qualified production train examples; use explicit bootstrap-reference-only for references/tests"
        )
    if not 1 <= augmentation_count <= 1000:
        raise ValueError("Augmentations outside bounded range")
    rng = np.random.default_rng(seed)
    X, y, support = [], [], []
    row_counts = {"production": 0, "officialReference": 0, "other": 0}
    production_used = []
    production_augmented = 0
    for row in sorted(samples, key=sample_key):
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
            values = [box[k] for k in ["x", "y", "width", "height"]]
            if not all(isinstance(v, (int, float)) and np.isfinite(v) for v in values):
                raise ValueError("Source box must contain finite numeric coordinates")
            bx, by, bw, bh = values
            if (
                min(bx, by) < 0
                or min(bw, bh) <= 0
                or bx + bw > image.shape[1]
                or by + bh > image.shape[0]
            ):
                raise ValueError("Source box out of bounds")
            x, y0 = int(np.floor(bx)), int(np.floor(by))
            w, h = int(np.ceil(bx + bw)) - x, int(np.ceil(by + bh)) - y0
            if (
                min(x, y0) < 0
                or min(w, h) < 1
                or x + w > image.shape[1]
                or y0 + h > image.shape[0]
            ):
                raise ValueError("Source box out of bounds")
            image = image[y0 : y0 + h, x : x + w]
            if row.get("sourceType") == "production-product":
                record = json.loads(
                    Path(row["provenance"]["qualification"]["evidencePath"]).read_text()
                )
                reviewing = record["reviewingImage"]
                if "cropBbox" in reviewing:
                    reviewed_crop = cv2.imread(reviewing["path"])
                    if reviewed_crop is None or not np.array_equal(
                        reviewed_crop, image
                    ):
                        raise ValueError(
                            "Production reviewed crop pixels differ from actual source crop"
                        )
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
        used_rows = 0
        for idx, augmented in enumerate(augment(image, rng, augmentation_count)):
            vector = features(augmented)
            if vector is not None:
                X.append(vector)
                y.append(row["code"])
                source_type = (
                    "production"
                    if row.get("sourceType") == "production-product"
                    else (
                        "officialReference" if row.get("officialReference") else "other"
                    )
                )
                row_counts[source_type] += 1
                used_rows += 1
                if source_type == "production" and idx > 0:
                    production_augmented += 1
                if idx == 0 and row["code"] != "UNKNOWN":
                    support.append(vector)
        if row.get("sourceType") == "production-product" and used_rows:
            production_used.append(row)
    if not bootstrap_reference_only and not production_used:
        raise ValueError(
            "No qualified production examples contributed feature vectors; refusing reference-only model"
        )
    for image in unknowns(rng, 400):
        vector = features(image)
        if vector is not None:
            X.append(vector)
            y.append("UNKNOWN")
    if set(y) != GHS_CODES | {"UNKNOWN"}:
        raise ValueError("Nine GHS classes plus UNKNOWN required")
    class_rows = {label: y.count(label) for label in sorted(set(y))}
    class_weights = {
        label: len(y) / (len(class_rows) * count) for label, count in class_rows.items()
    }
    clf = LogisticRegression(
        C=30, solver="lbfgs", max_iter=400, random_state=seed, class_weight="balanced"
    )
    clf.fit(np.asarray(X), y)
    source = [
        {k: v for k, v in r.items() if k != "imagePath"}
        for r in sorted(samples, key=sample_key)
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
            "classWeightStrategy": "balanced",
            "classTrainingRows": class_rows,
            "effectiveClassWeights": class_weights,
            "seed": seed,
            "augmentationCountPerSource": augmentation_count,
            "augmentationVersion": "ghs-glyph-projection-v2",
            "projectionAugmentation": {
                "horizontalScale": [0.65, 1.0],
                "shear": [-0.12, 0.12],
            },
            "bootstrapReferenceOnly": bootstrap_reference_only,
            "productionExamples": len(production),
            "productionImages": len({r["sha256"] for r in production}),
            "productionFamilies": len({r["familyId"] for r in production}),
            "usedProductionExamples": len(production_used),
            "usedProductionImages": len({r["sha256"] for r in production_used}),
            "usedProductionFamilies": len({r["familyId"] for r in production_used}),
            "productionAugmentedRows": production_augmented,
            "productionTrainingRows": row_counts["production"],
            "officialReferenceTrainingRows": row_counts["officialReference"],
            "otherTrainingRows": row_counts["other"],
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
    parser.add_argument(
        "--manifest",
        help="Required qualified-production samples manifest for normal training",
    )
    parser.add_argument(
        "--bootstrap-reference-only",
        action="store_true",
        help="Explicit reference-only bootstrap/testing, never production training",
    )
    parser.add_argument("--output", required=True)
    parser.add_argument("--seed", type=int, default=1729)
    parser.add_argument("--augmentations", type=int, default=160)
    args = parser.parse_args()
    output = Path(args.output)
    if output.exists() and any(output.iterdir()):
        raise ValueError("Refusing to overwrite frozen artifact directory")
    if not args.manifest and not args.bootstrap_reference_only:
        raise ValueError("Normal GHS training requires a qualified production manifest")
    if not 1 <= args.augmentations <= 1000:
        raise ValueError("Augmentations outside bounded range")
    root = Path(__file__).resolve().parents[1] / "app/assets/ghs"
    samples = (
        json.loads(Path(args.manifest).read_text())["samples"]
        if args.manifest
        else official_samples(root)
    )
    payload = train(
        samples,
        args.seed,
        args.augmentations,
        bootstrap_reference_only=args.bootstrap_reference_only,
    )
    output.mkdir(parents=True, exist_ok=False)
    data = (json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n").encode()
    (output / "model.json").write_bytes(data)
    manifest = {
        "version": payload["version"],
        "sha256": hashlib.sha256(data).hexdigest(),
        "purpose": "Offline trained GHS glyph model; production participation recorded; not independent field accuracy",
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
                "productionExamples": payload["provenance"]["productionExamples"],
                "productionFamilies": payload["provenance"]["productionFamilies"],
                "independentFieldGroups": 0,
            }
        )
    )


if __name__ == "__main__":
    main()
