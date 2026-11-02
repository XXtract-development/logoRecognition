"""ATDD CAP-9 telling, stopregel en vergelijking (meetregels §1-§7; contract `tel_proef.py`).
Rode fase: `tel_proef` bestaat nog niet. Verzonnen mini-sets met bekende uitkomst; grensgetallen nagerekend met Wilson (z = 1,96).
Eén integratietest gaat van de invulserver via uitslag.json naar `tel`."""
import importlib
import importlib.util
import json
import math
import threading
import urllib.request
from pathlib import Path

import pytest

K7 = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING",
      "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO")
K8 = K7 + ("NUTRISCORE",)
NIEUW_R9 = ("FOREST_STEWARDSHIP_COUNCIL_LABEL", "TRIMAN", "SOCIETY_PLASTICS_INDUSTRY", "ON_THE_WAY_TO_PLANETPROOF")  # ronde 9: ook gekozen
EU, GD = "EU_ORGANIC_FARMING", "GREEN_DOT"
NSA, NSB, NSC = "NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C"


def wilson(k, n, z=1.959963984540054):  # z zoals fase-b/tel.py (Z), die meetregels §1 voorschrijft
    p, z2 = k / n, z * z
    d = 1 + z2 / n
    c, h = (p + z2 / (2 * n)) / d, z * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


def et(aanwezig=(), onzeker=(), nutriscore=(), status="bevestigd"):
    k = {c: ("aanwezig" if c in aanwezig else "onzeker" if c in onzeker else "afwezig") for c in K7 + ("EUROPEAN_V_LABEL_VEGAN",) + NIEUW_R9}
    ns = nutriscore if isinstance(nutriscore, str) else list(nutriscore)
    return {"status": status, "keurmerken": k, "nutriscore": ns, "veranderd": [], "opmerking": "", "tijd": "2026-10-31T21:00:00+01:00"}


@pytest.fixture
def tp():
    return importlib.import_module("tel_proef")


@pytest.mark.parametrize("gevonden,met,vals,zonder,verwacht", [
    (16, 16, 0, 50, "automatisch"), (15, 16, 0, 50, "mens bevestigt"),
    (20, 20, 0, 50, "automatisch"), (19, 20, 0, 50, "mens bevestigt"),
    (24, 25, 0, 50, "automatisch"), (23, 25, 0, 50, "mens bevestigt"),
    (29, 30, 0, 50, "automatisch"), (28, 30, 0, 50, "mens bevestigt"),
    (37, 40, 0, 50, "automatisch"), (36, 40, 0, 50, "mens bevestigt"),
    (46, 50, 0, 50, "automatisch"), (45, 50, 0, 50, "mens bevestigt"),
    (16, 16, 0, 35, "automatisch"), (16, 16, 1, 50, "mens bevestigt"),
    (16, 16, 1, 60, "automatisch"), (16, 16, 2, 60, "mens bevestigt"),
    (16, 16, 2, 80, "automatisch"), (16, 16, 3, 80, "mens bevestigt"),
    (16, 16, 4, 100, "automatisch"), (16, 16, 5, 100, "mens bevestigt"),
    (16, 16, 7, 150, "automatisch"), (16, 16, 8, 150, "mens bevestigt"),
    (15, 15, 0, 50, "te weinig voorbeelden"), (16, 16, 0, 34, "te weinig voorbeelden"), (0, 0, 0, 0, "te weinig voorbeelden"),
])
def test_cap09_besluit_bij_de_grensgetallen(tp, gevonden, met, vals, zonder, verwacht):
    assert tp.besluit(gevonden, met, vals, zonder) == verwacht


def test_cap09_definities_gevonden_en_vals_per_etiket_met_wilson(tp):
    uitslag = {"d1": et(aanwezig={GD}), "d2": et(), "d3": et()}
    r = tp.tel(uitslag, {"d1": {GD}, "d2": {GD}, "d3": set()})
    g = r[GD]
    assert (g["met"], g["gevonden"], g["zonder"], g["vals"]) == (1, 1, 2, 1)
    assert g["ondergrens"] == pytest.approx(wilson(1, 1)[0]) and g["bovengrens"] == pytest.approx(wilson(1, 2)[1])
    assert g["besluit"] == "te weinig voorbeelden"
    assert set(K8) <= set(r)


