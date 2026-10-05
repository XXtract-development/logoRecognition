"""Actual template matching refines spatial regions without deciding logo codes."""

import importlib

import cv2
import numpy as np
import pytest


@pytest.fixture
def refinement(monkeypatch, tmp_path):
    from app.core.config import settings

    monkeypatch.setattr(settings, "MODEL_PATH", str(tmp_path / "models"))
    return importlib.import_module("app.services.artwork_template_refinement")


def assert_mark_recovered(box, expected):
    from app.services.localization import _iou

    assert box is not None
    assert _iou(box, expected) >= 0.95


def test_actual_matching_keeps_late_variant_and_repairs_partial_region(refinement):
    rng = np.random.default_rng(871)
    template = rng.integers(0, 256, (20, 20, 3), dtype=np.uint8)
    mark = cv2.resize(template, (60, 60), interpolation=cv2.INTER_LINEAR)
    image = np.full((300, 400, 3), 255, dtype=np.uint8)
    image[125:185, 207:267] = mark
    templates = [
        {
            "t3777_code": "OTHER",
            "image": rng.integers(0, 256, (20, 20, 3), dtype=np.uint8),
        }
        for _ in range(5)
    ] + [{"t3777_code": "LATE_VARIANT", "image": template}]
    result = refinement.refine_proposal(
        image, {"x": 200, "y": 120, "width": 60, "height": 65}, templates
    )
    assert_mark_recovered(result, {"x": 207, "y": 125, "width": 60, "height": 60})
    assert set(result) == {"x", "y", "width", "height"}


def test_no_matching_region_is_a_valid_spatial_abstention(refinement):
    rng = np.random.default_rng(71)
    image = np.full((100, 100, 3), 255, dtype=np.uint8)
    template = rng.integers(0, 256, (20, 20, 3), dtype=np.uint8)
    assert (
        refinement.refine_proposal(
            image,
            {"x": 0, "y": 0, "width": 100, "height": 100},
            [{"t3777_code": "REF", "image": template}],
        )
        is None
    )


def test_solid_dark_patch_cannot_outrank_a_visible_mark(refinement):
    rng = np.random.default_rng(814)
    template = rng.integers(0, 256, (20, 20, 3), dtype=np.uint8)
    image = np.full((300, 400, 3), 255, dtype=np.uint8)
    image[125:185, 207:267] = cv2.resize(template, (60, 60))
    image[200:260, 280:340] = 0
    result = refinement.refine_proposal(
        image,
        {"x": 200, "y": 120, "width": 140, "height": 140},
        [
            {"t3777_code": "SOLID", "image": np.zeros((20, 20, 3), dtype=np.uint8)},
            {"t3777_code": "VISIBLE", "image": template},
        ],
    )
    assert_mark_recovered(result, {"x": 207, "y": 125, "width": 60, "height": 60})


def test_tiny_text_fragment_is_not_a_complete_mark_refinement(refinement):
    rng = np.random.default_rng(95)
    template = rng.integers(0, 256, (4, 4, 3), dtype=np.uint8)
    image = np.full((200, 200, 3), 255, dtype=np.uint8)
    image[90:98, 80:88] = cv2.resize(template, (8, 8))
    assert (
        refinement.refine_proposal(
            image,
            {"x": 0, "y": 0, "width": 200, "height": 200},
            [{"t3777_code": "TINY", "image": template}],
        )
        is None
    )


def test_adjacent_marks_survive_location_collapse(refinement):
    rng = np.random.default_rng(200)
    template = rng.integers(0, 256, (20, 20, 3), dtype=np.uint8)
    image = np.full((300, 400, 3), 255, dtype=np.uint8)
    mark = cv2.resize(template, (60, 60))
    image[125:185, 100:160] = mark
    image[125:185, 260:320] = mark
    boxes = refinement.refine_proposals(
        image,
        {"x": 90, "y": 120, "width": 230, "height": 70},
        [{"t3777_code": "MARK", "image": template}],
    )
    assert len(boxes) == 2
    first, second = sorted(boxes, key=lambda box: box["x"])
    assert_mark_recovered(first, {"x": 100, "y": 125, "width": 60, "height": 60})
    assert_mark_recovered(second, {"x": 260, "y": 125, "width": 60, "height": 60})


def test_required_reference_library_cannot_be_silently_empty(refinement):
    with pytest.raises(ValueError, match="library is empty"):
        refinement.refine_proposal(
            np.zeros((100, 100, 3), dtype=np.uint8),
            {"x": 0, "y": 0, "width": 100, "height": 100},
            [],
        )


def test_valid_tiny_proposal_abstains_while_original_geometry_remains_valid(refinement):
    assert (
        refinement.refine_proposal(
            np.zeros((100, 100, 3), dtype=np.uint8),
            {"x": 50, "y": 50, "width": 1, "height": 1},
            [{"t3777_code": "REF", "image": np.ones((20, 20, 3), dtype=np.uint8)}],
        )
        is None
    )


@pytest.mark.parametrize(
    "bbox",
    [
        {"x": -1, "y": 0, "width": 10, "height": 10},
        {"x": 0, "y": 0, "width": 0, "height": 10},
        {"x": 95, "y": 0, "width": 10, "height": 10},
        {"x": 0.5, "y": 0, "width": 10, "height": 10},
    ],
)
def test_bad_spatial_geometry_is_an_operational_error(refinement, bbox):
    with pytest.raises(ValueError, match="Invalid refinement region"):
        refinement.refine_proposal(np.zeros((100, 100, 3), dtype=np.uint8), bbox, [{}])
