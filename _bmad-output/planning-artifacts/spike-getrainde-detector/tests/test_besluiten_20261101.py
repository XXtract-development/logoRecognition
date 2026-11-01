"""ATDD ronde 2: besluiten Friso 01-11-2026 (commit c86a067). Contract: atdd-checklist-spike-getrainde-detector.md,
sectie "Ronde 2 (besluiten Friso 01-11-2026)".

- CAP-13 (randvoorwaarden §4): BSL-1.0 en CNRI-Python toegestaan als exacte SPDX-id, voor elk pakket.
- CAP-6 (trainingsset §5): een maat anders dan N alleen met een vastgelegde besluitverwijzing.
- CAP-9 (meetregels §6-§7): blinde nakijklijst met gestratificeerde steekproef, verborgen sleutel, verplicht antwoord per
  regel, steekproefrapport, besluitregel met tweede ronde.
- CAP-10: DRAAIPLAN stap 10, 14 en 15 en het vervallen licentieblok.
Verzonnen GLN's, GTIN's en etiketten; geen netwerk."""
import hashlib
import importlib
import json
import math
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from types import SimpleNamespace

import pytest

HIER = Path(__file__).resolve().parents[1]
K7 = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING",
      "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO")
K8 = K7 + ("NUTRISCORE",)
GD, EU, WM, NS = "GREEN_DOT", "EU_ORGANIC_FARMING", "WEIDEMELK", "NUTRISCORE"
NSA, NSB = "NUTRISCORE_A", "NUTRISCORE_B"
TOETS = "1000000000002"
VELDEN = {"nr", "doc_id", "keurmerk", "waarheid"}
BESLUITEN = {"automatisch", "mens bevestigt", "te weinig voorbeelden"}


def mod(naam):
    return importlib.import_module(naam)


def wilson(k, n, z=1.959963984540054):  # zoals fase-b/tel.py
    p, z2 = k / n, z * z
    d = 1 + z2 / n
    c, h = (p + z2 / (2 * n)) / d, z * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


def et(aanwezig=(), nutriscore=(), onzeker=(), status="bevestigd"):
    k = {c: "aanwezig" if c in aanwezig else "onzeker" if c in onzeker else "afwezig" for c in K7}
    return {"status": status, "keurmerken": k, "nutriscore": list(nutriscore), "veranderd": [], "opmerking": "",
            "tijd": "2026-11-01T10:00:00+01:00"}


def schrijf(pad, data):
    pad.parent.mkdir(parents=True, exist_ok=True)
    pad.write_text(json.dumps(data))
    return pad


def run_bestand(pad, etiketten):
    return schrijf(pad, {"status": "voltooid", "etiketten": {d: sorted(v) if isinstance(v, set) else v for d, v in etiketten.items()}})


def rc(f, argv):
    try:
        return f(argv)
    except SystemExit as e:
        return e.code
    except ValueError:
        return 1


# --- CAP-13: licenties (randvoorwaarden §4) ----------------------------------------------------------------------------

TORCH = ("Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND ISC AND MIT "
         "AND Zlib")  # torch 2.15.0, gemeten 01-11-2026


@pytest.mark.parametrize("uitdrukking", ["BSL-1.0", "CNRI-Python", "Apache-2.0 AND CNRI-Python", "MIT AND BSL-1.0",
                                         "(BSL-1.0 OR GPL-3.0-only) AND MIT",
                                         # hoofdletterongevoelig (buildspec I/O-matrix, B-IO-1)
                                         "bsl-1.0", "Bsl-1.0", "cnri-python", "CNRI-PYTHON", "Apache-2.0 AND cnri-python"])
def test_cap13_bsl_1_0_en_cnri_python_zijn_toegestaan(uitdrukking):
    assert mod("licenties").beoordeel(uitdrukking) == "toegestaan"


