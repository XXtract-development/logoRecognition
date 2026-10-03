import pytest

from app.ghs_dataset import assert_reference_import, validate_manifest
from app.ghs_evaluation import evaluate, match_objects

B = {"x": 0, "y": 0, "width": 20, "height": 20}


def row(objects, readability="readable"):
    return {
        "sampleId": "a",
        "familyId": "f",
        "objects": objects,
        "readability": readability,
        "quality": "blur",
    }


def test_g09_duplicates_and_all_class_extras_fail_group():
    from app.symbol_contract import GHS_CODES

    truth = [{"label": "FLAME", "bbox": B}]
    report = evaluate([row(truth)], {"a": [{"code": c, "bbox": B} for c in GHS_CODES]})
    assert report["classes"]["FLAME"]["matched"] == 1
    assert report["classes"]["FLAME"]["correctFamilies"] == 0
    assert sum(s["extras"] for s in report["classes"].values()) == 8
    assert len(match_objects(truth, [{"code": "FLAME", "bbox": B}] * 2)) == 1


def test_g10_negative_label_denominator():
    report = evaluate([row([])], {"a": [{"code": "FLAME", "bbox": B}] * 3})
    assert report["negativeLabels"] == {"errors": 1, "total": 1}


def test_g11_confusion_visible():
    report = evaluate(
        [row([{"label": "FLAME", "bbox": B}])],
        {"a": [{"code": "FLAME_OVER_CIRCLE", "bbox": B}]},
    )
    assert report["confusionMatrix"]["FLAME"]["FLAME_OVER_CIRCLE"] == 1
    assert report["criticalConfusions"]


def test_g12_unreadable_not_vacuous_success():
    report = evaluate(
        [row([{"label": "FLAME", "bbox": B, "readable": False}], "unreadable")], {}
    )
    assert report["classes"]["FLAME"]["correctFamilies"] == 0
    assert report["classes"]["FLAME"]["readableFamilies"] == 0
    assert report["classes"]["FLAME"]["abstentions"] == 1
    assert report["classes"]["FLAME"]["status"] == "insufficient-evidence"
    assert report["quality"]["blur"]["uncertain"] == 1


def sample(split="train", family="f", digest="a", phash="0"):
    return dict(
        sampleId=family,
        sourceId="source",
        sourceURL="https://example.org",
        provenance="permission",
        artworkVersion="1",
        familyId=family,
        originalHash=digest,
        split=split,
        imageWidth=10,
        imageHeight=10,
        annotator="a",
        secondReviewer="b",
        readability="readable",
        quality="clear",
        fullImagePath="a.png",
        objects=[],
        perceptualHash=phash,
        duplicateReview="confirmed",
    )


@pytest.mark.parametrize("kind", ["hash", "family", "near"])
def test_g07_split_leakage(kind):
    a = sample()
    b = sample("holdout", "b", "b", "ffffffffffffffff")
    if kind == "hash":
        b["originalHash"] = "a"
    if kind == "family":
        b["familyId"] = "f"
    if kind == "near":
        b["perceptualHash"] = "1"
    with pytest.raises(ValueError):
        validate_manifest(
            {"version": "1", "annotationVersion": "1", "samples": [a, b]}, ".", False
        )


def test_g07_holdout_import_refused():
    with pytest.raises(ValueError):
        assert_reference_import({"samples": [sample("holdout")]}, ["f"])


def test_uncertain_ghs_proposals_still_count_negative_errors():
    report = evaluate(
        [row([])],
        {
            "a": [
                {"code": "FLAME", "bbox": B, "uncertain": True},
                {"code": "UNKNOWN", "uncertain": True},
            ]
        },
    )
    assert report["negativeLabels"] == {"errors": 1, "total": 1}
    assert report["uncertainProposals"] == 1 and report["predictionAbstentions"] == 1


