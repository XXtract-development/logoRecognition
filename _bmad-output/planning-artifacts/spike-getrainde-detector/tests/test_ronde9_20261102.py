"""ATDD ronde 9 (02-11-2026): FSC, Triman, kunststofcode en PlanetProof als 10e–13e keurmerk, nalopen van bevestigde
etiketten, een aparte voorinvulling voor de vier, een nieuwe versie van de scheiding en nachttraining met hervatten
(SPEC CAP-1–10, 12, 16–18, stoppunten 1 en 2; meetregels §2, toetsset §2/§5/§6, trainingsset §1/§2/§5/§11/§12;
interfacecontract ronde 9 in de ATDD-checklist; besluiten Friso 02-11-2026).

Rode fase: de 17 klassen met de FSC-varianten, `train_argumenten`/`--hervat`, `KEURMERKEN_R5`/`NIEUW_R9`,
`bevestigde_codes`/`na_te_lopen`, de serverregels voor nalopen, `voorinvulling_r9`/`samenvoegen`/`raming_r9`/`leeg`,
`toets.py voorinvulling-r9`, `scheiding.py kies --reden`, `nacht.py`, de nieuwe referentieplaatjes, OFF-zoekopdrachten,
het FSC-certificaatnummer, `per_klasse`, "n.v.t. (geen referenties)" en het bijgewerkte draaiplan bestaan nog niet.
De invulpagina in de browser staat in een eigen bestand. Verzonnen GLN's, GTIN's, beelden, klok en processen; geen
netwerk (de aanbieder wordt nagebootst); alles in `tmp_path`; de meetmap wordt niet gelezen."""
import copy
import io
import json
import os
import plistlib
import re
import signal
import subprocess
import threading
import urllib.request
import zipfile
from datetime import datetime, time, timedelta
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image

from test_besluiten_20261101 import HIER
from test_review_20261101 import TOETS_GLN, aanvraag, mod, png, schrijf
from test_ronde5_20261101 import WIKI, logos_pm, rc

EU, GD, RC, PW = "EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING"
MSC, WM, VG = "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO"
V, VV = "EUROPEAN_V_LABEL_VEGAN", "EUROPEAN_V_LABEL_VEGETARIAN"
FSC, TRI, SPI, PP = "FOREST_STEWARDSHIP_COUNCIL_LABEL", "TRIMAN", "SOCIETY_PLASTICS_INDUSTRY", "ON_THE_WAY_TO_PLANETPROOF"
FSC_MIX, FSC_REC, FSC_100 = ("FOREST_STEWARDSHIP_COUNCIL_MIX", "FOREST_STEWARDSHIP_COUNCIL_RECYCLED",
                             "FOREST_STEWARDSHIP_COUNCIL_100_PERCENT")
NSA, NSB, NSC, NSD, NSE = NS5 = tuple(f"NUTRISCORE_{x}" for x in "ABCDE")
NIEUW = (FSC, TRI, SPI, PP)
R5 = (EU, GD, RC, PW, MSC, WM, VG, V)  # de 8 losse codes van ronde 5
LOS12 = R5 + NIEUW
DERTIEN = LOS12 + ("NUTRISCORE",)
KLASSEN13 = (EU, GD, RC, NSA, NSB, NSC, PW, MSC, WM, VG, NSD, NSE, V)
KLASSEN17 = KLASSEN13 + NIEUW
GELIJKEND_R9 = sorted(["PEFC", "PEFC_CERTIFIED", "SEPARATE_COLLECTION", "RETURNABLE_CAN_NL", "RAINFOREST_ALLIANCE",
                       "RAINFOREST_ALLIANCE_PEOPLE_NATURE", "FAIR_TRADE_MARK", "FAIRTRADE_COCOA",
                       "CERTIFIED_B_CORPORATION"])
SPI_WAARDEN = ("01-pet", "1-pet", "02-hdpe", "2-hdpe", "02-pe-hd", "03-pvc", "04-ldpe", "4-ldpe", "04-pe-ld", "05-pp",
               "5-pp", "06-ps", "07-other", "7-other", "07-o", "7-o")  # trainingsset §11, in deze volgorde


def et9(aanwezig=(), codes=LOS12, nutriscore=(), status="bevestigd", **extra):
    """Etiket in het schema van ronde 9: een keuze voor `codes` (standaard alle 12 losse keurmerken)."""
    return {"status": status, "keurmerken": {c: "aanwezig" if c in aanwezig else "afwezig" for c in codes},
            "nutriscore": list(nutriscore), "veranderd": [], "opmerking": "", "tijd": "2026-11-02T21:00:00+01:00", **extra}


def code_van(fn):
    """Exitcode van een opdrachtregel: teruggegeven, via SystemExit, of een weigering als uitzondering."""
    try:
        return fn()
    except SystemExit as e:
        return e.code
    except ValueError as e:
        return f"ValueError: {e}"


# --- train.py: 17 klassen, varianten, hervatten (CAP-6, trainingsset §1/§5/§12) ----------------------------------------

def test_r9_klassen_17_id_1_tot_13_ongewijzigd_de_vier_achteraan():  # P0, CAP-6
    tr = mod("train")
    assert tuple(tr.KLASSEN) == KLASSEN17
    assert tr.CATEGORIEEN == [{"id": i + 1, "name": k, "supercategory": "keurmerk"} for i, k in enumerate(KLASSEN17)]
    assert {c["name"]: c["id"] for c in tr.CATEGORIEEN}[FSC] == 14 and {c["name"]: c["id"] for c in tr.CATEGORIEEN}[PP] == 17
    assert mod("generator").CATEGORIE == {k: i + 1 for i, k in enumerate(KLASSEN17)}


def test_r9_varianten_v_label_en_drie_fsc_varianten():  # P0, CAP-6 (meetregels §2)
    assert mod("train").VARIANTEN == {VV: V, FSC_MIX: FSC, FSC_REC: FSC, FSC_100: FSC}


def test_r9_een_klassenlijst_van_17_voor_alle_gereedschappen():  # P0, CAP-6
    klassen = mod("train").KLASSEN
    assert len(klassen) == 17
    for naam in ("echt", "generator", "herken", "k4aa_lokaal", "nutrigreen"):
        assert mod(naam).KLASSEN is klassen, naam
    assert mod("nutrigreen").CATEGORIEEN is mod("train").CATEGORIEEN


def cfg_basis(tmp_path):
    return ("nagemaakt", "N", tmp_path / "ds", tmp_path / "uit", 20, 20261031)


def test_r9_config_hervat_none_of_pad_en_een_ontbrekend_hervatpunt_weigert(tmp_path):  # P0, CAP-6/CAP-18
    tr = mod("train")
    assert tr.config(*cfg_basis(tmp_path))["hervat"] is None
    ck = tmp_path / "uit" / "checkpoint_3.ckpt"
    ck.parent.mkdir()
    ck.write_bytes(b"ckpt")
    assert tr.config(*cfg_basis(tmp_path), hervat=ck)["hervat"] == str(ck)
    with pytest.raises(ValueError):
        tr.config(*cfg_basis(tmp_path), hervat=tmp_path / "uit" / "checkpoint_9.ckpt")


def test_r9_train_argumenten_checkpoint_per_epoch_en_resume_alleen_met_hervatpunt(tmp_path):  # P0, CAP-6/CAP-18
    tr = mod("train")
    cfg = tr.config(*cfg_basis(tmp_path))
    ds = tmp_path / "uit" / "dataset-384"
    a = tr.train_argumenten(cfg, ds)
    assert str(a.pop("dataset_dir")) == str(ds)
    assert a == {"epochs": 20, "batch_size": tr.BATCH, "output_dir": cfg["uit"], "seed": 20261031, "tensorboard": False,
                 "num_workers": 0, "checkpoint_interval": 1}  # geen sleutel resume zonder hervatpunt
    ck = tmp_path / "uit" / "checkpoint_4.ckpt"
    ck.parent.mkdir(exist_ok=True)
    ck.write_bytes(b"ckpt")
    b = tr.train_argumenten(tr.config(*cfg_basis(tmp_path), hervat=ck), ds)
    assert b["resume"] == str(ck) and b["checkpoint_interval"] == 1


def coco_set(map_, categorieen):
    schrijf(map_ / "train" / "_annotations.coco.json", {"images": [], "annotations": [], "categories": categorieen})
    return map_


def test_r9_cli_train_neemt_hervat_aan_en_geeft_het_door(tmp_path, monkeypatch, capsys):  # P0, CAP-6/CAP-18
    tr = mod("train")
    ds = coco_set(tmp_path / "ds", tr.CATEGORIEEN)
    ck = tmp_path / "uit" / "checkpoint_4.ckpt"
    ck.parent.mkdir()
    ck.write_bytes(b"ckpt")
    gezien = []
    monkeypatch.setattr(tr, "train", lambda cfg: gezien.append(cfg) or {"ok": True})
    argv = ["train", "--fase", "nagemaakt", "--maat", "N", "--dataset", str(ds), "--uit", str(tmp_path / "uit"),
            "--epochs", "20"]
    assert code_van(lambda: tr.main(argv + ["--hervat", str(ck)])) == 0 and gezien[-1]["hervat"] == str(ck)
    assert code_van(lambda: tr.main(argv)) == 0 and gezien[-1]["hervat"] is None
    n = len(gezien)
    assert code_van(lambda: tr.main(argv + ["--hervat", str(tmp_path / "weg.ckpt")])) == 2 and len(gezien) == n