def test_cap13_torch_samengesteld_met_bsl_1_0_mag_en_staat_onder_even_ruim():
    assert mod("licenties").beoordeel(TORCH) == "ruim"  # ISC en Zlib zijn "even ruim"; alle andere delen toegestaan


@pytest.mark.parametrize("uitdrukking", ["BUSL-1.1", "BSL-1.1", "CNRI-Jython", "MIT AND BUSL-1.1", "Apache-2.0 AND CNRI-Jython",
                                         "Business Source License 1.1",
                                         # de grens geldt ook in andere schrijfwijzen (B-IO-1)
                                         "busl-1.1", "bsl-1.1", "cnri-jython", "CNRI-JYTHON"])
def test_cap13_busl_bsl_1_1_en_cnri_jython_blijven_verboden(uitdrukking):
    assert mod("licenties").beoordeel(uitdrukking) not in ("toegestaan", "ruim")


def test_cap13_torch_regex_en_elk_ander_pakket_met_deze_licenties_geven_geen_overtreding():
    p = [{"naam": "torch", "versie": "2.15.0", "licentie": TORCH, "tekst": ""},
         {"naam": "regex", "versie": "2026.9.29", "licentie": "Apache-2.0 AND CNRI-Python", "tekst": ""},
         {"naam": "iets-verzonnen", "versie": "1.0", "licentie": "BSL-1.0", "tekst": ""}]
    r = mod("licenties").controleer(p)
    assert r["overtredingen"] == []
    assert {x["naam"] for x in r["ruim"]} == {"torch"}


# --- CAP-6: maat N, andere maat alleen met besluit (trainingsset §5) ----------------------------------------------------

@pytest.mark.parametrize("besluit", [None, "", "   "])
@pytest.mark.parametrize("maat", ["S", "M", "L"])
def test_cap06_andere_maat_dan_n_zonder_besluit_wordt_geweigerd(tmp_path, maat, besluit):
    with pytest.raises(ValueError, match="besluit"):
        mod("train").config("nagemaakt", maat, tmp_path / "ds", tmp_path / "m", epochs=1, seed=1, besluit=besluit)


def test_cap06_zonder_besluit_parameter_weigert_config_s(tmp_path):
    with pytest.raises(ValueError, match="besluit"):
        mod("train").config("nagemaakt", "S", tmp_path / "ds", tmp_path / "m", epochs=1, seed=1)


def test_cap06_maat_n_zonder_besluit_mag_en_een_besluit_wordt_vastgelegd(tmp_path):
    tr = mod("train")
    assert tr.config("echt", "N", tmp_path / "ds", tmp_path / "m", epochs=1, seed=1)["besluit"] is None
    cfg = tr.config("nagemaakt", "L", tmp_path / "ds", tmp_path / "m", epochs=1, seed=1, besluit="Friso 2026-11-08: L op GPU")
    assert (cfg["maat"], cfg["model"], cfg["besluit"]) == ("L", "RFDETRLarge", "Friso 2026-11-08: L op GPU")


@pytest.mark.parametrize("maat", ["S", "M", "L"])
def test_cap06_snelheidsmeting_andere_maat_zonder_besluit_weigert_voor_het_werk(tmp_path, maat):
    with pytest.raises(ValueError, match="besluit"):
        mod("train").snelheid(maat, tmp_path / "geen-dataset", tmp_path / "uit")
    assert not (tmp_path / "uit").exists()


def test_cap06_opdrachtregel_train_vraagt_besluit_voor_andere_maat(tmp_path, monkeypatch):
    tr = mod("train")
    gestart = []
    monkeypatch.setattr(tr, "train", lambda cfg: gestart.append(cfg) or {})
    basis = ["train", "--fase", "nagemaakt", "--maat", "S", "--dataset", str(tmp_path / "ds"), "--uit", str(tmp_path / "m"),
             "--epochs", "1"]
    assert rc(tr.main, basis) not in (0, None) and gestart == []
    assert rc(tr.main, basis + ["--besluit", "Friso 2026-11-08: S op GPU"]) == 0
    assert (gestart[0]["maat"], gestart[0]["besluit"]) == ("S", "Friso 2026-11-08: S op GPU")