def test_g15_freeze_protocol_once_and_changed_threshold_rejected(tmp_path):
    import json
    import subprocess
    import sys
    from pathlib import Path

    script = Path(__file__).resolve().parents[1] / "scripts/ghs_eval.py"
    manifest = tmp_path / "manifest.json"
    protocol = tmp_path / "protocol.json"
    output = tmp_path / "result.json"
    manifest.write_text(
        json.dumps(
            {"version": "pilot-empty-v1", "annotationVersion": "1", "samples": []}
        )
    )
    command = [
        sys.executable,
        str(script),
        "freeze",
        "--manifest",
        str(manifest),
        "--protocol",
        str(protocol),
        "--output",
        str(output),
    ]
    assert subprocess.run(command, capture_output=True).returncode == 0
    bad = json.loads(protocol.read_text())
    bad["threshold"] = 0.1
    protocol.write_text(json.dumps(bad))
    command[2] = "evaluate"
    assert subprocess.run(command, capture_output=True).returncode != 0
    assert not output.exists()
    command[2] = "freeze"
    protocol.unlink()
    assert subprocess.run(command, capture_output=True).returncode == 0
    command[2] = "evaluate"
    result = subprocess.run(command, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    report = json.loads(output.read_text())
    assert all(
        s["status"] == "insufficient-evidence" for s in report["classes"].values()
    )
    assert (
        report["activeOfficialReferences"] == 9
        and not report["independentQualityEvidence"]
    )
    assert subprocess.run(command, capture_output=True).returncode != 0


def test_family_success_fails_if_other_view_has_extra_proposal():
    a = row([{"label": "FLAME", "bbox": B}])
    b = row([])
    b["sampleId"] = "b"
    report = evaluate(
        [a, b],
        {"a": [{"code": "FLAME", "bbox": B}], "b": [{"code": "CORROSION", "bbox": B}]},
    )
    assert report["classes"]["FLAME"]["correctFamilies"] == 0
    assert report["negativeLabels"]["total"] == 0


@pytest.mark.parametrize("kind", ["hash", "near"])
def test_same_split_distinct_families_not_independent(kind):
    a = sample("holdout")
    b = sample(
        "holdout",
        "b",
        "a" if kind == "hash" else "b",
        "ffffffffffffffff" if kind == "hash" else "1",
    )
    with pytest.raises(ValueError):
        validate_manifest(
            {"version": "1", "annotationVersion": "1", "samples": [a, b]}, ".", False
        )


def test_official_reference_cannot_be_holdout():
    import json
    from pathlib import Path

    manifest = json.loads(
        (
            Path(__file__).resolve().parents[1] / "app/assets/ghs/manifest.json"
        ).read_text()
    )
    a = sample("holdout", digest=manifest["templates"][0]["sha256"])
    with pytest.raises(ValueError, match="independent"):
        validate_manifest(
            {"version": "1", "annotationVersion": "1", "samples": [a]}, ".", False
        )


def test_g07_renamed_registered_pilot_hash_guard(tmp_path, monkeypatch):
    import json

    import numpy as np
    from PIL import Image

    from app.ghs_dataset import (
        assert_runtime_reference_import,
        file_hash,
        perceptual_hash,
    )

    image = tmp_path / "random.png"
    Image.fromarray(
        np.random.default_rng(31).integers(0, 256, (80, 80, 3), dtype=np.uint8)
    ).save(image)
    a = sample(
        "holdout", digest=file_hash(image), phash=f"{perceptual_hash(image):016x}"
    )
    a.update(fullImagePath=image.name, imageWidth=80, imageHeight=80)
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps({"version": "1", "annotationVersion": "1", "samples": [a]})
    )
    monkeypatch.setenv("GHS_PILOT_MANIFEST", str(manifest))
    with pytest.raises(ValueError, match="pilot"):
        assert_runtime_reference_import("renamed.png", image.read_bytes())