def test_cap09_nutriscore_groep_verkeerde_letter_is_gemist_d_en_e_zijn_met(tp):  # ronde 5: groep A–E
    uitslag = {"n1": et(nutriscore=["B"]), "n2": et(nutriscore=["B"]), "n3": et(nutriscore=["D"]), "n4": et(nutriscore=["E"]),
               "n5": et(nutriscore="onleesbaar"), "n6": et(nutriscore=[]), "n7": et(nutriscore=["A", "B"])}
    meld = {"n1": {NSB}, "n2": {NSC}, "n3": {NSA}, "n4": set(), "n5": {NSA}, "n6": {NSC}, "n7": {NSB}}
    ns = tp.tel(uitslag, meld)["NUTRISCORE"]
    assert (ns["met"], ns["gevonden"], ns["verkeerde_letter"]) == (5, 2, 2)  # n3 (D, gemeld A) gemist en verkeerd
    assert (ns["zonder"], ns["vals"]) == (1, 1)  # alleen n6 (geen); n5 onleesbaar telt niet


def test_cap09_gedeelde_negatieven_een_etiket_telt_als_zonder_voor_elk_afwezig_keurmerk(tp):
    r = tp.tel({"d1": et(nutriscore=[])}, {"d1": set()})
    assert {k: (r[k]["met"], r[k]["zonder"]) for k in K8} == {k: (0, 1) for k in K8}


def test_cap09_onzeker_en_onleesbaar_tellen_niet_mee(tp):
    uitslag = {"d1": et(onzeker={GD}), "d2": et(aanwezig={GD, EU}, status="onleesbaar")}
    r = tp.tel(uitslag, {"d1": {GD}, "d2": {GD, EU}})
    assert (r[GD]["met"], r[GD]["zonder"], r[GD]["vals"]) == (0, 0, 0)
    assert (r[EU]["met"], r[EU]["zonder"], r[EU]["vals"]) == (0, 1, 0)


def vijftig(fouten):
    uitslag = {f"d{i:02d}": et(aanwezig={GD} if i == 0 else ()) for i in range(50)}
    meld = {d: set() for d in uitslag}
    for i in range(fouten):
        meld[f"d{i:02d}"] = {"fout": "aanbieder"}
    return uitslag, meld


def test_cap09_fout_telt_als_geen_melding_en_wordt_geteld(tp):
    r = tp.tel(*vijftig(1))
    assert (r[GD]["met"], r[GD]["gevonden"]) == (1, 0)
    assert r["fouten"] in (1, {"aanbieder": 1})
    assert r["foutpercentage"] in (pytest.approx(2.0), pytest.approx(0.02))
    assert r["geldig"] is True  # precies 2% is niet boven 2%


def test_cap09_foutpercentage_boven_2_procent_maakt_de_run_ongeldig(tp):
    r = tp.tel(*vijftig(2))
    assert r["foutpercentage"] in (pytest.approx(4.0), pytest.approx(0.04)) and r["geldig"] is False


def test_cap09_zdr_weigering_stopt_de_telling(tp):
    uitslag, meld = vijftig(0)
    meld["d07"] = {"fout": "geen_zdr"}
    with pytest.raises(ValueError):
        tp.tel(uitslag, meld)


def wereld(met, gevonden, zonder, vals):
    uitslag, meld = {}, {}
    for i in range(met):
        uitslag[f"m{i:03d}"], meld[f"m{i:03d}"] = et(aanwezig={GD}), {GD} if i < gevonden else set()
    for i in range(zonder):
        uitslag[f"z{i:03d}"], meld[f"z{i:03d}"] = et(), {GD} if i < vals else set()
    return uitslag, meld


@pytest.mark.parametrize("met,gevonden,zonder,vals,verwacht", [
    (16, 16, 50, 0, "automatisch"), (16, 16, 50, 1, "mens bevestigt"), (16, 15, 50, 0, "mens bevestigt"),
    (15, 15, 50, 0, "te weinig voorbeelden"), (16, 16, 34, 0, "te weinig voorbeelden"), (25, 24, 60, 1, "automatisch"),
])
def test_cap09_besluit_in_de_tabel_per_keurmerk(tp, met, gevonden, zonder, vals, verwacht):
    g = tp.tel(*wereld(met, gevonden, zonder, vals))[GD]
    assert (g["met"], g["gevonden"], g["zonder"], g["vals"], g["besluit"]) == (met, gevonden, zonder, vals, verwacht)
    assert g["ondergrens"] == pytest.approx(wilson(gevonden, met)[0])
    assert g["bovengrens"] == pytest.approx(wilson(vals, zonder)[1])


def docs_in(lijst, uitslag):
    return {v for e in lijst for v in e.values() if isinstance(v, str) and v in uitslag}


