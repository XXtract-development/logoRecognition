"""Local pilot manifest validation. No database/storage/training operations."""

import hashlib
import io
import json
import math
from pathlib import Path

from app.symbol_contract import GHS_CODES, normalize_code

SPLITS = {"reference", "train", "validation", "holdout"}


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def perceptual_hash(path_or_bytes):
    import cv2
    import numpy as np
    from PIL import Image

    source_data = (
        io.BytesIO(path_or_bytes) if isinstance(path_or_bytes, bytes) else path_or_bytes
    )
    with Image.open(source_data) as source:
        rgba = source.convert("RGBA")
        background = Image.new("RGBA", rgba.size, "white")
        background.alpha_composite(rgba)
        image = np.asarray(background.convert("L"))
    values = cv2.dct(cv2.resize(image, (32, 32)).astype("float32"))[:8, :8].flatten()
    bits = values > float(np.median(values[1:]))
    return sum(int(bit) << i for i, bit in enumerate(bits))


def _number(value, positive=False):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and (value > 0 if positive else value >= 0)
    )


def _phash(value):
    if not isinstance(value, str) or not value or len(value) > 16:
        raise ValueError("Perceptual checksum must be a 64-bit hex value")
    try:
        result = int(value, 16)
    except ValueError as exc:
        raise ValueError("Invalid perceptual checksum") from exc
    if not 0 <= result < 2**64:
        raise ValueError("Invalid perceptual checksum")
    return result


def _image_entries(row):
    yield row["fullImagePath"], row["originalHash"], row["perceptualHash"]
    for obj in row["objects"]:
        if obj.get("cropPath"):
            if not obj.get("cropHash") or not obj.get("cropPerceptualHash"):
                raise ValueError("Crop content and perceptual checksums required")
            yield obj["cropPath"], obj["cropHash"], obj["cropPerceptualHash"]


def validate_manifest(manifest, root, verify_files=True, file_splits=None):
    """Metadata preflight never decodes dataset images when verify_files=False."""
    if not manifest.get("version") or not manifest.get("annotationVersion"):
        raise ValueError("Frozen manifest/annotation versions required")
    seen = set()
    families = {}
    hashes = {}
    phashes = []
    official = json.loads(
        (Path(__file__).resolve().parent / "assets/ghs/manifest.json").read_text()
    )
    official_hashes = {r["sha256"] for r in official["templates"]}
    official_families = {r["source_family"] for r in official["templates"]}
    official_phashes = [
        perceptual_hash(Path(__file__).resolve().parent / "assets/ghs" / r["file"])
        for r in official["templates"]
    ]
    root = Path(root).resolve()
    for row in manifest["samples"]:
        required = [
            "sampleId",
            "sourceId",
            "sourceURL",
            "provenance",
            "artworkVersion",
            "familyId",
            "originalHash",
            "split",
            "imageWidth",
            "imageHeight",
            "annotator",
            "secondReviewer",
            "readability",
            "quality",
            "fullImagePath",
            "objects",
            "perceptualHash",
            "duplicateReview",
        ]
        if any(k not in row or row[k] is None or row[k] == "" for k in required):
            raise ValueError("Incomplete source/annotation metadata")
        if (
            not all(
                isinstance(row[k], str) and row[k].strip()
                for k in ("annotator", "secondReviewer")
            )
            or row["annotator"].strip().casefold()
            == row["secondReviewer"].strip().casefold()
        ):
            raise ValueError("Distinct annotator and second reviewer required")
        if not all(
            _number(row[k], positive=True) and float(row[k]).is_integer()
            for k in ("imageWidth", "imageHeight")
        ):
            raise ValueError("Image dimensions must be finite positive integers")
        if row["readability"] not in {"readable", "unreadable", "uncertain"}:
            raise ValueError("Invalid readability")
        if row["sampleId"] in seen:
            raise ValueError("Duplicate sample ID")
        seen.add(row["sampleId"])
        split = row["split"]
        if split not in SPLITS:
            raise ValueError("Invalid split")
        family = row["familyId"]
        if family in families and families[family] != split:
            raise ValueError("Family split leakage")
        families[family] = split
        if split in {"holdout", "validation"} and family in official_families:
            raise ValueError(
                "Official reference is not independent evaluation evidence"
            )
        if row["duplicateReview"] != "confirmed":
            raise ValueError("Human duplicate review required")
        for obj in row["objects"]:
            if normalize_code(obj["label"]) not in GHS_CODES | {"UNKNOWN"}:
                raise ValueError("Invalid visual class")
            box = obj.get("bbox")
            if normalize_code(obj["label"]) != "UNKNOWN" and not box:
                raise ValueError("Positive object requires bbox")
            if box is not None:
                if not isinstance(box, dict) or any(
                    k not in box
                    or not _number(box[k], positive=k in {"width", "height"})
                    for k in ("x", "y", "width", "height")
                ):
                    raise ValueError("Bounding box must have finite valid coordinates")
                if (
                    box["x"] + box["width"] > row["imageWidth"]
                    or box["y"] + box["height"] > row["imageHeight"]
                ):
                    raise ValueError("Bounding box exceeds image dimensions")
        for relative, digest, perceptual in _image_entries(row):
            path = (root / relative).resolve()
            if not path.is_relative_to(root):
                raise ValueError("Manifest path escapes dataset root")
            phash = _phash(perceptual)
            if split in {"holdout", "validation"} and (
                digest in official_hashes
                or any((phash ^ p).bit_count() <= 4 for p in official_phashes)
            ):
                raise ValueError(
                    "Official reference is not independent evaluation evidence"
                )
            if digest in hashes and hashes[digest] != (split, family):
                raise ValueError("Exact hash split/family leakage")
            hashes[digest] = (split, family)
            for old, oldsplit, oldfamily in phashes:
                if (split != oldsplit or family != oldfamily) and (
                    phash ^ old
                ).bit_count() <= 4:
                    raise ValueError("Near duplicate split/family leakage")
            phashes.append((phash, split, family))
            if verify_files and (file_splits is None or split in file_splits):
                if file_hash(path) != digest:
                    raise ValueError("Image checksum mismatch")
                if perceptual_hash(path) != phash:
                    raise ValueError("Perceptual checksum mismatch")
                if relative == row["fullImagePath"]:
                    from PIL import Image

                    with Image.open(path) as image:
                        if image.size != (row["imageWidth"], row["imageHeight"]):
                            raise ValueError(
                                "Decoded image dimensions differ from manifest"
                            )
    return manifest


