"""
Story 12.1 / Task 5 — ATDD voor de GS1 Label Guide extractie (Task 1).

Unit: de anker→code mapping (exact / buur-anker / geen code).
Integratie (geskipt als de guide niet aanwezig is): proof-slice levert 5 bruikbare logo's,
met JPEG→PNG-transcode en below-min-res-vlag.
"""
import importlib.util
import os
import sys

_SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "apps", "api", "scripts", "extract_gs1_label_guide.py",
)
_spec = importlib.util.spec_from_file_location("extract_gs1", _SCRIPT)
assert _spec and _spec.loader
extract_gs1 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(extract_gs1)


class _FakeWS:
    """Minimal worksheet stub: column-A code per 1-based row."""
    def __init__(self, col_a: dict[int, str]):
        self._a = col_a

    def cell(self, row: int, column: int):
        class _C:
            value = self._a.get(row) if column == 1 else None
        return _C()


def test_anchor_maps_to_exact_code_on_same_row():
    ws = _FakeWS({5: "RECYCLABLE_GENERAL_CLAIM"})
    code, neighbor = extract_gs1._code_for_anchor_row(ws, 5)
    assert code == "RECYCLABLE_GENERAL_CLAIM"
    assert neighbor is False


def test_anchor_falls_back_to_neighbor_row_above_and_flags_it():
    # image anchored at row 7, code lives at row 6 (empty col-A at 7)
    ws = _FakeWS({6: "TRIMAN"})
    code, neighbor = extract_gs1._code_for_anchor_row(ws, 7)
    assert code == "TRIMAN"
    assert neighbor is True   # neighbour-anchor must be flagged for review


def test_anchor_returns_none_when_no_code_within_window():
    ws = _FakeWS({1: "FAR_AWAY"})
    code, _neighbor = extract_gs1._code_for_anchor_row(ws, 10)
    assert code is None


def test_placeholder_and_minres_constants_are_sane():
    assert extract_gs1.PLACEHOLDER_MAX >= 1
    assert extract_gs1.MIN_RES == 200
    assert extract_gs1.FIELD_TYPE == "PackagingMarkedLabelAccreditationCode"


# --- Integration (real guide; skipped when absent) ---
import pytest  # noqa: E402

_GUIDE = os.path.expanduser("~/Downloads/Packaging_label_guide_January2026_3_1_35.xlsx")
PROOF_SLICE = [
    "RECYCLABLE_GENERAL_CLAIM", "TRIMAN", "BETER_LEVEN_1_STER",
    "EUROPEAN_V_LABEL_VEGETARIAN", "MARINE_STEWARDSHIP_COUNCIL_LABEL",
]


@pytest.mark.skipif(not os.path.isfile(_GUIDE), reason="GS1 guide xlsx not present")
def test_proof_slice_extracts_five_usable_png_logos(tmp_path):
    import json
    sys.argv = ["x", "--xlsx", _GUIDE, "--out", str(tmp_path), "--codes", ",".join(PROOF_SLICE)]
    rc = extract_gs1.main()
    assert rc == 0
    manifest = json.load(open(tmp_path / "manifest.json"))
    codes = {e["code"] for e in manifest["entries"]}
    assert set(PROOF_SLICE) <= codes, f"missing: {set(PROOF_SLICE) - codes}"
    for e in manifest["entries"]:
        assert (tmp_path / e["file"]).is_file()
        assert e["file"].endswith(".png")          # all transcoded to PNG
        assert e["fieldType"] == "PackagingMarkedLabelAccreditationCode"
    # BETER_LEVEN is JPEG in the guide → must be transcoded to PNG on disk
    bl = next(e for e in manifest["entries"] if e["code"] == "BETER_LEVEN_1_STER")
    assert bl["file"].endswith(".png")
    # small logos flagged below-min-res (seeds may be < 200px)
    triman = next(e for e in manifest["entries"] if e["code"] == "TRIMAN")
    assert triman["belowMinRes"] is True


# --- Story 20.1: multi-sheet extractie (Labels_Instructions, categorie 3) ---

def test_normalize_code_collapses_spaces_around_underscores():
    # De gids bevat de typo "CLOSE _THE_LID" (spatie voor de underscore).
    assert extract_gs1._normalize_code("CLOSE _THE_LID") == "CLOSE_THE_LID"
    assert extract_gs1._normalize_code("  KEEP_AWAY_FROM_CHILDREN  ") == "KEEP_AWAY_FROM_CHILDREN"
    assert extract_gs1._normalize_code("DO NOT INGEST") == "DO_NOT_INGEST"


def test_normalize_code_is_identity_for_clean_codes():
    for c in ("RECYCLABLE_GENERAL_CLAIM", "AISE_1", "NUTRISCORE_A", "TRIMAN"):
        assert extract_gs1._normalize_code(c) == c


def test_header_text_is_not_a_valid_code():
    header = "GDS Code - for use with Attribute: consumerUsageLabelCode"
    assert not extract_gs1._is_valid_code(extract_gs1._normalize_code(header))
    assert extract_gs1._is_valid_code("KEEP_AWAY_FROM_CHILDREN")
    assert extract_gs1._is_valid_code("AISE_1")
    # legitieme keurmerk-codes met +/haakjes/mixed case blijven geldig
    assert extract_gs1._is_valid_code("ENERGY_LABEL_A+")
    assert extract_gs1._is_valid_code("RABBINICAL_COUNCIL_OF_CALIFORNIA_(RCC)")


@pytest.mark.skipif(not os.path.isfile(_GUIDE), reason="GS1 guide xlsx not present")
def test_instructions_sheet_extracts_consumerusage_pictograms(tmp_path):
    import json
    out = tmp_path / "out"
    sys.argv = [
        "x", "--xlsx", _GUIDE, "--out", str(out),
        "--sheet", "Labels_Instructions",
        "--field-type", "EU_consumerUsageLabelCodeList",
        "--gs1-field", "enumerationValue",
        "--normalize-codes",
    ]
    rc = extract_gs1.main()
    assert rc == 0
    manifest = json.loads((out / "manifest.json").read_text())
    assert manifest["sheet"] == "Labels_Instructions"
    entries = manifest["entries"]
    assert len(entries) >= 10  # 12 pictogrammen, wmf-drops gerapporteerd i.p.v. stil
    codes = {e["code"] for e in entries}
    assert "CLOSE_THE_LID" in codes  # typo genormaliseerd
    assert "KEEP_AWAY_FROM_CHILDREN" in codes
    for e in entries:
        assert e["fieldType"] == "EU_consumerUsageLabelCodeList"
        assert e["gs1Field"] == "enumerationValue"
        assert extract_gs1._is_valid_code(e["code"])