def test_cap09_blinde_nakijklijst_zonder_routenamen(tp):
    uitslag = {"a": et(aanwezig={GD}), "b": et(), "c": et(), "d": et(status="onleesbaar"), "e": et(aanwezig={GD})}
    routes = {
        "route-geheim-1": {"a": {GD}, "b": {GD}, "c": set(), "d": {GD}, "e": {"fout": "aanbieder"}},
        "route-geheim-2": {"a": set(), "b": set(), "c": set(), "d": set(), "e": {GD}},
    }
    # Ronde 2 (besluiten 01-11-2026): vaste seed in de code, geen parameter; de lijst bevat ook de steekproef, de sleutel
    # zegt welke regel een verschil is.
    lijst, sleutel = tp.nakijklijst(uitslag, routes)
    verschil = [e for e in lijst if {str(k): v for k, v in sleutel.items()}[str(e["nr"])] == "verschil"]
    assert docs_in(verschil, uitslag) == {"a", "b", "e"}
    tekst = json.dumps(lijst, default=str)
    assert "route-geheim" not in tekst
    assert tp.nakijklijst(uitslag, routes) == (lijst, sleutel)


def test_cap09_integratie_server_uitslag_json_telscript(tp, tmp_path):
    server = importlib.import_module("invul.server")
    docs = [f"1000000000001-{30000000000000 + i}-528" for i in range(3)]
    (tmp_path / "items.json").write_text(json.dumps([{"id": d, "beeld": f"{d}.png", "hint": [], "voorinvulling": {}} for d in docs]))
    srv = server.maak_server(tmp_path, 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        for d, waarde in zip(docs, (et(aanwezig={GD}, nutriscore=["A"]), et(nutriscore=["D"]), et(aanwezig={EU}, nutriscore=[]))):
            req = urllib.request.Request(f"http://127.0.0.1:{srv.server_address[1]}/opslaan", method="POST",
                                         data=json.dumps({"id": d, "waarde": waarde}).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as antwoord:
                assert antwoord.status == 200
    finally:
        srv.shutdown()
        srv.server_close()
    uitslag = json.loads((tmp_path / "uitslag.json").read_text())
    r = tp.tel(uitslag, {docs[0]: {GD, NSA}, docs[1]: {GD}, docs[2]: set()})
    assert (r[GD]["met"], r[GD]["gevonden"], r[GD]["zonder"], r[GD]["vals"]) == (1, 1, 2, 1)
    assert (r[EU]["met"], r[EU]["gevonden"]) == (1, 0)
    assert (r["NUTRISCORE"]["met"], r["NUTRISCORE"]["gevonden"], r["NUTRISCORE"]["zonder"]) == (2, 1, 1)  # ronde 5: D is mét
    assert r["geldig"] is True


# --- tabellen per route (meetregels §7) ------------------------------------------------------------------------------

FASE_B_TEL = Path(__file__).resolve().parents[2] / "spike-architectuurkeuze-logoherkenning" / "fase-b" / "tel.py"
G = ("1000000000001", "1000000000002", "1000000000003")
WM = "WEIDEMELK"


def fase_b():
    spec = importlib.util.spec_from_file_location("fase_b_tel", FASE_B_TEL)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def route_wereld():
    """Per leverancier 2 etiketten met GD en 3 zonder. Gevonden: g1 2/2, g2 1/2, g3 0/2. Vals: alleen g2 1/3."""
    uitslag, meld, meta = {}, {}, {}
    for gi, g in enumerate(G):
        for j in range(5):
            d = f"{g}-{30000000000000 + 10 * gi + j}-528"
            met = j < 2
            uitslag[d] = et(aanwezig={GD} if met else ())
            raak = (met and (gi == 0 or (gi == 1 and j == 0))) or (not met and gi == 1 and j == 2)
            meld[d] = {GD} if raak else set()
            meta[d] = {"gln": g, "tijd": 9.0 if j == 4 else 2.0, "kosten": 0.01, "beoordeeld": 2 if gi == 0 else 0}
    return uitslag, meld, meta


def test_cap09_tabel_spreiding_per_leverancier_en_leveranciers_aan_de_met_kant(tp):
    uitslag, meld, meta = route_wereld()
    ft = fase_b()
    draws = ft.trekkingen(list(G), 20261030, 2000)
    t = tp.tabel(uitslag, meld, meta)
    g = t[GD]
    assert (g["met"], g["gevonden"], g["zonder"], g["vals"]) == (6, 3, 9, 1)
    assert tuple(g["spreiding"]["gevonden"]) == pytest.approx(ft.bootstrap({G[0]: 2, G[1]: 1, G[2]: 0}, {x: 2 for x in G}, draws))
    assert tuple(g["spreiding"]["vals"]) == pytest.approx(ft.bootstrap({G[0]: 0, G[1]: 1, G[2]: 0}, {x: 3 for x in G}, draws))
    assert (g["leveranciers"] if isinstance(g["leveranciers"], int) else len(g["leveranciers"])) == 3
    assert t[EU]["spreiding"]["gevonden"] is None  # geen etiketten met EU
    assert tp.tabel(uitslag, meld, meta) == t


def test_cap09_tabel_spreiding_volgt_de_seed(tp):
    uitslag, meld, meta = route_wereld()
    ft = fase_b()
    draws = ft.trekkingen(list(G), 7, 300)
    g = tp.tabel(uitslag, meld, meta, seed=7, n_trekkingen=300)[GD]
    assert tuple(g["spreiding"]["gevonden"]) == pytest.approx(ft.bootstrap({G[0]: 2, G[1]: 1, G[2]: 0}, {x: 2 for x in G}, draws))


def test_cap09_tabel_tijd_kosten_en_beoordelaaraanroepen_per_route(tp):
    r = tp.tabel(*route_wereld())["route"]
    assert r["tijd"] == {"mediaan": pytest.approx(2.0), "p90": pytest.approx(9.0), "max": pytest.approx(9.0)}
    assert r["kosten"] == {"gemiddeld": pytest.approx(0.01), "totaal": pytest.approx(0.15)}
    assert r["beoordelaar_aanroepen"] == 10


def test_cap09_verschil_in_procentpunten(tp):
    uitslag, meld, meta = route_wereld()
    alles = {d: ({GD} if v["keurmerken"][GD] == "aanwezig" else set()) for d, v in uitslag.items()}
    v = tp.verschil(tp.tabel(uitslag, meld, meta), tp.tabel(uitslag, alles, meta))
    assert v[GD] == {"gevonden_pp": pytest.approx(-50.0), "vals_pp": pytest.approx(100 / 9)}
    assert v[EU]["gevonden_pp"] is None and v[EU]["vals_pp"] == pytest.approx(0.0)


def test_cap09_etiketten_waarop_twee_routes_verschillen(tp):
    a = {"d1": {GD}, "d2": {EU, WM}, "d3": {"fout": "aanbieder"}}
    b = {"d1": set(), "d2": {EU}, "d3": set()}
    uit = tp.verschil_etiketten(a, b)
    assert sorted((x["doc_id"], x["keurmerk"]) for x in uit) == [("d1", GD), ("d2", WM)]


def rc(tp, argv):
    try:
        return tp.main(argv)
    except SystemExit as e:
        return e.code


def schrijf_routes(tmp_path, k4aa_meld):
    uitslag, meld, meta = route_wereld()
    (tmp_path / "uitslag.json").write_text(json.dumps(uitslag))
    for naam, m in (("route-da", meld), ("route-k4aa", k4aa_meld(uitslag))):
        etiketten = {d: (sorted(v) if isinstance(v, set) else v) for d, v in m.items()}  # run-bestand (review 01-11)
        (tmp_path / f"{naam}.json").write_text(json.dumps({"status": "voltooid", "etiketten": etiketten}))
        (tmp_path / f"{naam}-meta.json").write_text(json.dumps(meta))
    argv = ["--uitslag", str(tmp_path / "uitslag.json"), "--uit", str(tmp_path / "uit")]
    for naam in ("route-da", "route-k4aa"):
        argv += ["--route", f"{naam}={tmp_path / f'{naam}.json'}", "--meta", f"{naam}={tmp_path / f'{naam}-meta.json'}"]
    return argv


def test_cap09_main_schrijft_tabellen_json_en_md(tp, tmp_path):
    alles = lambda u: {d: ({GD} if v["keurmerken"][GD] == "aanwezig" else set()) for d, v in u.items()}
    assert rc(tp, schrijf_routes(tmp_path, alles)) == 0
    data = json.loads((tmp_path / "uit" / "tabellen.json").read_text())
    assert (data["route-da"][GD]["gevonden"], data["route-k4aa"][GD]["gevonden"]) == (3, 6)
    md = (tmp_path / "uit" / "tabellen.md").read_text(encoding="utf-8")
    assert "route-da" in md and "route-k4aa" in md


def test_cap09_main_stopt_bij_zdr_weigering_zonder_tabellen(tp, tmp_path):
    def met_zdr(u):
        m = {d: set() for d in u}
        m[sorted(u)[0]] = {"fout": "geen_zdr"}
        return m

    assert rc(tp, schrijf_routes(tmp_path, met_zdr)) not in (0, None)
    assert not (tmp_path / "uit" / "tabellen.json").exists() and not (tmp_path / "uit" / "tabellen.md").exists()