def assert_reference_import(manifest, sample_ids):
    rows = {r["sampleId"]: r for r in manifest["samples"]}
    for sample_id in sample_ids:
        if rows[sample_id]["split"] not in {"train", "reference"}:
            raise ValueError("Sealed validation/holdout cannot be imported")


def load_manifest(path, file_splits=None, verify_files=True):
    path = Path(path)
    return validate_manifest(
        json.loads(path.read_text()),
        path.parent,
        verify_files=verify_files,
        file_splits=file_splits,
    )


def exposure_marker(manifest, manifest_path):
    """Shared exclusive ledger for the same image dataset, independent of protocol name."""
    identity = sorted(
        {
            digest
            for row in manifest["samples"]
            if row["split"] == "holdout"
            for _, digest, _ in _image_entries(row)
        }
    )
    key = hashlib.sha256(
        json.dumps(identity, separators=(",", ":")).encode()
    ).hexdigest()
    return Path(manifest_path).resolve().parent / f".ghs-final-{key}.exposed"


def assert_runtime_reference_import(crop_path, image_bytes=None):
    """Optional operator-configured manifest protects paths, hashes and near duplicates."""
    import os

    if any(
        part in str(crop_path).lower()
        for part in ("holdout", "validation", "ghs-pilot")
    ):
        raise ValueError("Sealed/pilot data cannot enter live references")
    manifest_path = os.environ.get("GHS_PILOT_MANIFEST")
    if not manifest_path:
        return
    manifest = load_manifest(manifest_path)
    digest = hashlib.sha256(image_bytes).hexdigest() if image_bytes else None
    incoming_phash = perceptual_hash(image_bytes) if image_bytes else None
    for row in manifest["samples"]:
        for path, original_hash, phash in _image_entries(row):
            if (
                crop_path == path
                or (digest and digest == original_hash)
                or (
                    incoming_phash is not None
                    and (incoming_phash ^ _phash(phash)).bit_count() <= 4
                )
            ):
                raise ValueError(
                    "Registered GHS pilot sample cannot enter live references"
                )