def test_g07_resized_official_reference_near_duplicate_rejected(tmp_path):
    from pathlib import Path

    from PIL import Image

    from app.ghs_dataset import file_hash, perceptual_hash

    src = Path(__file__).resolve().parents[1] / "app/assets/ghs/FLAME.png"
    path = tmp_path / "resized.png"
    Image.open(src).resize((160, 160)).save(path)
    a = sample("holdout", digest=file_hash(path), phash=f"{perceptual_hash(path):016x}")
    with pytest.raises(ValueError, match="independent"):
        validate_manifest(
            {"version": "1", "annotationVersion": "1", "samples": [a]}, tmp_path, False
        )


def test_uncertain_family_page_does_not_count_negative_minimum():
    a = row([])
    b = row([], readability="unreadable")
    b["sampleId"] = "b"
    assert evaluate([a, b], {})["negativeLabels"]["total"] == 0


def test_uncertain_crop_not_successful_classification():
    obj = {"label": "FLAME", "bbox": B, "cropPath": "crop.png"}
    report = evaluate([row([obj])], {}, {"a:0": {"code": "FLAME", "uncertain": True}})
    assert report["classes"]["FLAME"]["cropCorrect"] == 0
    assert report["classes"]["FLAME"]["cropAbstentions"] == 1


@pytest.mark.parametrize(
    "positive,negative,correct,errors,status",
    [
        (19, 100, 19, 0, "insufficient-evidence"),
        (20, 99, 20, 0, "insufficient-evidence"),
        (20, 100, 17, 0, "below-pilot-target"),
        (20, 100, 18, 5, "pilot-target-met-human-review"),
        (20, 100, 18, 6, "below-pilot-target"),
    ],
)
def test_accounting_pilot_threshold_boundaries_not_field_evidence(
    positive, negative, correct, errors, status
):
    rows = []
    predictions = {}
    for i in range(positive + negative):
        item = row([{"label": "FLAME", "bbox": B}] if i < positive else [])
        item["sampleId"] = item["familyId"] = str(i)
        rows.append(item)
        if i < correct or positive <= i < positive + errors:
            predictions[str(i)] = [{"code": "FLAME", "bbox": B}]
    report = evaluate(rows, predictions)
    assert report["classes"]["FLAME"]["status"] == status
    assert report["classes"]["FLAME"]["correctFamilies"] == correct
    assert report["negativeLabels"] == {"errors": errors, "total": negative}


def test_sample_unreadable_override_cannot_qualify_twenty_positive_families():
    rows = []
    predictions = {}
    for i in range(120):
        item = row(
            [{"label": "FLAME", "bbox": B, "readable": True}] if i < 20 else [],
            "unreadable" if 18 <= i < 20 else "readable",
        )
        item["sampleId"] = item["familyId"] = str(i)
        rows.append(item)
        if i < 20:
            predictions[str(i)] = [{"code": "FLAME", "bbox": B}]
    report = evaluate(rows, predictions)
    assert report["classes"]["FLAME"]["readableFamilies"] == 18
    assert report["classes"]["FLAME"]["status"] == "insufficient-evidence"
    assert report["confusionMatrix"]["UNKNOWN"]["UNKNOWN"] == 2


def test_uncertain_same_class_is_abstention_not_diagonal_or_critical_confusion():
    item = row([{"label": "FLAME", "bbox": B, "cropPath": "a.png"}])
    report = evaluate(
        [item],
        {"a": [{"code": "FLAME", "bbox": B, "uncertain": True}]},
        {"a:0": {"code": "FLAME", "uncertain": True}},
    )
    assert report["confusionMatrix"]["FLAME"]["FLAME"] == 0
    assert report["confusionMatrix"]["FLAME"]["UNKNOWN"] == 1
    assert report["cropConfusionMatrix"]["FLAME"]["FLAME"] == 0
    assert report["cropConfusionMatrix"]["FLAME"]["UNKNOWN"] == 1
    assert report["criticalConfusions"] == []


