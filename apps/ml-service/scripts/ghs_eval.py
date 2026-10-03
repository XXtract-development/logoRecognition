#!/usr/bin/env python3
"""Freeze before access, then evaluate the local reference route once. No live writes."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.ghs_dataset import exposure_marker, file_hash, load_manifest
from app.ghs_evaluation import evaluate


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "action", choices=["freeze", "evaluate", "validate-development"]
    )
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--protocol", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    manifest_path = Path(args.manifest)
    protocol_path = Path(args.protocol)
    output = Path(args.output)
    root = Path(__file__).resolve().parents[1]
    import importlib.util

    from app.symbol_contract import GHS_ALIASES, GHS_CODES

    spec = importlib.util.spec_from_file_location(
        "offline_ghs_reference", root / "app/services/ghs_reference.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    mapping_path = root / "reference-code-mapping.json"
    if not mapping_path.is_file():
        mapping_path = root.parent / "api/src/services/reference-code-mapping.json"
    import platform

    import PIL

    config = {
        "manifestHash": file_hash(manifest_path),
        "codeCommit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True
        ).strip(),
        "sourceHashes": {
            (
                str(p.relative_to(root)) if p.is_relative_to(root) else str(p.resolve())
            ): file_hash(p)
            for p in [
                root / "app/symbol_contract.py",
                root / "app/services/reference_category.py",
                mapping_path,
                root / "app/ghs_dataset.py",
                root / "app/ghs_evaluation.py",
                root / "app/services/ghs_reference.py",
                Path(__file__).resolve(),
            ]
        },
        "referenceManifestHash": file_hash(root / "app/assets/ghs/manifest.json"),
        "runtimeVersions": {
            "python": platform.python_version(),
            "opencv": module.cv2.__version__,
            "numpy": module.np.__version__,
            "pillow": PIL.__version__,
        },
        "model": "official-reference-route",
        "modelWeights": "none",
        "labelMap": {"aliases": GHS_ALIASES, "labels": sorted(GHS_CODES)},
        "categoryMapping": json.loads(mapping_path.read_text()),
        "gate": "closed-red-diamond-v1",
        "threshold": module.THRESHOLD,
        "proposalFloor": module.PROPOSAL_FLOOR,
        "margin": module.MARGIN,
        "iou": 0.5,
        "selectionUsesFinalHoldout": False,
        "evaluationVersion": "ghs-eval-v1",
    }
    manifest = load_manifest(manifest_path, verify_files=False)
    if args.action == "freeze":
        # Annotation metadata is preflighted; final images remain undecoded until exposure is recorded.
        with protocol_path.open("x") as stream:
            json.dump(config, stream, indent=2)
        return
    development = args.action == "validate-development"
    protocol = config if development else json.loads(protocol_path.read_text())
    if protocol != config:
        raise ValueError("Frozen protocol changed or final holdout used for selection")
    ledger = exposure_marker(manifest, manifest_path)
    if not development:
        with ledger.open("x") as stream:
            stream.write(config["manifestHash"])
    # Exposure remains recorded even when evaluation fails; never silently rerun final selection.
    manifest = load_manifest(
        manifest_path, file_splits={"validation"} if development else {"holdout"}
    )
    detect_ghs, classify_ghs, references = (
        module.detect_ghs,
        module.classify_ghs,
        module.references,
    )
    from PIL import Image

    references()  # verify every official checksum before processing
    rows = [
        r
        for r in manifest["samples"]
        if r["split"] in ({"validation"} if development else {"holdout"})
    ]
    predictions = {}
    crops = {}
    for row in rows:
        with Image.open(manifest_path.parent / row["fullImagePath"]) as image:
            predictions[row["sampleId"]] = [
                {**d, "code": d["t3777_code"]} for d in detect_ghs(image)
            ]
        for index, obj in enumerate(row["objects"]):
            if obj.get("cropPath"):
                with Image.open(manifest_path.parent / obj["cropPath"]) as image:
                    result = classify_ghs(image)
                crops[f"{row['sampleId']}:{index}"] = (
                    {
                        "code": result["t3777_code"],
                        "uncertain": result["uncertain"],
                        "confidence": result["confidence"],
                    }
                    if result
                    else {"code": "UNKNOWN", "uncertain": True}
                )
    report = evaluate(rows, predictions, crops)
    from app.symbol_contract import normalize_code

    for code, stats in report["classes"].items():
        stats["developmentGroups"] = len(
            {
                r["familyId"]
                for r in manifest["samples"]
                if r["split"] in {"train", "reference"}
                and any(normalize_code(o["label"]) == code for o in r["objects"])
            }
        )
        stats["validationGroups"] = len(
            {
                r["familyId"]
                for r in manifest["samples"]
                if r["split"] == "validation"
                and any(normalize_code(o["label"]) == code for o in r["objects"])
            }
        )
        stats["activeOfficialReferences"] = sum(c == code for c, _ in references()[1])
        stats["holdoutGroups"] = stats["families"] if not development else 0
    report["wholeLabelPages"] = len(rows)
    report.update(
        {
            "protocol": protocol,
            "manifestVersion": manifest["version"],
            "annotationVersion": manifest["annotationVersion"],
            "route": "real-local-images",
            "predictions": predictions,
            "cropPredictions": crops,
            "independentQualityEvidence": bool(rows) and not development,
            "selectionData": development,
            "baselineChallengerComparison": "not supplied; no comparative release claim",
            "developmentGroups": len(
                {r["familyId"] for r in manifest["samples"] if r["split"] == "train"}
            ),
            "validationGroups": len(
                {
                    r["familyId"]
                    for r in manifest["samples"]
                    if r["split"] == "validation"
                }
            ),
            "activeOfficialReferences": len(references()[1]),
        }
    )
    with output.open("x") as stream:
        json.dump(report, stream, indent=2)


if __name__ == "__main__":
    main()