def test_cap06_opdrachtregel_snelheid_geeft_besluit_door(tmp_path, monkeypatch):
    tr = mod("train")
    gezien = []
    monkeypatch.setattr(tr, "snelheid", lambda *a, **k: gezien.append([*a, *k.values()]) or {})
    argv = ["snelheid", "--maat", "S", "--dataset", str(tmp_path / "ds"), "--uit", str(tmp_path / "s"), "--besluit", "Friso X"]
    assert rc(tr.main, argv) == 0 and "Friso X" in gezien[0]


# --- CAP-9: nakijklijst met steekproef (meetregels §6) -----------------------------------------------------------------

def kant(rij):
    w = rij["waarheid"]
    return "met" if w == "aanwezig" or (isinstance(w, list) and set(w) & {"A", "B", "C"}) else "zonder"


def wereld_steekproef():
    """13 etiketten met GD en NS A, 1 met EU, 29 zonder iets, 1 met GD onzeker, 1 onleesbaar. Zes verschillen."""
    u, waar = {}, {}
    for i in range(13):
        u[f"g{i:02d}"], waar[f"g{i:02d}"] = et(aanwezig={GD}, nutriscore=["A"]), {GD, NSA}
    u["e00"], waar["e00"] = et(aanwezig={EU}), {EU}
    for i in range(29):
        u[f"z{i:02d}"], waar[f"z{i:02d}"] = et(), set()
    u["onz"], waar["onz"] = et(onzeker={GD}), set()
    u["onl"], waar["onl"] = et(aanwezig={GD}, status="onleesbaar"), {GD}
    routes = {"D+A": {**waar, "g00": {NSA}, "z00": {GD}, "onz": {GD}},                 # mist GD op g00, vals GD op z00
              "D": {**waar, "z01": {"fout": "aanbieder"}, "g05": {"fout": "aanbieder"}},  # fout = geen melding
              "K4-aa": {**waar, "g01": {GD, NSA, NSB}, "z02": {WM}, "onl": {EU}}}     # verkeerde letter, vals WM
    return u, routes


VERSCHILLEN = {("g00", GD), ("z00", GD), ("g05", GD), ("g05", NS), ("g01", NS), ("z02", WM)}
# overeenkomende paren per keurmerk en kant → ceil(10%): GD 11→2 / 29→3, EU 1→1 / 43→5, NS 11→2 / 31→4, WM 0 / 43→5,
# overige vier 0 / 44→5
STEEKPROEF = {(GD, "met"): 2, (GD, "zonder"): 3, (EU, "met"): 1, (EU, "zonder"): 5, (NS, "met"): 2, (NS, "zonder"): 4,
              (WM, "zonder"): 5, **{(k, "zonder"): 5 for k in K7 if k not in (GD, EU, WM)}}


def herkomst(lijst, sleutel):
    sl = {str(k): v for k, v in sleutel.items()}
    return {(r["doc_id"], r["keurmerk"]): sl[str(r["nr"])] for r in lijst}


def test_cap09_steekproef_seed_ligt_vast_in_de_telcode():
    assert mod("tel_proef").STEEKPROEF_SEED == 20261101


def test_cap09_nakijklijst_verschillen_plus_steekproef_per_keurmerk_en_kant():
    u, routes = wereld_steekproef()
    lijst, sleutel = mod("tel_proef").nakijklijst(u, routes)
    h = herkomst(lijst, sleutel)
    assert {p for p, v in h.items() if v == "verschil"} == VERSCHILLEN
    steek = [r for r in lijst if h[(r["doc_id"], r["keurmerk"])] == "steekproef"]
    assert Counter((r["keurmerk"], kant(r)) for r in steek) == Counter(STEEKPROEF)
    assert not {(r["doc_id"], r["keurmerk"]) for r in steek} & VERSCHILLEN
    assert all(r["doc_id"] != "onl" and (r["doc_id"], r["keurmerk"]) != ("onz", GD) for r in lijst)
    assert set(h.values()) == {"verschil", "steekproef"} and len(sleutel) == len(lijst) == 48