def test_unreadable_sample_crop_truth_is_unknown_even_with_readable_object_override():
    item = row(
        [{"label": "FLAME", "bbox": B, "readable": True, "cropPath": "a.png"}],
        "unreadable",
    )
    report = evaluate(
        [item],
        {"a": [{"code": "FLAME", "bbox": B}]},
        {"a:0": {"code": "FLAME", "uncertain": False}},
    )
    assert report["classes"]["FLAME"]["cropCorrect"] == 0
    assert report["cropConfusionMatrix"]["UNKNOWN"]["UNKNOWN"] == 1
    assert report["criticalConfusions"] == []


def test_maximum_cardinality_reassigns_competing_boxes():
    truth = [{"label": "FLAME", "bbox": {**B, "x": x}} for x in [0, 6]]
    predictions = [{"code": "FLAME", "bbox": {**B, "x": x}} for x in [3, -6]]
    assert len(match_objects(truth, predictions)) == 2
    report = evaluate([row(truth)], {"a": predictions})
    assert report["classes"]["FLAME"]["matched"] == 2
    assert report["classes"]["FLAME"]["misses"] == 0
    assert report["classes"]["FLAME"]["extras"] == 0
    assert report["classes"]["FLAME"]["correctFamilies"] == 1


@pytest.mark.parametrize(
    "field,value",
    [
        ("annotator", "b"),
        ("imageWidth", 0),
        ("imageHeight", float("nan")),
        ("imageWidth", float("inf")),
        ("imageWidth", True),
        ("imageHeight", -1),
    ],
)
def test_invalid_metadata_reviewers_dimensions_rejected(field, value):
    item = sample()
    item[field] = value
    with pytest.raises(ValueError):
        validate_manifest(
            {"version": "v", "annotationVersion": "a", "samples": [item]}, ".", False
        )


@pytest.mark.parametrize(
    "field,value",
    [
        ("x", -1),
        ("y", float("nan")),
        ("width", 0),
        ("height", float("inf")),
        ("x", 9),
        ("width", True),
    ],
)
def test_invalid_box_rejected_before_image_access(field, value):
    item = sample()
    box = {"x": 0, "y": 0, "width": 5, "height": 5}
    box[field] = value
    item["objects"] = [{"label": "FLAME", "bbox": box}]
    with pytest.raises(ValueError):
        validate_manifest(
            {"version": "v", "annotationVersion": "a", "samples": [item]}, ".", False
        )


def image_sample(tmp_path, family="f", split="holdout", seed=41):
    import numpy as np
    from PIL import Image

    from app.ghs_dataset import file_hash, perceptual_hash

    path = tmp_path / f"{family}.png"
    Image.fromarray(
        np.random.default_rng(seed).integers(0, 256, (80, 80, 3), dtype=np.uint8)
    ).save(path)
    item = sample(split, family, file_hash(path), f"{perceptual_hash(path):016x}")
    item.update(fullImagePath=path.name, imageWidth=80, imageHeight=80)
    return item, path


def test_actual_dimensions_verified_in_chosen_split(tmp_path):
    item, _ = image_sample(tmp_path)
    item["imageWidth"] = 81
    with pytest.raises(ValueError, match="dimensions"):
        validate_manifest(
            {"version": "v", "annotationVersion": "a", "samples": [item]}, tmp_path
        )


def add_crop(item, path):
    from app.ghs_dataset import file_hash, perceptual_hash

    item["objects"] = [
        {
            "label": "FLAME",
            "bbox": B,
            "cropPath": path.name,
            "cropHash": file_hash(path),
            "cropPerceptualHash": f"{perceptual_hash(path):016x}",
        }
    ]


