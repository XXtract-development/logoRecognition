"""ATDD spec-logo-scan-k4aa CAP-8b (norm aangepast 31-10-2026, akkoord Friso): de route wijkt
niet meer af van spike K4-aa run 1 dan spike run 2 van run 1, in beide richtingen."""

import importlib.util
import json
import types
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/k4aa_vergelijk.py"


def load():
    spec = importlib.util.spec_from_file_location("k4aa_vergelijk", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_norm_passes_when_route_is_as_close_as_the_spike_to_itself():
    v = load()
    assert v.norm_geslaagd([21, 23], [21, 27], [21, 25], [21, 27]) is True


def test_norm_fails_on_the_measurement_of_31_10():
    v = load()
    # gemeten 31-10: route→spike 21/23, spike→route 21/27; spike run2→run1 22/25, run1→run2 23/27
    assert v.norm_geslaagd([21, 23], [21, 27], [22, 25], [23, 27]) is False


def test_norm_fails_when_one_direction_is_worse_than_the_spike_itself():
    v = load()
    assert v.norm_geslaagd([21, 23], [20, 27], [21, 25], [21, 27]) is False
    assert v.norm_geslaagd([20, 25], [21, 27], [21, 25], [21, 27]) is False


def test_norm_fails_without_reports():
    v = load()
    assert v.norm_geslaagd([0, 0], [21, 27], [21, 25], [21, 27]) is False
    assert v.norm_geslaagd([21, 23], [21, 27], [0, 0], [21, 27]) is False


def m(code, box):
    return {"code": code, "vak": box}


X, Y, Z, W = m("c1", [0, 0, 1, 1]), m("c2", [2, 2, 3, 3]), m("c3", [4, 4, 5, 5]), m("c1", [6, 6, 7, 7])


def stub(monkeypatch, v, runs):
    monkeypatch.setattr(v, "_tel", lambda: types.SimpleNamespace(iou=lambda a, b: float(a == b)))
    monkeypatch.setattr(v, "spike_k4", lambda kaart, run="run1": runs[kaart][run])


def test_failures_count_as_misses_and_missing_run1_is_skipped(monkeypatch):
    v = load()
    stub(monkeypatch, v, {"a": {"run1": [X], "run2": [X, Y]},
                          "b": {"run1": [W], "run2": None},
                          "c": {"run1": None, "run2": [Z]}})  # fmt: skip
    sp = v.spreiding(["a", "b", "c"])
    assert sp == {"run2_in_run1": [1, 2], "run1_in_run2": [1, 2],
                  "run1_mislukt": ["c"], "run2_mislukt": ["b"]}  # fmt: skip
    rows = [{"kaart": "a", "bouw": [X, Z]}, {"kaart": "b", "fout": "provider_timeout"},
            {"kaart": "c", "bouw": [Z]}]  # fmt: skip
    s = v._beoordeel({}, rows)
    assert s["bouw_in_spike"] == [1, 2]
    assert s["spike_in_bouw"] == [1, 2]  # W on the failed label counts as a miss
    assert s["mislukt"] == ["b"]


def test_beoordeel_compares_each_direction_with_its_own_spike_direction(monkeypatch):
    v = load()
    # route 1/2 and 1/1; spike run2→run1 1/2 and run1→run2 1/1: passes, swapped it would fail
    stub(monkeypatch, v, {"a": {"run1": [X], "run2": [X, Y]}})
    s = v._beoordeel({}, [{"kaart": "a", "bouw": [X, Z]}])
    assert (s["bouw_in_spike"], s["spike_in_bouw"]) == ([1, 2], [1, 1])
    assert s["geslaagd"] is True
    assert v.norm_geslaagd([1, 2], [1, 1], [1, 1], [1, 2]) is False


def test_norm_keeps_previous_verdict_and_needs_route_json(monkeypatch, tmp_path, capsys):
    v = load()
    monkeypatch.setattr(v, "OUT", tmp_path)
    with pytest.raises(SystemExit, match="route"):
        v.norm()
    stub(monkeypatch, v, {"a": {"run1": [X], "run2": [X]}})
    previous = {"bouw_in_spike": [9, 9], "geslaagd": False}
    (tmp_path / "route.json").write_text(
        json.dumps({"samenvatting": previous, "etiketten": [{"kaart": "a", "bouw": [X]}]})
    )
    assert v.norm() is True
    data = json.loads((tmp_path / "route.json").read_text())
    assert data["samenvatting_vorige"] == previous
    assert data["herbeoordeeld_op"]
    assert "SPEC.md CAP-8b" in capsys.readouterr().out
