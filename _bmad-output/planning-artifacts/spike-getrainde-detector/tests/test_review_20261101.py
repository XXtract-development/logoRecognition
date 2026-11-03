"""Tests bij de reviewbevindingen van 01-11-2026 (bmad-build step-04): één test per reparatie en de genoemde
verificatiegaten. Elke test faalt als de reparatie wordt teruggedraaid. Verzonnen GLN's, GTIN's en beelden; geen netwerk
(de aanbieder, ssh en rsync worden nagebootst)."""
import hashlib
import http.client
import importlib
import io
import json
import subprocess
import threading
import urllib.error
import urllib.request
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image, ImageDraw

from conftest import laad_klaar

K7 = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING",
      "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO")
GD, EU, WM = "GREEN_DOT", "EU_ORGANIC_FARMING", "WEIDEMELK"
NSA, NSB, NSC = "NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C"
TRAIN_GLN, TOETS_GLN = "1000000000001", "1000000000002"
V_LABEL = "EUROPEAN_V_LABEL_VEGAN"  # ronde 5: 8e losse keuze van een bevestigd etiket
NIEUW_R9 = ("FOREST_STEWARDSHIP_COUNCIL_LABEL", "TRIMAN", "SOCIETY_PLASTICS_INDUSTRY", "ON_THE_WAY_TO_PLANETPROOF")  # ronde 9


def mod(naam):
    return importlib.import_module(naam)


def png(maat=(32, 32), kleur=(200, 200, 200), ruis=None):
    im = Image.new("RGB", maat, kleur)
    if ruis is not None:
        im = Image.fromarray(np.random.default_rng(ruis).integers(0, 255, (maat[1], maat[0], 3), dtype=np.uint8))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def et(aanwezig=(), nutriscore=(), status="bevestigd"):
    return {"status": status, "keurmerken": {c: "aanwezig" if c in aanwezig else "afwezig" for c in K7 + (V_LABEL,) + NIEUW_R9},
            "nutriscore": list(nutriscore), "veranderd": [], "opmerking": "", "tijd": "2026-11-01T10:00:00+01:00"}


def schrijf(pad, data):
    pad.parent.mkdir(parents=True, exist_ok=True)
    pad.write_text(json.dumps(data))
    return pad


def run_bestand(pad, etiketten, status="voltooid", **extra):
    return schrijf(pad, {"status": status, "etiketten": {d: sorted(v) if isinstance(v, set) else v for d, v in etiketten.items()},
                         **extra})


# --- invulserver: tussenstand houdt de status, alleen de eigen pagina ---------------------------------------------

DOCS = [f"1000000000001-{20000000000000 + i}-528" for i in range(3)]


