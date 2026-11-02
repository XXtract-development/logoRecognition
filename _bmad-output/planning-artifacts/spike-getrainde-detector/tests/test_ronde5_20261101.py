"""ATDD ronde 5 (01-11-2026): Nutri-Score A–E, V-label als 9e keurmerk, NutriGreen in de training (SPEC CAP-1/2/3/4/5/6/
7/8/9/10/12/16; meetregels §2–§4/§6, toetsset §2/§4–§6, trainingsset §1–§10, randvoorwaarden §4; interfacecontract
ronde 5 in de ATDD-checklist; besluiten Friso 01-11-2026). Rode fase: de 13 klassen, `KEURMERKEN_LOS`/`KEURMERKEN`, de
Nutri-Score-groep A–E, de extra scheidingsrijen, `met_v_label`/`letters`, `kies_nutrigreen`, `--nutrigreen`,
`nutrigreen.py` en het bijgewerkte draaiplan bestaan nog niet. De invulpagina in de browser staat in
test_ronde5_browser_20261101.py. Verzonnen GLN's, GTIN's, beelden en een verzonnen mini-zip; geen netwerk (aanbieder
nagebootst); alles in `tmp_path`; de meetmap wordt niet gelezen."""
import collections
import copy
import hashlib
import inspect
import io
import json
import re
import subprocess
import sys
import threading
import urllib.request
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

from test_besluiten_20261101 import HIER, stap
from test_cap12_k4aa_runner import det, nep_k4aa
from test_review_20261101 import (TOETS_GLN, TRAIN_GLN, NepClient, aanvraag, echt_pm, mod, png, schrijf, toets_pm,
                                  vak)
from test_ronde3_20261101 import FLASH, LEEG, Opname, vervang
from test_ronde4_20261101 import opdrachten, sha, uit_van

EU, GD, RC, PW = "EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING"
MSC, WM, VG = "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO"
V, VV = "EUROPEAN_V_LABEL_VEGAN", "EUROPEAN_V_LABEL_VEGETARIAN"
NSA, NSB, NSC, NSD, NSE = NS5 = tuple(f"NUTRISCORE_{x}" for x in "ABCDE")
KLASSEN10 = (EU, GD, RC, NSA, NSB, NSC, PW, MSC, WM, VG)
KLASSEN13 = KLASSEN10 + (NSD, NSE, V)
LOS = (EU, GD, RC, PW, MSC, WM, VG, V)
NEGEN = LOS + ("NUTRISCORE",)
CATEGORIEEN = [{"id": i + 1, "name": k, "supercategory": "keurmerk"} for i, k in enumerate(KLASSEN13)]  # zoals echt._coco
G = {k: f"100000000000{i}" for i, k in enumerate("ABCDE", 1)}  # verzonnen leveranciers
MD5_ECHT = "6836b94d5c065aee397fad8415396e5a"
BESLUITEN = {"automatisch", "mens bevestigt", "te weinig voorbeelden"}


def attributie():
    """De attributietekst uit randvoorwaarden §4 (bron van de waarheid; nutrigreen.ATTRIBUTIE moet hem letterlijk volgen)."""
    tekst = (HIER / "randvoorwaarden.md").read_text(encoding="utf-8")
    return re.search(r'Attributie \(zelfde tekst in `train-resultaat\.json`\): "([^"]+)"', tekst).group(1)


def et5(aanwezig=(), nutriscore=(), onzeker=(), status="bevestigd"):
    """Bevestigd etiket in het schema van ronde 5: een keuze voor alle 8 losse keurmerken (V-label inbegrepen)."""
    k = {c: "aanwezig" if c in aanwezig else "onzeker" if c in onzeker else "afwezig" for c in LOS}
    ns = nutriscore if isinstance(nutriscore, str) else list(nutriscore)
    return {"status": status, "keurmerken": k, "nutriscore": ns, "veranderd": [], "opmerking": "",
            "tijd": "2026-11-01T22:00:00+01:00"}


def rc(fn):
    try:
        return fn()
    except SystemExit as e:
        return e.code


def gtins5(letter, n, prefix="2"):
    return {f"{prefix}{'ABCDE'.index(letter) + 1}{i:012d}" for i in range(n)}


def leeg13():
    return {r: {} for r in KLASSEN13}


def waarden(x):
    yield x
    for v in (x.values() if isinstance(x, dict) else x if isinstance(x, list) else ()):
        yield from waarden(v)


# --- klassen en keurmerken op één plek ---------------------------------------------------------------------------------

def test_r5_klassen_13_de_tien_bestaande_eerst_coco_ids_ongewijzigd():  # P1, CAP-6
    tr, gen = mod("train"), mod("generator")
    assert tuple(tr.KLASSEN) == KLASSEN13
    assert gen.CATEGORIE == {k: i + 1 for i, k in enumerate(KLASSEN13)}
    assert {k: gen.CATEGORIE[k] for k in KLASSEN10} == {k: i + 1 for i, k in enumerate(KLASSEN10)}  # id 1–10 gelijk
    assert tr.VARIANTEN == {VV: V}


def test_r5_een_klassenlijst_voor_alle_gereedschappen():  # P1, CAP-6
    klassen = mod("train").KLASSEN
    for naam in ("echt", "generator", "herken", "k4aa_lokaal", "nutrigreen"):
        assert mod(naam).KLASSEN is klassen, naam


def test_r5_keurmerklijsten_los_en_negen_op_een_plek():  # P0, CAP-3/CAP-9
    us, ts = mod("uitslag"), mod("toets")
    assert tuple(us.KEURMERKEN_LOS) == LOS and tuple(us.KEURMERKEN) == NEGEN
    assert not hasattr(us, "KEURMERKEN7") and not hasattr(us, "KEURMERKEN8")  # de oude namen verdwijnen
    assert ts.LOS is us.KEURMERKEN_LOS
    assert tuple(ts.NS) == NS5 and tuple(mod("herken").NS) == NS5
    assert mod("tel_proef").NS == {c: c[-1] for c in NS5}


# --- uitslag: schema, groep A–E, per letter, V-label (CAP-3, CAP-9) -----------------------------------------------------

def test_r5_valideer_bevestigd_vraagt_het_v_label_en_weigert_vegetarisch():  # P0, CAP-3
    us, ids = mod("uitslag"), {"d"}
    assert us.valideer({"id": "d", "waarde": et5(nutriscore=["D", "E"])}, ids)["nutriscore"] == ["D", "E"]
    assert us.valideer({"id": "d", "waarde": {"keurmerken": {V: "onzeker"}}}, ids)  # tussenstand met alleen V-label
    assert us.valideer({"id": "d", "waarde": {**et5(), "veranderd": [V, "NUTRISCORE"]}}, ids)
    zonder_v = {**et5(), "keurmerken": {c: "afwezig" for c in LOS if c != V}}
    for fout in (zonder_v, {**et5(), "keurmerken": {**et5()["keurmerken"], VV: "afwezig"}},
                 {"keurmerken": {VV: "aanwezig"}}, {**et5(), "veranderd": [VV]}):
        with pytest.raises(ValueError):
            us.valideer({"id": "d", "waarde": fout}, ids)


def test_r5_per_keurmerk_nutriscore_groep_a_tot_e_en_per_letter():  # P0, CAP-9 (meetregels §3)
    pk = mod("uitslag").per_keurmerk({
        "d": et5(nutriscore=["D"]), "e": et5(nutriscore=["E"]), "ab": et5(nutriscore=["A", "B"]),
        "leeg": et5(nutriscore=[]), "onl": et5(nutriscore="onleesbaar"), "x": et5(nutriscore=["D"], status="onleesbaar")})
    assert set(pk) == set(NEGEN) | set(NS5)
    assert (pk["NUTRISCORE"]["met"], pk["NUTRISCORE"]["zonder"]) == ({"d", "e", "ab"}, {"leeg"})  # D en E zijn mét
    assert (pk[NSD]["met"], pk[NSD]["zonder"]) == ({"d"}, {"e", "ab", "leeg"})
    assert (pk[NSE]["met"], pk[NSE]["zonder"]) == ({"e"}, {"d", "ab", "leeg"})
    assert (pk[NSA]["met"], pk[NSA]["zonder"]) == ({"ab"}, {"d", "e", "leeg"})
    assert not any("onl" in pk[k][kant] for k in ("NUTRISCORE", *NS5) for kant in ("met", "zonder"))  # letter onleesbaar
    assert "onl" in pk[GD]["zonder"] and not any("x" in pk[k][kant] for k in pk for kant in ("met", "zonder"))


def test_r5_per_keurmerk_en_stand_tellen_het_v_label_als_negende():  # P0, CAP-3
    us = mod("uitslag")
    u = {"v": et5(aanwezig={V}), "n": et5(), "o": et5(onzeker={V})}
    pk = us.per_keurmerk(u)
    assert (pk[V]["met"], pk[V]["zonder"]) == ({"v"}, {"n"})
    st = us.stand(u)
    assert set(st) == set(NEGEN)
    assert st[V] == {"met": 1, "zonder": 1} and st["NUTRISCORE"] == {"met": 0, "zonder": 3}


