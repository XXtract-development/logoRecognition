"""Reviewtests bij de besluiten van 01-11-2026 (spec-spike-getrainde-detector-besluiten.md): ongeldige ronde-2-opties
(I/O-matrix), correcties uit de tweede ronde, de gevoeligheid, de md-rij, de hashcontrole van stap 15, oude uitvoer en
het besluit in de snelheidsmeting. De verzonnen werelden en hulpfuncties komen uit test_besluiten_20261101.py.
Verzonnen GLN's, GTIN's en etiketten; geen netwerk."""
import importlib
import json
import math
from types import SimpleNamespace

import pytest

from test_besluiten_20261101 import (GD, K8, NS, TOETS, antwoorden, et, na, proef, rc, ronde1_met_fout, run_bestand, schrijf,
                                     stap14, wilson)

ROUTES = ("D+A", "D", "K4-aa")


def tp():
    return importlib.import_module("tel_proef")


def r2_pad(p, ronde2, wijzig=None):
    return antwoorden(p, ronde2, wijzig, naam="ronde2.json")


# --- ongeldige ronde-2-opties (I/O-matrix) --------------------------------------------------------------------------

ONGELDIG = {
    "ronde2_overgeslagen_zonder_nakijken": lambda r1, r2: ["--ronde2-overgeslagen", GD],
    "nakijken_ronde2_zonder_nakijken": lambda r1, r2: ["--nakijken-ronde2", f"{GD}={r2}"],
    "keurmerk_zonder_tweede_ronde": lambda r1, r2: ["--nakijken", r1, "--ronde2-overgeslagen", NS],
    "keurmerk_zonder_tweede_ronde_met_antwoord": lambda r1, r2: ["--nakijken", r1, "--nakijken-ronde2", f"{NS}={r2}"],
    "onbekend_keurmerk": lambda r1, r2: ["--nakijken", r1, "--ronde2-overgeslagen", "BESTAAT_NIET"],
    "beide_opties_voor_hetzelfde_keurmerk": lambda r1, r2: ["--nakijken", r1, "--nakijken-ronde2", f"{GD}={r2}",
                                                            "--ronde2-overgeslagen", GD],
    "keurmerk_zonder_pad": lambda r1, r2: ["--nakijken", r1, "--nakijken-ronde2", GD],
}


@pytest.mark.parametrize("geval", sorted(ONGELDIG))
def test_ongeldige_ronde2_optie_geeft_geen_tabellen_na_nakijken(tmp_path, geval):
    p = proef(tmp_path)
    r1, ronde2 = ronde1_met_fout(p)
    for f in ("tabellen-na-nakijken.json", "tabellen-na-nakijken.md"):
        (p.uit / f).unlink()  # gemaakt door de geldige eerste ronde
    assert rc(tp().main, p.argv + ONGELDIG[geval](r1, r2_pad(p, ronde2))) not in (0, None)
    assert not (p.uit / "tabellen-na-nakijken.json").exists() and not (p.uit / "tabellen-na-nakijken.md").exists()


def test_geen_fout_in_de_steekproef_geeft_geen_tweede_ronde(tmp_path):
    p = proef(tmp_path)
    lijst, _ = stap14(p)
    assert tp().main(p.argv + ["--nakijken", antwoorden(p, lijst)]) == 0
    assert not list(p.uit.glob("nakijklijst-ronde2-*.json"))
    voor = json.loads((p.uit / "tabellen.json").read_text())
    t = na(p)
    assert {(r, k): t[r][k]["besluit"] for r in t for k in K8} == {(r, k): voor[r][k]["besluit"] for r in voor for k in K8}


# --- tweede ronde: correcties tellen mee ----------------------------------------------------------------------------

def test_correcties_uit_de_tweede_ronde_verschuiven_met_en_zonder(tmp_path):
    p = proef(tmp_path)
    r1, ronde2 = ronde1_met_fout(p)
    voor = na(p)  # alleen de eerste ronde
    om = [r["nr"] for r in ronde2 if r["waarheid"] == "afwezig"][:3]
    assert len(om) == 3
    assert tp().main(p.argv + ["--nakijken", r1, "--nakijken-ronde2", f"{GD}={r2_pad(p, ronde2, dict.fromkeys(om, 'aanwezig'))}"]) == 0
    t = na(p)
    assert {r: (t[r][GD]["met"], t[r][GD]["zonder"]) for r in ROUTES} == \
        {r: (voor[r][GD]["met"] + 3, voor[r][GD]["zonder"] - 3) for r in ROUTES}


# --- gevoeligheid ---------------------------------------------------------------------------------------------------

def wereld(tmp_path, met=20, zonder=60):
    """`met` etiketten met GD, `zonder` zonder iets; alle drie routes melden de waarheid (geen verschillen)."""
    u, waar = {}, {}
    for i in range(met + zonder):
        d = f"{TOETS}-{42000000000000 + i}-528"
        u[d], waar[d] = (et(aanwezig={GD}), {GD}) if i < met else (et(), set())
    argv = ["--uitslag", str(schrijf(tmp_path / "uitslag.json", u)), "--uit", str(tmp_path / "uit")]
    for naam in ROUTES:
        argv += ["--route", f"{naam}={run_bestand(tmp_path / f'{naam}.json', waar)}"]
    return SimpleNamespace(argv=argv, uit=tmp_path / "uit", u=u, tmp=tmp_path)