@pytest.fixture
def server(tmp_path):
    srv_mod = mod("invul.server")
    schrijf(tmp_path / "items.json", [{"id": d, "beeld": "x.png", "hint": [], "voorinvulling": {}} for d in DOCS])
    srv = srv_mod.maak_server(tmp_path, 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield SimpleNamespace(poort=srv.server_address[1], bestand=tmp_path / "uitslag.json")
    srv.shutdown()
    srv.server_close()


def aanvraag(poort, pad="/opslaan", body=None, **headers):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{poort}{pad}", data=data, method="POST" if data else "GET",
                                 headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def test_server_tussenstand_houdt_bevestigd_en_weigert_onvolledig(server):
    w = et(aanwezig={GD}, nutriscore=["B"])
    assert aanvraag(server.poort, body={"id": DOCS[0], "waarde": w}) == 200
    tussen = {"keurmerken": {**w["keurmerken"], EU: "onzeker"}, "nutriscore": ["B"]}
    assert aanvraag(server.poort, body={"id": DOCS[0], "waarde": tussen}) == 200
    r = json.loads(server.bestand.read_text())[DOCS[0]]
    assert r["status"] == "bevestigd" and r["keurmerken"][EU] == "onzeker"
    voor = server.bestand.read_bytes()
    assert aanvraag(server.poort, body={"id": DOCS[0], "waarde": {"keurmerken": {GD: "aanwezig"}}}) == 400
    assert server.bestand.read_bytes() == voor


def test_server_weigert_vreemde_host_en_vreemde_origin(server):
    w = {"id": DOCS[1], "waarde": et()}
    assert aanvraag(server.poort, body=w, Origin="http://kwaadaardig.example") == 403
    assert aanvraag(server.poort, body=w, Host=f"kwaadaardig.example:{server.poort}") == 403
    assert aanvraag(server.poort, pad="/stand", Host=f"rebind.example:{server.poort}") == 403
    assert not server.bestand.exists()
    assert aanvraag(server.poort, body=w, Origin=f"http://127.0.0.1:{server.poort}") == 200
    assert aanvraag(server.poort, pad="/stand", Host=f"localhost:{server.poort}") == 200


# --- invulpagina in de browser: opslagen één voor één, `b` alleen met alle keuzes -------------------------------

E1, E2 = "9990000000017-09990000000011-528", "9990000000017-09990000000028-528"


@pytest.fixture
def pagina(tmp_path):
    playwright = pytest.importorskip("playwright.sync_api")
    (tmp_path / "beelden").mkdir()
    Image.new("RGB", (40, 30), "white").save(tmp_path / "beelden/0.png")
    volledig = {"keurmerken": {c: c == GD for c in K7 + (V_LABEL,) + NIEUW_R9}, "nutriscore": [], "hinttegels": {},
                "gelijkend": []}  # ronde 9: ook de vier nieuwe voorgevuld
    zonder_wm = {**volledig, "keurmerken": {c: v for c, v in volledig["keurmerken"].items() if c != WM}}  # WM niet beoordeeld
    schrijf(tmp_path / "items.json", [{"id": E1, "beeld": "beelden/0.png", "hint": [], "voorinvulling": zonder_wm},
                                      {"id": E2, "beeld": "beelden/0.png", "hint": [], "voorinvulling": volledig}])
    srv = mod("invul.server").maak_server(tmp_path, 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with playwright.sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_default_timeout(5_000)
        posts = []
        page.on("request", lambda r: posts.append(r) if r.method == "POST" else None)
        laad_klaar(page, f"http://127.0.0.1:{srv.server_address[1]}/")
        yield SimpleNamespace(page=page, posts=posts, map=tmp_path)
        browser.close()
    srv.shutdown()
    srv.server_close()


@pytest.mark.browser
def test_pagina_b_zonder_alle_keuzes_slaat_niets_op_en_blijft_staan(pagina):
    page = pagina.page
    page.keyboard.press("b")
    assert "Kies eerst" in page.locator("#melding").text_content()
    assert page.get_by_test_id("etiket-id").text_content() == E1
    page.locator("#opslaan").click()
    assert pagina.posts == [] and not (pagina.map / "uitslag.json").exists()
    with page.expect_response(lambda r: r.url.endswith("/opslaan")):
        page.get_by_test_id(f"keuze-{WM}").locator('input[value="afwezig"]').check()  # tussenstand mag wel
    with page.expect_response(lambda r: r.url.endswith("/opslaan")) as antwoord:
        page.locator("body").press("b")
    assert antwoord.value.request.post_data_json["waarde"]["status"] == "bevestigd"
    assert page.get_by_test_id("etiket-id").text_content() == E2


@pytest.mark.browser
def test_pagina_bevestigen_wacht_op_een_lopende_tussenstand(pagina):
    page, gehouden = pagina.page, []
    page.route("**/opslaan", lambda route: route.continue_() if gehouden else gehouden.append(route))  # alleen de eerste vast
    with page.expect_request(lambda r: r.url.endswith("/opslaan")):
        page.get_by_test_id(f"keuze-{WM}").locator('input[value="afwezig"]').check()
    page.locator("#opslaan").click()
    page.wait_for_timeout(500)  # bewijs van afwezigheid: de bevestiging mag niet naast de tussenstand vertrekken
    assert len(pagina.posts) == 1 and "status" not in pagina.posts[0].post_data_json["waarde"]
    with page.expect_response(lambda r: r.url.endswith("/opslaan") and "status" in r.request.post_data_json["waarde"]) as tweede:
        gehouden[0].continue_()
    assert tweede.value.request.post_data_json["waarde"]["status"] == "bevestigd" and len(pagina.posts) == 2
    assert json.loads((pagina.map / "uitslag.json").read_text())[E1]["status"] == "bevestigd"


# --- uitgavenbewaking: grootboek per post, modellen zonder tarief ---------------------------------------------------

def test_bewaker_grootboek_telt_over_herstarts(tmp_path):
    ko = mod("kosten")
    boek = tmp_path / "uitgaven.json"
    b1 = ko.Bewaker("voorinvulling toets", 1.0, grootboek=boek)
    b1.boek(0.5)
    b2 = ko.Bewaker("voorinvulling toets", 1.0, grootboek=boek)
    assert b2.uitgegeven == pytest.approx(0.5) and ko.Bewaker("beoordelaar", 1.0, grootboek=boek).uitgegeven == 0
    with pytest.raises(ko.BudgetOverschreden):
        b2.controleer_start(1.01)  # 0,5 + 1,01 > 1,5
    b2.controleer_start(1.0)
    assert not b2.mag(1.01)


def test_client_weigert_model_zonder_tarief():
    orq = mod("openrouter")
    with pytest.raises(ValueError):
        orq.Client("onbekend/model-x", "beoordelaar", sleutel="NEP", transport=lambda *a: (200, {}))


def test_client_onvolledig_antwoord_wordt_opnieuw_geprobeerd():
    orq, pogingen, slaap = mod("openrouter"), [], []
    schema = {"type": "object", "properties": {"zichtbaar": {"type": "boolean"}}, "required": ["zichtbaar"]}

    def transport(url, body, headers, timeout):
        pogingen.append(1)
        if len(pogingen) == 2:  # de eerste is de zdr-proef
            raise http.client.IncompleteRead(b"")
        return 200, {"choices": [{"finish_reason": "stop", "message": {"content": '{"zichtbaar": true}'}}], "usage": {"cost": 0.001}}

    c = orq.Client("google/gemini-3.8-flash", "beoordelaar", sleutel="NEP", transport=transport, slaap=slaap.append)
    c.zdr_proef(png())
    assert c.vraag("x", [png()], schema)[0] == {"zichtbaar": True}
    assert slaap == [2]


# --- antwoorden in een andere vorm zijn een fout, nooit een stille uitkomst ------------------------------------------

class NepClient:
    def __init__(self, *antwoorden, model="anthropic/claude-sonnet-5.5", fout=None):
        self.antwoorden, self.model, self.fout, self.calls = list(antwoorden), model, fout, []

    def zdr_proef(self, beeld):
        return {"model": self.model, "tijd": "t", "ok": True}

    def vraag(self, tekst, beelden, schema, verwacht=0.0):
        self.calls.append(beelden)
        if self.fout:
            raise self.fout
        a = self.antwoorden.pop(0) if len(self.antwoorden) > 1 else self.antwoorden[0]
        return a, 0.01


def test_antwoord_met_verkeerde_typen_is_antwoord_ongeldig():
    orq = mod("openrouter")
    uit = mod("toets").voorinvulling(NepClient({"keurmerken": [1, 2], "nutriscore": [], "gelijkend": []}), png(), [png()])
    assert uit["fout"] == "antwoord_ongeldig" and uit["keurmerken"] == {}
    with pytest.raises(orq.EtiketFout):
        mod("echt").voorlabels(NepClient({"vakjes": ["kapot"]}, model="google/gemini-3.8-flash"), png((40, 30)), [])
    with pytest.raises(orq.EtiketFout):
        mod("beoordelaar").beoordeel(NepClient({"oordeel": ["ja"]}), png(), png(), GD)


# --- voorinvulling: hoogstens 16 tegels per aanroep, samengevoegd ------------------------------------------------

def test_voorinvulling_verdeelt_tegels_over_aanroepen_met_juiste_index():
    a1 = {"keurmerken": [{"code": GD, "aanwezig": False, "tegels": []}], "nutriscore": ["B"], "gelijkend": []}
    a2 = {"keurmerken": [{"code": GD, "aanwezig": True, "tegels": [1]}], "nutriscore": [], "gelijkend": ["TRIMAN"]}
    client, heel, tegels = NepClient(a1, a2), png(kleur=(1, 1, 1)), [png(kleur=(i, 0, 0)) for i in range(20)]
    uit = mod("toets").voorinvulling(client, heel, tegels)
    assert [len(c) for c in client.calls] == [17, 5] and all(c[0] == heel for c in client.calls)
    assert client.calls[1][1:] == tegels[16:]
    assert uit["keurmerken"] == {GD: True} and uit["hinttegels"] == {GD: [17]}
    assert uit["nutriscore"] == ["B"] and uit["gelijkend"] == ["TRIMAN"] and uit["kosten"] == pytest.approx(0.02)


def toets_pm(tmp_path, n=6):
    pm, mf = tmp_path / "pm", tmp_path / "pm" / "toets" / "gecombineerd"
    mf.mkdir(parents=True)
    manifest = {}
    for i in range(n):
        d = f"{TOETS_GLN}-{30000000000000 + i}-528"
        (mf / f"{d}.png").write_bytes(png((64, 64), ruis=i))
        manifest[d] = {"sha256": f"sha{i}"}
    schrijf(mf / "manifest.json", manifest)
    (pm / "logo.png").write_bytes(png())
    return pm, mf, sorted(manifest)


def test_voorinvulling_stopt_na_5_weigeringen_en_herprobeert_fouten(tmp_path, monkeypatch):
    orq, ts = mod("openrouter"), mod("toets")
    pm, mf, docs = toets_pm(tmp_path)
    argv = ["voorinvulling", "--proef-map", str(pm), "--manifest", str(mf / "manifest.json"), "--zdr-logo", str(pm / "logo.png"), "--model", "anthropic/claude-sonnet-5.5"]
    weiger = NepClient(fout=orq.EtiketFout("geweigerd"))
    monkeypatch.setattr(orq, "Client", lambda *a, **k: weiger)
    with pytest.raises(SystemExit):
        ts.main(argv)
    vi = json.loads((pm / "toets" / "voorinvulling.json").read_text())
    assert len(vi) == 5 and all(v["fout"] == "geweigerd" for v in vi.values())
    goed = NepClient({"keurmerken": [{"code": GD, "aanwezig": True, "tegels": [0]}], "nutriscore": [], "gelijkend": []})
    monkeypatch.setattr(orq, "Client", lambda *a, **k: goed)
    assert ts.main(argv) == 0
    vi = json.loads((pm / "toets" / "voorinvulling.json").read_text())
    assert len(goed.calls) == 6 and all("fout" not in v for v in vi.values())
    items = json.loads((pm / "toets" / "items.json").read_text())
    # niet-beoordeelde codes blijven zonder voorinvulling, ook het V-label: deze voorinvulling is van ronde 5 en vroeg het
    # zelf (alleen oudere krijgen het uit `gelijkend`, toetsset §5; review 02-11)
    assert items[0]["voorinvulling"]["keurmerken"] == {GD: True}


def test_ontdubbel_voegt_aanvulling_samen_met_bestaande_toetsdocs(tmp_path):
    ts = mod("toets")
    pm, mf, docs = toets_pm(tmp_path, n=3)
    manifest = json.loads((mf / "manifest.json").read_text())
    manifest[docs[2]]["sha256"] = manifest[docs[0]]["sha256"]  # docs[2] is hetzelfde beeld als docs[0]
    schrijf(mf / "manifest.json", manifest)
    schrijf(pm / "toets" / "toets-docs.json", [docs[0]])
    aanv = schrijf(pm / "toets" / "kandidaten-aanvulling.json", [{"gtin": d.split("-")[1]} for d in docs[1:]])
    assert ts.main(["ontdubbel", "--proef-map", str(pm), "--manifest", str(mf / "manifest.json"), "--kandidaten", str(aanv)]) == 0
    assert json.loads((pm / "toets" / "toets-docs.json").read_text()) == [docs[0], docs[1]]


def test_alleen_zonder_bestaand_weigert(tmp_path):
    with pytest.raises(SystemExit) as e:
        mod("toets").main(["kandidaten", "--proef-map", str(tmp_path), "--alleen", GD])
    assert e.value.code == 2 and not (tmp_path / "toets").exists()


# --- echte trainingsvoorbeelden ------------------------------------------------------------------------------------

def vak(code, box, onzeker=False):
    return {"code": code, "box": box, "onzeker": onzeker}


def test_schoon_weigert_kapotte_vakjes_en_voegt_dubbele_samen():
    ec = mod("echt")
    uit = ec.schoon([vak(GD, (10, 10, 12, 30)), vak(GD, (60, 60, 50, 80)), vak(GD, (100, 100, 150, 150)),
                     vak(GD, (101, 101, 151, 151)), vak(GD, (102, 102, 150, 150), onzeker=True)])
    assert sorted((v["box"], v["onzeker"]) for v in uit) == [((100, 100, 150, 150), False), ((102, 102, 150, 150), True)]


def test_voorlabels_maat_schaalt_beeld_0_en_dubbel_vakje_telt_een_keer():
    ec = mod("echt")
    heel, tegel = png((400, 300)), (png((200, 150)), (0, 0, 200, 150))
    antwoord = {"vakjes": [{"beeld": 0, "code": GD, "box": [10, 10, 50, 50], "onzeker": False},
                           {"beeld": 1, "code": GD, "box": [20, 20, 100, 100], "onzeker": False}]}  # tegel op ware maat
    uit = ec.voorlabels(NepClient(antwoord, model="google/gemini-3.8-flash"), heel, [tegel], maat=(800, 600))
    assert [(v["code"], tuple(v["box"])) for v in uit] == [(GD, (20, 20, 100, 100))]


def test_naar_tegels_rand_70_procent_afgesneden_label_40_procent_tegel_valt_af():
    ec = mod("echt")
    a = {"doc_id": "a", "gln": TRAIN_GLN, "beeld": SimpleNamespace(size=(512, 256)), "vakjes": [vak(GD, (228, 100, 268, 140))]}
    b = {"doc_id": "b", "gln": TRAIN_GLN, "beeld": SimpleNamespace(size=(512, 256)), "vakjes": [vak(GD, (240, 100, 280, 140))]}
    uit = ec.naar_tegels([a, b], {TRAIN_GLN}, tegel=256, overlap=64)  # tegels x 0, 192, 256
    per = {(t["doc_id"], t["tegel"][0]): t["vakjes"] for t in uit}
    assert [tuple(v["box"]) for v in per[("a", 0)]] == [(228, 100, 256, 140)]  # 28/40 = 70% zichtbaar
    assert ("a", 256) not in per  # 12/40 = 30%
    assert ("b", 256) in per and ("b", 0) not in per  # tegel 256: 24/40 = 60%; tegel 0: 16/40 = 40% valt af


def test_valsplit_slaat_te_groot_cluster_over_en_meldt_het():
    ec = mod("echt")
    h = int(hashlib.sha256(b"keten").hexdigest()[:16], 16)
    et_ = [{"doc_id": f"k{i}", "codes": {WM}, "dhash": h ^ ((1 << (6 * i)) - 1)} for i in range(6)]  # keten van 6
    et_ += [{"doc_id": f"s{i}", "codes": {GD}, "dhash": int(hashlib.sha256(f"s{i}".encode()).hexdigest()[:16], 16)} for i in range(10)]
    gemeld = []
    train, valid = ec.valsplit(et_, overgeslagen=gemeld)
    assert {f"k{i}" for i in range(6)} <= train
    assert {"klasse": WM, "docs": [f"k{i}" for i in range(6)]} in gemeld


def echt_pm(tmp_path, n=10):
    pm = tmp_path / "pm"
    schrijf(pm / "scheiding.json", {"trainingsleveranciers": [TRAIN_GLN]})
    lijst, vl = [], {}
    for i in range(n):
        d = f"{TRAIN_GLN}-{10000000000000 + i}-528"
        pad = tmp_path / "et" / f"{d}.png"
        pad.parent.mkdir(exist_ok=True)
        pad.write_bytes(png((300, 300), ruis=100 + i))
        lijst.append({"doc_id": d, "gln": TRAIN_GLN, "pad": str(pad)})
        vl[d] = {"vakjes": [vak(GD, [10, 10, 60, 60])]}
    return pm, schrijf(tmp_path / "lijst.json", lijst), schrijf(tmp_path / "voorlabels.json", vl), lijst


def test_dataset_achtergronden_alleen_train_en_testmap_is_kopie_van_valid(tmp_path):
    ec = mod("echt")
    pm, lijst, vl, _ = echt_pm(tmp_path)
    uit = tmp_path / "pm" / "train" / "echt"
    assert ec.main(["dataset", "--lijst", str(lijst), "--voorlabels", str(vl), "--proef-map", str(pm), "--uit", str(uit)]) == 0
    valid = set(json.loads((uit / "validatie-waarheid.json").read_text()))
    achter = {Path(a["pad"]).stem for a in json.loads((uit / "achtergronden.json").read_text())}
    assert valid and achter and not achter & valid
    assert (uit / "test" / "_annotations.coco.json").read_text() == (uit / "valid" / "_annotations.coco.json").read_text()


def test_dataset_meng_met_andere_categorieen_weigert(tmp_path):
    ec = mod("echt")
    pm, lijst, vl, _ = echt_pm(tmp_path)
    meng = schrijf(tmp_path / "meng" / "_annotations.coco.json", {"images": [], "annotations": [],
                                                                   "categories": [{"id": 1, "name": GD, "supercategory": "keurmerk"}]})
    with pytest.raises(SystemExit):
        ec.main(["dataset", "--lijst", str(lijst), "--voorlabels", str(vl), "--proef-map", str(pm),
                 "--uit", str(tmp_path / "pm" / "train" / "echt"), "--meng", str(meng.parent)])


def test_validatie_onzekere_code_is_onzeker_niet_afwezig(tmp_path):
    ec = mod("echt")
    assert ec._waarheid([vak(GD, (10, 10, 60, 60)), vak(WM, (100, 100, 150, 150), onzeker=True)], 300, 300) == ({GD}, {WM})
    w = schrijf(tmp_path / "w.json", {"d1": {"aanwezig": [GD], "onzeker": [WM, NSA]}})
    ec.main(["validatie-uitslag", "--waarheid", str(w), "--uit", str(tmp_path / "u.json")])
    r = json.loads((tmp_path / "u.json").read_text())["d1"]
    assert (r["keurmerken"][GD], r["keurmerken"][WM], r["keurmerken"][EU], r["nutriscore"]) == ("aanwezig", "onzeker", "afwezig", "onleesbaar")


def test_voorlabels_herstart_probeert_alleen_mislukte_opnieuw(tmp_path, monkeypatch):
    orq, ec = mod("openrouter"), mod("echt")
    pm, lijst, _, items = echt_pm(tmp_path, n=2)
    uit = schrijf(tmp_path / "vl.json", {items[0]["doc_id"]: {"fout": "aanbieder"}, items[1]["doc_id"]: {"vakjes": []}})
    (tmp_path / "logo.png").write_bytes(png())
    client = NepClient({"vakjes": []}, model="google/gemini-3.8-flash")
    monkeypatch.setattr(orq, "Client", lambda *a, **k: client)
    ec.main(["voorlabels", "--lijst", str(lijst), "--proef-map", str(pm), "--uit", str(uit), "--zdr-logo", str(tmp_path / "logo.png")])
    assert len(client.calls) == 1 and json.loads(uit.read_text())[items[0]["doc_id"]] == {"vakjes": []}


def test_klassenlijst_staat_op_een_plek():
    klassen = mod("train").KLASSEN
    assert mod("echt").KLASSEN is klassen and mod("generator").KLASSEN is klassen and mod("herken").KLASSEN is klassen
    assert mod("k4aa_lokaal").ACHT == set(klassen)


# --- generator ---------------------------------------------------------------------------------------------------

def logo(maat=64):
    im = Image.new("RGBA", (maat, maat), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse((2, 2, maat - 3, maat - 3), fill=(0, 110, 40, 255))
    return im


def test_generator_60_procent_regel_en_achtergrond_als_pad(tmp_path):
    gen = mod("generator")
    (tmp_path / "ag.png").write_bytes(png((512, 512)))
    kw = dict(logos={GD: [{"beeld": logo(), "gtin": None}]}, gelijkend=[], trainings_gtins={"10000000000017"},
              n_tegels=40, seed=7, tegel=256)
    m = gen.genereer([{"pad": str(tmp_path / "ag.png"), "gtin": "10000000000017"}], uit=tmp_path / "a", **kw)
    rand = 0
    for b in m["beelden"]:
        for o in b["objecten"]:
            x, y, w, h = o["bbox"]
            assert w * h >= 0.6 * o["volledig"][0] * o["volledig"][1]
            rand += x == 0 or y == 0 or x + w == 256 or y + h == 256
    assert rand > 0  # er zijn afgesneden logo's aan de rand, dus de regel is echt getoetst
    with Image.open(tmp_path / "ag.png") as im:
        m2 = gen.genereer([{"beeld": im.convert("RGB"), "gtin": "10000000000017"}], uit=tmp_path / "b", **kw)
    assert (tmp_path / "a/train/_annotations.coco.json").read_text() == (tmp_path / "b/train/_annotations.coco.json").read_text()
    assert [b["sha256"] for b in m["beelden"]] == [b["sha256"] for b in m2["beelden"]]


# --- training ----------------------------------------------------------------------------------------------------

def test_op_schaal_verkleint_beelden_en_vakjes(tmp_path):
    tr = mod("train")
    for split in ("train", "valid", "test"):
        d = tmp_path / "ds" / split
        d.mkdir(parents=True)
        Image.new("RGB", (1024, 1024), "white").save(d / "t.jpg")
        schrijf(d / "_annotations.coco.json", {"images": [{"id": 0, "file_name": "t.jpg", "width": 1024, "height": 1024}],
                                               "annotations": [{"id": 0, "image_id": 0, "category_id": 1, "bbox": [256, 512, 128, 64],
                                                                "area": 8192, "iscrowd": 0}], "categories": []})
    tr._op_schaal(tmp_path / "ds", tmp_path / "klein", 544)
    coco = json.loads((tmp_path / "klein/train/_annotations.coco.json").read_text())
    f = 544 / 1024
    assert (coco["images"][0]["width"], coco["images"][0]["height"]) == (544, 544)
    assert Image.open(tmp_path / "klein/train/t.jpg").size == (544, 544)
    assert coco["annotations"][0]["bbox"] == pytest.approx([256 * f, 512 * f, 128 * f, 64 * f])
    assert coco["annotations"][0]["area"] == pytest.approx(128 * f * 64 * f)


def test_gewichtsherkomst_fase_2_neemt_fase_1_over(tmp_path):
    tr = mod("train")
    (tmp_path / "f1").mkdir()
    (tmp_path / "f1" / "ckpt.pth").write_bytes(b"gewichten")
    cfg = tr.config("echt", "N", tmp_path / "ds", tmp_path / "f2", epochs=1, seed=1, start=tmp_path / "f1" / "ckpt.pth")
    with pytest.raises(FileNotFoundError):
        tr._gewichtsherkomst(cfg)
    basis = {"url": "https://storage.googleapis.com/rfdetr/nano_coco/checkpoint_best_regular.pth", "sha256": "abc", "licentie": "Apache-2.0"}
    schrijf(tmp_path / "f1" / "train-resultaat.json", {"gewichten": basis})
    h = tr._gewichtsherkomst(cfg)
    assert h["basis"] == basis and h["sha256"] == hashlib.sha256(b"gewichten").hexdigest() and h["licentie"] == "Apache-2.0"


# --- herkenning ----------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("overlap", [256, 300, -1])
def test_tegels_weigert_overlap_buiten_bereik(overlap):
    with pytest.raises(ValueError):
        mod("herken").tegels(1000, 1000, tegel=256, overlap=overlap)


def beslis_bestanden(tmp_path, n=2, codes_drempels=(GD,), refs=(GD,)):
    lijst, kand = [], {}
    for i in range(n):
        d = f"{TOETS_GLN}-{40000000000000 + i}-528"
        pad = tmp_path / f"{d}.png"
        pad.write_bytes(png((300, 300), ruis=i))
        lijst.append({"doc_id": d, "gln": TOETS_GLN, "pad": str(pad)})
        kand[d] = {"kandidaten": [{"code": GD, "box": [10, 10, 60, 60], "score": 0.5}], "wand_s": 1.0}
    (tmp_path / "ref.png").write_bytes(png())
    argv = ["beslis", "--kandidaten", str(schrijf(tmp_path / "k.json", kand)),
            "--drempels", str(schrijf(tmp_path / "d.json", {c: [0.1, 0.9] for c in codes_drempels})),
            "--lijst", str(schrijf(tmp_path / "l.json", lijst)),
            "--referenties", str(schrijf(tmp_path / "r.json", {c: str(tmp_path / "ref.png") for c in refs})),
            "--grootboek", str(tmp_path / "uitgaven.json"), "--uit", str(tmp_path / "run.json"), "--meta", str(tmp_path / "meta.json")]
    return argv, lijst


def test_beslis_stoppunt_7_zonder_referentieplaatje(tmp_path):
    argv, _ = beslis_bestanden(tmp_path, codes_drempels=(GD, WM), refs=(GD,))
    with pytest.raises(SystemExit) as e:
        mod("herken").main(argv)
    assert "stoppunt 7" in str(e.value) and WM in str(e.value)


def test_beslis_start_niet_boven_de_uitgavengrens(tmp_path):
    argv, _ = beslis_bestanden(tmp_path)
    schrijf(tmp_path / "uitgaven.json", {"beoordelaar": 4.499})  # grens 4,50; deze run verwacht 2 × 0,002
    with pytest.raises(SystemExit) as e:
        mod("herken").main(argv)
    assert "stoppunt 5" in str(e.value) and not (tmp_path / "run.json").exists()


def test_beslis_afgebroken_run_herstart_en_telling(tmp_path, monkeypatch):
    orq, hk, tp = mod("openrouter"), mod("herken"), mod("tel_proef")
    argv, lijst = beslis_bestanden(tmp_path)
    monkeypatch.setattr(orq, "Client", lambda *a, **k: NepClient(model="google/gemini-3.8-flash", fout=orq.RunStop("geen_zdr")))
    assert hk.main(argv) == 3
    run = json.loads((tmp_path / "run.json").read_text())
    assert (run["status"], run["reden"], run["etiketten"]) == ("afgebroken", "geen_zdr", {})
    schrijf(tmp_path / "uitslag.json", {e["doc_id"]: et(aanwezig={GD}) for e in lijst})
    telling = ["--uitslag", str(tmp_path / "uitslag.json"), "--route", f"da={tmp_path / 'run.json'}", "--uit", str(tmp_path / "t")]
    assert tp.main(telling) != 0 and not (tmp_path / "t" / "tabellen.json").exists()
    # een onderbroken (gestarte) run gaat verder waar hij was
    run_bestand(tmp_path / "run.json", {lijst[0]["doc_id"]: [GD]}, status="gestart")
    client = NepClient({"oordeel": "ja"}, model="google/gemini-3.8-flash")
    monkeypatch.setattr(orq, "Client", lambda *a, **k: client)
    assert hk.main(argv) == 0
    run = json.loads((tmp_path / "run.json").read_text())
    assert run["status"] == "voltooid" and len(client.calls) == 1 and run["etiketten"] == {e["doc_id"]: [GD] for e in lijst}
    assert tp.main(telling) == 0


def test_detecteer_met_bevroren_weigert_waarden_op_de_opdrachtregel(tmp_path):
    with pytest.raises(SystemExit) as e:
        mod("herken").main(["detecteer", "--bevroren", str(tmp_path / "b.json"), "--model", "x", "--maat", "N",
                            "--lijst", "l.json", "--uit", str(tmp_path / "u.json")])
    assert "bevroren" in str(e.value)


# --- bevriezing en runs ------------------------------------------------------------------------------------------

@pytest.fixture
def bevroren(tmp_path):
    bv = mod("bevries")
    d = tmp_path / "o"
    d.mkdir()
    o = {n: schrijf(d / f"{n}.json", {"n": n}) for n in ("scheiding", "uitslag", "drempels", "beoordelaar", "k4aa", "telcode", "gewichten")}
    (d / "model").mkdir()
    (d / "model" / "ckpt.pth").write_bytes(b"model")
    (d / "ref.png").write_bytes(b"beeld-1")
    o["model"] = d / "model"
    o["referentieplaatjes"] = schrijf(d / "referenties.json", {GD: str(d / "ref.png")})
    o["instellingen"] = schrijf(d / "instellingen.json", {"maat": "N", "tegel": 1024, "overlap": 256, "drempel": 0.05,
                                                          "beoordelaar_model": "google/gemini-3.8-flash", "k4aa_budget": 300})
    uit = tmp_path / "bevroren.json"
    bv.bevries(o, uit)
    return SimpleNamespace(bv=bv, o=o, uit=uit, d=d)


def test_bevries_legt_code_vast_en_hasht_beeldinhoud(bevroren):
    data = json.loads(bevroren.uit.read_text())["onderdelen"]
    assert "code" in data and data["referentieplaatjes"]["sha256"] != hashlib.sha256(bevroren.o["referentieplaatjes"].read_bytes()).hexdigest()
    (bevroren.d / "ref.png").write_bytes(b"beeld-2")  # zelfde index, ander beeld
    with pytest.raises(bevroren.bv.Gewijzigd):
        bevroren.bv.controleer(bevroren.uit, {})


def test_bevries_map_gewijzigd_ook_zonder_onderdelen_te_noemen(bevroren):
    bevroren.bv.controleer(bevroren.uit, bevroren.o)
    (bevroren.o["model"] / "ckpt.pth").write_bytes(b"bijgesteld")
    with pytest.raises(bevroren.bv.Gewijzigd):
        bevroren.bv.controleer(bevroren.uit, bevroren.o)
    with pytest.raises(bevroren.bv.Gewijzigd):
        bevroren.bv.controleer(bevroren.uit, {})


def test_bevries_instellingen_moeten_volledig_zijn(tmp_path, bevroren):
    o = {**bevroren.o, "instellingen": schrijf(tmp_path / "i.json", {"maat": "N"})}
    with pytest.raises(ValueError):
        bevroren.bv.bevries(o, tmp_path / "ander.json")


def test_laatste_voltooide_run(tmp_path):
    bv = mod("bevries")
    r1 = bv.registreer_run(tmp_path, "da")
    run_bestand(r1, {}, status="afgebroken", reden="geen_zdr")
    assert bv.laatste(tmp_path, "da") is None
    r2 = bv.registreer_run(tmp_path, "da", herhaling=True, reden="geen_zdr")
    assert bv.laatste(tmp_path, "da") is None  # nog gestart
    run_bestand(r2, {"d1": []})
    assert bv.laatste(tmp_path, "da") == r2


# --- K4-aa-runner --------------------------------------------------------------------------------------------------

def nep_k4aa(kosten=0.012):
    class K4aaError(Exception):
        def __init__(self, klasse):
            super().__init__(klasse)
            self.klasse = klasse

    calls = []

    async def scan(data, remaining):
        calls.append(data)
        return {"detections": [{"t3777_code": GD, "requires_review": False}], "stats": {"cost_usd": kosten}}

    return SimpleNamespace(scan=scan, K4aaError=K4aaError, MODEL="google/gemini-3.8-flash", calls=calls)


def test_k4aa_stopt_voor_het_etiket_dat_de_grens_passeert(tmp_path):
    kl, ko, orq = mod("k4aa_lokaal"), mod("kosten"), mod("openrouter")
    lijst = []
    for i in range(5):
        (tmp_path / f"{i}.png").write_bytes(png(ruis=i))
        lijst.append({"doc_id": f"d{i}", "gln": TOETS_GLN, "pad": str(tmp_path / f"{i}.png")})
    k4aa, run, meta = nep_k4aa(), {"status": "gestart", "etiketten": {}}, {}
    bewaker = ko.Bewaker("k4aa", 0.02)  # grens 0,03: na 2 etiketten (0,024) past een derde niet meer
    with pytest.raises(orq.RunStop) as e:
        kl.draai(k4aa, lijst, run, meta, bewaker, 300, lambda: None)
    assert e.value.reden == "budget" and len(k4aa.calls) == 2 and list(run["etiketten"]) == ["d0", "d1"]
    assert bewaker.uitgegeven == pytest.approx(0.024)


def test_k4aa_matrix_gefilterd_tegen_alle_referenties(tmp_path):
    kl = mod("k4aa_lokaal")
    pm, mo = tmp_path / "pm", tmp_path / "mo"
    refs = [{"id": "r1", "code": GD, "source": "review-confirmed", "path": "crops/10000000000017/a.png"},
            {"id": "r2", "code": GD, "source": "review-confirmed", "path": "crops/10000000000024/b.png"},
            {"id": "r3", "code": WM, "source": "gs1-packaging-label-guide", "path": "gs1/wm.png"},
            {"id": "r4", "code": EU, "source": "gs1-packaging-label-guide", "path": "gs1/egaal.png"}]
    schrijf(pm / "invoer" / "momentopname" / "actieve-refs.json", refs)
    schrijf(pm / "scheiding.json", {"trainingsleveranciers": [TRAIN_GLN]})
    (pm / "invoer" / "declaraties-prod-basiseenheden-20261008.tsv").write_text(
        f"doc_id\tt3777\tdieet\tnutriscore\n{TRAIN_GLN}-10000000000017-528\t{GD}\t\t\n{TOETS_GLN}-10000000000024-528\t{GD}\t\t\n")
    (pm / "invoer" / "alcohol-kandidaten.tsv").write_text("")
    for i, r in enumerate(refs):
        p = mo / "bestanden" / r["path"]
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(png((32, 32)) if r["id"] == "r4" else png((32, 32), ruis=i))
    np.savez(mo / "embeddings.npz", pad=np.array([r["path"] for r in refs]), siglip=np.eye(4, dtype=np.float32))
    R, codes, ids = kl._matrix(pm, False, mo=mo)
    assert ids == ["r1", "r3"] and codes == [GD, WM] and R.shape == (2, 4)
    assert kl._matrix(pm, True, mo=mo)[2] == ["r1", "r2", "r3"]  # r4 egaal: valt altijd af
    voor = kl.refset_sha(ids, mo)
    np.savez(mo / "embeddings.npz", pad=np.array([r["path"] for r in refs]), siglip=2 * np.eye(4, dtype=np.float32))
    assert kl.refset_sha(ids, mo) != voor  # de embeddings tellen mee in de bevroren referentieset


def test_k4aa_met_bevroren_weigert_budget_op_de_opdrachtregel(tmp_path):
    with pytest.raises(SystemExit) as e:
        mod("k4aa_lokaal").main(["--ml-service", str(tmp_path), "--proef-map", str(tmp_path), "--lijst", "l.json",
                                 "--uit", str(tmp_path / "u.json"), "--meta", str(tmp_path / "m.json"),
                                 "--bevroren", str(tmp_path / "b.json"), "--budget", "60"])
    assert "bevroren" in str(e.value)


# --- telling -------------------------------------------------------------------------------------------------------

def test_nutriscore_gemelde_letter_buiten_de_waarheid_is_gemist():
    r = mod("tel_proef").tel({"n1": et(nutriscore=["B"]), "n2": et(nutriscore=["A", "B"])}, {"n1": {NSB, NSC}, "n2": {NSA, NSB}})
    assert (r["NUTRISCORE"]["gevonden"], r["NUTRISCORE"]["verkeerde_letter"]) == (1, 1)


def telling_argv(tmp_path):
    docs = [f"{TOETS_GLN}-{50000000000000 + i}-528" for i in range(3)]
    schrijf(tmp_path / "uitslag.json", {docs[0]: et(aanwezig={GD}, nutriscore=["A"]), docs[1]: et(), docs[2]: et(nutriscore=["A"])})
    run_bestand(tmp_path / "run.json", {docs[0]: {GD, NSA}, docs[1]: {GD}, docs[2]: set()})
    argv = ["--uitslag", str(tmp_path / "uitslag.json"), "--route", f"da={tmp_path / 'run.json'}", "--uit", str(tmp_path / "t")]
    return argv, docs


def nakijken_pad(tmp_path, wijzig):
    """Ronde 2 (besluiten 01-11-2026): `nakijken.json` = {nr: oordeel} voor elke regel van de uitgegeven lijst; hier
    Friso's eerdere oordeel, behalve `wijzig` ({(doc_id, keurmerk): oordeel})."""
    lijst = json.loads((tmp_path / "t" / "nakijklijst.json").read_text())
    return str(schrijf(tmp_path / "nakijken.json",
                       {str(r["nr"]): wijzig.get((r["doc_id"], r["keurmerk"]), r["waarheid"]) for r in lijst}))


def test_nakijken_voor_een_keurmerk_en_nutriscore(tmp_path):
    tp = mod("tel_proef")
    argv, docs = telling_argv(tmp_path)
    assert tp.main(argv) == 0  # stap 14: lijst uitgeven
    pad = nakijken_pad(tmp_path, {(docs[1], GD): "aanwezig", (docs[2], "NUTRISCORE"): ["D"]})
    assert tp.main(argv + ["--nakijken", pad]) == 0
    voor = json.loads((tmp_path / "t" / "tabellen.json").read_text())["da"]
    na = json.loads((tmp_path / "t" / "tabellen-na-nakijken.json").read_text())["da"]
    assert (voor[GD]["met"], voor[GD]["gevonden"], na[GD]["met"], na[GD]["gevonden"]) == (1, 1, 2, 2)
    assert (voor["NUTRISCORE"]["met"], na["NUTRISCORE"]["met"], na["NUTRISCORE"]["zonder"]) == (2, 2, 1)  # ronde 5: D is mét


@pytest.mark.parametrize("fout", ["nutriscore_als_keurmerk", "letter_buiten_a_e", "keurmerk_als_letters", "waarde"])
def test_ongeldig_nakijken_geeft_geen_tabellen_na_nakijken(tmp_path, fout):
    tp = mod("tel_proef")
    argv, docs = telling_argv(tmp_path)
    assert tp.main(argv) == 0
    wijzig = {"nutriscore_als_keurmerk": {(docs[2], "NUTRISCORE"): "aanwezig"}, "letter_buiten_a_e": {(docs[2], "NUTRISCORE"): ["F"]},
              "keurmerk_als_letters": {(docs[1], GD): ["A"]}, "waarde": {(docs[1], GD): "ja"}}[fout]
    assert tp.main(argv + ["--nakijken", nakijken_pad(tmp_path, wijzig)]) != 0
    assert not (tmp_path / "t" / "tabellen-na-nakijken.json").exists()


def test_tabel_aandeel_requires_review():
    tp = mod("tel_proef")
    uitslag = {"d1": et(aanwezig={GD, WM}), "d2": et(aanwezig={GD})}
    meta = {"d1": {"gln": TOETS_GLN, "tijd": 1.0, "kosten": 0.01, "requires_review": [WM]},
            "d2": {"gln": TOETS_GLN, "tijd": 1.0, "kosten": 0.01, "requires_review": []}}
    t = tp.tabel(uitslag, {"d1": {GD, WM}, "d2": {GD}}, meta, n_trekkingen=10)
    assert t["route"]["aandeel_requires_review"] == pytest.approx(1 / 3)


# --- beelden ophalen en bouwen -------------------------------------------------------------------------------------

def test_rgb_origineel_blijft_bruikbaar_en_te_groot_wordt_geweigerd(tmp_path, monkeypatch):
    bl = mod("beelden")
    Image.new("RGB", (20, 10), (1, 2, 3)).save(tmp_path / "o.png")
    beeld = bl.origineel_beeld(tmp_path / "o.png")
    beeld.save(io.BytesIO(), "PNG")  # vóór de reparatie: AssertionError, het beeld was met het bestand gesloten
    assert beeld.mode == "RGB" and beeld.getpixel((0, 0)) == (1, 2, 3)
    monkeypatch.setattr(bl, "MAX_PIXELS", 100)
    with pytest.raises(bl.TeGroot):
        bl.origineel_beeld(tmp_path / "o.png")
    with pytest.raises(bl.TeGroot):
        bl.pagina_samen([])


def test_bouwen_origineel_met_rgb_png(tmp_path):
    bl = mod("beelden")
    (tmp_path / "bron" / "map").mkdir(parents=True)
    Image.new("RGB", (20, 10), "white").save(tmp_path / "bron" / "map" / "o.png")
    (tmp_path / "originelen.tsv").write_text("doc_id\tlocation\nd1\tmap/o.png\n")
    bl.main(["bouwen-origineel", "--originelen", str(tmp_path / "originelen.tsv"), "--bron", str(tmp_path / "bron"),
             "--uit", str(tmp_path / "uit")])
    assert "sha256" in json.loads((tmp_path / "uit" / "manifest.json").read_text())["d1"]


def ls_nep(regels_per_gtin, code_per_gtin=None):
    calls = []

    def run(args):
        calls.append(args)
        gtin = next(g for g in regels_per_gtin if g in args[-1])
        code = (code_per_gtin or {}).get(gtin)
        if code:
            raise subprocess.CalledProcessError(code, args)
        return "\n".join(regels_per_gtin[gtin]).encode()

    return run, calls


def origineel_argv(tmp_path, *extra):
    (tmp_path / "paren.tsv").write_text(f"gln\tgtin\n{TOETS_GLN}\t10000000000017\n{TOETS_GLN}\t10000000000024\n{TOETS_GLN}\t10000000000031\n")
    return ["origineel-paden", "--paren", str(tmp_path / "paren.tsv"), "--uit", str(tmp_path / "uit"), *extra]


def test_origineel_paden_manifest_overgeslagen_en_ssh_fout(tmp_path):
    bl = mod("beelden")
    d = lambda g: f"{TOETS_GLN}-{g}-528"  # noqa: E731
    mf = schrijf(tmp_path / "manifest.json", {d("10000000000017"): {"sha256": "x"}, d("10000000000024"): {"fout": "OSError"}})
    run, calls = ls_nep({"10000000000017": ["/media/Xmedia/a.pdf"], "10000000000024": ["/media/Xmedia/b.png"],
                         "10000000000031": []}, {"10000000000031": 2})
    bl.main(origineel_argv(tmp_path, "--manifest", str(mf)), run=run)
    assert len(calls) == 2  # het doc met een gelukte print-laag wordt overgeslagen, het mislukte krijgt het origineel
    assert (tmp_path / "uit" / "originelen.tsv").read_text().splitlines()[1:] == [f"{d('10000000000024')}\tb.png"]
    assert d("10000000000031") in (tmp_path / "uit" / "originelen-overgeslagen.tsv").read_text()
    run255, _ = ls_nep({"10000000000017": [], "10000000000024": [], "10000000000031": []}, {"10000000000017": 255})
    with pytest.raises(subprocess.CalledProcessError):
        bl.main(origineel_argv(tmp_path), run=run255)


def test_origineel_paden_alleen_pdf_ook_met_print_laag(tmp_path):
    bl = mod("beelden")
    mf = schrijf(tmp_path / "manifest.json", {f"{TOETS_GLN}-10000000000017-528": {"sha256": "x"}})
    run, calls = ls_nep({"10000000000017": ["/media/Xmedia/a.png", "/media/Xmedia/a.pdf"],
                         "10000000000024": ["/media/Xmedia/b.png"], "10000000000031": ["/media/Xmedia/c.pdf"]})
    bl.main(origineel_argv(tmp_path, "--manifest", str(mf), "--alleen-pdf"), run=run)
    regels = (tmp_path / "uit" / "pdf-originelen.tsv").read_text().splitlines()[1:]
    assert regels == [f"{TOETS_GLN}-10000000000017-528\ta.pdf", f"{TOETS_GLN}-10000000000031-528\tc.pdf"]


def test_uitvoerder_toont_stderr_bij_een_fout(capsys):
    with pytest.raises(subprocess.CalledProcessError):
        mod("beelden").uitvoerder(["sh", "-c", "echo verbinding-weg >&2; exit 3"])
    assert "verbinding-weg" in capsys.readouterr().err


# --- licenties en declaraties ----------------------------------------------------------------------------------------

def test_licentie_met_ongelezen_rest_is_onbekend():
    assert mod("licenties").beoordeel("(MIT) GPL-3.0") == "onbekend"


def test_nutriscore_token_van_twee_letters_telt_niet(tmp_path):
    (tmp_path / "d.tsv").write_text(f"doc_id\tt3777\tdieet\tnutriscore\n{TOETS_GLN}-10000000000017-528\t\t\tAB;C\n")
    assert mod("scheiding").lees_declaraties(tmp_path / "d.tsv")[0][3] == frozenset({NSC})