def test_cap09_nakijklijst_regels_gelijk_van_vorm_geschud_en_zonder_herkomst():
    u, routes = wereld_steekproef()
    lijst, sleutel = mod("tel_proef").nakijklijst(u, routes)
    assert all(set(r) == VELDEN for r in lijst)
    assert [r["nr"] for r in lijst] == list(range(1, len(lijst) + 1))
    for r in lijst:
        assert r["waarheid"] == (u[r["doc_id"]]["nutriscore"] if r["keurmerk"] == NS else u[r["doc_id"]]["keurmerken"][r["keurmerk"]])
    tekst = json.dumps(lijst)
    assert not any(w in tekst for w in ("D+A", "K4-aa", "verschil", "steekproef"))
    volgorde = [herkomst(lijst, sleutel)[(r["doc_id"], r["keurmerk"])] for r in lijst]
    assert volgorde != sorted(volgorde) and volgorde != sorted(volgorde, reverse=True)  # door elkaar, niet in blokken
    assert [(r["doc_id"], r["keurmerk"]) for r in lijst] != sorted((r["doc_id"], r["keurmerk"]) for r in lijst)


def test_cap09_steekproef_hangt_niet_af_van_de_volgorde_van_de_invoer():
    tp = mod("tel_proef")
    u, routes = wereld_steekproef()
    omgekeerd = {n: dict(reversed(list(m.items()))) for n, m in reversed(list(routes.items()))}
    lijst, sleutel = tp.nakijklijst(u, routes)
    assert tp.nakijklijst(dict(reversed(list(u.items()))), omgekeerd) == (lijst, sleutel)


def cli_wereld(tmp_path):
    u, routes = wereld_steekproef()
    schrijf(tmp_path / "uitslag.json", u)
    meta = schrijf(tmp_path / "meta.json", {d: {"gln": TOETS, "tijd": 1.0, "kosten": 0.0} for d in u})
    argv = ["--uitslag", str(tmp_path / "uitslag.json")]
    for naam, m in routes.items():
        argv += ["--route", f"{naam}={run_bestand(tmp_path / f'{naam}.json', m)}", "--meta", f"{naam}={meta}"]
    return u, routes, argv


def test_cap09_zelfde_trekking_in_elk_proces(tmp_path):
    u, routes, argv = cli_wereld(tmp_path)
    uitvoer = []
    for hashseed in ("1", "4242"):
        uit = tmp_path / f"uit-{hashseed}"
        r = subprocess.run([sys.executable, str(HIER / "tel_proef.py"), *argv, "--uit", str(uit)], cwd=tmp_path,
                           env={**os.environ, "PYTHONHASHSEED": hashseed}, capture_output=True, text=True, timeout=120)
        assert r.returncode == 0, r.stderr
        uitvoer.append(((uit / "nakijklijst.json").read_bytes(), (uit / "niet-voor-nakijker" / "nakijk-sleutel.json").read_bytes()))
    assert uitvoer[0] == uitvoer[1]
    lijst, sleutel = mod("tel_proef").nakijklijst(u, routes)
    assert json.loads(uitvoer[0][0]) == lijst
    assert json.loads(uitvoer[0][1]) == {str(k): v for k, v in sleutel.items()}


def test_cap09_opdrachtregeloptie_seed_verandert_de_steekproef_niet(tmp_path):
    tp = mod("tel_proef")
    _, _, argv = cli_wereld(tmp_path)
    for s in ("1", "2"):
        assert tp.main([*argv, "--uit", str(tmp_path / f"s{s}"), "--seed", s]) == 0
    for naam in ("nakijklijst.json", "niet-voor-nakijker/nakijk-sleutel.json"):
        assert (tmp_path / "s1" / naam).read_bytes() == (tmp_path / "s2" / naam).read_bytes()


