"""Story 20.11 — de declaratie-oogst mag niet stilzwijgend door het geheugen sneuvelen.

Aanleiding (ACC, 2026-07-27): een run over 173 paren met de default-batch werd
OOM-killed (anon-rss 7,03 GB, limiet 8 GiB). Twee retainers hielden het geheugen vast:

  a) de page-cache groeide onbegrensd met het aantal unieke pagina's in de batch;
  b) de gequeuede crops waren numpy-VIEWS op de volledige pagina — daardoor bleven
     tot ~105 complete artworks in leven tot de insert aan het eind.

(b) was in de eerste analyse gemist; alleen (a) begrenzen had de OOM níét opgelost.

Deze suite dekt het nieuwe gedrag; de bestaande 20.2-suite bewaakt dat floor/dedup/
cap/cross-code/keyline byte-gelijk blijven.
"""

import importlib.util
import sys
import types

import numpy as np
import pytest


def _load_module(monkeypatch):
    """Laad de module met dezelfde stubs als de 20.2-suite (cv2 + logging)."""
    for name in ("app", "app.core", "app.services"):
        mod = types.ModuleType(name)
        mod.__path__ = []
        monkeypatch.setitem(sys.modules, name, mod)

    log_stub = types.ModuleType("app.core.logging")

    class _L:
        def info(self, *a, **k):
            pass

        def warning(self, *a, **k):
            pass

        def error(self, *a, **k):
            pass

    log_stub.logger = _L()
    monkeypatch.setitem(sys.modules, "app.core.logging", log_stub)

    cv2_stub = types.ModuleType("cv2")
    cv2_stub.IMREAD_COLOR = 1
    cv2_stub.imdecode = lambda *a, **k: None
    cv2_stub.imencode = lambda *a, **k: (True, np.zeros(8, np.uint8))
    cv2_stub.__spec__ = importlib.util.spec_from_loader("cv2", loader=None)
    monkeypatch.setitem(sys.modules, "cv2", cv2_stub)

    spec = importlib.util.spec_from_file_location(
        "app.services.queue_harvest_declared",
        "app/services/queue_harvest_declared.py",
    )
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "app.services.queue_harvest_declared", module)
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# AC2 — retainer (b): een gequeuede crop houdt de pagina NIET vast
# ---------------------------------------------------------------------------


def test_crop_is_losgekoppeld_van_de_pagina(monkeypatch):
    """De kern van de OOM: een view houdt de hele pagina in leven.

    `crop.base is None` bewijst dat de crop zijn eigen geheugen heeft. Draai
    `.copy()` terug en deze test valt om (`base` wijst dan naar de pagina-array).
    """
    m = _load_module(monkeypatch)
    pagina = np.zeros((2000, 2000, 3), np.uint8)  # ~12 MB
    crop = m._crop_bgr(pagina, (10, 10, 40, 40))

    assert crop is not None
    assert crop.base is None, "crop is nog een view op de pagina — houdt ~12 MB vast"
    assert crop.shape == (40, 40, 3)


def test_crop_overleeft_het_vrijgeven_van_de_pagina(monkeypatch):
    """Praktijktest: de pagina loslaten mag de crop niet ongeldig maken."""
    m = _load_module(monkeypatch)
    pagina = np.full((500, 500, 3), 7, np.uint8)
    crop = m._crop_bgr(pagina, (0, 0, 20, 20))
    del pagina
    assert crop is not None and int(crop[0, 0, 0]) == 7


def test_te_kleine_regio_blijft_none(monkeypatch):
    """Bestaand gedrag ongewijzigd: <4px levert None, niet een lege kopie."""
    m = _load_module(monkeypatch)
    pagina = np.zeros((50, 50, 3), np.uint8)
    assert m._crop_bgr(pagina, (0, 0, 2, 2)) is None
    assert m._crop_bgr(pagina, (0, 0, 0, 0)) is None