def test_r9_controleer_klassen_weigert_een_set_met_13_en_noemt_het_aantal_uit_klassen(tmp_path):  # P1, CAP-6
    tr = mod("train")
    oud = [{"id": i + 1, "name": k, "supercategory": "keurmerk"} for i, k in enumerate(KLASSEN13)]
    cfg = tr.config("nagemaakt", "N", coco_set(tmp_path / "ds", oud), tmp_path / "uit", 1, 1)
    with pytest.raises(ValueError, match=r"\b17\b"):
        tr.controleer_klassen(cfg)


# --- uitslag.py: 12 losse codes, bevestigde codes, nalopen (CAP-3/CAP-9, toetsset §6) -------------------------------------

def test_r9_keurmerklijsten_r5_nieuw_los_en_dertien_op_een_plek():  # P0, CAP-3
    us, ts = mod("uitslag"), mod("toets")
    assert tuple(us.KEURMERKEN_R5) == R5 and tuple(us.NIEUW_R9) == NIEUW
    assert tuple(us.KEURMERKEN_LOS) == LOS12 and tuple(us.KEURMERKEN) == DERTIEN
    assert ts.LOS is us.KEURMERKEN_LOS and tuple(ts.NIEUW) == NIEUW


def test_r9_valideer_bevestigd_vraagt_alle_12_en_nutriscore():  # P0, CAP-3
    us, ids = mod("uitslag"), {"d"}
    assert us.valideer({"id": "d", "waarde": et9(aanwezig={FSC, SPI}, nutriscore=["B"])}, ids)["keurmerken"][FSC] == "aanwezig"
    zonder_ns = {k: v for k, v in et9().items() if k != "nutriscore"}
    for fout in (et9(codes=R5), et9(codes=LOS12[:-1]), et9(codes=tuple(c for c in LOS12 if c != V)), zonder_ns):
        with pytest.raises(ValueError):
            us.valideer({"id": "d", "waarde": fout}, ids)


def test_r9_valideer_met_vereist_r5_laat_een_etiket_van_voor_ronde_9_bevestigd():  # P0, CAP-3 (tussenstand)
    us, ids = mod("uitslag"), {"d"}
    assert us.valideer({"id": "d", "waarde": et9(codes=R5)}, ids, vereist=us.KEURMERKEN_R5)
    assert us.valideer({"id": "d", "waarde": et9(codes=R5 + (FSC,), aanwezig={FSC})}, ids, vereist=us.KEURMERKEN_R5)
    with pytest.raises(ValueError):
        us.valideer({"id": "d", "waarde": et9(codes=R5[:-1])}, ids, vereist=us.KEURMERKEN_R5)


@pytest.mark.parametrize("waarde", [
    {"keurmerken": {FSC_MIX: "aanwezig"}},
    {"keurmerken": {FSC_REC: "afwezig", FSC_100: "afwezig"}},
    et9(codes=LOS12 + (FSC_MIX,)),
    et9(bevestigde_codes=sorted(LOS12)),  # de invuller stuurt het veld nooit zelf
    {"keurmerken": {GD: "aanwezig"}, "bevestigde_codes": [GD]},
], ids=["mix", "recycled_100", "bevestigd_met_mix", "bevestigde_codes_bevestigd", "bevestigde_codes_tussenstand"])
def test_r9_valideer_weigert_fsc_variantcodes_en_bevestigde_codes_van_de_client(waarde):  # P0, CAP-3
    with pytest.raises(ValueError):
        mod("uitslag").valideer({"id": "d", "waarde": waarde}, {"d"})


def test_r9_bevestigde_codes_lijst_oud_record_en_niet_bevestigd():  # P0, CAP-3
    us = mod("uitslag")
    assert us.bevestigde_codes(et9(bevestigde_codes=sorted(LOS12))) == set(LOS12)
    assert us.bevestigde_codes(et9(bevestigde_codes=sorted(R5))) == set(R5)
    assert us.bevestigde_codes(et9(codes=R5)) == set(R5)  # bevestigd van vóór ronde 9, zonder lijst
    assert us.bevestigde_codes(et9(codes=R5 + (FSC,), aanwezig={FSC})) == set(R5)  # een losse nieuwe keuze telt niet
    assert us.bevestigde_codes(et9(codes=R5[:3])) == set(R5[:3])
    assert us.bevestigde_codes(et9(status="onleesbaar")) == set()
    assert us.bevestigde_codes({"keurmerken": {GD: "aanwezig"}, "nutriscore": []}) == set()


def test_r9_na_te_lopen_als_een_van_de_vier_niet_bevestigd_is():  # P0, CAP-3
    us = mod("uitslag")
    assert us.na_te_lopen(et9(codes=R5))
    assert us.na_te_lopen(et9(bevestigde_codes=sorted(R5)))
    assert us.na_te_lopen(et9(bevestigde_codes=sorted(LOS12[:-1])))
    assert not us.na_te_lopen(et9(bevestigde_codes=sorted(LOS12)))
    assert not us.na_te_lopen(et9(status="onleesbaar"))
    assert not us.na_te_lopen({"keurmerken": {}, "nutriscore": []})


def test_r9_per_keurmerk_en_stand_tellen_alleen_bevestigde_codes():  # P0, CAP-3/CAP-9 (antwoorden Friso)
    us = mod("uitslag")
    u = {"oud": et9(codes=R5, aanwezig={GD}, nutriscore=["A"]),
         "tussen": et9(codes=R5 + (FSC,), aanwezig={GD, FSC}, bevestigde_codes=sorted(R5)),
         "nieuw": et9(aanwezig={FSC, TRI}, bevestigde_codes=sorted(LOS12)),
         "nieuw_zonder": et9(bevestigde_codes=sorted(LOS12)),
         "onl": et9(aanwezig={FSC}, status="onleesbaar")}
    pk = us.per_keurmerk(u)
    assert set(pk) == set(DERTIEN) | set(NS5)
    assert (pk[GD]["met"], pk[GD]["zonder"]) == ({"oud", "tussen"}, {"nieuw", "nieuw_zonder"})
    assert (pk[FSC]["met"], pk[FSC]["zonder"]) == ({"nieuw"}, {"nieuw_zonder"})  # "tussen" telt pas na Bevestigen
    assert (pk[TRI]["met"], pk[TRI]["zonder"]) == ({"nieuw"}, {"nieuw_zonder"})
    assert (pk[SPI]["met"], pk[SPI]["zonder"]) == (set(), {"nieuw", "nieuw_zonder"})
    assert (pk["NUTRISCORE"]["met"], pk["NUTRISCORE"]["zonder"]) == ({"oud"}, {"tussen", "nieuw", "nieuw_zonder"})
    st = us.stand(u)
    assert set(st) == set(DERTIEN)
    assert st[FSC] == {"met": 1, "zonder": 1} and st[GD] == {"met": 2, "zonder": 2} and st[PP] == {"met": 0, "zonder": 2}


def test_r9_oud_bevestigd_etiket_telt_voor_de_negen_oude_en_niet_voor_de_vier():  # P0, CAP-9
    us = mod("uitslag")
    pk = us.per_keurmerk({"oud": et9(codes=R5, aanwezig={EU, V}, nutriscore=["C"])})
    for c in R5:
        assert ("oud" in pk[c]["met"]) == (c in (EU, V)) and ("oud" in pk[c]["zonder"]) == (c not in (EU, V)), c
    assert pk["NUTRISCORE"]["met"] == {"oud"} and pk[NSC]["met"] == {"oud"}
    for c in NIEUW:
        assert not pk[c]["met"] and not pk[c]["zonder"], c


# --- invul/server.py: bevestigde codes, nalopen, /stand (CAP-3, toetsset §6) -------------------------------------------