@pytest.fixture
def server5(tmp_path):
    docs = [f"{TOETS_GLN}-{60000000000000 + i}-528" for i in range(3)]
    schrijf(tmp_path / "items.json", [{"id": d, "beeld": "x.png", "hint": [], "voorinvulling": {}} for d in docs])
    srv = mod("invul.server").maak_server(tmp_path, 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield SimpleNamespace(poort=srv.server_address[1], bestand=tmp_path / "uitslag.json", docs=docs)
    srv.shutdown()
    srv.server_close()


def test_r5_server_bevestigd_met_v_label_landt_zonder_of_vegetarisch_geweigerd(server5):  # P0, CAP-3
    p, (d0, d1, _) = server5.poort, server5.docs
    assert aanvraag(p, body={"id": d0, "waarde": et5(aanwezig={V}, nutriscore=["E"])}) == 200
    voor = server5.bestand.read_bytes()
    zonder_v = {**et5(), "keurmerken": {c: "afwezig" for c in LOS if c != V}}
    assert aanvraag(p, body={"id": d1, "waarde": zonder_v}) == 400
    assert aanvraag(p, body={"id": d1, "waarde": {"keurmerken": {VV: "aanwezig"}}}) == 400
    tussen = {"keurmerken": {c: "afwezig" for c in LOS if c != V}, "nutriscore": ["E"]}  # maakt d0 onvolledig
    assert aanvraag(p, body={"id": d0, "waarde": tussen}) == 400
    assert server5.bestand.read_bytes() == voor
    with urllib.request.urlopen(f"http://127.0.0.1:{p}/stand", timeout=10) as r:
        st = json.loads(r.read())["stand"]
    assert set(st) == set(NEGEN) and st[V] == {"met": 1, "zonder": 0} and st["NUTRISCORE"] == {"met": 1, "zonder": 0}


# --- tel_proef: groep A–E, per letter, V-label, nakijklijst over de 9 (CAP-9) -------------------------------------------

def ns_wereld():
    u = {"d_goed": et5(nutriscore=["D"]), "d_fout": et5(nutriscore=["D"]), "e_extra": et5(nutriscore=["E"]),
         "e_mis": et5(nutriscore=["E"]), "ab": et5(nutriscore=["A", "B"]), "z_d": et5(), "z_e": et5(), "z_a": et5(),
         "z_niets": et5(), "onl": et5(nutriscore="onleesbaar")}
    meld = {"d_goed": {NSD}, "d_fout": {NSC}, "e_extra": {NSE, NSA}, "e_mis": set(), "ab": {NSB}, "z_d": {NSD},
            "z_e": {NSE}, "z_a": {NSA}, "z_niets": set(), "onl": {NSD}}
    return u, meld


def test_r5_tel_nutriscore_d_op_d_gevonden_andere_letter_gemist_vals_bij_elke_letter():  # P0, CAP-9
    ns = mod("tel_proef").tel(*ns_wereld())["NUTRISCORE"]
    assert (ns["met"], ns["gevonden"], ns["verkeerde_letter"]) == (5, 2, 2)  # d_goed en ab; d_fout en e_extra verkeerd
    assert (ns["zonder"], ns["vals"]) == (4, 3)  # D, E en A op een etiket zonder Nutri-Score zijn alle drie vals


def test_r5_tel_per_letter_a_tot_e():  # P0, CAP-9
    r = mod("tel_proef").tel(*ns_wereld())
    rij = lambda k: (r[k]["met"], r[k]["gevonden"], r[k]["zonder"], r[k]["vals"])  # noqa: E731
    assert set(NS5) <= set(r)
    assert (rij(NSA), rij(NSD), rij(NSE)) == ((1, 0, 8, 2), (2, 1, 7, 1), (2, 1, 7, 1))  # onleesbaar telt nergens


def test_r5_tel_en_tabel_v_label_en_letters_d_e_hebben_een_rij():  # P0, CAP-9
    tp = mod("tel_proef")
    u = {"v1": et5(aanwezig={V}), "v2": et5(aanwezig={V}), "n1": et5(), "n2": et5(), "o": et5(onzeker={V})}
    meld = {"v1": {V}, "v2": set(), "n1": {V}, "n2": set(), "o": {V}}
    r = tp.tel(u, meld)[V]
    assert (r["met"], r["gevonden"], r["zonder"], r["vals"]) == (2, 1, 2, 1)
    t = tp.tabel(u, meld, {}, n_trekkingen=10)
    for k in ("NUTRISCORE", *NS5, V):
        assert "spreiding" in t[k] and t[k]["besluit"] in BESLUITEN, k


def test_r5_nakijklijst_en_besluit_lopen_over_de_negen(tmp_path):  # P0, CAP-9 (meetregels §6)
    tp = mod("tel_proef")
    u, waar = {}, {}
    for i in range(12):
        u[f"m{i:02d}"], waar[f"m{i:02d}"] = et5(aanwezig=set(LOS), nutriscore=["D"]), set(LOS) | {NSD}
        u[f"z{i:02d}"], waar[f"z{i:02d}"] = et5(), set()
    routes = {"r1": {**waar, "m00": waar["m00"] - {V}, "z00": {V}, "m01": waar["m01"] - {NSD} | {NSE}}, "r2": waar}
    lijst, sleutel = tp.nakijklijst(u, routes)
    assert {r["keurmerk"] for r in lijst} == set(NEGEN)
    verschil = {(r["doc_id"], r["keurmerk"]) for r in lijst if sleutel[str(r["nr"])] == "verschil"}
    assert verschil == {("m00", V), ("z00", V), ("m01", "NUTRISCORE")}  # NSD op een D-etiket is geen verschil
    pad = schrijf(tmp_path / "nakijken.json", {str(r["nr"]): r["waarheid"] for r in lijst})
    na, tweede = tp.na_nakijken(u, routes, {}, pad)
    assert tweede == {} and set(NEGEN) <= set(na["r1"]) and "steekproef" in na["r1"][V]
    assert (na["r1"][V]["met"], na["r1"][V]["gevonden"], na["r1"][V]["vals"]) == (12, 11, 1)
    assert set(tp.verschil(na["r1"], na["r2"])) == set(NEGEN)


# --- scheiding: 10 keuzerijen, 3 extra rijen buiten de keuze (CAP-1, toetsset §2) ----------------------------------------

def test_r5_scheiding_tien_keuzerijen_en_drie_extra():  # P0, CAP-1
    sch = mod("scheiding")
    assert tuple(sch.RIJEN) == KLASSEN10 and tuple(sch.RIJEN_EXTRA) == (NSD, NSE, V)


def test_r5_bouw_rijen_13_vegetarisch_telt_in_de_v_label_rij():  # P0, CAP-1
    decl = [(f"{G['A']}-{g}-528", G["A"], g, frozenset(c)) for g, c in (
        ("10000000000017", {V}), ("10000000000024", {VV}), ("10000000000031", {NSD, NSE}), ("10000000000048", {VG}))]
    rijen = mod("scheiding").bouw_rijen(decl, [])
    assert set(rijen) == set(KLASSEN13)
    assert dict(rijen[V]) == {G["A"]: {"10000000000017", "10000000000024"}}
    assert dict(rijen[NSD]) == dict(rijen[NSE]) == {G["A"]: {"10000000000031"}}
    assert dict(rijen[VG]) == {G["A"]: {"10000000000048"}}


def scheiding_wereld():
    """Op de 10 keuzerijen wint {A} (gelijk met {B}, laagste GLN-rij); telde de V-label-rij mee in de keuze, dan won {B}
    (B traint 4 V-label-GTIN's, C houdt er 4 voor de toets)."""
    gt = lambda p, n: {f"{p}{i:012d}" for i in range(n)}  # noqa: E731
    uit = {"91000000000001", "92000000000001"}
    rijen = leeg13()
    rijen[EU] = {G["A"]: gt("21", 5), G["B"]: gt("22", 5), G["E"]: {"91000000000001"}}
    rijen[V] = {G["B"]: gt("31", 4), G["C"]: gt("32", 4) | {"92000000000001"}}
    return rijen, uit


def test_r5_kies_kiest_alleen_op_de_tien_rijen_ook_als_de_extra_rijen_anders_zouden_kiezen():  # P0, CAP-1
    sch = mod("scheiding")
    rijen, uit = scheiding_wereld()
    tien = {r: rijen[r] for r in KLASSEN10}
    als_keuzerij = {**tien, WM: rijen[V]}  # voorwaarde: met deze rij in de keuze verandert de uitkomst
    assert sch.kies(als_keuzerij, uit)["trainingsleveranciers"] == [G["B"]]
    k10, k13 = sch.kies(tien, uit), sch.kies(rijen, uit)
    assert k10["trainingsleveranciers"] == k13["trainingsleveranciers"] == [G["A"]]
    assert k13["score"] == k10["score"] and len(k13["score"]) == 10
    assert k13["kandidaten"] == k10["kandidaten"]
    assert {r: k13["per_rij"][r] for r in KLASSEN10} == {r: k10["per_rij"][r] for r in KLASSEN10}
    assert not any(k13["per_rij"][r].get("buiten_keuze") for r in KLASSEN10)
    assert k13["per_rij"][V] == {"train": 0, "toets": 8, "train_glns": 0, "toets_glns": 2, "buiten_keuze": True}
    assert k13["per_rij"][NSD] == {"train": 0, "toets": 0, "train_glns": 0, "toets_glns": 0, "buiten_keuze": True}


def test_r5_schrijf_zet_de_rijen_buiten_de_keuze_met_reden(tmp_path):  # P0, CAP-1
    sch = mod("scheiding")
    rijen, uit = scheiding_wereld()
    data = json.loads(Path(sch.schrijf(sch.kies(rijen, uit), tmp_path / "scheiding.json", {"x.tsv": "a" * 64})).read_text())
    rbk = data["rijen_buiten_keuze"]
    assert sorted(rbk["rijen"]) == sorted([NSD, NSE, V]) and isinstance(rbk["reden"], str) and rbk["reden"].strip()
    assert data["per_rij"][V]["buiten_keuze"] is True and data["trainingsleveranciers"] == [G["A"]]


# --- toets: gelijkende, schema, V-label uit gelijkend, rapport (CAP-2, toetsset §4–§5) -----------------------------------

def test_r5_toets_gelijkende_keurmerken_zonder_v_label_en_nutriscore_codes():  # P0, CAP-2 (meetregels §2)
    ts = mod("toets")
    assert tuple(ts.GELIJKEND[VG]) == ("VEGAN",) and tuple(ts.GELIJKEND[V]) == ("VEGAN",)
    assert tuple(ts.GELIJKEND["NUTRISCORE"]) == ()
    assert "VEGAN" in ts.GELIJKEND_CODES
    assert not [c for c in ts.GELIJKEND_CODES if c.startswith(("NUTRISCORE_", "EUROPEAN_V_LABEL_"))]


def test_r5_toets_schema_en_prompt_vragen_het_v_label():  # P0, CAP-2
    ts = mod("toets")
    s = ts.SCHEMA_VOORINVULLING["properties"]
    assert s["keurmerken"]["items"]["properties"]["code"]["enum"] == list(LOS)
    assert s["gelijkend"]["items"]["enum"] == list(ts.GELIJKEND_CODES)
    assert V in ts.OMSCHRIJVING and re.search(r"vegetari", ts.OMSCHRIJVING[V], re.I)
    assert V in ts.PROMPT and re.search(r"v-label", ts.PROMPT, re.I) and re.search(r"vegetari", ts.PROMPT, re.I)


def vi5(keurmerken, nutriscore=(), gelijkend=(), **extra):
    return {"keurmerken": dict(keurmerken), "nutriscore": list(nutriscore), "hinttegels": {}, "gelijkend": list(gelijkend),
            "model": "m", "kosten": 0.0, **extra}


@pytest.mark.parametrize("gelijkend, verwacht", [([VV], True), ([V], True), ([V, VV], True), (["VEGAN"], False), ([], False)],
                         ids=["vegetarisch", "vegan", "beide", "alleen-woord-vegan", "niets"])
def test_r5_met_v_label_leidt_het_v_label_af_uit_gelijkend_als_kopie(gelijkend, verwacht):  # P0, CAP-2 (toetsset §5)
    v = vi5({GD: True}, ["D"], gelijkend)
    voor = copy.deepcopy(v)
    uit = mod("toets").met_v_label(v)
    assert uit["keurmerken"] == {GD: True, V: verwacht}
    assert {k: x for k, x in uit.items() if k != "keurmerken"} == {k: x for k, x in voor.items() if k != "keurmerken"}
    uit["keurmerken"][EU] = True
    assert v == voor  # de invoer is niet gewijzigd en deelt geen keurmerken met de uitkomst


def test_r5_met_v_label_laat_een_mislukte_voorinvulling_en_een_bestaand_oordeel_staan():  # P0, CAP-2
    ts = mod("toets")
    for v in ({**vi5({}, gelijkend=[V]), "fout": "geweigerd"}, vi5({V: False, GD: True}, gelijkend=[VV])):
        voor = copy.deepcopy(v)
        assert ts.met_v_label(v) == voor and v == voor


def test_r5_met_v_label_leidt_niet_af_bij_een_lege_of_een_nieuwe_voorinvulling():  # P0, CAP-2 (review 02-11)
    ts = mod("toets")
    for v in (vi5({}, gelijkend=[VV]), vi5({GD: True}, gelijkend=[VV], ronde=5)):
        voor = copy.deepcopy(v)
        assert ts.met_v_label(v) == voor and v == voor


def test_r5_voorinvulling_markeert_ronde_5_ook_bij_een_fout():  # P0, CAP-2 (review 02-11)
    ts, orq = mod("toets"), mod("openrouter")
    goed = ts.voorinvulling(NepClient({"keurmerken": [{"code": GD, "aanwezig": True, "tegels": []}], "nutriscore": [],
                                       "gelijkend": []}), png(), [png()])
    fout = ts.voorinvulling(NepClient(fout=orq.EtiketFout("geweigerd")), png(), [png()])
    assert goed["ronde"] == fout["ronde"] == 5 and "fout" in fout
    assert ts.met_v_label(goed)["keurmerken"] == {GD: True}  # V-label niet genoemd: blijft zonder keuze


def rapport_wereld():
    nee = {c: False for c in LOS if c != V}
    return {"d1": vi5({**nee, GD: True}, ["D"], [VV]), "d2": vi5({**nee, V: True}, ["E"]),
            "d3": vi5(nee, ["A", "C"], ["VEGAN"]), "d4": vi5(nee, []), "d5": {**vi5({}, [], [V]), "fout": "geweigerd"}}


def test_r5_rapport_negen_keurmerken_nutriscore_elke_letter_v_label_afgeleid():  # P0, CAP-2 (stoppunt 2)
    ts = mod("toets")
    r = ts.rapport(rapport_wereld())
    assert set(r) == set(NEGEN)
    assert (r["NUTRISCORE"], r[V], r[GD], r[VG]) == (3, 2, 1, 0)  # D en E tellen; V-label uit gelijkend; fout telt niet
    assert ts.letters(rapport_wereld()) == {"A": 1, "B": 0, "C": 1, "D": 1, "E": 1}


def test_r5_cli_rapport_per_letter_en_stoppunt_2_alleen_over_de_negen(tmp_path, capsys):  # P0, CAP-2
    pm = tmp_path / "pm"
    schrijf(pm / "toets" / "voorinvulling.json",
            {f"d{i:02d}": vi5({c: True for c in LOS if c != V}, ["E"], [VV] if i < 15 else []) for i in range(16)})
    code = rc(lambda: mod("toets").main(["rapport", "--proef-map", str(pm)]))
    uit = json.loads(capsys.readouterr().out)
    assert set(uit) == {"rapport", "nutriscore_per_letter", "stoppunt_2"}
    assert set(uit["rapport"]) == set(NEGEN) and (uit["rapport"]["NUTRISCORE"], uit["rapport"][V]) == (16, 15)
    assert uit["nutriscore_per_letter"] == {"A": 0, "B": 0, "C": 0, "D": 0, "E": 16}
    assert uit["stoppunt_2"] == [V] and code == 2  # letters A–D op 0 zijn geen stoppunt


def test_r5_items_dragen_het_afgeleide_v_label_voorinvulling_json_blijft_ongewijzigd(tmp_path, monkeypatch):  # P0, CAP-2
    pm, mf, docs = toets_pm(tmp_path, 4)
    t = pm / "toets"
    oud = {docs[0]: vi5({GD: True}, gelijkend=[VV]), docs[1]: vi5({}), docs[2]: vi5({V: False}, gelijkend=[V])}
    schrijf(t / "voorinvulling.json", oud)
    client = vervang(monkeypatch, Opname(LEEG))
    argv = ["voorinvulling", "--proef-map", str(pm), "--manifest", str(mf / "manifest.json"), "--zdr-logo", str(pm / "logo.png")]
    assert mod("toets").main(argv) == 0
    assert len(client.calls) == 1  # alleen docs[3] is nieuw
    vi = json.loads((t / "voorinvulling.json").read_text())
    assert {d: vi[d] for d in docs[:3]} == oud and V not in vi[docs[3]]["keurmerken"] and vi[docs[3]]["ronde"] == 5
    items = {i["id"]: i["voorinvulling"]["keurmerken"] for i in json.loads((t / "items.json").read_text())}
    # docs[1] (oud, leeg) en docs[3] (nieuw, model noemde geen V-label): geen afgeleid V-label (review 02-11)
    assert items == {docs[0]: {GD: True, V: True}, docs[1]: {}, docs[2]: {V: False}, docs[3]: {}}


def mini_toets_pm(tmp_path):
    """Proefmap met de invoer van de scheiding: toetsleverancier met V-label (vegetarisch en vegan), het woord VEGAN en
    Nutri-Score E; de trainingsleverancier met een vegetarisch V-label."""
    pm, inv = tmp_path / "pm", tmp_path / "pm" / "invoer"
    schrijf(pm / "scheiding.json", {"trainingsleveranciers": [TRAIN_GLN]})
    regels = [(TOETS_GLN, "20000000000011", VV, "", ""), (TOETS_GLN, "20000000000028", V, "", ""),
              (TOETS_GLN, "20000000000035", "", "VEGAN", ""), (TOETS_GLN, "20000000000042", "", "", "E"),
              (TRAIN_GLN, "20000000000059", VV, "", "")]
    inv.mkdir(parents=True)
    (inv / "declaraties-prod-basiseenheden-20261008.tsv").write_text(
        "doc_id\tt3777\tdieet\tnutriscore\n" + "".join(f"{l}-{g}-528\t{t}\t{d}\t{n}\n" for l, g, t, d, n in regels))
    (inv / "alcohol-kandidaten.tsv").write_text("")
    schrijf(inv / "momentopname" / "actieve-refs.json", [])
    (inv / "momentopname" / "training-data-actief.tsv").write_text("")
    schrijf(inv / "voorlopige-selectie.json", {"etiketten": []})
    return pm


def test_r5_toetsrijen_v_label_uit_de_scheiding_vegetarisch_telt_mee(tmp_path):  # P0, CAP-2
    ts = mod("toets")
    pm = mini_toets_pm(tmp_path)
    rijen, gelijkend = ts._toets_rijen(pm)
    assert rijen[V] == {TOETS_GLN: {"20000000000011", "20000000000028"}} and rijen[NSE] == {TOETS_GLN: {"20000000000042"}}
    assert gelijkend[VG] == gelijkend[V] == {TOETS_GLN: {"20000000000035"}}  # V-label is geen gelijkend van Vegan Society
    assert not gelijkend.get("NUTRISCORE")
    assert ts._toets_rijen(pm, "train")[0][V] == {TRAIN_GLN: {"20000000000059"}}


def test_r5_cli_aanvulling_v_label_kiest_ook_op_een_vegetarische_declaratie(tmp_path, capsys):  # P0, CAP-2
    pm = mini_toets_pm(tmp_path)
    kand = schrijf(pm / "toets" / "kandidaten.json", [{"gtin": "20000000000028", "gln": TOETS_GLN, "reden": "gelijkend:" + VG}])
    assert mod("toets").main(["kandidaten", "--proef-map", str(pm), "--alle", V, "--bestaand", str(kand)]) == 0
    assert json.loads((pm / "toets" / "kandidaten-aanvulling.json").read_text()) == \
        [{"gtin": "20000000000011", "gln": TOETS_GLN, "reden": V}]
    assert json.loads(capsys.readouterr().out)["per_keurmerk"] == {V: {"toegevoegd": 1, "over": 0}}


def test_r5_cli_aanvulling_op_een_letter_en_het_v_label(tmp_path, monkeypatch, capsys):  # P0, CAP-2 (toetsset §4)
    pm = tmp_path / "pm"
    e, v = sha(gtins5("A", 6, "5")), sha(gtins5("C", 3, "6"))
    rijen = leeg13()
    rijen[NSE], rijen[NSD], rijen[NSA], rijen[V] = {G["A"]: set(e)}, {G["B"]: gtins5("B", 5, "4")}, \
        {G["C"]: gtins5("C", 4, "3")}, {G["C"]: set(v)}
    monkeypatch.setattr(mod("toets"), "_toets_rijen", lambda _pm, kant="toets": copy.deepcopy((rijen, {})))
    kand = schrijf(pm / "toets" / "kandidaten.json", [{"gtin": e[0], "gln": G["A"], "reden": NSE},
                                                      {"gtin": v[0], "gln": G["C"], "reden": "gelijkend:" + VG}])
    argv = ["kandidaten", "--proef-map", str(pm), "--alle", V, "--alleen", NSE, "--max-per", "3", "--bestaand", str(kand),
            "--naam", "kandidaten-aanvulling-2"]
    assert mod("toets").main(argv) == 0
    lijst = json.loads((pm / "toets" / "kandidaten-aanvulling-2.json").read_text())
    per = collections.defaultdict(list)
    for i in lijst:
        per[i["reden"]].append(i["gtin"])
    assert dict(per) == {NSE: e[1:4], V: v[1:]}  # alleen letter E (niet D of A), hetzelfde maximum
    assert json.loads(capsys.readouterr().out)["per_keurmerk"] == {NSE: {"toegevoegd": 3, "over": 2},
                                                                   V: {"toegevoegd": 2, "over": 0}}


@pytest.mark.parametrize("code", ["NUTRISCORE_F", VV])
def test_r5_cli_aanvulling_onbekende_code_exit_2(tmp_path, capsys, code):  # P1, CAP-2 (bewaking, vooraf groen)
    pm = mini_toets_pm(tmp_path)
    kand = schrijf(pm / "toets" / "kandidaten.json", [])
    assert rc(lambda: mod("toets").main(["kandidaten", "--proef-map", str(pm), "--alle", code, "--bestaand", str(kand)])) == 2
    assert sorted(p.name for p in (pm / "toets").iterdir()) == ["kandidaten.json"]


@pytest.mark.parametrize("bestaat", ["kandidaten.json", "kandidaten-paren.tsv"])
def test_r5_cli_gewone_run_overschrijft_geen_bestaande_lijst(tmp_path, bestaat):  # P0, CAP-2 (review 02-11, toetsset §4)
    pm = mini_toets_pm(tmp_path)
    (pm / "toets").mkdir()
    (pm / "toets" / bestaat).write_text("lijst van 31-10\n")
    voor = {q.name: q.read_bytes() for q in (pm / "toets").iterdir()}
    assert rc(lambda: mod("toets").main(["kandidaten", "--proef-map", str(pm)])) not in (0, None)
    assert {q.name: q.read_bytes() for q in (pm / "toets").iterdir()} == voor


def test_r5_cli_alle_op_een_letter_neemt_alles_wat_overblijft(tmp_path, monkeypatch, capsys):  # P0, CAP-2 (review 02-11)
    pm, e = tmp_path / "pm", sha(gtins5("E", 7, "5"))
    rijen = leeg13()
    rijen[NSE], rijen[NSD] = {G["A"]: set(e)}, {G["B"]: gtins5("D", 5, "4")}
    monkeypatch.setattr(mod("toets"), "_toets_rijen", lambda _pm, kant="toets": copy.deepcopy((rijen, {})))
    kand = schrijf(pm / "toets" / "kandidaten.json", [{"gtin": e[0], "gln": G["A"], "reden": NSE}])
    argv = ["kandidaten", "--proef-map", str(pm), "--alle", NSE, "--max-per", "2", "--bestaand", str(kand)]
    assert mod("toets").main(argv) == 0
    assert [i["gtin"] for i in json.loads((pm / "toets" / "kandidaten-aanvulling.json").read_text())] == e[1:]
    assert json.loads(capsys.readouterr().out)["per_keurmerk"] == {NSE: {"toegevoegd": 6, "over": 0}}


def test_r5_cli_nutriscore_bij_alleen_en_alle_samen_exit_2(tmp_path):  # P0, CAP-2 (review 02-11)
    pm = mini_toets_pm(tmp_path)
    kand = schrijf(pm / "toets" / "kandidaten.json", [])
    argv = ["kandidaten", "--proef-map", str(pm), "--alleen", NSE, "--alle", NSD, "--bestaand", str(kand)]
    assert rc(lambda: mod("toets").main(argv)) == 2
    assert sorted(p.name for p in (pm / "toets").iterdir()) == ["kandidaten.json"]


def test_r5_kandidaten_nutriscore_40_voor_de_groep_om_de_beurt_over_a_tot_e():  # P0, CAP-2
    rijen = leeg13()
    for i, c in enumerate(NS5):
        rijen[c] = {G["ABCDE"[i]]: gtins5("ABCDE"[i], 20, str(3 + i))}
    tel = collections.Counter(i["reden"] for i in mod("toets").kandidaten(rijen, {}))
    assert tel == {c: 8 for c in NS5}


def test_r5_kandidaten_kiest_het_v_label_als_eigen_keurmerk():  # P0, CAP-2
    rijen = leeg13()
    rijen[V], rijen[VG] = {G["A"]: gtins5("A", 50, "6")}, {G["B"]: gtins5("B", 5, "7")}
    tel = collections.Counter(i["reden"] for i in mod("toets").kandidaten(rijen, {}))
    assert tel == {V: 40, VG: 5}


# --- generator._logos: vegetarisch als V-label-bron, geen D/E/V-label bij de harde negatieven (CAP-4) ---------------------

def logos_pm(tmp_path, monkeypatch, refs):
    """Momentopname onder een verzonnen thuismap (HOME), zodat de echte meetmap niet gelezen wordt."""
    monkeypatch.setenv("HOME", str(tmp_path / "thuis"))
    mo = tmp_path / "thuis" / "logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/momentopname/bestanden"
    for i, r in enumerate(refs):
        (mo / r["path"]).parent.mkdir(parents=True, exist_ok=True)
        (mo / r["path"]).write_bytes(png((48, 48), ruis=300 + i))
    pm, inv = tmp_path / "pm", tmp_path / "pm" / "invoer"
    schrijf(pm / "scheiding.json", {"trainingsleveranciers": [TRAIN_GLN]})
    inv.mkdir(parents=True)
    (inv / "declaraties-prod-basiseenheden-20261008.tsv").write_text("doc_id\tt3777\tdieet\tnutriscore\n")
    (inv / "alcohol-kandidaten.tsv").write_text("")
    schrijf(inv / "momentopname" / "actieve-refs.json", refs)
    return pm


WIKI = "https://commons.wikimedia.org/wiki/File:"
REFS = [  # het vegetarische V-label eerst en ook als http-bron: het mag toch nooit het referentieplaatje worden
    {"id": "r-vv", "code": VV, "source": WIKI + "V-Label_Vegetarisch.png", "path": "wiki/v-label-vegetarisch.png"},
    {"id": "r-v", "code": V, "source": WIKI + "V-Label_Vegan_2023.png", "path": "wiki/v-label-vegan.png"},
    {"id": "r-d", "code": NSD, "source": "synthetic-nutriscore-bootstrap", "path": "synth/d.png"},
    {"id": "r-e", "code": NSE, "source": "synthetic-nutriscore-bootstrap", "path": "synth/e.png"},
    {"id": "r-vegan", "code": "VEGAN", "source": "gs1-packaging-label-guide", "path": "gs1/vegan.png"},
    {"id": "r-triman", "code": "TRIMAN", "source": "gs1-packaging-label-guide", "path": "gs1/triman.png"},
    {"id": "r-gd", "code": GD, "source": WIKI + "Gruener_Punkt.svg", "path": "wiki/gd.png"},
]


def test_r5_logos_vegetarisch_is_v_label_bron_maar_nooit_het_referentieplaatje(tmp_path, monkeypatch):  # P1, CAP-4
    bronnen, gelijkend, referenties, ontbreekt = mod("generator")._logos(logos_pm(tmp_path, monkeypatch, REFS))
    assert {Path(b["pad"]).name: b["klasse"] for b in bronnen} == {
        "v-label-vegetarisch.png": V, "v-label-vegan.png": V, "d.png": NSD, "e.png": NSE, "gd.png": GD}
    assert {Path(g["pad"]).name for g in gelijkend} == {"vegan.png", "triman.png"}
    assert not [g for g in gelijkend if g["klasse"].startswith(("NUTRISCORE_", "EUROPEAN_V_LABEL_"))]
    assert Path(referenties[V]["pad"]).name == "v-label-vegan.png"
    assert set(referenties) == {V, NSD, NSE, GD}
    assert ontbreekt == [k for k in KLASSEN13 if k not in referenties]  # over de 13


def test_r5_logos_zonder_vegan_referentie_ontbreekt_het_v_label(tmp_path, monkeypatch):  # P1, CAP-4 (stoppunt 7)
    bronnen, _, referenties, ontbreekt = mod("generator")._logos(logos_pm(tmp_path, monkeypatch, [REFS[0], REFS[-1]]))
    assert [b["klasse"] for b in bronnen if Path(b["pad"]).name == "v-label-vegetarisch.png"] == [V]
    assert V not in referenties and V in ontbreekt and NSD in ontbreekt and NSE in ontbreekt and len(ontbreekt) == 12


# --- echt: 13 klassen, vegetarisch → V-label, validatie-uitslag (CAP-5) ---------------------------------------------------

def test_r5_echt_gelijkend_schema_en_prompt_met_13_klassen():  # P1, CAP-5
    ec = mod("echt")
    assert not {NSD, NSE, V, VV} & set(ec.GELIJKEND)
    enum = ec.SCHEMA_VOORLABELS["properties"]["vakjes"]["items"]["properties"]["code"]["enum"]
    assert set(KLASSEN13) <= set(enum)
    assert all(k in ec.PROMPT for k in KLASSEN13)


def test_r5_voorlabels_vegetarisch_wordt_v_label_d_en_e_blijven_klassen():  # P1, CAP-5
    antwoord = {"vakjes": [{"beeld": 0, "code": VV, "box": [10, 10, 50, 50], "onzeker": False},
                           {"beeld": 0, "code": NSD, "box": [100, 100, 160, 140], "onzeker": False},
                           {"beeld": 0, "code": NSE, "box": [200, 100, 260, 140], "onzeker": True}]}
    uit = mod("echt").voorlabels(NepClient(antwoord, model=FLASH), png((400, 300)), [])
    assert sorted((v["code"], tuple(v["box"]), v["onzeker"]) for v in uit) == sorted(
        [(V, (10, 10, 50, 50), False), (NSD, (100, 100, 160, 140), False), (NSE, (200, 100, 260, 140), True)])


def test_r5_echt_rapport_over_13_klassen():  # P1, CAP-5
    r = mod("echt").rapport([{"vakjes": [vak(V, (0, 0, 9, 9)), vak(NSE, (20, 0, 29, 9))]}], [])
    assert set(r) == set(KLASSEN13)
    assert r[V] == {"train_etiketten": 1, "train_vakjes": 1, "valid_etiketten": 0, "valid_vakjes": 0}
    assert r[NSE]["train_vakjes"] == 1


def test_r5_validatie_uitslag_met_v_label_en_letters_d_e(tmp_path):  # P1, CAP-5/CAP-9
    w = schrijf(tmp_path / "w.json", {"d1": {"aanwezig": [V, NSD, GD], "onzeker": []},
                                      "d2": {"aanwezig": [NSE, NSA], "onzeker": [V]}, "d3": {"aanwezig": [], "onzeker": []}})
    mod("echt").main(["validatie-uitslag", "--waarheid", str(w), "--uit", str(tmp_path / "u.json")])
    u = json.loads((tmp_path / "u.json").read_text())
    assert [(u[d]["keurmerken"][V], u[d]["nutriscore"]) for d in ("d1", "d2", "d3")] == \
        [("aanwezig", ["D"]), ("onzeker", ["A", "E"]), ("afwezig", [])]
    assert all(set(r["keurmerken"]) == set(LOS) for r in u.values())
    for d, r in u.items():
        mod("uitslag").valideer({"id": d, "waarde": r}, set(u))  # past in het schema van uitslag.json


# --- echt.kies_nutrigreen: twee grenzen, om de beurt per klasse, ≤ 10% leeg, vaste seed (CAP-16) --------------------------

def coco_van(beelden, breedte=64):
    """[(naam, [codes])] → COCO-set zoals nutrigreen.omzetten hem schrijft: één vakje per code, `ng_naam` = naam."""
    cat = {k: i + 1 for i, k in enumerate(KLASSEN13)}
    coco = {"images": [], "annotations": [], "categories": CATEGORIEEN}
    for i, (naam, codes) in enumerate(beelden):
        coco["images"].append({"id": i, "file_name": f"{naam}.jpg", "width": breedte, "height": breedte, "ng_naam": naam})
        for c in codes:
            coco["annotations"].append({"id": len(coco["annotations"]), "image_id": i, "category_id": cat[c],
                                        "bbox": [8, 8, 16, 16], "area": 256, "iscrowd": 0})
    return coco


def volgorde_ng(namen, seed=20261031):
    return sorted(namen, key=lambda n: hashlib.sha256((str(seed) + n).encode()).hexdigest())


def kies(coco, *a, **k):
    """(gekozen namen, rapport); controleert dat elk beeld hoogstens één keer gekozen is."""
    ids, rapport = mod("echt").kies_nutrigreen(coco, *a, **k)
    ids, naam = list(ids), {im["id"]: im["ng_naam"] for im in coco["images"]}
    assert len(ids) == len(set(ids))
    return [naam[i] for i in ids], rapport


A50 = [f"ngfoto-a-{i:02d}" for i in range(50)]
LEEG10 = [f"ngfoto-leeg-{i:02d}" for i in range(10)]
GRENS_COCO = [(n, [NSA]) for n in A50] + [(n, []) for n in LEEG10]


@pytest.mark.parametrize("eigen_tegels, eigen_vakjes, budget, aandeel, n_pos, n_leeg, grens", [
    (40, 1000, 100, 0.2, 28, 0, 28),  # floor(0,2 × (40 + 100)) = 28 < budget: de tegelgrens stopt, geen ruimte voor leeg
    (40, 20, 100, 0.2, 20, 2, 28),    # de vakjesgrens stopt bij 20; leeg = min(10, 20 // 9, 28 − 20) = 2
    (1000, 1000, 15, 0.2, 15, 0, 15),  # het budget stopt
    (40, 1000, 100, 0.5, 50, 5, 70),  # alle 50 positief; leeg = min(10, 50 // 9, 20) = 5
], ids=["tegelgrens", "vakjesgrens", "budget", "aandeel-0,5"])
def test_r5_kies_nutrigreen_twee_grenzen_en_hoogstens_tien_procent_zonder_vakje(eigen_tegels, eigen_vakjes, budget, aandeel,
                                                                                 n_pos, n_leeg, grens):  # P0, CAP-16
    namen, r = kies(coco_van(GRENS_COCO), eigen_tegels, eigen_vakjes, budget, aandeel=aandeel)
    assert set(namen) == set(volgorde_ng(A50)[:n_pos]) | set(volgorde_ng(LEEG10)[:n_leeg])
    assert (r["tegels"], r["zonder_vakje"], r["grens_tegels"], r["grens_vakjes"]) == (n_pos + n_leeg, n_leeg, grens, eigen_vakjes)
    assert r["beelden"][NSA] == r["vakjes"][NSA] == n_pos
    assert r["zonder_vakje"] <= 0.1 * r["tegels"]


def test_r5_kies_nutrigreen_om_de_beurt_per_klasse_in_klassenvolgorde():  # P0, CAP-16
    eu, a, v = [f"ngfoto-eu-{i}" for i in range(10)], [f"ngfoto-a-{i}" for i in range(10)], ["ngfoto-v-0", "ngfoto-v-1"]
    coco = coco_van([(n, [V]) for n in v] + [(n, [NSA]) for n in a] + [(n, [EU]) for n in eu])
    # grens = min(10, floor(0,2 × (25 + 10))) = 7: EU, NS-A, V, EU, NS-A, V, EU (KLASSEN-volgorde, niet de invoervolgorde)
    namen, r = kies(coco, 25, 1000, 10)
    assert set(namen) == set(volgorde_ng(eu)[:3]) | set(volgorde_ng(a)[:2]) | set(v)
    assert {c: r["beelden"].get(c, 0) for c in (EU, NSA, V)} == {EU: 3, NSA: 2, V: 2}


def test_r5_kies_nutrigreen_beeld_met_meer_klassen_een_keer_en_telt_voor_elk():  # P0, CAP-16
    coco = coco_van([("ngfoto-mix", [EU, V])] + [(f"ngfoto-eu-{i}", [EU]) for i in range(3)] + [("ngfoto-v-0", [V])])
    namen, r = kies(coco, 1000, 1000, 100)
    assert sorted(namen) == sorted(["ngfoto-mix", "ngfoto-eu-0", "ngfoto-eu-1", "ngfoto-eu-2", "ngfoto-v-0"])
    assert r["tegels"] == 5 and (r["beelden"][EU], r["beelden"][V], r["vakjes"][EU], r["vakjes"][V]) == (4, 2, 4, 2)


def test_r5_kies_nutrigreen_vaste_seed():  # P0, CAP-16
    coco = coco_van(GRENS_COCO)
    assert kies(coco, 40, 1000, 100) == kies(copy.deepcopy(coco), 40, 1000, 100)
    namen7, _ = kies(coco, 40, 1000, 100, seed=7)
    assert set(namen7) == set(volgorde_ng(A50, seed=7)[:28]) != set(volgorde_ng(A50)[:28])


@pytest.mark.parametrize("nagemaakt, grens", [(0, 10), (8, 12), (1000, 28)], ids=["geen", "te-weinig", "genoeg"])
def test_r5_kies_nutrigreen_blijft_onder_20_procent_bij_weinig_nagemaakte_tegels(nagemaakt, grens):  # P0 (review 02-11)
    # grens = min(100, floor(0,2 × 140) = 28, floor(0,2 × (40 + nagemaakt) / 0,8))
    _, r = kies(coco_van(GRENS_COCO), 40, 1000, 100, nagemaakt=nagemaakt)
    assert r["grens_tegels"] == r["tegels"] == grens
    assert r["tegels"] <= 0.2 * (40 + r["tegels"] + min(nagemaakt, 100 - r["tegels"]))


# --- echt.py dataset --nutrigreen: alleen train/, uit het mengbudget, rapport en herkomst (CAP-16) ------------------------

def coco_map(map_, beelden, categorieen=CATEGORIEEN):
    """COCO-map met kleine JPEG's: [(bestandsnaam, [codes], extra-velden)]."""
    map_.mkdir(parents=True, exist_ok=True)
    cat = {c["name"]: c["id"] for c in categorieen}
    coco = {"images": [], "annotations": [], "categories": categorieen}
    for i, (naam, codes, extra) in enumerate(beelden):
        Image.new("RGB", (64, 64), (200, 200, 200)).save(map_ / naam, quality=90)
        coco["images"].append({"id": i, "file_name": naam, "width": 64, "height": 64, **extra})
        for c in codes:
            coco["annotations"].append({"id": len(coco["annotations"]), "image_id": i, "category_id": cat[c],
                                        "bbox": [8, 8, 16, 16], "area": 256, "iscrowd": 0})
    schrijf(map_ / "_annotations.coco.json", coco)
    return coco


def dataset_ng(tmp_path, categorieen=CATEGORIEEN):
    pm, lijst, vl, _ = echt_pm(tmp_path)  # 10 trainingsetiketten van 300 × 300, elk één zeker vakje: één tegel per etiket
    ng = coco_map(tmp_path / "ng", [(f"ngfoto-{i:02d}.jpg", [NSA], {"ng_naam": f"ngfoto-{i:02d}"}) for i in range(30)]
                  + [(f"ngfoto-leeg-{i}.jpg", [], {"ng_naam": f"ngfoto-leeg-{i}"}) for i in range(6)], categorieen)
    coco_map(tmp_path / "meng", [(f"nep-{i:03d}.jpg", [GD], {}) for i in range(30)])
    uit = tmp_path / "pm" / "train" / "echt"
    argv = ["dataset", "--lijst", str(lijst), "--voorlabels", str(vl), "--proef-map", str(pm), "--uit", str(uit),
            "--meng", str(tmp_path / "meng"), "--meng-aantal", "20", "--nutrigreen", str(tmp_path / "ng")]
    return argv, uit, ng


def is_ng(im):
    return im["file_name"].startswith("ngfoto") or "ng_naam" in im


def test_r5_dataset_nutrigreen_alleen_in_train_uit_het_mengbudget_met_rapport_en_herkomst(tmp_path):  # P0, CAP-16
    ec = mod("echt")
    argv, uit, ng = dataset_ng(tmp_path)
    assert rc(lambda: ec.main(argv)) in (0, None)
    tr = json.loads((uit / "train" / "_annotations.coco.json").read_text())
    ng_im, nep = [im for im in tr["images"] if is_ng(im)], [im for im in tr["images"] if im["file_name"].startswith("nep-")]
    eigen = {im["id"] for im in tr["images"] if not is_ng(im) and not im["file_name"].startswith("nep-")}
    eigen_vakjes = sum(a["image_id"] in eigen for a in tr["annotations"])
    ids, verwacht = ec.kies_nutrigreen(ng, len(eigen), eigen_vakjes, 20)  # eigen tegels en vakjes van train/ vóór mengen
    rp = json.loads((uit / "rapport.json").read_text())["_nutrigreen"]
    assert rp == json.loads(json.dumps(verwacht)) and len(ng_im) == verwacht["tegels"] > 0
    naam = {im["id"]: im["file_name"] for im in ng["images"]}
    assert sorted(im["file_name"] for im in ng_im) == sorted(naam[i] for i in ids)
    assert sorted(im["file_name"] for im in nep) == [f"nep-{i:03d}.jpg" for i in range(20 - len(ng_im))]  # rest nagemaakt
    assert len(ng_im) <= 0.2 * len(tr["images"]) and len(tr["images"]) == len(eigen) + 20
    ng_ids = {im["id"] for im in ng_im}
    assert sum(a["image_id"] in ng_ids for a in tr["annotations"]) <= eigen_vakjes
    assert all((uit / "train" / im["file_name"]).is_file() for im in ng_im)
    for split in ("valid", "test"):
        assert not [im for im in json.loads((uit / split / "_annotations.coco.json").read_text())["images"] if is_ng(im)]
        assert not list((uit / split).glob("ngfoto*"))
    h = json.loads((uit / "herkomst.json").read_text(encoding="utf-8"))
    tekst = json.dumps(h, ensure_ascii=False)
    assert attributie() in tekst and "CC-BY-SA-4.0" in tekst and "doi:10.5281/zenodo.10020545" in tekst
    assert rp in list(waarden(h))


def test_r5_dataset_nutrigreen_met_andere_categorieen_weigert_en_mengt_niets(tmp_path, capsys):  # P0, CAP-16
    tien = [{"id": i + 1, "name": k, "supercategory": "keurmerk"} for i, k in enumerate(KLASSEN10)]
    argv, uit, _ = dataset_ng(tmp_path, tien)
    code = rc(lambda: mod("echt").main(argv))
    uitvoer = capsys.readouterr()
    assert code not in (0, None) and "unrecognized arguments" not in uitvoer.out + uitvoer.err + str(code)
    pad = uit / "train" / "_annotations.coco.json"
    assert not pad.exists() or not [im for im in json.loads(pad.read_text())["images"] if is_ng(im)]
    assert not (uit / "herkomst.json").exists() and not list(uit.rglob("ngfoto*"))


@pytest.mark.parametrize("meng", [None, "1000"], ids=["zonder-meng", "meng-te-kort"])
def test_r5_dataset_nutrigreen_hoogstens_20_procent_ook_zonder_genoeg_nagemaakt(tmp_path, meng):  # P0 (review 02-11)
    argv, uit, _ = dataset_ng(tmp_path)
    i = argv.index("--meng")
    argv = argv[:i] + argv[i + 4:] + ["--meng-aantal", "1000"] if meng is None else \
        argv[:i + 3] + [meng] + argv[i + 4:]  # 30 nagemaakte tegels, budget 1000
    assert rc(lambda: mod("echt").main(argv)) in (0, None)
    tr = json.loads((uit / "train" / "_annotations.coco.json").read_text())
    ng_im = [im for im in tr["images"] if is_ng(im)]
    rp = json.loads((uit / "rapport.json").read_text())
    assert 0 < len(ng_im) <= 0.2 * len(tr["images"]) and rp["_nutrigreen"]["tegels"] == len(ng_im)
    assert rp["_nagemaakt"] == (0 if meng is None else 30)
    assert len(tr["images"]) == len(ng_im) + rp["_nagemaakt"] + sum(not is_ng(im) and not im["file_name"].startswith("nep-")
                                                                   for im in tr["images"])


def test_r5_dataset_zonder_nutrigreen_ruimt_een_oude_herkomst_op(tmp_path):  # P0, CAP-16 (review 02-11)
    ec = mod("echt")
    argv, uit, _ = dataset_ng(tmp_path)
    assert rc(lambda: ec.main(argv)) in (0, None) and (uit / "herkomst.json").exists()
    zonder = argv[:argv.index("--nutrigreen")]
    assert rc(lambda: ec.main(zonder)) in (0, None)
    rp = json.loads((uit / "rapport.json").read_text())
    assert not (uit / "herkomst.json").exists() and "_nutrigreen" not in rp and rp["_nagemaakt"] == 20


# --- train: klassen en data_herkomst in train-resultaat.json (CAP-6, CAP-16) ----------------------------------------------

def train_resultaat(tmp_path, monkeypatch, dataset, start=None):
    tr = mod("train")

    def nep_train(cfg, log, voortgang=None):
        Path(cfg["uit"], "checkpoint_best_total.pth").write_bytes(b"gewichten")
        return None, "mps", 1.0

    schrijf(Path(dataset) / "train" / "_annotations.coco.json", {"categories": CATEGORIEEN})  # verplicht (review 02-11)

    monkeypatch.setattr(tr, "_train", nep_train)
    monkeypatch.setattr(tr, "_gewichtsherkomst", lambda cfg: {"licentie": "Apache-2.0"})
    cfg = tr.config("echt" if start else "nagemaakt", "N", dataset, tmp_path / "uit", epochs=1, seed=1, start=start)
    tr.train(cfg)
    return json.loads((tmp_path / "uit" / "train-resultaat.json").read_text(encoding="utf-8"))


def test_r5_train_resultaat_klassen_en_lege_data_herkomst(tmp_path, monkeypatch):  # P1, CAP-6
    (tmp_path / "ds").mkdir()
    r = train_resultaat(tmp_path, monkeypatch, tmp_path / "ds")
    assert r["klassen"] == list(KLASSEN13) and r["data_herkomst"] == []


def test_r5_train_resultaat_neemt_herkomst_van_dataset_en_vorige_fase_over(tmp_path, monkeypatch):  # P0, CAP-16
    h = {"attributie": attributie(), "licentie": "CC-BY-SA-4.0", "bron": "doi:10.5281/zenodo.10020545",
         "rapport": {"tegels": 5}}
    schrijf(tmp_path / "ds" / "herkomst.json", h)
    vorige = {"bron": "eerdere fase (verzonnen)", "licentie": "CC-BY-SA-4.0"}
    (tmp_path / "f1").mkdir()
    (tmp_path / "f1" / "ckpt.pth").write_bytes(b"fase 1")
    schrijf(tmp_path / "f1" / "train-resultaat.json", {"gewichten": {}, "data_herkomst": [vorige], "klassen": list(KLASSEN13)})
    r = train_resultaat(tmp_path, monkeypatch, tmp_path / "ds", start=tmp_path / "f1" / "ckpt.pth")
    assert r["data_herkomst"] == [vorige, h] and r["klassen"] == list(KLASSEN13)


@pytest.mark.parametrize("geval", ["geen-coco", "tien-categorieen", "start-zonder-klassen", "start-tien-klassen"])
def test_r5_train_weigert_andere_categorieen_of_startklassen_voor_het_werk(tmp_path, monkeypatch, geval):  # P0 (review 02-11)
    tr = mod("train")
    gestart = []
    monkeypatch.setattr(tr, "_train", lambda *a, **k: gestart.append(a))
    ds, start = tmp_path / "ds", None
    ds.mkdir()
    if geval != "geen-coco":
        schrijf(ds / "train" / "_annotations.coco.json",
                {"categories": CATEGORIEEN[:10] if geval == "tien-categorieen" else CATEGORIEEN})
    if geval.startswith("start"):
        start = tmp_path / "f1" / "ckpt.pth"
        schrijf(start.parent / "train-resultaat.json", {"gewichten": {}, **({"klassen": list(KLASSEN10)}
                                                                          if geval == "start-tien-klassen" else {})})
        start.write_bytes(b"fase 1")
    cfg = tr.config("echt" if start else "nagemaakt", "N", ds, tmp_path / "uit", epochs=1, seed=1, start=start)
    with pytest.raises(ValueError):
        tr.train(cfg)
    argv = ["train", "--fase", cfg["fase"], "--maat", "N", "--dataset", str(ds), "--uit", str(tmp_path / "uit"), "--epochs", "1"]
    assert tr.main(argv + (["--start", str(start)] if start else [])) == 2
    assert gestart == [] and not (tmp_path / "uit" / "train-resultaat.json").exists()


# --- herken: NMS over A–E, checkpoint met andere klassen geweigerd vóór torch (CAP-6, CAP-7) -------------------------------

def test_r5_nms_voegt_de_letters_a_tot_e_samen():  # P1, CAP-7
    a = (0, 0, 120, 60)
    uit = mod("herken").nms([{"code": c, "box": a, "score": s} for c, s in
                             ((NSD, 0.6), (NSE, 0.9), (NSA, 0.7), (GD, 0.5), (V, 0.4))])
    assert {(k["code"], k["score"]) for k in uit} == {(NSE, 0.9), (GD, 0.5), (V, 0.4)}


def detecteer_argv(tmp_path, resultaat):
    ck = tmp_path / "m" / "checkpoint_best_total.pth"
    ck.parent.mkdir()
    ck.write_bytes(b"x")
    if resultaat is not None:
        schrijf(ck.parent / "train-resultaat.json", resultaat)
    return ["detecteer", "--model", str(ck), "--maat", "N", "--lijst", str(schrijf(tmp_path / "l.json", [])),
            "--uit", str(tmp_path / "k.json")]


@pytest.mark.parametrize("resultaat", [None, {"klassen": list(KLASSEN10)}, {"config": {}}, {"klassen": list(reversed(KLASSEN13))}],
                         ids=["ontbreekt", "tien-klassen", "zonder-klassen", "andere-volgorde"])
def test_r5_detecteer_weigert_checkpoint_met_andere_klassen_voor_torch(tmp_path, monkeypatch, resultaat):  # P1, CAP-6
    argv = detecteer_argv(tmp_path, resultaat)
    monkeypatch.setitem(sys.modules, "torch", None)  # elke import van torch faalt: de weigering moet ervoor komen
    assert rc(lambda: mod("herken").main(argv)) not in (0, None)
    assert not (tmp_path / "k.json").exists()


def test_r5_detecteer_met_de_13_klassen_gaat_door_tot_torch(tmp_path, monkeypatch):  # P1, controle (vooraf groen)
    argv = detecteer_argv(tmp_path, {"klassen": list(KLASSEN13)})
    monkeypatch.setitem(sys.modules, "torch", None)
    with pytest.raises(ImportError):
        mod("herken").main(argv)


# --- beoordelaar en K4-aa (CAP-8, CAP-12) ----------------------------------------------------------------------------------

def test_r5_beoordelaar_v_label_vegan_en_vegetarisch_hetzelfde_d_en_e_lettervraag():  # P1, CAP-8
    bo = mod("beoordelaar")
    vraag = bo.vraag_voor(V).lower()
    assert "vegan" in vraag and "vegetarian" in vraag and bo.vraag_voor(V) != bo.vraag_voor(GD)
    assert "letter D" in bo.vraag_voor(NSD) and "letter E" in bo.vraag_voor(NSE)


def test_r5_k4aa_vegetarisch_telt_als_v_label_en_d_e_blijven():  # P1, CAP-12
    kl = mod("k4aa_lokaal")
    res = {"detections": [det(GD), det(VV, review=True), det(NSD), det(NSE), det("FOREST_STEWARDSHIP_COUNCIL_MIX")],
           "stats": {"cost_usd": 0.01}}
    assert kl.meldingen_uit(res) == {GD, V, NSD, NSE}
    uit = kl.draai_etiket(nep_k4aa(res), b"x")
    assert uit["meldingen"] == {GD, V, NSD, NSE} and uit["requires_review"] == {V}


# --- nutrigreen.py: omzetten van een mini-zip (CAP-16, trainingsset §10) -------------------------------------------------

KOP = "File Name,Class ID,X,Y,Width,Height\n"  # kop van data.csv (Zenodo 10020545, gelezen 01-11-2026)
TOETS_GTIN_NG, TOETS_GLN_NG = "08711111111117", "8722222000004"


def foto(maat=(200, 100), soort="JPEG", exif_orientatie=None):
    buf, kw = io.BytesIO(), {}
    if exif_orientatie:
        exif = Image.Exif()
        exif[0x0112] = exif_orientatie
        kw["exif"] = exif.tobytes()
    Image.new("RGB", maat, (90, 160, 60)).save(buf, soort, **kw)
    return buf.getvalue()


def mini_ng(tmp_path):
    leden = {
        "dataset/images/nutriScoreD (657).jpg": foto((2000, 1000)),  # groot: wordt 1024 × 512
        "dataset/images/bio en vlabel (3).PNG": foto((600, 400), "PNG"),  # hoofdletters, PNG, twee klassen, niet verkleind
        "dataset/images/achtergrond (12).jpeg": foto((300, 300)),  # geen annotatie: achtergrond
        "dataset/images/gedraaid (1).jpg": foto((400, 300), exif_orientatie=6),
        "dataset/images/8711111111117.jpg": foto(),  # barcode = toets-GTIN (14 cijfers met voorloopnul)
        "dataset/images/8722222333336.jpg": foto(),  # eerste 7 cijfers = die van een toets-GLN
        "dataset/images/8733333444449.jpg": foto(),  # barcode zonder toetsleverancier: blijft
        "dataset/a/dubbel (2).jpg": foto(), "dataset/b/dubbel (2).png": foto(soort="PNG"),
        "dataset/README.txt": b"geen beeld",
    }
    z = tmp_path / "download" / "dataset.zip"
    z.parent.mkdir(parents=True)
    with zipfile.ZipFile(z, "w") as f:
        for naam, data in leden.items():
            f.writestr(naam, data)
    csv = tmp_path / "download" / "data.csv"
    csv.write_text(KOP + "".join(f"{r}\n" for r in (
        "nutriScoreD (657).txt,3,0.5,0.5,0.2,0.4", "nutriScoreD (657).txt,4,0.95,0.1,0.2,0.1",
        "bio en vlabel (3).txt,5,0.25,0.5,0.1,0.2", "bio en vlabel (3).txt,6,0.75,0.5,0.1,0.2",
        "gedraaid (1).txt,0,0.5,0.5,0.1,0.1", "8711111111117.txt,1,0.5,0.5,0.1,0.1", "8722222333336.txt,2,0.5,0.5,0.1,0.1",
        "8733333444449.txt,2,0.5,0.5,0.1,0.1", "dubbel (2).txt,0,0.5,0.5,0.1,0.1", "zonder foto (99).txt,1,0.5,0.5,0.1,0.1")),
        encoding="utf-8")
    return SimpleNamespace(zip=z, csv=csv, md5=hashlib.md5(z.read_bytes()).hexdigest())


def test_r5_nutrigreen_constanten():  # P0, CAP-16 (randvoorwaarden §4)
    ng = mod("nutrigreen")
    assert ng.MD5 == MD5_ECHT and ng.LICENTIE == "CC-BY-SA-4.0"
    assert ng.KLASSE == {0: NSA, 1: NSB, 2: NSC, 3: NSD, 4: NSE, 5: EU, 6: V}
    assert ng.ATTRIBUTIE == attributie() and attributie().startswith("Trained in part on the NutriGreen")


def test_r5_lees_csv_stam_zonder_txt_met_onze_codes(tmp_path):  # P0, CAP-16
    ann = mod("nutrigreen").lees_csv(mini_ng(tmp_path).csv)
    assert [tuple(x) for x in ann["nutriScoreD (657)"]] == [(NSD, 0.5, 0.5, 0.2, 0.4), (NSE, 0.95, 0.1, 0.2, 0.1)]
    assert [tuple(x) for x in ann["bio en vlabel (3)"]] == [(EU, 0.25, 0.5, 0.1, 0.2), (V, 0.75, 0.5, 0.1, 0.2)]
    assert len(ann) == 8 and "zonder foto (99)" in ann


@pytest.mark.parametrize("regel", ["x (1).txt,7,0.5,0.5,0.1,0.1", "x (1).txt,2,1.2,0.5,0.1,0.1", "x (1).txt,2,0.5,-0.1,0.1,0.1",
                                   "x (1).txt,2,0.5,0.5,0.1,1.5"], ids=["klasse-7", "x-boven-1", "y-onder-0", "hoogte-boven-1"])
def test_r5_lees_csv_ongeldige_regel_geweigerd_met_regelnummer(tmp_path, regel):  # P0, CAP-16
    p = tmp_path / "data.csv"
    p.write_text(KOP + "goed (1).txt,0,0.5,0.5,0.1,0.1\n" + regel + "\n")  # de ongeldige regel is regel 3 van het bestand
    with pytest.raises(ValueError, match=r"\b3\b"):
        mod("nutrigreen").lees_csv(p)


def test_r5_omzetten_coco_met_onze_categorieen_vakjes_achtergrond_en_afvallers(tmp_path):  # P0, CAP-16
    ng, z, uit = mod("nutrigreen"), mini_ng(tmp_path), tmp_path / "ng"
    r = ng.omzetten(z.zip, ng.lees_csv(z.csv), uit, toets_gtins={TOETS_GTIN_NG}, toets_glns={TOETS_GLN_NG}, md5=z.md5)
    coco = json.loads((uit / "_annotations.coco.json").read_text(encoding="utf-8"))
    assert coco["categories"] == CATEGORIEEN  # dezelfde als echt en generator
    per = {im["ng_naam"]: im for im in coco["images"]}
    assert set(per) == {"nutriScoreD (657)", "bio en vlabel (3)", "achtergrond (12)", "8733333444449"}
    for im in per.values():
        with Image.open(uit / im["file_name"]) as b:
            assert b.format == "JPEG" and b.size == (im["width"], im["height"]) and max(b.size) <= 1024
    assert (per["nutriScoreD (657)"]["width"], per["nutriScoreD (657)"]["height"]) == (1024, 512)
    naam, cat = {im["id"]: im["ng_naam"] for im in coco["images"]}, {c["id"]: c["name"] for c in CATEGORIEEN}
    vakjes = collections.defaultdict(dict)
    for a in coco["annotations"]:
        im = per[naam[a["image_id"]]]
        x, y, w, h = a["bbox"]
        assert x >= 0 and y >= 0 and x + w <= im["width"] + 0.5 and y + h <= im["height"] + 0.5
        vakjes[naam[a["image_id"]]][cat[a["category_id"]]] = a["bbox"]
    d, bv = vakjes["nutriScoreD (657)"], vakjes["bio en vlabel (3)"]
    assert d[NSD] == pytest.approx([409.6, 153.6, 204.8, 204.8], abs=1)  # (x − w/2)·W … × 1024/2000
    assert d[NSE] == pytest.approx([870.4, 25.6, 153.6, 51.2], abs=1)  # rechts op de beeldrand geknipt
    assert bv[EU] == pytest.approx([120, 160, 60, 80], abs=1) and bv[V] == pytest.approx([420, 160, 60, 80], abs=1)
    assert vakjes["8733333444449"] == {NSC: pytest.approx([90, 45, 20, 10], abs=1)}
    assert "achtergrond (12)" not in vakjes and r["zonder_vakje"] == 1
    af = r["afgevallen"]
    assert (af["annotatie_zonder_beeld"], af["exif_orientatie"], af["toetsleverancier"]) == (1, 1, 2)
    assert af["dubbele_naam"] in (1, 2)  # één naam, twee beelden
    telling = {NSA: 0, NSB: 0, NSC: 1, NSD: 1, NSE: 1, EU: 1, V: 1}
    assert {c: r["beelden"].get(c, 0) for c in telling} == telling == {c: r["vakjes"].get(c, 0) for c in telling}
    assert r["md5"] == z.md5 and r["attributie"] == attributie() and "10020545" in str(r["bron"])


def test_r5_omzetten_weigert_een_andere_md5_en_schrijft_niets(tmp_path):  # P0, CAP-16
    ng, z = mod("nutrigreen"), mini_ng(tmp_path)
    for kw in ({"md5": "0" * 32}, {}):  # zonder md5: de md5 van de echte zip
        with pytest.raises(ValueError):
            ng.omzetten(z.zip, ng.lees_csv(z.csv), tmp_path / "ng", **kw)
        assert not (tmp_path / "ng").exists()


def test_r5_omzetten_schrijft_nooit_in_een_git_werkboom(tmp_path):  # P0, CAP-16
    ng, z, repo = mod("nutrigreen"), mini_ng(tmp_path), tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    with pytest.raises(mod("beelden").BinnenRepo):
        ng.omzetten(z.zip, ng.lees_csv(z.csv), repo / "ng", md5=z.md5)
    assert not (repo / "ng").exists()


def ng_pm(tmp_path):
    """Proefmap: één trainingsleverancier, een toetsleverancier in de declaraties en een in de alcohollijst."""
    pm, inv = tmp_path / "pm", tmp_path / "pm" / "invoer"
    train_gln, alcohol_gln = "8733333000007", "8744444000001"
    schrijf(pm / "scheiding.json", {"trainingsleveranciers": [train_gln]})
    inv.mkdir(parents=True)
    (inv / "declaraties-prod-basiseenheden-20261008.tsv").write_text(
        "doc_id\tt3777\tdieet\tnutriscore\n"
        f"{TOETS_GLN_NG}-08722222999992-528\tGREEN_DOT\t\t\n{train_gln}-08733333444449-528\tGREEN_DOT\t\t\n")
    (inv / "alcohol-kandidaten.tsv").write_text(f"{alcohol_gln}\t{TOETS_GTIN_NG}\t10000263\tJenever X\n")
    return pm, {TOETS_GLN_NG, alcohol_gln}, {"08722222999992", TOETS_GTIN_NG}


def test_r5_cli_omzetten_toetsleveranciers_uit_de_proefmap_rapport_naar_bestand_en_stdout(tmp_path, monkeypatch, capsys):  # P0
    ng, z = mod("nutrigreen"), mini_ng(tmp_path)
    pm, glns, gtins_ = ng_pm(tmp_path)
    echt_omzetten, gezien = ng.omzetten, {}

    def omzetten(*a, **k):  # de echte functie, alleen met de md5 van de mini-zip; legt de argumenten vast
        b = inspect.signature(echt_omzetten).bind(*a, **k)
        b.apply_defaults()
        gezien.update(b.arguments)
        return echt_omzetten(*a, **{**k, "md5": z.md5})

    monkeypatch.setattr(ng, "omzetten", omzetten)
    uit = tmp_path / "ng"
    argv = ["omzetten", "--zip", str(z.zip), "--csv", str(z.csv), "--proef-map", str(pm), "--uit", str(uit), "--tegel", "512"]
    assert rc(lambda: ng.main(argv)) in (0, None)
    assert set(gezien["toets_glns"]) == glns and set(gezien["toets_gtins"]) == gtins_ and gezien["tegel"] == 512
    rapport = json.loads((uit / "rapport.json").read_text(encoding="utf-8"))
    assert json.loads(capsys.readouterr().out) == rapport
    assert rapport["afgevallen"]["toetsleverancier"] == 2  # trainingsleverancier 8733333…: foto blijft
    assert max(max(im["width"], im["height"]) for im in json.loads((uit / "_annotations.coco.json").read_text())["images"]) <= 512


def test_r5_cli_omzetten_met_de_mini_zip_weigert_op_de_md5(tmp_path, capsys):  # P0, CAP-16
    ng, z = mod("nutrigreen"), mini_ng(tmp_path)
    pm, _, _ = ng_pm(tmp_path)
    argv = ["omzetten", "--zip", str(z.zip), "--csv", str(z.csv), "--proef-map", str(pm), "--uit", str(tmp_path / "ng")]
    try:
        code = ng.main(argv)
    except SystemExit as e:
        code = e.code
    except ValueError:
        code = "ValueError"
    assert code not in (0, None) and not (tmp_path / "ng" / "_annotations.coco.json").exists()


# --- DRAAIPLAN: stap 1, 4, 5, 6 en 10 (CAP-10) ----------------------------------------------------------------------------

def test_r5_draaiplan_stap_1_extra_rijen_en_de_5_leveranciers_blijven():  # P2
    s1 = stap(1)
    assert re.search(r"extra rij", s1, re.I) and re.search(r"blijv", s1)
    assert re.search(r"\b5\b[^\n]*leverancier", s1)


def test_r5_draaiplan_stap_4_negen_keurmerken_en_nutriscore_per_letter():  # P2
    s4 = stap(4)
    assert re.search(r"\b9\b", s4) and re.search(r"per letter", s4) and "(8)" not in s4


def test_r5_draaiplan_stap_5_noemt_het_v_label():  # P2
    s5 = stap(5)
    assert "V-label" in s5 and "alle 7 keurmerken" not in s5


def test_r5_draaiplan_stap_6_blok_ronde_5_v_label_en_letter_e():  # P2
    s6 = stap(6)
    assert "ronde 5" in s6.lower()
    deel = s6[s6.lower().index("ronde 5"):]
    nodig = ["--alle EUROPEAN_V_LABEL_VEGAN", "--alleen NUTRISCORE_E", "--max-per 20", "--bestaand $T/kandidaten.json",
             "--bestaand $T/kandidaten-aanvulling-1.json", "--print-laag-eerst"]
    naam_n = re.search(r"^N=kandidaten-aanvulling-2\b", deel, re.M)

    def past(c):
        naam = re.search(r"--naam\s+kandidaten-aanvulling-2\b", c) or (naam_n and re.search(r"--naam\s+\$N\b", c))
        return naam and all(re.search(re.escape(x).replace(r"\ ", r"\s+") + r"(?![\w-])", c) for x in nodig)

    kand = opdrachten(deel, r"toets\.py\s+kandidaten")
    assert any(past(c) for c in kand), kand
    ophaal = opdrachten(deel, r"beelden\.py\s+ophaallijst")
    assert ophaal and all(uit_van(c) == "$T/$N" for c in ophaal), ophaal
    assert any(uit_van(c) == "$T/gecombineerd" for c in opdrachten(deel, r"beelden\.py\s+bouwen(?![\w-])"))


def test_r5_draaiplan_stap_10_nutrigreen_omzetten_mengen_20_procent_en_attributie():  # P2
    s10 = stap(10)
    assert opdrachten(s10, r"nutrigreen\.py\s+omzetten")
    assert any("--nutrigreen" in c for c in opdrachten(s10, r"echt\.py\s+dataset"))
    assert re.search(r"20\s?%", s10) and re.search(r"attributie", s10, re.I)