def test_resized_official_crop_on_unrelated_page_is_not_independent(tmp_path):
    from pathlib import Path

    from PIL import Image

    item, _ = image_sample(tmp_path)
    crop = tmp_path / "official-crop.png"
    Image.open(Path(__file__).resolve().parents[1] / "app/assets/ghs/FLAME.png").resize(
        (160, 160)
    ).save(crop)
    add_crop(item, crop)
    with pytest.raises(ValueError, match="independent"):
        validate_manifest(
            {"version": "v", "annotationVersion": "a", "samples": [item]},
            tmp_path,
            False,
        )


@pytest.mark.parametrize("split", ["train", "holdout"])
def test_crop_near_duplicates_between_families_and_splits_rejected(tmp_path, split):
    from PIL import Image

    a, path = image_sample(tmp_path, "a", "holdout", seed=42)
    b, _ = image_sample(tmp_path, "b", split, seed=80)
    crop = tmp_path / "resized-crop.png"
    Image.open(path).resize((120, 120)).save(crop)
    add_crop(b, crop)
    with pytest.raises(ValueError, match="duplicate"):
        validate_manifest(
            {"version": "v", "annotationVersion": "a", "samples": [a, b]}, tmp_path
        )


def test_same_family_crop_reuse_allowed_and_crop_hash_verified(tmp_path):
    item, path = image_sample(tmp_path)
    add_crop(item, path)
    manifest = {"version": "v", "annotationVersion": "a", "samples": [item]}
    validate_manifest(manifest, tmp_path)
    item["objects"][0]["cropPerceptualHash"] = "ffffffffffffffff"
    with pytest.raises(ValueError, match="Perceptual checksum"):
        validate_manifest(manifest, tmp_path)


@pytest.mark.parametrize("transform", ["resized", "reencoded"])
def test_runtime_guard_denies_renamed_transformed_pilot_images(
    tmp_path, monkeypatch, transform
):
    import io
    import json

    from PIL import Image

    from app.ghs_dataset import assert_runtime_reference_import

    item, path = image_sample(tmp_path)
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps({"version": "v", "annotationVersion": "a", "samples": [item]})
    )
    monkeypatch.setenv("GHS_PILOT_MANIFEST", str(manifest))
    image = Image.open(path)
    output = io.BytesIO()
    if transform == "resized":
        image = image.resize((160, 160))
        image.save(output, format="PNG")
    else:
        image.save(output, format="BMP")
    with pytest.raises(ValueError, match="pilot"):
        assert_runtime_reference_import("renamed.png", output.getvalue())


def cli_run(tmp_path, action, protocol="protocol.json", script=None):
    import subprocess
    import sys
    from pathlib import Path

    script = script or Path(__file__).resolve().parents[1] / "scripts/ghs_eval.py"
    return subprocess.run(
        [
            sys.executable,
            str(script),
            action,
            "--manifest",
            str(tmp_path / "manifest.json"),
            "--protocol",
            str(tmp_path / protocol),
            "--output",
            str(tmp_path / "result.json"),
        ],
        capture_output=True,
        text=True,
    )


def test_two_protocol_filenames_cannot_reexpose_same_final_dataset(tmp_path):
    import json

    (tmp_path / "manifest.json").write_text(
        json.dumps({"version": "v", "annotationVersion": "a", "samples": []})
    )
    assert cli_run(tmp_path, "freeze", "one.json").returncode == 0
    assert cli_run(tmp_path, "freeze", "two.json").returncode == 0
    assert cli_run(tmp_path, "evaluate", "one.json").returncode == 0
    result = cli_run(tmp_path, "evaluate", "two.json")
    assert result.returncode != 0 and "FileExistsError" in result.stderr
    assert len(list(tmp_path.glob(".ghs-final-*.exposed"))) == 1


def test_invalid_metadata_preflight_does_not_expose_holdout(tmp_path):
    import json

    item = sample("holdout")
    item["annotator"] = item["secondReviewer"]
    (tmp_path / "manifest.json").write_text(
        json.dumps({"version": "v", "annotationVersion": "a", "samples": [item]})
    )
    result = cli_run(tmp_path, "evaluate")
    assert result.returncode != 0 and "Distinct annotator" in result.stderr
    assert not list(tmp_path.glob(".ghs-final-*.exposed"))