@pytest.fixture
def server9(tmp_path):
    docs = [f"{TOETS_GLN}-{70000000000000 + i}-528" for i in range(3)]
    schrijf(tmp_path / "items.json", [{"id": d, "beeld": "x.png", "hint": [], "voorinvulling": {}} for d in docs])
    srv = mod("invul.server").maak_server(tmp_path, 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield SimpleNamespace(poort=srv.server_address[1], bestand=tmp_path / "uitslag.json", docs=docs)
    srv.shutdown()
    srv.server_close()


def opgeslagen(s):
    return json.loads(s.bestand.read_text(encoding="utf-8"))


def stand(s):
    with urllib.request.urlopen(f"http://127.0.0.1:{s.poort}/stand", timeout=10) as r:
        return json.loads(r.read())


def test_r9_server_bevestigd_vraagt_13_keuzes_en_zet_bevestigde_codes(server9):  # P0, CAP-3
    p, (d0, d1, d2) = server9.poort, server9.docs
    assert aanvraag(p, body={"id": d0, "waarde": et9(codes=R5, nutriscore=["B"])}) == 400  # 8 losse is niet genoeg meer
    assert aanvraag(p, body={"id": d0, "waarde": et9(aanwezig={FSC}, nutriscore=["B"])}) == 200
    r = opgeslagen(server9)[d0]
    assert r["status"] == "bevestigd" and r["bevestigde_codes"] == sorted(LOS12) and r["keurmerken"][FSC] == "aanwezig"
    assert aanvraag(p, body={"id": d1, "waarde": {"status": "onleesbaar", "opmerking": "wazig"}}) == 200
    assert "bevestigde_codes" not in opgeslagen(server9)[d1]
    voor = server9.bestand.read_bytes()
    assert aanvraag(p, body={"id": d2, "waarde": et9(bevestigde_codes=sorted(LOS12))}) == 400
    assert aanvraag(p, body={"id": d2, "waarde": et9(codes=LOS12 + (FSC_MIX,))}) == 400
    assert server9.bestand.read_bytes() == voor
    st = stand(server9)
    assert set(st["stand"]) == set(DERTIEN) and st["stand"][FSC] == {"met": 1, "zonder": 0} and st["na_te_lopen"] == 0


def test_r9_server_tussenstand_op_oud_bevestigd_etiket_houdt_status_en_telt_pas_na_bevestigen(server9):  # P0, CAP-3
    p, d0 = server9.poort, server9.docs[0]
    oud = et9(codes=R5, aanwezig={GD}, nutriscore=["C"])
    schrijf(server9.bestand, {d0: oud})  # bevestigd van vóór ronde 9: geen bevestigde_codes
    st = stand(server9)
    assert st["stand"][GD]["met"] == 1 and st["stand"][FSC] == {"met": 0, "zonder": 0} and st["na_te_lopen"] == 1
    klik = {"keurmerken": {**oud["keurmerken"], FSC: "aanwezig"}, "nutriscore": ["C"]}  # klik op een nieuwe rij
    assert aanvraag(p, body={"id": d0, "waarde": klik}) == 200
    r = opgeslagen(server9)[d0]
    assert r["status"] == "bevestigd" and r["bevestigde_codes"] == sorted(R5) and r["keurmerken"][FSC] == "aanwezig"
    st = stand(server9)
    assert st["stand"][FSC] == {"met": 0, "zonder": 0} and st["stand"][GD]["met"] == 1 and st["na_te_lopen"] == 1
    voor = server9.bestand.read_bytes()
    onvolledig = {"keurmerken": {c: "afwezig" for c in R5 if c != WM}, "nutriscore": ["C"]}  # een oude code ontbreekt
    assert aanvraag(p, body={"id": d0, "waarde": onvolledig}) == 400
    assert server9.bestand.read_bytes() == voor
    alles = et9(aanwezig={GD, FSC}, nutriscore=["C"])
    assert aanvraag(p, body={"id": d0, "waarde": alles}) == 200
    assert opgeslagen(server9)[d0]["bevestigde_codes"] == sorted(LOS12)
    st = stand(server9)
    assert st["stand"][FSC] == {"met": 1, "zonder": 0} and st["stand"][GD]["met"] == 1 and st["na_te_lopen"] == 0
    later = {"keurmerken": {**alles["keurmerken"], TRI: "onzeker"}, "nutriscore": ["C"]}  # tussenstand houdt de lijst
    assert aanvraag(p, body={"id": d0, "waarde": later}) == 200
    r = opgeslagen(server9)[d0]
    assert r["status"] == "bevestigd" and r["bevestigde_codes"] == sorted(LOS12) and r["keurmerken"][TRI] == "onzeker"


# --- toets.py: de vier, schema, lege tegels, voorinvulling ronde 9, samenvoegen, rapport (CAP-2, toetsset §5) -----------

def test_r9_toets_los_nieuw_aanvulcodes_en_omschrijving():  # P0, CAP-2
    ts = mod("toets")
    assert tuple(ts.LOS) == LOS12 and tuple(ts.NIEUW) == NIEUW
    assert set(NIEUW) <= set(ts.AANVUL_CODES) and set(NIEUW) <= set(ts.OMSCHRIJVING)
    assert all(isinstance(ts.OMSCHRIJVING[c], str) and ts.OMSCHRIJVING[c].strip() for c in NIEUW)


def test_r9_toets_gelijkend_van_de_vier_volgens_meetregels():  # P0, CAP-2 (meetregels §2)
    ts = mod("toets")
    assert set(ts.GELIJKEND[FSC]) == {"PEFC", "PEFC_CERTIFIED"}
    assert set(ts.GELIJKEND[TRI]) == {GD, RC, "SEPARATE_COLLECTION", SPI, "RETURNABLE_CAN_NL"}
    assert set(ts.GELIJKEND[SPI]) == {RC, GD, TRI, "SEPARATE_COLLECTION", "RETURNABLE_CAN_NL"}
    assert set(ts.GELIJKEND[PP]) == {"RAINFOREST_ALLIANCE", "RAINFOREST_ALLIANCE_PEOPLE_NATURE", "FAIR_TRADE_MARK",
                                     "FAIRTRADE_COCOA", "CERTIFIED_B_CORPORATION"}
    assert list(ts.GELIJKEND_R9) == GELIJKEND_R9


def test_r9_schema_r9_alleen_de_vier_en_hun_gelijkende_zonder_nutriscore():  # P0, CAP-2
    ts = mod("toets")
    s = ts.SCHEMA_R9
    assert s["properties"]["keurmerken"]["items"]["properties"]["code"]["enum"] == list(NIEUW)
    assert s["properties"]["gelijkend"]["items"]["enum"] == GELIJKEND_R9
    assert "nutriscore" not in s["properties"] and "nutriscore" not in s.get("required", [])
    p = ts.PROMPT_R9
    for c in NIEUW:
        assert c in p and ts.OMSCHRIJVING[c] in p, c
    assert re.search(r"\bmix\b", p, re.I) and re.search(r"recycled", p, re.I) and "100" in p  # FSC-variantregel
    assert re.search(r"\b(number|digit|cijfer)", p, re.I)  # het cijfer van de kunststofcode doet er niet toe


def grijs(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L").convert("RGB")


def test_r9_leeg_bij_standaardafwijking_van_de_grijswaarden_onder_3():  # P0, CAP-2
    ts, rng = mod("toets"), np.random.default_rng(9)
    egaal = Image.new("RGB", (64, 64), (240, 240, 240))
    bijna = grijs(128 + rng.normal(0, 1, (64, 64)))
    ruis = grijs(rng.integers(0, 255, (64, 64)))
    lijn = np.full((64, 64), 240.0)
    lijn[30:34, :] = 0
    assert np.asarray(bijna.convert("L")).std() < 3 and np.asarray(grijs(lijn).convert("L")).std() >= 3  # voorwaarden
    assert ts.leeg(egaal) and ts.leeg(bijna)
    assert not ts.leeg(ruis) and not ts.leeg(grijs(lijn))


class Client9:
    """Nagebootste zdr-client met dezelfde `vraag`-vorm als openrouter.Client; legt tekst, beelden en schema vast."""

    def __init__(self, *antwoorden, fout=None, model="anthropic/claude-sonnet-5.5"):
        self.antwoorden, self.fout, self.model, self.calls = list(antwoorden), fout, model, []

    def zdr_proef(self, beeld):
        return {"model": self.model, "tijd": "t", "ok": True}

    def vraag(self, tekst, beelden, schema, verwacht=0.0):
        self.calls.append(SimpleNamespace(tekst=tekst, beelden=list(beelden), schema=schema))
        if self.fout:
            raise self.fout
        return (self.antwoorden.pop(0) if len(self.antwoorden) > 1 else self.antwoorden[0]), 0.01


def test_r9_voorinvulling_r9_verdeelt_de_gegeven_tegels_en_hinttegels_op_etiketindex():  # P0, CAP-2
    ts = mod("toets")
    a1 = {"keurmerken": [{"code": FSC, "aanwezig": False, "tegels": []}, {"code": TRI, "aanwezig": True, "tegels": [2]}],
          "gelijkend": ["PEFC"]}
    a2 = {"keurmerken": [{"code": FSC, "aanwezig": True, "tegels": [1]}], "gelijkend": ["FAIR_TRADE_MARK"]}
    heel, tegels = png(kleur=(1, 1, 1)), [png(kleur=(i, 0, 0)) for i in range(20)]
    index = [3 * i + 1 for i in range(20)]  # etiketindex van de niet-lege tegels
    client = Client9(a1, a2)
    uit = ts.voorinvulling_r9(client, heel, tegels, index)
    assert [len(c.beelden) for c in client.calls] == [17, 5] and all(c.beelden[0] == heel for c in client.calls)
    assert client.calls[1].beelden[1:] == tegels[16:]
    assert all(c.schema == ts.SCHEMA_R9 and c.tekst == ts.PROMPT_R9 for c in client.calls)
    assert uit["keurmerken"] == {FSC: True, TRI: True}
    assert uit["hinttegels"] == {TRI: [index[2]], FSC: [index[17]]}
    assert sorted(uit["gelijkend"]) == ["FAIR_TRADE_MARK", "PEFC"]
    assert uit["ronde"] == 9 and uit["model"] == client.model and uit["kosten"] == pytest.approx(0.02)
    assert "tijd" in uit and "fout" not in uit


def test_r9_voorinvulling_r9_mislukt_geeft_lege_velden_met_fout():  # P0, CAP-2
    ts, orq = mod("toets"), mod("openrouter")
    uit = ts.voorinvulling_r9(Client9(fout=orq.EtiketFout("geweigerd")), png(), [png()], [5])
    assert uit["fout"] == "geweigerd" and uit["ronde"] == 9
    assert (uit["keurmerken"], uit["hinttegels"], uit["gelijkend"]) == ({}, {}, [])
    kapot = ts.voorinvulling_r9(Client9({"keurmerken": [1, 2], "gelijkend": []}), png(), [png()], [5])
    assert "fout" in kapot and kapot["keurmerken"] == {} and kapot["ronde"] == 9


def vi(keurmerken, **extra):
    return {"keurmerken": dict(keurmerken), "nutriscore": [], "hinttegels": {}, "gelijkend": [], "model": "m5",
            "kosten": 0.1, "tijd": "t5", "ronde": 5, **extra}


def vi9(keurmerken, **extra):
    return {"keurmerken": dict(keurmerken), "hinttegels": {}, "gelijkend": [], "model": "m9", "kosten": 0.05,
            "tijd": "t9", "ronde": 9, **extra}


def test_r9_samenvoegen_vult_alleen_de_vier_en_overschrijft_keurmerk_1_tot_9_nooit():  # P0, CAP-2
    ts = mod("toets")
    v = vi({GD: True, V: False}, nutriscore=["B"], hinttegels={GD: [0]}, gelijkend=["VEGAN"])
    v9 = vi9({FSC: True, TRI: False, GD: False, EU: True}, hinttegels={FSC: [3], GD: [7], EU: [1]}, gelijkend=["PEFC"])
    v_kopie, v9_kopie = copy.deepcopy(v), copy.deepcopy(v9)
    uit = ts.samenvoegen(v, v9)
    assert v == v_kopie and v9 == v9_kopie  # een kopie, de invoer blijft zoals hij is
    assert uit["keurmerken"] == {GD: True, V: False, FSC: True, TRI: False}
    assert uit["hinttegels"] == {GD: [0], FSC: [3]}
    assert set(uit["gelijkend"]) == {"VEGAN", "PEFC"}
    assert (uit["nutriscore"], uit["model"], uit["ronde"]) == (["B"], "m5", 5)
    assert uit["ronde9"] == {"model": "m9", "kosten": 0.05, "tijd": "t9"}


def test_r9_samenvoegen_met_een_mislukte_ronde_9_laat_de_vier_zonder_voorinvulling():  # P0, CAP-2
    ts = mod("toets")
    v = vi({GD: True}, hinttegels={GD: [0]})
    uit = ts.samenvoegen(v, vi9({}, kosten=0.0, fout="geweigerd"))
    assert uit["keurmerken"] == {GD: True} and uit["hinttegels"] == {GD: [0]}
    assert uit["ronde9"] == {"model": "m9", "kosten": 0.0, "tijd": "t9", "fout": "geweigerd"}
    rest = ts.samenvoegen(v, vi9({FSC: True}, hinttegels={FSC: [2]}, fout="antwoord_ongeldig"))
    assert not set(NIEUW) & set(rest["keurmerken"]) and FSC not in rest["hinttegels"]


def test_r9_samenvoegen_neemt_het_v_label_uit_een_voorinvulling_van_voor_ronde_5_mee():  # P1, CAP-2 (met_v_label)
    ts = mod("toets")
    oud = {"keurmerken": {GD: True}, "nutriscore": [], "hinttegels": {}, "gelijkend": [VV], "model": "m", "kosten": 0.1}
    uit = ts.samenvoegen(oud, vi9({FSC: False}))
    assert uit["keurmerken"] == {GD: True, V: True, FSC: False}


def test_r9_raming_r9_kostenmodel():  # P0, CAP-2 (randvoorwaarden §3)
    ts = mod("toets")
    assert ts.raming_r9(10, 2) == pytest.approx(0.0022 * 10 + 0.0164 * 2)
    assert ts.raming_r9(0, 0) == 0


def test_r9_rapport_telt_13_met_de_vier_uit_ronde_9():  # P0, CAP-2 (stoppunt 2)
    ts = mod("toets")
    v = {"a": vi({GD: True}, nutriscore=["A"]), "b": vi({GD: False}), "c": vi({}, fout="geweigerd")}
    r9 = {"a": vi9({FSC: True, TRI: True}), "b": vi9({FSC: True, SPI: False}), "c": vi9({PP: True}, fout="geweigerd")}
    r = ts.rapport(v, r9)
    assert set(r) == set(DERTIEN)
    assert (r[FSC], r[TRI], r[SPI], r[PP], r[GD], r["NUTRISCORE"]) == (2, 1, 0, 0, 1, 1)
    zonder = ts.rapport(v)
    assert set(zonder) == set(DERTIEN) and all(zonder[c] == 0 for c in NIEUW) and zonder[GD] == 1


def test_r9_cli_rapport_leest_voorinvulling_r9_als_die_bestaat(tmp_path, capsys):  # P1, CAP-2
    pm = tmp_path / "pm"
    schrijf(pm / "toets" / "voorinvulling.json", {"a": vi({GD: True}), "b": vi({})})
    schrijf(pm / "toets" / "voorinvulling-r9.json", {"a": vi9({FSC: True}), "b": vi9({FSC: True, PP: True})})
    code_van(lambda: mod("toets").main(["rapport", "--proef-map", str(pm)]))
    uit = json.loads(capsys.readouterr().out)
    assert set(uit["rapport"]) == set(DERTIEN) and (uit["rapport"][FSC], uit["rapport"][PP]) == (2, 1)


BREEDTE, HOOGTE, RUIS_VANAF = 2600, 1024, 1800  # tegels van 1024 px: x = 0, 768, 1536, 1576; alleen de laatste twee niet leeg


def etiket(i):
    arr = np.full((HOOGTE, BREEDTE), 230, np.uint8)
    arr[:, RUIS_VANAF:] = np.random.default_rng(900 + i).integers(0, 255, (HOOGTE, BREEDTE - RUIS_VANAF))
    return Image.fromarray(arr, "L").convert("RGB")


def r9_pm(tmp_path, n=3):
    """Proefmap met gebouwde toetsetiketten, een live items.json en de voorinvulling van ronde 5 (GREEN_DOT in tegel 2)."""
    pm, mf = tmp_path / "pm", tmp_path / "pm" / "toets" / "gecombineerd"
    mf.mkdir(parents=True)
    manifest = {}
    for i in range(n):
        d = f"{TOETS_GLN}-{40000000000000 + i}-528"
        etiket(i).save(mf / f"{d}.png")
        manifest[d] = {"sha256": f"sha{i}"}
    schrijf(mf / "manifest.json", manifest)
    (pm / "logo.png").write_bytes(png())
    docs = sorted(manifest)
    schrijf(pm / "toets" / "voorinvulling.json",
            {d: {**vi({GD: True}, hinttegels={GD: [2]}), "beeldtype": "jpeg"} for d in docs})
    schrijf(pm / "toets" / "items.json", [{"id": "live", "beeld": "beelden/live.png", "hint": [], "voorinvulling": {}}])
    return pm, mf, docs


def argv_r9(pm, mf, *extra):
    return ["voorinvulling-r9", "--proef-map", str(pm), "--manifest", str(mf / "manifest.json"), "--zdr-logo",
            str(pm / "logo.png"), *extra]


def test_r9_cli_voorinvulling_r9_alleen_niet_lege_tegels_items_r9_en_klare_etiketten_niet_opnieuw(tmp_path, monkeypatch):  # P0
    ts, orq, herken = mod("toets"), mod("openrouter"), mod("herken")
    pm, mf, docs = r9_pm(tmp_path)
    vakken = herken.tegels(BREEDTE, HOOGTE)
    niet_leeg = [i for i, t in enumerate(vakken) if np.asarray(etiket(0).crop(t).convert("L")).std() >= 3]
    assert len(vakken) == 4 and niet_leeg == [2, 3]  # voorwaarde van deze test
    klaar = vi9({PP: True}, model="eerder", kosten=0.03)
    schrijf(pm / "toets" / "voorinvulling-r9.json", {docs[0]: klaar, docs[1]: vi9({}, kosten=0.0, fout="aanbieder")})
    live = (pm / "toets" / "items.json").read_bytes()
    client = Client9({"keurmerken": [{"code": FSC, "aanwezig": True, "tegels": [0]}], "gelijkend": ["PEFC"]})
    monkeypatch.setattr(orq, "Client", lambda *a, **k: client)
    assert code_van(lambda: ts.main(argv_r9(pm, mf))) in (0, None)
    assert len(client.calls) == 2  # docs[1] (fout) en docs[2] (open); docs[0] wordt niet opnieuw betaald
    for c in client.calls:
        assert len(c.beelden) == 1 + len(niet_leeg)  # overzicht + alleen de niet-lege tegels
        assert all(np.asarray(Image.open(io.BytesIO(b)).convert("L")).std() >= 3 for b in c.beelden[1:])
    r9 = json.loads((pm / "toets" / "voorinvulling-r9.json").read_text())
    assert r9[docs[0]] == klaar
    for d in docs[1:]:
        assert r9[d]["ronde"] == 9 and "fout" not in r9[d] and r9[d]["keurmerken"] == {FSC: True}
        assert r9[d]["hinttegels"] == {FSC: [niet_leeg[0]]}  # tegel 0 van de aanroep = etiketindex 2
    assert (pm / "toets" / "items.json").read_bytes() == live  # de live lijst blijft staan tot de wissel
    items = {i["id"]: i for i in json.loads((pm / "toets" / "items-r9.json").read_text())}
    assert set(items) == set(docs)
    assert items[docs[0]]["voorinvulling"]["keurmerken"] == {GD: True, PP: True}
    assert items[docs[2]]["voorinvulling"]["keurmerken"] == {GD: True, FSC: True}
    assert items[docs[2]]["voorinvulling"]["ronde9"]["model"] == client.model
    hints = items[docs[2]]["hint"]
    assert any(FSC in h for h in hints) and any(GD in h for h in hints)  # hintbeelden van beide voorinvullingen
    assert all((pm / "toets" / h).is_file() for h in hints)
    assert all((pm / "toets" / i["beeld"]).is_file() for i in items.values())


def test_r9_cli_voorinvulling_r9_startprojectie_boven_de_grens_stopt_voor_de_client(tmp_path, monkeypatch, capsys):  # P0
    ts, orq = mod("toets"), mod("openrouter")
    pm, mf, _ = r9_pm(tmp_path, n=2)
    gemaakt = []
    monkeypatch.setattr(orq, "Client", lambda *a, **k: gemaakt.append(a) or Client9({"keurmerken": [], "gelijkend": []}))
    try:
        uitkomst = ts.main(argv_r9(pm, mf, "--grens", "0.001", "--besluit", "test: grens vrijwel nul"))
    except SystemExit as e:
        uitkomst = e.code
    except mod("kosten").BudgetOverschreden:
        uitkomst = "budget"
    assert uitkomst not in (0, None)
    assert not re.search(r"invalid choice|unrecognized arguments", capsys.readouterr().err)  # stoppunt 5, geen argparse-fout
    assert gemaakt == [] and not (pm / "toets" / "voorinvulling-r9.json").exists()
    assert not (pm / "toets" / "items-r9.json").exists()


# --- scheiding.py: vier extra rijen, nieuwe versie alleen met reden en gelijke leveranciers (CAP-1, toetsset §2) --------

def test_r9_scheiding_extra_rijen_drie_van_ronde_5_plus_de_vier():  # P1, CAP-1
    assert tuple(mod("scheiding").RIJEN_EXTRA) == (NSD, NSE, V, FSC, TRI, SPI, PP)


def test_r9_bouw_rijen_fsc_varianten_tellen_in_de_fsc_rij():  # P1, CAP-1
    gln = "1000000000001"
    decl = [(f"{gln}-{g}-528", gln, g, frozenset(c)) for g, c in (
        ("10000000000017", {FSC_MIX}), ("10000000000024", {FSC_REC}), ("10000000000031", {FSC_100}),
        ("10000000000048", {FSC}), ("10000000000055", {TRI, SPI}), ("10000000000062", {PP}))]
    rijen = mod("scheiding").bouw_rijen(decl, [])
    assert set(rijen) == set(KLASSEN17)
    assert dict(rijen[FSC]) == {gln: {"10000000000017", "10000000000024", "10000000000031", "10000000000048"}}
    assert dict(rijen[TRI]) == dict(rijen[SPI]) == {gln: {"10000000000055"}} and dict(rijen[PP]) == {gln: {"10000000000062"}}


A_GLN, B_GLN = "1000000000001", "1000000000002"


def kies_pm(tmp_path):
    """Kleine invoer van de scheiding: twee leveranciers, één uitgesloten GTIN (in een referentiepad), FSC Mix bij B."""
    pm, inv = tmp_path / "pm", tmp_path / "pm" / "invoer"
    inv.mkdir(parents=True)
    regels = [(A_GLN, "20000000000011", EU), (A_GLN, "20000000000028", EU), (A_GLN, "20000000000035", GD),
              (B_GLN, "20000000000042", EU), (B_GLN, "20000000000059", FSC_MIX), (B_GLN, "20000000000066", EU)]
    (inv / "declaraties-prod-basiseenheden-20261008.tsv").write_text(
        "doc_id\tt3777\tdieet\tnutriscore\n" + "".join(f"{l}-{g}-528\t{c}\t\t\n" for l, g, c in regels))
    (inv / "alcohol-kandidaten.tsv").write_text("")
    schrijf(inv / "momentopname" / "actieve-refs.json", [{"path": "refs/x/20000000000066/a.png"}])
    (inv / "momentopname" / "training-data-actief.tsv").write_text("")
    schrijf(inv / "voorlopige-selectie.json", {"etiketten": []})
    return pm


def kopieen(pm):
    return sorted(pm.glob("scheiding.*.json"))


def kies(pm, *extra):
    return code_van(lambda: mod("scheiding").main(["kies", "--proef-map", str(pm), *extra]))


def test_r9_cli_kies_eerste_versie_telt_de_vier_extra_rijen_buiten_de_keuze(tmp_path):  # P1, CAP-1
    pm = kies_pm(tmp_path)
    assert kies(pm) in (0, None)
    data = json.loads((pm / "scheiding.json").read_text())
    assert all(data["per_rij"][r].get("buiten_keuze") for r in NIEUW)
    assert data["per_rij"][FSC]["train"] + data["per_rij"][FSC]["toets"] == 1  # FSC Mix telt in de FSC-rij
    assert sorted(data["rijen_buiten_keuze"]["rijen"]) == sorted((NSD, NSE, V) + NIEUW)
    assert "versie_reden" not in data and kopieen(pm) == []


def test_r9_cli_kies_weigert_een_nieuwe_versie_zonder_reden(tmp_path):  # P1, CAP-1
    pm = kies_pm(tmp_path)
    assert kies(pm) in (0, None)
    voor = (pm / "scheiding.json").read_bytes()
    assert kies(pm) == 2
    assert (pm / "scheiding.json").read_bytes() == voor and kopieen(pm) == []


def test_r9_cli_kies_met_reden_en_gelijke_leveranciers_bewaart_een_kopie_en_schrijft_versie_reden(tmp_path):  # P1, CAP-1
    pm = kies_pm(tmp_path)
    assert kies(pm) in (0, None)
    voor = (pm / "scheiding.json").read_bytes()
    reden = "ronde 9 (besluit Friso 02-11-2026): vier extra rijen"
    assert kies(pm, "--reden", reden) in (0, None)
    assert [k.read_bytes() for k in kopieen(pm)] == [voor]
    nieuw = json.loads((pm / "scheiding.json").read_text())
    assert nieuw["versie_reden"] == reden
    assert nieuw["trainingsleveranciers"] == json.loads(voor)["trainingsleveranciers"]


def test_r9_cli_kies_met_reden_weigert_andere_trainingsleveranciers(tmp_path, capsys):  # P1, CAP-1
    pm = kies_pm(tmp_path)
    assert kies(pm) in (0, None)
    data = json.loads((pm / "scheiding.json").read_text())
    andere = sorted({A_GLN, B_GLN} - set(data["trainingsleveranciers"])) or ["9999999999999"]
    schrijf(pm / "scheiding.json", {**data, "trainingsleveranciers": andere})
    voor = (pm / "scheiding.json").read_bytes()
    assert kies(pm, "--reden", "ronde 9") == 2
    assert "unrecognized arguments" not in capsys.readouterr().err  # geweigerd om de leveranciers, niet om --reden
    assert (pm / "scheiding.json").read_bytes() == voor and kopieen(pm) == []


# --- nacht.py: venster, hervatpunt, opruimen, planner, draai, status, stoppunt 1 (CAP-18, trainingsset §12) -------------

def dt(dag, uur, minuut=0):
    return datetime(2026, 11, dag, uur, minuut)


def als_dt(x):
    return x if isinstance(x, datetime) else datetime.fromisoformat(x)


def ckpt(pad, leesbaar=True):
    if leesbaar:
        with zipfile.ZipFile(pad, "w") as z:
            z.writestr("archive/data.pkl", b"gewichten")
    else:
        pad.write_bytes(b"half geschreven, geen zip")
    return pad


OPDRACHT = ["python", "train.py", "train", "--fase", "echt", "--maat", "N", "--dataset", "DS", "--uit", "U",
            "--epochs", "12"]


class Proces:
    pid = 4242

    def __init__(self, w, args):
        self.w, self.args, self.returncode = w, args, None

    def poll(self):
        self.w.bij()
        return self.returncode

    def terminate(self):
        self.w.term = self.w.term or self.w.t
        if self.w.stopt_op_term and self.returncode is None:
            self.returncode = -signal.SIGTERM

    def kill(self):
        self.w.kill = self.w.kill or self.w.t
        if self.returncode is None:
            self.returncode = -signal.SIGKILL

    def send_signal(self, sig):
        self.kill() if sig == signal.SIGKILL else self.terminate()

    def wait(self, timeout=None):
        if self.poll() is not None:
            return self.returncode
        if timeout is None:
            raise AssertionError("wait zonder timeout op een lopend proces: draai zou blijven hangen")
        self.w.slaap(timeout)
        if self.poll() is None:
            raise subprocess.TimeoutExpired(self.args, timeout)
        return self.returncode


class Cafe:
    """`caffeinate -w <pid>` stopt vanzelf als het trainingsproces stopt."""
    pid = 4343

    def __init__(self, w, args):
        self.w, self.args, self.returncode = w, args, None

    def poll(self):
        if self.returncode is None and (self.w.proces is None or self.w.proces.returncode is not None):
            self.returncode = 0
        return self.returncode

    def terminate(self):
        self.returncode = -signal.SIGTERM if self.returncode is None else self.returncode

    kill = terminate

    def send_signal(self, sig):
        self.terminate()

    def wait(self, timeout=None):
        return self.poll() if self.poll() is not None else self.terminate() or self.returncode


class Nacht:
    """Nagebootste klok (`nu`, `slaap`) en `popen`: het trainingsproces schrijft op vaste tijdstippen checkpoints
    (`checkpoint_<n>.ckpt`, mtime = dat tijdstip) en stopt met een exitcode; op SIGTERM stopt het, of niet."""

    def __init__(self, uit, start, gebeurtenissen=(), stopt_op_term=True):
        self.uit, self.t, self.start = uit, start, start
        self.gebeurtenissen = sorted(gebeurtenissen, key=lambda g: g[0])
        self.stopt_op_term, self.term, self.kill = stopt_op_term, None, None
        self.aanroepen, self.proces, self.n_slaap = [], None, 0

    def nu(self):
        return self.t

    def slaap(self, s):
        self.n_slaap += 1
        assert s >= 0
        if self.n_slaap > 100_000 or self.t > self.start + timedelta(days=3):
            raise RuntimeError("de nagebootste klok loopt weg: draai stopt niet")
        self.t += timedelta(seconds=s)
        self.bij()

    def bij(self):
        p = self.proces
        while p is not None and p.returncode is None and self.gebeurtenissen and self.gebeurtenissen[0][0] <= self.t:
            t, soort, arg = self.gebeurtenissen.pop(0)
            if soort == "ckpt":
                pad = ckpt(self.uit / f"checkpoint_{arg}.ckpt")
                os.utime(pad, (t.timestamp(), t.timestamp()))
                (self.uit / "checkpoint_best_total.pth").write_bytes(b"beste tot nu")
            elif soort == "einde":
                if arg == 0:
                    schrijf(self.uit / "train-resultaat.json", {"checkpoint": str(self.uit / "checkpoint_best_total.pth")})
                p.returncode = arg

    def popen(self, cmd, *a, **kw):
        cmd = [str(c) for c in cmd]
        self.aanroepen.append((self.t, cmd))
        if Path(cmd[0]).name == "caffeinate":
            return Cafe(self, cmd)
        assert self.proces is None, "tweede trainingsproces gestart"
        self.proces = Proces(self, cmd)
        return self.proces

    def training(self):
        return [c for _, c in self.aanroepen if Path(c[0]).name != "caffeinate"]

    def cafe(self):
        return [c for _, c in self.aanroepen if Path(c[0]).name == "caffeinate"]


def uurlijks(start, n, eerste=0):
    """Elk uur na `start` een checkpoint, epoch `eerste` t/m `eerste + n - 1`."""
    return [(start + timedelta(hours=i + 1), "ckpt", eerste + i) for i in range(n)]


def gepland(tmp_path, epochs=12, fase="echt", naam="fase2"):
    uit = tmp_path / naam
    uit.mkdir()
    mod("nacht").plan(uit, OPDRACHT, epochs, fase)
    return uit


def draai(w):
    return mod("nacht").draai(w.uit, nu=w.nu, popen=w.popen, slaap=w.slaap, poll_s=60)


def test_r9_nacht_constanten():  # P0, CAP-18
    n = mod("nacht")
    assert (n.BEGIN, n.EIND, n.STOP_WACHT, n.HOUD, n.MAX_NACHTEN, n.MAX_EPOCH_S, n.LABEL) == \
        (time(22, 0), time(7, 30), 300, 2, 4, 9.5 * 3600, "com.xxtract.proef-nachttraining")


@pytest.mark.parametrize("t, binnen", [(dt(2, 22, 1), True), (dt(2, 23, 59), True), (dt(3, 0, 1), True),
                                      (dt(3, 7, 29), True), (dt(3, 7, 31), False), (dt(3, 12), False),
                                      (dt(3, 21, 59), False)])
def test_r9_nacht_venster_over_middernacht(t, binnen):  # P0, CAP-18
    assert bool(mod("nacht").in_venster(t)) is binnen


def test_r9_nacht_einde_is_de_eerstvolgende_0730_alleen_binnen_het_venster():  # P0, CAP-18
    n = mod("nacht")
    assert n.einde(dt(2, 22)) == dt(3, 7, 30)
    assert n.einde(dt(2, 23, 15)) == dt(3, 7, 30)
    assert n.einde(dt(3, 3)) == dt(3, 7, 30)
    with pytest.raises(ValueError):
        n.einde(dt(3, 12))


@pytest.mark.parametrize("t, seconden, verwacht", [
    (dt(2, 23), 3600, dt(3, 0)),
    (dt(2, 23), 9 * 3600, dt(3, 22, 30)),  # 8,5 uur in deze nacht, de rest vanaf de volgende 22:00
    (dt(2, 12), 3600, dt(2, 23)),  # buiten het venster: pas vanaf 22:00
    (dt(3, 6), 3 * 3600, dt(3, 23, 30)),
    (dt(2, 22), 2 * 9.5 * 3600 + 3600, dt(4, 23)),  # twee volle vensters, dan nog een uur
])
def test_r9_nacht_einddatum_telt_alleen_vensteruren(t, seconden, verwacht):  # P0, CAP-18
    assert mod("nacht").einddatum(t, seconden) == verwacht


def test_r9_nacht_checkpoints_op_epoch_oplopend_alleen_checkpoint_n_ckpt(tmp_path):  # P0, CAP-18
    n = mod("nacht")
    for e in (10, 2, 0):
        ckpt(tmp_path / f"checkpoint_{e}.ckpt")
    for naam in ("checkpoint_best_total.pth", "checkpoint.pth", "checkpoint_best_ema.pth", "train.log"):
        (tmp_path / naam).write_bytes(b"x")
    assert [(e, Path(p).name) for e, p in n.checkpoints(tmp_path)] == \
        [(0, "checkpoint_0.ckpt"), (2, "checkpoint_2.ckpt"), (10, "checkpoint_10.ckpt")]


def test_r9_nacht_hervatpunt_nieuwste_leesbare_terugval_en_alleen_de_eigen_map(tmp_path):  # P0, CAP-18
    n = mod("nacht")
    uit, ander = tmp_path / "fase2", tmp_path / "fase1"
    uit.mkdir()
    ander.mkdir()
    ckpt(ander / "checkpoint_7.ckpt")
    assert n.hervatpunt(uit) is None  # geen checkpoint hier: vanaf het begin, nooit uit een andere fase
    ckpt(uit / "checkpoint_1.ckpt")
    ckpt(uit / "checkpoint_2.ckpt")
    assert Path(n.hervatpunt(uit)) == uit / "checkpoint_2.ckpt"
    ckpt(uit / "checkpoint_3.ckpt", leesbaar=False)
    assert Path(n.hervatpunt(uit)) == uit / "checkpoint_2.ckpt"  # onleesbaar nieuwste valt terug op het vorige
    for e in (1, 2):
        ckpt(uit / f"checkpoint_{e}.ckpt", leesbaar=False)
    assert n.hervatpunt(uit) is None


def test_r9_nacht_opruimen_houdt_de_nieuwste_twee_leesbare_en_raakt_niets_anders(tmp_path):  # P0, CAP-18
    n = mod("nacht")
    for e in range(5):
        ckpt(tmp_path / f"checkpoint_{e}.ckpt")
    anders = ("checkpoint_best_total.pth", "checkpoint_best_ema.pth", "checkpoint_best_regular.pth", "checkpoint.pth",
              "train.log", "nacht.json")
    for naam in anders:
        (tmp_path / naam).write_bytes(b"blijft")
    n.opruimen(tmp_path)
    assert sorted(p.name for p in tmp_path.glob("checkpoint_*.ckpt")) == ["checkpoint_3.ckpt", "checkpoint_4.ckpt"]
    assert all((tmp_path / naam).read_bytes() == b"blijft" for naam in anders)
    ckpt(tmp_path / "checkpoint_5.ckpt", leesbaar=False)
    n.opruimen(tmp_path)
    assert (tmp_path / "checkpoint_3.ckpt").exists() and (tmp_path / "checkpoint_4.ckpt").exists()


def test_r9_nacht_plan_schrijft_nacht_json_en_weigert_hervat_in_de_opdracht(tmp_path):  # P0, CAP-18
    n = mod("nacht")
    uit = gepland(tmp_path, epochs=20, fase="echt")
    assert json.loads((uit / "nacht.json").read_text()) == {"opdracht": OPDRACHT, "epochs": 20, "fase": "echt",
                                                            "venster": ["22:00", "07:30"], "uit": str(uit)}
    ander = tmp_path / "ander"
    ander.mkdir()
    with pytest.raises(ValueError):
        n.plan(ander, OPDRACHT + ["--hervat", str(uit / "checkpoint_3.ckpt")], 20, "echt")
    assert not (ander / "nacht.json").exists()


def test_r9_nacht_plist_launchd_agent_dagelijks_22_uur_met_draai(tmp_path):  # P0, CAP-18
    n = mod("nacht")
    tekst = n.plist("/usr/bin/python3", "/pad/nacht.py", str(tmp_path))
    pl = plistlib.loads(tekst if isinstance(tekst, bytes) else tekst.encode())
    assert pl["Label"] == "com.xxtract.proef-nachttraining"
    assert pl["ProgramArguments"] == ["/usr/bin/python3", "/pad/nacht.py", "draai", "--uit", str(tmp_path)]
    assert pl["StartCalendarInterval"] == {"Hour": 22, "Minute": 0}
    assert pl["StandardOutPath"].startswith(str(tmp_path)) and pl["StandardErrorPath"].startswith(str(tmp_path))


def test_r9_nacht_draai_klaar_start_niets(tmp_path):  # P0, CAP-18
    uit = gepland(tmp_path)
    schrijf(uit / "train-resultaat.json", {"checkpoint": "x"})
    w = Nacht(uit, dt(2, 22))
    assert draai(w) == "klaar" and w.aanroepen == []


def test_r9_nacht_draai_buiten_het_venster_start_niets(tmp_path):  # P0, CAP-18
    w = Nacht(gepland(tmp_path), dt(3, 12))
    assert draai(w) == "buiten_venster" and w.aanroepen == []


def test_r9_nacht_draai_bezet_bij_een_slot_met_levend_pid_maar_niet_bij_een_dood_pid(tmp_path):  # P0, CAP-18
    uit = gepland(tmp_path)
    (uit / "nacht.slot").write_text(f"{os.getpid()}\n")
    w = Nacht(uit, dt(2, 22))
    assert draai(w) == "bezet" and w.aanroepen == []
    dood = subprocess.Popen(["true"])
    dood.wait()
    (uit / "nacht.slot").write_text(f"{dood.pid}\n")
    w = Nacht(uit, dt(2, 22), [(dt(2, 23), "einde", 0)])
    assert draai(w) == "afgerond" and len(w.training()) == 1


def test_r9_nacht_draai_zonder_checkpoint_vanaf_het_begin_onder_caffeinate_en_afgerond(tmp_path):  # P0, CAP-18
    uit = gepland(tmp_path)
    w = Nacht(uit, dt(2, 22), [(dt(2, 23), "ckpt", 0), (dt(2, 23, 30), "einde", 0)])
    assert draai(w) == "afgerond"
    assert w.training() == [OPDRACHT]  # geen hervatpunt: geen --hervat
    assert w.cafe() == [["caffeinate", "-i", "-w", str(Proces.pid)]]
    assert w.term is None and w.kill is None
    assert mod("nacht").status(uit, dt(3, 8))["uitkomst"] == "afgerond"
    w2 = Nacht(uit, dt(3, 22))
    assert draai(w2) == "klaar" and w2.aanroepen == []  # het slot is vrijgegeven: klaar, niet bezet


def test_r9_nacht_draai_fout_bij_een_andere_afloop(tmp_path):  # P0, CAP-18
    w = Nacht(gepland(tmp_path), dt(2, 22), [(dt(2, 22, 30), "einde", 1)])
    assert draai(w) == "fout"


def test_r9_nacht_draai_stuurt_sigterm_om_0730_en_pauzeert(tmp_path):  # P0, CAP-18
    uit = gepland(tmp_path)
    w = Nacht(uit, dt(2, 22), uurlijks(dt(2, 22), 9))
    assert draai(w) == "gepauzeerd"
    assert dt(3, 7, 30) <= w.term <= dt(3, 7, 31) and w.kill is None


def test_r9_nacht_draai_sigkill_na_300_s_als_het_proces_blijft_lopen(tmp_path):  # P0, CAP-18
    w = Nacht(gepland(tmp_path), dt(2, 22), uurlijks(dt(2, 22), 9), stopt_op_term=False)
    draai(w)
    assert dt(3, 7, 30) <= w.term <= dt(3, 7, 31)
    assert w.term + timedelta(seconds=300) <= w.kill <= w.term + timedelta(seconds=360)


def test_r9_nacht_na_een_nacht_opgeruimd_en_status_met_verwacht_klaar(tmp_path):  # P0, CAP-18
    n = mod("nacht")
    uit = gepland(tmp_path, epochs=12)
    w = Nacht(uit, dt(2, 22), uurlijks(dt(2, 22), 9))  # epoch 0–8, om 23:00 t/m 07:00
    assert draai(w) == "gepauzeerd"
    assert sorted(p.name for p in uit.glob("checkpoint_*.ckpt")) == ["checkpoint_7.ckpt", "checkpoint_8.ckpt"]
    assert (uit / "checkpoint_best_total.pth").exists()
    s = n.status(uit, dt(3, 8))
    assert (s["fase"], s["epochs_totaal"], s["epochs_klaar"], s["uitkomst"]) == ("echt", 12, 9, "gepauzeerd")
    assert s["gem_epoch_s"] == pytest.approx(3600, abs=120)
    assert als_dt(s["eerste_start"]) == als_dt(s["laatste_start"]) == dt(2, 22)
    assert dt(3, 7, 30) <= als_dt(s["laatste_stop"]) <= dt(3, 7, 36)
    assert abs(als_dt(s["verwacht_klaar"]) - dt(4, 1)) <= timedelta(minutes=10)  # 3 epochs vanaf de volgende 22:00
    assert not s["stoppunt_1"]
    bewaard = json.loads((uit / "nacht-status.json").read_text())
    assert bewaard["epochs_klaar"] == 9 and bewaard["epochs_totaal"] == 12


def test_r9_nacht_status_zonder_meting_heeft_geen_verwachte_einddatum(tmp_path):  # P1, CAP-18
    s = mod("nacht").status(gepland(tmp_path), dt(2, 21))
    assert s["epochs_klaar"] == 0 and s["verwacht_klaar"] is None and s["epochs_totaal"] == 12


def test_r9_nacht_tweede_nacht_hervat_bij_het_nieuwste_checkpoint_en_rondt_af(tmp_path):  # P0, CAP-18
    n = mod("nacht")
    uit = gepland(tmp_path, epochs=12)
    assert draai(Nacht(uit, dt(2, 22), uurlijks(dt(2, 22), 9))) == "gepauzeerd"
    w = Nacht(uit, dt(3, 22), uurlijks(dt(3, 22), 3, eerste=9) + [(dt(4, 1, 5), "einde", 0)])
    assert draai(w) == "afgerond"
    assert w.training() == [OPDRACHT + ["--hervat", str(uit / "checkpoint_8.ckpt")]]
    s = n.status(uit, dt(4, 8))
    assert als_dt(s["eerste_start"]) == dt(2, 22) and als_dt(s["laatste_start"]) == dt(3, 22)
    assert s["uitkomst"] == "afgerond" and s["epochs_klaar"] == 12


def test_r9_nacht_tweede_nacht_met_onleesbaar_nieuwste_checkpoint_hervat_bij_het_vorige(tmp_path):  # P0, CAP-18
    uit = gepland(tmp_path, epochs=12)
    draai(Nacht(uit, dt(2, 22), uurlijks(dt(2, 22), 9)))
    ckpt(uit / "checkpoint_8.ckpt", leesbaar=False)
    w = Nacht(uit, dt(3, 22), [(dt(3, 23), "einde", 1)])
    draai(w)
    assert w.training() == [OPDRACHT + ["--hervat", str(uit / "checkpoint_7.ckpt")]]


def test_r9_nacht_stoppunt_1_na_een_volledig_venster_zonder_checkpoint_daarna_geen_start_tot_vrijgeven(tmp_path):  # P0
    n = mod("nacht")
    uit = gepland(tmp_path)
    assert draai(Nacht(uit, dt(2, 22))) in ("gepauzeerd", "stoppunt_1")  # liep tot 07:30 zonder één checkpoint
    assert n.status(uit, dt(3, 8))["stoppunt_1"]
    assert json.loads((uit / "nacht-status.json").read_text())["stoppunt_1"]
    w = Nacht(uit, dt(3, 22), [(dt(3, 23), "einde", 0)])
    assert draai(w) == "stoppunt_1" and w.aanroepen == []  # ook niet via launchd
    n.vrijgeven(uit)
    assert not n.status(uit, dt(3, 22))["stoppunt_1"]
    w = Nacht(uit, dt(3, 22), [(dt(3, 23), "einde", 0)])
    assert draai(w) == "afgerond" and len(w.training()) == 1


def test_r9_nacht_stoppunt_1_als_de_verwachte_einddatum_verder_dan_4_nachten_ligt(tmp_path):  # P0, CAP-18
    uit = gepland(tmp_path, epochs=100)  # 9 per nacht: 91 uur over, ±10 nachten
    draai(Nacht(uit, dt(2, 22), uurlijks(dt(2, 22), 9)))
    assert mod("nacht").status(uit, dt(3, 8))["stoppunt_1"]


def test_r9_nacht_stoppunt_1_bij_een_epoch_langer_dan_max_epoch_s(tmp_path, monkeypatch):  # P0, CAP-18
    n = mod("nacht")
    monkeypatch.setattr(n, "MAX_EPOCH_S", 1800)  # een epoch van een uur is dan te lang
    uit = gepland(tmp_path, epochs=12)
    draai(Nacht(uit, dt(2, 22), uurlijks(dt(2, 22), 9)))
    assert n.status(uit, dt(3, 8))["stoppunt_1"]


def test_r9_nacht_opdrachtregel_plan_status_vrijgeven(tmp_path, capsys):  # P1, CAP-18
    n = mod("nacht")
    uit, agent = tmp_path / "fase1", tmp_path / "agent.plist"
    uit.mkdir()
    argv = ["plan", "--uit", str(uit), "--epochs", "20", "--fase", "nagemaakt", "--plist", str(agent), "--", *OPDRACHT]
    assert code_van(lambda: n.main(argv)) in (0, None)
    plan = json.loads((uit / "nacht.json").read_text())
    assert (plan["opdracht"], plan["epochs"], plan["fase"]) == (OPDRACHT, 20, "nagemaakt")
    pl = plistlib.loads(agent.read_bytes())
    assert pl["Label"] == n.LABEL and pl["ProgramArguments"][-3:] == ["draai", "--uit", str(uit)]
    capsys.readouterr()
    assert code_van(lambda: n.main(["status", "--uit", str(uit)])) in (0, None)
    assert capsys.readouterr().out.strip() and (uit / "nacht-status.json").exists()
    assert code_van(lambda: n.main(["vrijgeven", "--uit", str(uit)])) in (0, None)
    ander = tmp_path / "fase2"
    ander.mkdir()
    met_hervat = ["plan", "--uit", str(ander), "--epochs", "20", "--fase", "echt", "--", *OPDRACHT, "--hervat", "x.ckpt"]
    assert code_van(lambda: n.main(met_hervat)) not in (0, None)
    assert not (ander / "nacht.json").exists()


# --- overige modules (CAP-4/5/7/8/12/17, CAP-9) -------------------------------------------------------------------------

def test_r9_echt_gelijkend_zonder_triman_en_kunststofcode_met_pefc_en_planetproof_groep():  # P1, CAP-5
    ec = mod("echt")
    assert not {TRI, SPI} & set(ec.GELIJKEND)
    assert {"PEFC", "PEFC_CERTIFIED", "RAINFOREST_ALLIANCE", "RAINFOREST_ALLIANCE_PEOPLE_NATURE", "FAIR_TRADE_MARK",
            "FAIRTRADE_COCOA", "CERTIFIED_B_CORPORATION"} <= set(ec.GELIJKEND)
    assert {"AGRICULTURE_BIOLOGIQUE", "BDIH_LOGO", "SEPARATE_COLLECTION", "RETURNABLE_CAN_NL", "VEGAN",
            "AQUACULTURE_STEWARDSHIP_COUNCIL"} <= set(ec.GELIJKEND)  # de bestaande gelijkende blijven
    enum = ec.SCHEMA_VOORLABELS["properties"]["vakjes"]["items"]["properties"]["code"]["enum"]
    assert enum == [*KLASSEN17, *ec.GELIJKEND, "ander"]
    assert FSC in ec.PROMPT and re.search(r"\bmix\b", ec.PROMPT, re.I) and re.search(r"recycled", ec.PROMPT, re.I)


REFS9 = [
    {"id": "r-mix", "code": FSC_MIX, "source": WIKI + "FSC-R-logobackground_green.png", "path": "wiki/fsc-mix.png"},
    {"id": "r-rec", "code": FSC_REC, "source": "gs1-packaging-label-guide", "path": "gs1/fsc-recycled.png"},
    {"id": "r-vv", "code": VV, "source": WIKI + "V-Label_Vegetarisch.png", "path": "wiki/v-label-vegetarisch.png"},
    {"id": "r-v", "code": V, "source": "gs1-packaging-label-guide", "path": "gs1/v-label-vegan.png"},
    {"id": "r-tri", "code": TRI, "source": "gs1-packaging-label-guide", "path": "gs1/triman.png"},
    {"id": "r-pp", "code": PP, "source": "gs1-packaging-label-guide", "path": "gs1/planetproof.png"},
    {"id": "r-pefc", "code": "PEFC", "source": "gs1-packaging-label-guide", "path": "gs1/pefc.png"},
]


def test_r9_logos_fsc_referentie_uit_een_variant_v_label_houdt_vegan_triman_en_kunststofcode_gelabeld(tmp_path,
                                                                                                    monkeypatch):  # P1
    gen = mod("generator")
    pm = logos_pm(tmp_path, monkeypatch, REFS9)
    spi = tmp_path / "publiek" / "harscode.png"
    spi.parent.mkdir()
    spi.write_bytes(png((48, 48), ruis=77))
    schrijf(pm / "logos" / "handmatig.json", [{"klasse": SPI, "pad": str(spi), "herkomst": WIKI + "Resin-identification-code.svg",
                                              "licentie": "publiek domein"}])
    bronnen, gelijkend, referenties, ontbreekt = gen._logos(pm)
    assert Path(referenties[FSC]["pad"]).name == "fsc-mix.png"  # geen eigen FSC-bestand: variant, http vóór GS1
    assert Path(referenties[V]["pad"]).name == "v-label-vegan.png"  # eigen code (GS1) gaat vóór de variant (http)
    assert Path(referenties[TRI]["pad"]).name == "triman.png" and Path(referenties[PP]["pad"]).name == "planetproof.png"
    assert Path(referenties[SPI]["pad"]) == spi
    klasse = {Path(b["pad"]).name: b["klasse"] for b in bronnen}
    assert (klasse["fsc-mix.png"], klasse["fsc-recycled.png"], klasse["triman.png"], klasse["harscode.png"]) == \
        (FSC, FSC, TRI, SPI)
    assert {Path(g["pad"]).name for g in gelijkend} == {"pefc.png"}  # Triman en kunststofcode zijn geen gelijkende meer
    assert ontbreekt == [k for k in KLASSEN17 if k not in referenties]


def test_r9_logos_eigen_fsc_bestand_gaat_voor_een_variant(tmp_path, monkeypatch):  # P1, CAP-4
    refs = [REFS9[0], {"id": "r-fsc", "code": FSC, "source": "gs1-packaging-label-guide", "path": "gs1/fsc.png"}]
    _, _, referenties, _ = mod("generator")._logos(logos_pm(tmp_path, monkeypatch, refs))
    assert Path(referenties[FSC]["pad"]).name == "fsc.png"


def test_r9_beoordelaar_vraag_fsc_varianten_en_kunststofcode_zonder_cijfer():  # P2, CAP-8
    b = mod("beoordelaar")
    f, s, gewoon = b.vraag_voor(FSC), b.vraag_voor(SPI), b.vraag_voor(GD)
    assert re.search(r"\bmix\b", f, re.I) and re.search(r"recycled", f, re.I) and "100%" in f and f != gewoon
    assert re.search(r"\b(number|digit)", s, re.I) and s != gewoon


def test_r9_herken_certificaatnummer_fsc():  # P2, CAP-7 (trainingsset §8)
    hk = mod("herken")
    p = hk.CERTIFICAAT[FSC]
    assert p.pattern == r"FSC[®\s]*[-–]?\s*C\s?\d{6}"
    for tekst in ("FSC® C012345", "FSC-C123456", "FSC C 654321", "www.fsc.org FSC®C109876"):
        assert p.search(tekst), tekst
    for tekst in ("FSC C12345", "FSC Mix papier"):
        assert not p.search(tekst), tekst
    assert hk.certificaten("Verpakking FSC® C012345") == {FSC}


def test_r9_off_zoek_vier_klassen_exact():  # P1, CAP-17 (trainingsset §11)
    z = {k: tuple(tuple(p) for p in v) for k, v in mod("off").ZOEK.items()}
    assert z[FSC] == (("label", "en:fsc-mix"), ("label", "en:fsc"))
    assert z[TRI] == (("label", "fr:triman"),)
    assert z[SPI] == tuple(("packaging", w) for w in SPI_WAARDEN)
    assert z[PP] == (("label", "en:planet-proof"),)
    assert RC not in z and not {FSC_MIX, FSC_REC, FSC_100} & set(z)


def test_r9_k4aa_per_klasse_telt_referenties_voor_alle_17_varianten_naar_hun_klasse():  # P1, CAP-12
    pk = mod("k4aa_lokaal").per_klasse([GD, GD, FSC_MIX, FSC_100, VV, V, "VEGAN", NSA, TRI])
    assert set(pk) == set(KLASSEN17)
    assert (pk[GD], pk[FSC], pk[V], pk[NSA], pk[TRI], pk[SPI], pk[PP]) == (2, 2, 2, 1, 1, 0, 0)


def bevestigd_wereld():
    u, meld = {}, {}
    for i in range(20):
        u[f"m{i:02d}"] = et9(aanwezig={GD, FSC}, nutriscore=["A"], bevestigde_codes=sorted(LOS12))
        u[f"z{i:02d}"] = et9(nutriscore=[], bevestigde_codes=sorted(LOS12))
        meld[f"m{i:02d}"], meld[f"z{i:02d}"] = [GD, FSC, NSA], []
    return u, meld


def test_r9_tel_met_referenties_geeft_nvt_bij_een_keurmerk_zonder_referenties():  # P1, CAP-9/CAP-12
    tp = mod("tel_proef")
    u, meld = bevestigd_wereld()
    referenties = {**dict.fromkeys(KLASSEN17, 0), GD: 3, NSA: 1, V: 2}
    r = tp.tel(u, meld, referenties=referenties)
    nvt = "n.v.t. (geen referenties)"
    assert r[FSC]["besluit"] == nvt and r[TRI]["besluit"] == nvt  # ook bij te weinig voorbeelden gaat n.v.t. voor
    assert r[GD]["besluit"] != nvt and r[V]["besluit"] != nvt
    assert r["NUTRISCORE"]["besluit"] != nvt  # groep = som van de letters (1)
    assert r[NSA]["besluit"] != nvt and r[NSB]["besluit"] == nvt  # een letter = zijn klasse
    zonder = tp.tel(u, meld)
    assert not any(isinstance(v, dict) and v.get("besluit") == nvt for v in zonder.values())
    alleen_ns = tp.tel(u, meld, referenties=dict.fromkeys(KLASSEN17, 0))
    assert alleen_ns["NUTRISCORE"]["besluit"] == nvt


# --- DRAAIPLAN.md (CAP-10) -------------------------------------------------------------------------------------------------

def test_r9_draaiplan_nachttraining_voorinvulling_r9_scheiding_met_reden_en_wisselplan():  # P2, CAP-10
    tekst = (HIER / "DRAAIPLAN.md").read_text(encoding="utf-8")
    for nodig in ("nacht.py plan", "nacht.py draai", "nacht.py status", "launchctl", "toets.py voorinvulling-r9",
                  "scheiding.py kies --proef-map $PM --reden"):
        assert nodig in tekst, nodig
    assert "pmset" in tekst or "slaapstand" in tekst
    wissel = [b for b in re.split(r"\n\s*\n", tekst) if re.search(r"wisselplan", b, re.I)]
    assert wissel and any("items-r9.json" in b and "uitslag.json" in b for b in wissel)
    stoppunt = [r for r in tekst.splitlines() if r.strip().startswith("Stoppunt:") and re.search(r"\b1\b", r)]
    assert stoppunt and not any(re.search(r"\b8 uur\b", r) for r in stoppunt)