# ---------------------------------------------------------------------------
# AC4 — geheugendruk uit de CGROUP (niet de eigen RSS)
# ---------------------------------------------------------------------------


def test_geheugendruk_leest_cgroup_v2(monkeypatch, tmp_path):
    m = _load_module(monkeypatch)
    monkeypatch.setattr(m, "_read_int", lambda p: 8 if p.endswith("memory.current") else 10)
    assert m.memory_pressure(0.75) is True   # 8/10 = 80%
    assert m.memory_pressure(0.90) is False


def test_geen_limiet_of_onleesbaar_geeft_geen_valse_stop(monkeypatch):
    """Zonder leesbare cgroup mag de oogst NIET gaan stoppen — fail-open."""
    m = _load_module(monkeypatch)
    monkeypatch.setattr(m, "_read_int", lambda p: None)
    assert m.memory_pressure(0.75) is False


def test_drempel_nul_schakelt_de_bewaking_uit(monkeypatch):
    m = _load_module(monkeypatch)
    monkeypatch.setattr(m, "_read_int", lambda p: 10 if p.endswith("current") else 10)
    assert m.memory_pressure(0.0) is False


def test_cgroup_v1_fallback(monkeypatch):
    """v1 gebruikt andere bestandsnamen; de helper moet terugvallen."""
    m = _load_module(monkeypatch)

    def fake(p):
        if p == "/sys/fs/cgroup/memory/memory.usage_in_bytes":
            return 900
        if p == "/sys/fs/cgroup/memory/memory.limit_in_bytes":
            return 1000
        return None  # v2-paden bestaan niet

    monkeypatch.setattr(m, "_read_int", fake)
    use, lim = m.cgroup_memory()
    assert (use, lim) == (900, 1000)
    assert m.memory_pressure(0.75) is True


def test_v1_zonder_limiet_telt_als_geen_limiet(monkeypatch):
    """cgroup v1 zet een absurd hoog getal als er geen limiet is — niet als grens lezen."""
    m = _load_module(monkeypatch)

    def fake(p):
        if p.endswith("usage_in_bytes"):
            return 10**9
        if p.endswith("limit_in_bytes"):
            return (1 << 63) - 1
        return None

    monkeypatch.setattr(m, "_read_int", fake)
    _, lim = m.cgroup_memory()
    assert lim is None
    assert m.memory_pressure(0.5) is False


def test_read_int_hanteert_max_en_rommel(monkeypatch, tmp_path):
    m = _load_module(monkeypatch)
    p = tmp_path / "v"
    p.write_text("max")
    assert m._read_int(str(p)) is None
    p.write_text("1234")
    assert m._read_int(str(p)) == 1234
    assert m._read_int(str(tmp_path / "bestaat-niet")) is None


# ---------------------------------------------------------------------------
# AC3/AC6 — offset, flush-volgorde en run-marker (via een ECHTE run_batch)
# ---------------------------------------------------------------------------
#
# Deze tests roepen `run_batch` daadwerkelijk aan. De eerste testronde deed dat
# NIET — daardoor bleef een livelock onopgemerkt: de pagina-groepen werden op
# paginasleutel gesorteerd, terwijl de offset een aaneengesloten prefix over de
# OORSPRONKELIJKE parenlijst is. Brak de run vroeg af (timebox of geheugenstop),
# dan bleef `to_offset == from_offset` en deed de volgende run exact hetzelfde
# werk opnieuw — stil, want dedup blokkeert dubbele rijen.

import json  # noqa: E402
import os  # noqa: E402

sys.path.insert(0, os.path.dirname(__file__))

from test_queue_harvest_declared_20_2 import _Harness, _page, _region  # noqa: E402


def _state_of(res):
    raw = res.storage.store.get("keurmerk-harvest/declared-harvest-state.json")
    return json.loads(raw.decode("utf-8")) if raw else {}