def test_gevoeligheid_met_de_hand_nagerekend(tmp_path):
    tel = tp()
    p = wereld(tmp_path)
    lijst, _ = stap14(p)
    assert tel.main(p.argv + ["--nakijken", antwoorden(p, lijst)]) == 0
    # GD: 20 mét → steekproef ceil(2,0) = 2, 60 zonder → 6; 0 fouten. Niet nagekeken: 18 mét, 54 zonder.
    e_met = math.ceil(wilson(0, 2)[1] * 18)    # 0,658 × 18 → 12
    e_zonder = math.ceil(wilson(0, 6)[1] * 54)  # 0,390 × 54 → 22
    assert (e_met, e_zonder) == (12, 22)
    verwacht = tel.besluit(20 - e_met, 20 - e_met + e_zonder, 0 + e_met, 60 + e_met - e_zonder)  # (8, 30, 12, 50)
    zonder_verschuiving = tel.besluit(20 - e_met, 20 - e_met, e_met, 60 + e_met)               # (8, 8, 12, 72)
    assert (verwacht, zonder_verschuiving) == ("mens bevestigt", "te weinig voorbeelden")  # de wereld onderscheidt ze
    t = na(p)
    assert {r: (t[r][GD]["besluit"], t[r][GD]["gevoeligheid"]) for r in ROUTES} == {r: ("automatisch", verwacht) for r in ROUTES}


def test_gevoeligheid_na_de_tweede_ronde_is_het_besluit(tmp_path):
    p = proef(tmp_path)
    r1, ronde2 = ronde1_met_fout(p)
    assert tp().main(p.argv + ["--nakijken", r1, "--nakijken-ronde2", f"{GD}={r2_pad(p, ronde2)}"]) == 0
    t = na(p)
    assert all(t[r][GD]["gevoeligheid"] == t[r][GD]["besluit"] for r in ROUTES)


# --- md ---------------------------------------------------------------------------------------------------------------

def test_md_rij_bevat_de_steekproefcellen(tmp_path):
    p = proef(tmp_path)
    ronde1_met_fout(p)  # GD: mét 2 nagekeken / 0 fouten, zonder 4 / 1
    regels = (p.uit / "tabellen-na-nakijken.md").read_text(encoding="utf-8").splitlines()
    kop = next(r for r in regels if r.startswith("| keurmerk |"))
    rij = next(r for r in regels if r.startswith(f"| {GD} |"))
    assert "| 2 / 0 / " in rij and "| 4 / 1 / " in rij
    assert rij.count("|") == kop.count("|")


# --- stap 15: hashcontrole en oude uitvoer ----------------------------------------------------------------------------

def test_nakijken_weigert_een_lijst_die_sinds_stap_14_veranderd_is(tmp_path):
    p = proef(tmp_path)
    lijst, _ = stap14(p)
    bewaard = {f: (p.uit / f).read_bytes() for f in ("nakijklijst.json", "nakijk-sha256.json", "niet-voor-nakijker/nakijk-sleutel.json")}
    da = json.loads((tmp_path / "D+A.json").read_text())
    da["etiketten"] = json.loads((tmp_path / "D.json").read_text())["etiketten"]  # D+A meldt nu ook het gemiste GD
    schrijf(tmp_path / "D+A.json", da)
    assert rc(tp().main, p.argv + ["--nakijken", antwoorden(p, lijst)]) not in (0, None)
    assert not (p.uit / "tabellen-na-nakijken.json").exists()
    assert {f: (p.uit / f).read_bytes() for f in bewaard} == bewaard
    (p.uit / "nakijk-sha256.json").unlink()
    assert rc(tp().main, p.argv + ["--nakijken", antwoorden(p, lijst)]) not in (0, None)


def test_oude_tabellen_en_tweede_ronde_blijven_niet_staan(tmp_path):
    p = proef(tmp_path)
    r1, ronde2 = ronde1_met_fout(p)
    lijst = json.loads((p.uit / "nakijklijst.json").read_text())
    # mislukte run: oude tabellen ná nakijken weg, de lijst van de tweede ronde blijft (Friso kan hem aan het lezen zijn)
    kapot = schrijf(tmp_path / "kapot.json", {})
    assert rc(tp().main, p.argv + ["--nakijken", str(kapot)]) not in (0, None)
    assert not (p.uit / "tabellen-na-nakijken.json").exists() and not (p.uit / "tabellen-na-nakijken.md").exists()
    assert (p.uit / f"nakijklijst-ronde2-{GD}.json").exists()
    # geslaagde run zonder fout in de steekproef: de tweede ronde van GD vervalt
    assert tp().main(p.argv + ["--nakijken", antwoorden(p, lijst)]) == 0
    assert not list(p.uit.glob("nakijklijst-ronde2-*.json"))


# --- snelheidsmeting met besluit ------------------------------------------------------------------------------------

def test_snelheid_andere_maat_met_besluit_legt_het_besluit_vast(tmp_path, monkeypatch):
    tr = importlib.import_module("train")
    for split in ("train", "valid", "test"):
        (tmp_path / "ds" / split).mkdir(parents=True)
        (tmp_path / "ds" / split / "a.jpg").write_bytes(b"x")
        schrijf(tmp_path / "ds" / split / "_annotations.coco.json",
                {"images": [{"id": 0, "file_name": "a.jpg", "width": 8, "height": 8}], "annotations": [], "categories": []})
    monkeypatch.setattr(tr, "_train", lambda *a, **k: (None, "mps", 1.0))
    meting = tr.snelheid("S", tmp_path / "ds", tmp_path / "s", iteraties=1, besluit="X")
    assert meting["besluit"] == "X"
    assert json.loads((tmp_path / "s" / "snelheid.json").read_text())["besluit"] == "X"