def test_final_exposure_retained_after_image_decode_failure(tmp_path):
    import json

    from app.ghs_dataset import file_hash

    image = tmp_path / "broken.png"
    image.write_bytes(b"not an image")
    item = sample("holdout", digest=file_hash(image))
    item["fullImagePath"] = image.name
    (tmp_path / "manifest.json").write_text(
        json.dumps({"version": "v", "annotationVersion": "a", "samples": [item]})
    )
    # Freeze/preflight must not decode final data, so malformed bytes do not block freezing.
    result = cli_run(tmp_path, "freeze")
    assert result.returncode == 0, result.stderr
    result = cli_run(tmp_path, "evaluate")
    assert result.returncode != 0 and "cannot identify image" in result.stderr
    assert len(list(tmp_path.glob(".ghs-final-*.exposed"))) == 1
    assert cli_run(tmp_path, "freeze", "other.json").returncode == 0
    assert "FileExistsError" in cli_run(tmp_path, "evaluate", "other.json").stderr


def test_dirty_normalization_source_change_invalidates_protocol(tmp_path):
    import json
    import shutil
    from pathlib import Path

    source = Path(__file__).resolve().parents[1]
    copy = tmp_path / "service"
    files = [
        "scripts/ghs_eval.py",
        "app/symbol_contract.py",
        "app/ghs_dataset.py",
        "app/ghs_evaluation.py",
        "app/services/ghs_reference.py",
        "app/services/reference_category.py",
    ]
    for relative in files:
        target = copy / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / relative, target)
    shutil.copytree(source / "app/assets/ghs", copy / "app/assets/ghs")
    shutil.copyfile(
        source.parent / "api/src/services/reference-code-mapping.json",
        copy / "reference-code-mapping.json",
    )
    (tmp_path / "manifest.json").write_text(
        json.dumps({"version": "v", "annotationVersion": "a", "samples": []})
    )
    result = cli_run(tmp_path, "freeze", script=copy / "scripts/ghs_eval.py")
    assert result.returncode == 0, result.stderr
    protocol = json.loads((tmp_path / "protocol.json").read_text())
    assert protocol["labelMap"]["aliases"]["GHS02"] == "FLAME"
    assert protocol["categoryMapping"]["aliases"]["GHS02"] == "FLAME"
    assert "app/symbol_contract.py" in protocol["sourceHashes"]
    normalization = copy / "app/symbol_contract.py"
    normalization.write_text(
        normalization.read_text().replace(
            "return GHS_ALIASES.get(value, value)", "return value"
        )
    )
    result = cli_run(tmp_path, "evaluate", script=copy / "scripts/ghs_eval.py")
    assert result.returncode != 0 and "Frozen protocol changed" in result.stderr
    assert not list(tmp_path.glob(".ghs-final-*.exposed"))


def test_runtime_guard_checks_transformed_crop_as_well_as_full_image(
    tmp_path, monkeypatch
):
    import io
    import json

    from PIL import Image

    from app.ghs_dataset import assert_runtime_reference_import

    item, _ = image_sample(tmp_path, "page", seed=123)
    _, crop = image_sample(tmp_path, "crop", seed=456)
    add_crop(item, crop)
    (tmp_path / "manifest.json").write_text(
        json.dumps({"version": "v", "annotationVersion": "a", "samples": [item]})
    )
    monkeypatch.setenv("GHS_PILOT_MANIFEST", str(tmp_path / "manifest.json"))
    output = io.BytesIO()
    Image.open(crop).resize((160, 160)).save(output, format="BMP")
    with pytest.raises(ValueError, match="pilot"):
        assert_runtime_reference_import("renamed-crop.bmp", output.getvalue())
