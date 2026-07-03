"""Story 12.8 (AC4b) — localize codes-filter tests.

Covers the ML-side reference-library subset filter that the kruischeck flow uses
to detect ONLY the declared (alias-mapped) codes: an empty/None filter keeps the
whole library (existing behaviour), a filter restricts the set case-insensitively,
and a filter matching nothing yields an empty set (open-input gate → no detections).

The test targets the pure `filter_templates_by_codes` helper so it needs no
storage/DB. It imports `app.api.artwork`, which pulls numpy/fastapi/opencv — where
those runtime deps are absent (e.g. a bare dev box) the test skips cleanly; it runs
in CI / on the ml-service image where the deps are installed.
"""

import pytest

pytest.importorskip("numpy")
pytest.importorskip("fastapi")
pytest.importorskip("cv2")

from app.api.artwork import filter_templates_by_codes  # noqa: E402


def _tpl(code):
    # The helper only reads t3777_code; the image is irrelevant here.
    return {"t3777_code": code, "image": object()}


def test_empty_filter_keeps_whole_library():
    templates = [_tpl("GREEN_DOT"), _tpl("EU_ORGANIC_FARMING")]
    assert filter_templates_by_codes(templates, None) == templates
    assert filter_templates_by_codes(templates, []) == templates


def test_filter_restricts_to_the_declared_subset():
    templates = [_tpl("GREEN_DOT"), _tpl("EU_ORGANIC_FARMING"), _tpl("FSC_MIX")]
    out = filter_templates_by_codes(templates, ["GREEN_DOT", "FSC_MIX"])
    assert [t["t3777_code"] for t in out] == ["GREEN_DOT", "FSC_MIX"]


def test_filter_is_case_insensitive_and_trims():
    templates = [_tpl("GREEN_DOT")]
    out = filter_templates_by_codes(templates, ["  green_dot  "])
    assert [t["t3777_code"] for t in out] == ["GREEN_DOT"]


def test_filter_matching_nothing_yields_empty_set():
    templates = [_tpl("GREEN_DOT"), _tpl("EU_ORGANIC_FARMING")]
    assert filter_templates_by_codes(templates, ["NONEXISTENT_CODE"]) == []


def test_whitespace_only_filter_is_treated_as_no_filter():
    templates = [_tpl("GREEN_DOT")]
    assert filter_templates_by_codes(templates, ["   ", ""]) == templates