def test_cap09_sleutel_en_verschil_in_aparte_map_met_sha256_vooraf(tmp_path):
    tp = mod("tel_proef")
    _, _, argv = cli_wereld(tmp_path)
    uit = tmp_path / "uit"
    assert tp.main([*argv, "--uit", str(uit)]) == 0
    apart = uit / "niet-voor-nakijker"
    assert (uit / "nakijklijst.json").is_file() and (apart / "nakijk-sleutel.json").is_file() and (apart / "verschil.json").is_file()
    assert not (uit / "verschil.json").exists() and not (uit / "nakijk-sleutel.json").exists()
    sha = json.loads((uit / "nakijk-sha256.json").read_text())
    assert sha == {"nakijklijst.json": hashlib.sha256((uit / "nakijklijst.json").read_bytes()).hexdigest(),
                   "nakijk-sleutel.json": hashlib.sha256((apart / "nakijk-sleutel.json").read_bytes()).hexdigest()}
    lijst = json.loads((uit / "nakijklijst.json").read_text())
    assert set(json.loads((apart / "nakijk-sleutel.json").read_text())) == {str(r["nr"]) for r in lijst}


# --- CAP-9: nakijken.json, steekproefrapport en besluitregel (meetregels §6-§7) ----------------------------------------

def proef(tmp_path, met=20, gemist=1):
    """`met` etiketten met GD en Nutri-Score A+B, 40 zonder iets; D+A mist GD op de eerste `gemist`, D en K4-aa melden de
    waarheid. Eén leverancier. Vóór nakijken: GD D+A 19/20 → mens bevestigt, D en K4-aa 20/20 en 0/40 → automatisch."""
    u, waar = {}, {}
    for i in range(met):
        d = f"{TOETS}-{40000000000000 + i}-528"
        u[d], waar[d] = et(aanwezig={GD}, nutriscore=["A", "B"]), {GD, NSA, NSB}
    for i in range(40):
        d = f"{TOETS}-{41000000000000 + i}-528"
        u[d], waar[d] = et(), set()
    gemiste = sorted(waar)[:gemist]
    routes = {"D+A": {d: c - {GD} if d in gemiste else c for d, c in waar.items()}, "D": waar, "K4-aa": waar}
    argv = ["--uitslag", str(schrijf(tmp_path / "uitslag.json", u)), "--uit", str(tmp_path / "uit")]
    for naam, m in routes.items():
        argv += ["--route", f"{naam}={run_bestand(tmp_path / f'{naam}.json', m)}"]
    return SimpleNamespace(argv=argv, uit=tmp_path / "uit", u=u, tmp=tmp_path)


def stap14(p):
    assert mod("tel_proef").main(p.argv) == 0
    lijst = json.loads((p.uit / "nakijklijst.json").read_text())
    sleutel = {str(k): v for k, v in json.loads((p.uit / "niet-voor-nakijker" / "nakijk-sleutel.json").read_text()).items()}
    return lijst, sleutel


def steek(lijst, sleutel, keurmerk, zijde):
    return [r for r in lijst if sleutel[str(r["nr"])] == "steekproef" and r["keurmerk"] == keurmerk and kant(r) == zijde]


def antwoorden(p, lijst, wijzig=None, naam="nakijken.json"):
    """Elke regel beantwoord met Friso's eerdere oordeel, behalve `wijzig` ({nr: oordeel})."""
    a = {str(r["nr"]): r["waarheid"] for r in lijst}
    a.update({str(k): v for k, v in (wijzig or {}).items()})
    return str(schrijf(p.tmp / naam, a))


def na(p):
    return json.loads((p.uit / "tabellen-na-nakijken.json").read_text())