def test_page_order_zet_de_groep_met_de_laagste_index_eerst(monkeypatch):
    """H1-regressie, direct op de sorteerlogica.

    Paginasleutels staan hier bewust omgekeerd t.o.v. de paar-indices. Met
    `sorted(groups)` (op sleutel) komt `a_page` eerst en blijft index 0 liggen —
    breekt de run daarvoor af, dan schuift de offset nooit op → livelock.
    """
    m = _load_module(monkeypatch)
    groups = {"z_page": [0, 2], "a_page": [1, 3], "m_page": [4, 5]}

    assert m.page_order(groups) == ["z_page", "a_page", "m_page"]
    # Contrast: sorteren op sleutel zou hier fout zijn.
    assert sorted(groups) == ["a_page", "m_page", "z_page"]


def test_page_order_garandeert_voortgang_bij_vroege_afbreking(monkeypatch):
    """Na ALLEEN de eerste groep moet de aaneengesloten prefix al opschuiven."""
    m = _load_module(monkeypatch)
    next_offset = 0
    groups = {"z_page": [0, 2], "a_page": [1, 3]}

    def reached(done):
        r = next_offset
        while r in done:
            r += 1
        return r

    order = m.page_order(groups)
    done = set(groups[order[0]])          # run breekt af na de eerste groep
    assert reached(done) > next_offset, "geen voortgang -> de run zou zichzelf herhalen"

    # Met de foute volgorde (op sleutel) staat de offset wél stil:
    done_fout = set(groups[sorted(groups)[0]])
    assert reached(done_fout) == next_offset


def test_page_order_is_deterministisch(monkeypatch):
    m = _load_module(monkeypatch)
    g = {"b": [3], "a": [1], "c": [2]}
    assert m.page_order(g) == m.page_order(dict(reversed(list(g.items()))))


def test_offset_en_marker_na_een_nette_run(monkeypatch):
    """AC3 — offset gecheckpoint, run-marker opgeruimd."""
    res = _Harness(monkeypatch).run(
        [_page("111", _region(sim=0.9)), _page("222", _region(sim=0.9))],
        {"AISE_1": ["111", "222"]},
    )
    st = _state_of(res)
    assert res.result["status"] == "ok"
    assert st["next_offset"] == res.result["to_offset"] == 2
    assert "in_progress" not in st, "run-marker moet bij nette afsluiting weg zijn"
    assert "run_started_at" not in st


def test_flush_gaat_vooraf_aan_checkpoint(monkeypatch):
    """AC3 — de offset mag nooit voorlopen op de ingevoegde rijen."""
    res = _Harness(monkeypatch).run(
        [_page("111", _region(sim=0.9)), _page("222", _region(sim=0.9))],
        {"AISE_1": ["111", "222"]},
    )
    assert res.result["inserted"] == 2
    assert _state_of(res)["next_offset"] == 2


def test_dry_run_raakt_de_state_niet(monkeypatch):
    """AC3 — DRY_RUN schrijft geen offset en geen marker."""
    res = _Harness(monkeypatch).run(
        [_page("111", _region(sim=0.9))], {"AISE_1": ["111"]}, dry_run=True
    )
    assert res.result["dry_run"] is True
    assert _state_of(res) == {}


def test_per_code_cap_blijft_run_breed_ondanks_tussentijds_legen(monkeypatch):
    """AC5 — de cap telt per RUN, niet per flush.

    De queue wordt tussentijds geleegd; tellen op `len(queue[code])` zou de cap
    daardoor per flush laten resetten. Dat zou een stille gedragswijziging zijn.
    """
    res = _Harness(monkeypatch).run(
        [_page(str(100 + n), _region(sim=0.9)) for n in range(5)],
        {"AISE_1": [str(100 + n) for n in range(5)]},
        per_code_cap=2,
    )
    assert res.result["inserted"] == 2
    assert res.result["skipped_cap"] == 3
