"""Check qualified production objects against immutable, actual ACC responses."""

import argparse
import hashlib
import json
from pathlib import Path


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def iou(a, b):
    overlap = max(
        0, min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"])
    ) * max(0, min(a["y"] + a["height"], b["y"] + b["height"]) - max(a["y"], b["y"]))
    union = a["width"] * a["height"] + b["width"] * b["height"] - overlap
    return overlap / union if union > 0 else 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--qualification-freeze", required=True)
    parser.add_argument("--model-manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    destination = Path(args.output)
    if destination.exists():
        raise ValueError("Refusing to overwrite evidence")
    freeze = json.loads(Path(args.qualification_freeze).read_text())
    if sha256(args.manifest) != freeze["manifestSha256"]:
        raise ValueError("Qualified production manifest changed after freeze")
    manifest = json.loads(Path(args.manifest).read_text())
    model = json.loads(Path(args.model_manifest).read_text())
    runtime = json.loads(Path(args.runtime).read_text())
    if (
        runtime["modelSha256"] != model["sha256"]
        or runtime["modelVersion"] != model["version"]
    ):
        raise ValueError("Runtime evidence does not use the trained model")
    provenance = model["provenance"]
    if (
        not model["trainingPerformed"]
        or provenance["bootstrapReferenceOnly"]
        or provenance["usedProductionExamples"] <= 0
    ):
        raise ValueError("Production model training not established")
    rows = [
        row
        for row in manifest["samples"]
        if row.get("sourceType") == "production-product"
    ]
    if not rows or not all(row["split"] in ("train", "validation") for row in rows):
        raise ValueError("Qualified production train/validation snapshot required")
    train_rows = [row for row in rows if row["split"] == "train"]
    if len(train_rows) != provenance["usedProductionExamples"]:
        raise ValueError("Training provenance differs from frozen qualified objects")
    if len({row["sha256"] for row in train_rows}) != provenance["usedProductionImages"]:
        raise ValueError("Training image count differs from frozen manifest")
    train_families = {row["familyId"] for row in rows if row["split"] == "train"}
    validation_families = {
        row["familyId"] for row in rows if row["split"] == "validation"
    }
    if train_families & validation_families:
        raise ValueError("Production train and validation families overlap")
    objects = []
    totals = {}
    for threshold in (0.99, 0.87):
        for split in ("train", "validation"):
            split_rows = [row for row in rows if row["split"] == split]
            accepted = reviewed = matched = 0
            for row in split_rows:
                requests = [
                    request
                    for request in runtime["requests"]
                    if request["sha256"] == row["sha256"]
                    and request["requestedConfidenceThreshold"] == threshold
                ]
                if len(requests) != 1 or requests[0]["httpStatus"] != 200:
                    raise ValueError(
                        "Exactly one actual successful request per production image and threshold required"
                    )
                request = requests[0]
                candidates = []
                for channel in ("detections", "review_proposals"):
                    for detection in request["response"][channel]:
                        if (
                            detection.get("category") == "GHSSymbolDescriptionCode"
                            and detection.get("value") == row["code"]
                        ):
                            overlap = iou(row["bbox"], detection["bbox"])
                            if overlap >= 0.5:
                                candidates.append((overlap, channel, detection))
                if len(candidates) > 1:
                    raise ValueError(
                        "Duplicate matching GHS proposals require investigation"
                    )
                item = {
                    "id": row["id"],
                    "split": split,
                    "familyId": row["familyId"],
                    "code": row["code"],
                    "sourceSha256": row["sha256"],
                    "requestedConfidenceThreshold": threshold,
                    "matched": bool(candidates),
                }
                if candidates:
                    overlap, channel, detection = candidates[0]
                    matched += 1
                    if channel == "detections":
                        accepted += 1
                    else:
                        reviewed += 1
                    item.update(
                        {
                            "iou": overlap,
                            "channel": channel,
                            "score": detection["confidence"],
                            "uncertain": detection["uncertain"],
                            "requiresReview": detection["requires_review"],
                            "modelVersion": detection["model_version"],
                            "bbox": detection["bbox"],
                        }
                    )
                objects.append(item)
            totals[f"{split}@{threshold}"] = {
                "expected": len(split_rows),
                "matched": matched,
                "detections": accepted,
                "reviewProposals": reviewed,
                "families": len({row["familyId"] for row in split_rows}),
            }
    result = {
        "runtimeEvidenceSha256": sha256(args.runtime),
        "qualifiedManifestSha256": sha256(args.manifest),
        "modelManifestSha256": sha256(args.model_manifest),
        "modelVersion": model["version"],
        "modelSha256": model["sha256"],
        "actualTraining": {
            "originalObjects": provenance["usedProductionExamples"],
            "originalImages": provenance["usedProductionImages"],
            "provisionalSourceProductGroups": provenance["usedProductionFamilies"],
            "productionRows": provenance["productionTrainingRows"],
            "productionAugmentedRows": provenance["productionAugmentedRows"],
            "allTrainingRows": provenance["trainingRows"],
        },
        "humanGold": False,
        "independentFinalBenchmark": False,
        "validationPreviouslyExposedInDevelopment": True,
        "unmatchedOtherPageObjectsAreNotFalsePositiveGold": True,
        "totals": totals,
        "objects": objects,
    }
    with destination.open("x") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    print(json.dumps(totals, ensure_ascii=False))


if __name__ == "__main__":
    main()