@pytest.mark.parametrize("fout", ["regel_ontbreekt", "regel_buiten_de_lijst"])
def test_cap09_nakijken_vraagt_een_oordeel_voor_precies_elke_regel(tmp_path, fout):
    p = proef(tmp_path)
    lijst, _ = stap14(p)
    a = json.loads(Path(antwoorden(p, lijst)).read_text())
    if fout == "regel_ontbreekt":
        a.pop(str(lijst[-1]["nr"]))
    else:
        a[str(len(lijst) + 1)] = "afwezig"
    pad = schrijf(tmp_path / "nakijken.json", a)
    assert mod("tel_proef").main(p.argv + ["--nakijken", str(pad)]) not in (0, None)
    assert not (p.uit / "tabellen-na-nakijken.json").exists() and not (p.uit / "tabellen-na-nakijken.md").exists()


def test_cap09_oude_correctievorm_wordt_niet_meer_aangenomen(tmp_path):
    p = proef(tmp_path)
    assert mod("tel_proef").main(p.argv) == 0
    pad = schrijf(tmp_path / "c.json", {sorted(p.u)[0]: {GD: "afwezig"}})
    assert rc(mod("tel_proef").main, p.argv + ["--correcties", str(pad)]) not in (0, None)
    assert not (p.uit / "tabellen-na-nakijken.json").exists()


def test_cap09_correcties_gelden_voor_alle_routes_gelijk(tmp_path):
    p = proef(tmp_path)
    lijst, sleutel = stap14(p)
    (v,) = [r for r in lijst if sleutel[str(r["nr"])] == "verschil"]  # D+A mist GD op het eerste etiket
    assert mod("tel_proef").main(p.argv + ["--nakijken", antwoorden(p, lijst, {v["nr"]: "afwezig"})]) == 0
    t = na(p)
    assert {r: (t[r][GD]["met"], t[r][GD]["zonder"]) for r in ("D+A", "D", "K4-aa")} == {r: (19, 41) for r in ("D+A", "D", "K4-aa")}
    voor = json.loads((p.uit / "tabellen.json").read_text())
    assert (voor["D"][GD]["met"], voor["D"][GD]["besluit"]) == (20, "automatisch")


def test_cap09_fout_is_elk_afwijkend_oordeel_ook_onzeker_onleesbaar_en_elke_letterwijziging(tmp_path):
    p = proef(tmp_path)
    lijst, sleutel = stap14(p)
    gd_met, ns_met, ns_zonder = steek(lijst, sleutel, GD, "met"), steek(lijst, sleutel, NS, "met"), steek(lijst, sleutel, NS, "zonder")
    wijzig = {gd_met[0]["nr"]: "onzeker", ns_met[0]["nr"]: ["A", "B", "D"], ns_met[1]["nr"]: ["B", "A"],
              ns_zonder[0]["nr"]: "onleesbaar"}
    assert mod("tel_proef").main(p.argv + ["--nakijken", antwoorden(p, lijst, wijzig)]) == 0
    s = na(p)["D"]
    assert (s[GD]["steekproef"]["met"]["fouten"], s[GD]["steekproef"]["zonder"]["fouten"]) == (1, 0)
    assert (s[NS]["steekproef"]["met"]["fouten"], s[NS]["steekproef"]["zonder"]["fouten"]) == (1, 1)  # ["B","A"] is geen fout


