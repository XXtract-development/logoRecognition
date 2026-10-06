import importlib.util
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location(
    "reference_content_test",
    Path(__file__).resolve().parents[2] / "app/services/reference_content.py",
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@pytest.mark.parametrize(
    "color",
    [(255, 255, 255, 255), (0, 0, 0, 255), (34, 80, 120, 255), (34, 80, 120, 0)],
)
def test_uniform_surface_rejected(color):
    with pytest.raises(ValueError, match="centrale beeldinhoud"):
        module.assert_reference_content(Image.new("RGBA", (200, 200), color))


def test_outside_frame_rejected():
    image = Image.new("RGB", (200, 200), "white")
    ImageDraw.Draw(image).rectangle((1, 1, 198, 198), outline="black", width=2)
    with pytest.raises(ValueError):
        module.assert_reference_content(image)


@pytest.mark.parametrize(
    "background,color",
    [("white", "black"), ("black", "white"), ((0, 0, 0, 0), "#54949e")],
)
def test_sparse_central_mark_allowed(background, color):
    image = Image.new("RGBA", (200, 200), background)
    ImageDraw.Draw(image).line((100, 70, 100, 130), fill=color, width=1)
    module.assert_reference_content(image)


def test_actual_blank_print_frame_regression_fixture():
    import hashlib, json

    directory = Path(__file__).resolve().parents[1] / "fixtures/reference-content"
    provenance = json.loads((directory / "provenance.json").read_text())
    path = directory / provenance["fixture"]
    assert (
        hashlib.sha256(path.read_bytes()).hexdigest() == provenance["fixtureFileSha256"]
    )
    with Image.open(path) as image, pytest.raises(
        ValueError, match="centrale beeldinhoud"
    ):
        module.assert_reference_content(image)


import hashlib
import json

SHARED_DIRECTORY = Path(__file__).resolve().parents[1] / "fixtures/reference-content"
SHARED_CASES = json.loads((SHARED_DIRECTORY / "contract-cases.json").read_text())


@pytest.mark.parametrize(
    "case", SHARED_CASES, ids=[case["file"] for case in SHARED_CASES]
)
def test_shared_encoded_contract(case):
    path = SHARED_DIRECTORY / case["file"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == case["sha256"]
    with Image.open(path) as image:
        if case["accepted"]:
            module.assert_reference_content(image)
        else:
            with pytest.raises(ValueError, match="centrale beeldinhoud"):
                module.assert_reference_content(image)


def test_actual_positive_people_nature_seal():
    provenance = json.loads((SHARED_DIRECTORY / "positive-provenance.json").read_text())
    path = SHARED_DIRECTORY / provenance["fixture"]
    assert (
        hashlib.sha256(path.read_bytes()).hexdigest() == provenance["fixtureFileSha256"]
    )
    with Image.open(path) as image:
        module.assert_reference_content(image)