def test_cap09_steekproef_apart_gerapporteerd_met_wilson_bovengrens_en_gevoeligheid(tmp_path):
    p = proef(tmp_path)
    lijst, sleutel = stap14(p)
    fout = steek(lijst, sleutel, GD, "zonder")[0]
    assert mod("tel_proef").main(p.argv + ["--nakijken", antwoorden(p, lijst, {fout["nr"]: "onzeker"})]) == 0
    t = na(p)
    for k in K8:
        assert t["D+A"][k]["steekproef"] == t["D"][k]["steekproef"] == t["K4-aa"][k]["steekproef"]
        assert all(t[r][k]["gevoeligheid"] in BESLUITEN for r in t)
    gd = t["D"][GD]["steekproef"]
    assert (gd["met"]["nagekeken"], gd["met"]["fouten"], gd["zonder"]["nagekeken"], gd["zonder"]["fouten"]) == (2, 0, 4, 1)
    assert gd["met"]["bovengrens"] == pytest.approx(wilson(0, 2)[1]) and gd["zonder"]["bovengrens"] == pytest.approx(wilson(1, 4)[1])
    assert t["D"][EU]["steekproef"]["met"] == {"nagekeken": 0, "fouten": 0, "bovengrens": None}  # "–" bij 0 paren
    assert t["D"][NS]["besluit"] == "automatisch" and t["D"][NS]["gevoeligheid"] != "automatisch"  # bovengrens 66% telt
    md = (p.uit / "tabellen-na-nakijken.md").read_text(encoding="utf-8")
    assert "steekproef" in md.lower() and "gevoeligheid" in md.lower()


def test_cap09_fout_in_steekproef_geeft_voorlopig_en_een_tweede_ronde_met_alle_overige_overeenkomende_paren(tmp_path):
    p = proef(tmp_path)
    lijst, sleutel = stap14(p)
    fout = steek(lijst, sleutel, GD, "zonder")[0]
    assert mod("tel_proef").main(p.argv + ["--nakijken", antwoorden(p, lijst, {fout["nr"]: "onzeker"})]) == 0
    t = na(p)
    assert {r: t[r][GD]["besluit"] for r in t} == {r: "mens bevestigt (voorlopig)" for r in ("D+A", "D", "K4-aa")}
    assert {r: t[r][NS]["besluit"] for r in t} == {r: "automatisch" for r in ("D+A", "D", "K4-aa")}
    ronde2 = json.loads((p.uit / f"nakijklijst-ronde2-{GD}.json").read_text())
    assert all(set(r) == VELDEN and r["keurmerk"] == GD for r in ronde2)
    assert [r["nr"] for r in ronde2] == list(range(1, len(ronde2) + 1))
    eerste = {(r["doc_id"], r["keurmerk"]) for r in lijst}
    overeenkomend = {(d, GD) for d in p.u} - {(r["doc_id"], GD) for r in lijst if sleutel[str(r["nr"])] == "verschil"}
    assert {(r["doc_id"], r["keurmerk"]) for r in ronde2} == overeenkomend - eerste and len(ronde2) == 53
    assert not (p.uit / f"nakijklijst-ronde2-{NS}.json").exists() and not (p.uit / f"nakijklijst-ronde2-{EU}.json").exists()


def ronde1_met_fout(p):
    lijst, sleutel = stap14(p)
    fout = steek(lijst, sleutel, GD, "zonder")[0]
    r1 = antwoorden(p, lijst, {fout["nr"]: "onzeker"})
    assert mod("tel_proef").main(p.argv + ["--nakijken", r1]) == 0
    return r1, json.loads((p.uit / f"nakijklijst-ronde2-{GD}.json").read_text())


def test_cap09_tweede_ronde_nagekeken_geeft_het_gewone_besluit(tmp_path):
    p = proef(tmp_path)
    r1, ronde2 = ronde1_met_fout(p)
    r2 = antwoorden(p, ronde2, naam="ronde2.json")
    assert mod("tel_proef").main(p.argv + ["--nakijken", r1, "--nakijken-ronde2", f"{GD}={r2}"]) == 0
    t = na(p)
    assert (t["D+A"][GD]["besluit"], t["D"][GD]["besluit"], t["K4-aa"][GD]["besluit"]) == ("mens bevestigt", "automatisch", "automatisch")


def test_cap09_tweede_ronde_vraagt_ook_een_oordeel_voor_elke_regel(tmp_path):
    p = proef(tmp_path)
    r1, ronde2 = ronde1_met_fout(p)
    r2 = antwoorden(p, ronde2[:-1], naam="ronde2.json")
    for f in ("tabellen-na-nakijken.json", "tabellen-na-nakijken.md"):
        (p.uit / f).unlink()
    assert mod("tel_proef").main(p.argv + ["--nakijken", r1, "--nakijken-ronde2", f"{GD}={r2}"]) not in (0, None)
    assert not (p.uit / "tabellen-na-nakijken.json").exists()


def test_cap09_tweede_ronde_uitdrukkelijk_overgeslagen_geeft_mens_bevestigt(tmp_path):
    p = proef(tmp_path)
    r1, _ = ronde1_met_fout(p)
    assert mod("tel_proef").main(p.argv + ["--nakijken", r1, "--ronde2-overgeslagen", GD]) == 0
    t = na(p)
    assert {r: t[r][GD]["besluit"] for r in t} == {r: "mens bevestigt" for r in ("D+A", "D", "K4-aa")}


def test_cap09_te_weinig_voorbeelden_gaat_voor_voorlopig(tmp_path):
    p = proef(tmp_path, met=16, gemist=0)
    lijst, sleutel = stap14(p)
    fout = steek(lijst, sleutel, GD, "met")[0]
    assert mod("tel_proef").main(p.argv + ["--nakijken", antwoorden(p, lijst, {fout["nr"]: "afwezig"})]) == 0
    t = na(p)
    assert {r: (t[r][GD]["met"], t[r][GD]["besluit"]) for r in t} == {r: (15, "te weinig voorbeelden") for r in ("D+A", "D", "K4-aa")}


# --- CAP-10: draaiplan (stap 10, 14, 15; licentieblok) -----------------------------------------------------------------

def draaiplan():
    return (HIER / "DRAAIPLAN.md").read_text(encoding="utf-8").replace("\\\n", " ")


def stap(n):
    delen = re.split(r"^### Stap (\d+) — .+$", draaiplan(), flags=re.M)
    return dict(zip(map(int, delen[1::2]), delen[2::2]))[n]


def test_cap10_licentieblok_is_vervallen():
    tekst = draaiplan()
    assert "tot dan geen training" not in tekst
    assert not any("[!warning]" in r and "icentie" in r for r in tekst.splitlines())


def test_cap10_maat_n_en_nergens_een_andere_maat_zonder_besluit():
    tekst = draaiplan()
    assert re.search(r"^MAAT=N\b", tekst, re.M)
    for regel in tekst.splitlines():
        for maat in re.findall(r"--maat\s+(\S+)", regel):
            assert maat in ("N", "$MAAT") or "--besluit" in regel, regel


def test_cap10_stap_10_zonder_lus_over_maten_en_stoppunt_1_bij_tekortschieten_op_validatie():
    s10 = stap(10)
    assert not re.search(r"herhaal[^.\n]*andere maat", s10, re.I)
    stoppunt = next(r for r in s10.splitlines() if r.startswith("Stoppunt:"))
    assert re.search(r"\b1\b", stoppunt) and "validatie" in stoppunt.lower()


def test_cap10_stap_14_telt_drie_routes_en_legt_sleutel_en_verschil_apart():
    s14 = stap(14)
    assert set(re.findall(r"--route\s+([^=\s]+)=", s14)) == {"D+A", "D", "K4-aa"}  # niet de informatieve K4-aa-run
    for woord in ("steekproef", "niet-voor-nakijker", "nakijk-sleutel.json", "nakijk-sha256.json"):
        assert woord in s14, woord


def test_cap10_stap_15_oordeel_per_regel_en_tweede_ronde():
    s15 = stap(15)
    for woord in ("nakijken.json", "--nakijken ", "elke regel", "nakijklijst-ronde2-", "--nakijken-ronde2", "--ronde2-overgeslagen",
                  "voorlopig"):
        assert woord in s15, woord
    assert "--correcties" not in draaiplan() and "Kijkt Friso niet na" not in s15
