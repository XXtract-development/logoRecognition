"""ATDD ronde 3 (01-11-2026): verzoekgrootte, grens voorinvulling $65, startprojectie per aanroep (SPEC CAP-2, CAP-5,
CAP-14, CAP-10; randvoorwaarden §3 en §5; interfacecontract ronde 3 in de ATDD-checklist). Rode fase: `delen`,
`MAX_BEELD_BYTES`, het beeldtype per beeld, `--grens`/`--besluit` en `Bewaker(grens=)` bestaan nog niet. Verzonnen
GLN's, GTIN's en beelden; geen netwerk (client en transport nagebootst); alles in `tmp_path`."""
import base64
import functools
import io
import json
import re
from pathlib import Path

import pytest
from PIL import Image

from test_besluiten_20261101 import draaiplan, stap
from test_cap10_draaiplan import regel
from test_openrouter import KEY, LOGO, MODEL_PER_ROL, SCHEMA, Nep
from test_review_20261101 import GD, EU, NSA, WM, NepClient, echt_pm, mod, png, schrijf, toets_pm

JPEG, PNG = b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n"
FLASH = "google/gemini-3.8-flash"
LEEG = {"keurmerken": [], "nutriscore": [], "gelijkend": []}
POST_VI, POST_VL = "voorinvulling toets", "voorlabels + achtergrondscreening"


def jpeg(maat=(16, 12), kleur=(30, 120, 60), ruis=None):
    """Echt, decodeerbaar JPEG-beeld (kwaliteit 90); met `ruis` groot in bytes."""
    im = Image.open(io.BytesIO(png(maat, kleur, ruis))).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def nepjpeg(n, i=0):
    """n bytes die met de JPEG-kop beginnen (voorinvulling decodeert tegels niet)."""
    return JPEG + i.to_bytes(2, "big") + b"\0" * (n - 5)


@functools.lru_cache
def groot_png():
    return png((4096, 4096))  # herken.tegels: 25 tegels = 2 aanroepen


def b64(b):
    return base64.b64encode(b).decode()


def budget(monkeypatch, n):
    # raising=False: in de rode fase bestaat de constante nog niet, zodat de test op het gedrag faalt
    monkeypatch.setattr(mod("openrouter"), "MAX_BEELD_BYTES", n, raising=False)


class Gestart(Exception):
    """De startcontrole is gepasseerd (de zdr-proef werd aangeroepen); de test stopt de run hier."""


class Opname(NepClient):
    def __init__(self, *antwoorden, stop=None, **kw):
        super().__init__(*antwoorden, **kw)
        self.zdr, self.kw, self.stop = [], None, stop

    def zdr_proef(self, beeld):
        self.zdr.append(beeld)
        if self.stop:
            raise self.stop
        return super().zdr_proef(beeld)


def vervang(monkeypatch, client):
    def fabriek(*a, **k):
        client.kw = k
        return client

    monkeypatch.setattr(mod("openrouter"), "Client", fabriek)
    return client


def start(fn):
    try:
        fn()
    except mod("kosten").BudgetOverschreden:
        return "geweigerd"
    except Gestart:
        return "gestart"
    return "doorgelopen"


def uitkomst(capsys, fn):
    """(exitcode, alle tekst): een SystemExit of een returnwaarde, plus stdout, stderr en een SystemExit-melding."""
    try:
        rc = fn()
    except SystemExit as e:
        rc = e.code
    uit = capsys.readouterr()
    return rc, uit.out + uit.err + ("" if rc is None or isinstance(rc, int) else str(rc))


def toets_r3(tmp_path, n, groot=(), boek=None):
    pm, mf, docs = toets_pm(tmp_path, n)
    manifest = json.loads((mf / "manifest.json").read_text())
    for i in groot:
        (mf / f"{docs[i]}.png").write_bytes(groot_png())
        manifest[docs[i]].update(w=64, h=64)  # verkeerde maat in het manifest: de projectie hoort het bestand te lezen
    schrijf(mf / "manifest.json", manifest)
    if boek is not None:
        schrijf(pm / "uitgaven.json", {POST_VI: boek})
    argv = ["voorinvulling", "--proef-map", str(pm), "--manifest", str(mf / "manifest.json"), "--zdr-logo", str(pm / "logo.png")]
    return argv, pm / "toets", docs


def echt_r3(tmp_path, n, groot=False, boek=None):
    pm, lijst, _, items = echt_pm(tmp_path, n)
    if groot:
        for e in items:
            Path(e["pad"]).write_bytes(groot_png())
    if boek is not None:
        schrijf(pm / "uitgaven.json", {POST_VL: boek})
    (tmp_path / "logo.png").write_bytes(png())
    uit = tmp_path / "vl.json"
    argv = ["voorlabels", "--lijst", str(lijst), "--proef-map", str(pm), "--uit", str(uit), "--zdr-logo", str(tmp_path / "logo.png")]
    return argv, uit, items


# --- openrouter.delen: 16 tegels en 20.000.000 bytes per verzoek (randvoorwaarden §5) --------------------------------

def test_r3_delen_constante_20_mb_en_rand_met_de_echte_grens():
    orq = mod("openrouter")
    assert orq.MAX_BEELD_BYTES == 20_000_000
    assert orq.delen([10_000_000, 9_000_000], vast=1_000_000) == [range(0, 2)]  # precies 20.000.000 mag
    assert orq.delen([10_000_000, 9_000_001], vast=1_000_000) == [range(0, 1), range(1, 2)]


def test_r3_delen_hoogstens_16_tegels_op_volgorde_zonder_overlap():
    orq = mod("openrouter")
    assert orq.delen([1] * 35) == [range(0, 16), range(16, 32), range(32, 35)]
    assert orq.delen([1] * 16) == [range(0, 16)]
    assert orq.delen([1] * 5, max_aantal=2) == [range(0, 2), range(2, 4), range(4, 5)]


def test_r3_delen_bytegrens_telt_het_overzicht_mee_ongelijke_splitsing(monkeypatch):
    orq = mod("openrouter")
    budget(monkeypatch, 1000)
    groottes = [10] * 16 + [295] * 3 + [20] * 16  # 16 (aantal), 3 (100 + 885 + 20 > 1000), 16
    uit = orq.delen(groottes, vast=100)
    assert uit == [range(0, 16), range(16, 19), range(19, 35)]
    assert all(len(r) <= 16 and 100 + sum(groottes[r.start:r.stop]) <= 1000 for r in uit)
    assert orq.delen([450, 450], vast=100) == [range(0, 2)]  # precies op de grens
    assert orq.delen([450, 451], vast=100) == [range(0, 1), range(1, 2)]


def test_r3_delen_lege_invoer_is_een_aanroep_zonder_tegels():
    orq = mod("openrouter")
    assert orq.delen([]) == [range(0, 0)]
    assert orq.delen([], vast=123) == [range(0, 0)]


def test_r3_delen_overzicht_plus_een_tegel_te_groot_is_etiketfout(monkeypatch):
    orq = mod("openrouter")
    budget(monkeypatch, 100)
    for groottes, vast in (([60], 50), ([10, 10, 95], 10)):
        with pytest.raises(orq.EtiketFout) as e:
            orq.delen(groottes, vast=vast)
        assert e.value.klasse == "te_groot", groottes
    assert orq.delen([90], vast=10) == [range(0, 1)]


def test_r3_delen_leest_de_grens_bij_elke_aanroep(monkeypatch):
    orq = mod("openrouter")
    budget(monkeypatch, 100)
    assert orq.delen([60, 60]) == [range(0, 1), range(1, 2)]
    budget(monkeypatch, 120)
    assert orq.delen([60, 60]) == [range(0, 2)]


# --- Client: beeldtype uit de eerste bytes; onbekend type gaat nooit de deur uit -----------------------------------

def client_r3(proef=True):
    nep = Nep("auto") if proef else Nep()
    c = mod("openrouter").Client(MODEL_PER_ROL["voorinvulling"], "voorinvulling", sleutel=KEY, transport=nep, slaap=[].append)
    if proef:
        c.zdr_proef(LOGO)
    return c, nep


def urls(call):
    return [d["image_url"]["url"] for d in call["body"]["messages"][0]["content"][1:]]


def test_r3_client_jpeg_als_image_jpeg_en_png_als_image_png():
    c, nep = client_r3()
    j, p = jpeg(), png()
    c.vraag("x", [j, p], SCHEMA)
    assert urls(nep.calls[-1]) == ["data:image/jpeg;base64," + b64(j), "data:image/png;base64," + b64(p)]
    assert c._body("x", [j], SCHEMA)["messages"][0]["content"][1]["image_url"]["url"] == "data:image/jpeg;base64," + b64(j)


def test_r3_zdr_proef_png_logo_blijft_png_jpeg_logo_wordt_jpeg():
    for logo, soort in ((LOGO, "png"), (jpeg((20, 20)), "jpeg")):
        c, nep = client_r3(proef=False)
        c.zdr_proef(logo)
        assert urls(nep.calls[0]) == [f"data:image/{soort};base64," + b64(logo)]


@pytest.mark.parametrize("onbekend", [b"GIF89a" + b"\0" * 10, b"", b"\xff\xd8" + b"\0" * 10, b"\x89PNG" + b"\0" * 10],
                         ids=["gif", "leeg", "halve-jpeg-kop", "halve-png-kop"])
def test_r3_client_onbekend_beeldtype_valueerror_zonder_verzenden(onbekend):
    c, nep = client_r3()
    na_proef = len(nep.calls)
    with pytest.raises(ValueError):
        c.vraag("x", [png(), onbekend], SCHEMA)
    with pytest.raises(ValueError):
        c._body("x", [onbekend], SCHEMA)
    c2, nep2 = client_r3(proef=False)
    with pytest.raises(ValueError):
        c2.zdr_proef(onbekend)
    assert len(nep.calls) == na_proef and nep2.calls == []


# --- toets.voorinvulling: splitsing op bytes, hinttegels op etiketindex, te_groot -----------------------------------

def test_r3_voorinvulling_splitst_op_bytes_hinttegels_op_etiketindex(monkeypatch):
    budget(monkeypatch, 1000)
    heel = nepjpeg(100, 999)
    tegels = [nepjpeg(g, i) for i, g in enumerate([10] * 16 + [295] * 3 + [20] * 16)]
    a1 = {"keurmerken": [{"code": GD, "aanwezig": False, "tegels": []}], "nutriscore": ["B"], "gelijkend": []}
    a2 = {"keurmerken": [{"code": GD, "aanwezig": True, "tegels": [2, 3]}], "nutriscore": [], "gelijkend": []}  # 3: buiten deze aanroep
    a3 = {"keurmerken": [{"code": EU, "aanwezig": True, "tegels": [0, 15]}], "nutriscore": [], "gelijkend": ["TRIMAN"]}
    client = NepClient(a1, a2, a3)
    uit = mod("toets").voorinvulling(client, heel, tegels)
    assert [len(c) for c in client.calls] == [17, 4, 17] and all(c[0] == heel for c in client.calls)
    assert [t for c in client.calls for t in c[1:]] == tegels  # elke tegel precies één keer, op volgorde
    assert uit["keurmerken"] == {GD: True, EU: True} and uit["hinttegels"] == {GD: [18], EU: [19, 34]}
    assert uit["nutriscore"] == ["B"] and uit["gelijkend"] == ["TRIMAN"] and uit["kosten"] == pytest.approx(0.03)
    assert "fout" not in uit


def test_r3_voorinvulling_te_groot_lege_velden_zonder_aanroep(monkeypatch):
    budget(monkeypatch, 100)
    client = NepClient(LEEG)
    uit = mod("toets").voorinvulling(client, nepjpeg(50), [nepjpeg(10, 1), nepjpeg(60, 2)])  # 50 + 60 > 100
    assert uit.get("fout") == "te_groot" and client.calls == []
    assert (uit["keurmerken"], uit["nutriscore"], uit["hinttegels"], uit["gelijkend"], uit["kosten"]) == ({}, [], {}, [], 0.0)


# --- toets.main voorinvulling: JPEG, grens $65, besluitverwijzing, projectie per aanroep -----------------------------

def test_r3_toets_main_stuurt_jpeg_90_en_houdt_paginabeelden_png(tmp_path, monkeypatch):
    argv, t, docs = toets_r3(tmp_path, 2)
    client = vervang(monkeypatch, Opname({"keurmerken": [{"code": GD, "aanwezig": True, "tegels": [0]}], "nutriscore": [],
                                          "gelijkend": []}))
    assert mod("toets").main(argv) == 0
    assert len(client.calls) == 2 and all(b[:3] == JPEG for c in client.calls for b in c)
    ref = io.BytesIO()
    Image.new("RGB", (8, 8)).save(ref, "JPEG", quality=90)
    q90 = Image.open(ref).quantization
    assert all(Image.open(io.BytesIO(b)).quantization == q90 for c in client.calls for b in c)  # kwaliteit 90
    assert client.zdr[0][:8] == PNG
    for d in docs:
        assert (t / "beelden" / f"{d}.png").read_bytes()[:8] == PNG
        assert (t / "beelden" / f"{d}-{GD}-0.png").read_bytes()[:8] == PNG  # hinttegel
    vi = json.loads((t / "voorinvulling.json").read_text())
    assert [vi[d].get("beeldtype") for d in docs] == ["jpeg", "jpeg"]
    assert [i["voorinvulling"].get("beeldtype") for i in json.loads((t / "items.json").read_text())] == ["jpeg", "jpeg"]


def test_r3_toets_standaardgrens_65_start_ook_boven_de_oude_31_50(tmp_path, monkeypatch, capsys):
    ts = mod("toets")
    argv, _, _ = toets_r3(tmp_path, 6, boek=31.40)  # 31,40 + 6 × 0,06 = 31,76: boven 1,5 × 21, onder 65
    client = vervang(monkeypatch, Opname(LEEG))
    assert ts.main(argv) == 0
    assert client.kw["bewaker"].grens == pytest.approx(65.0)
    assert re.search(r"\b65\b", capsys.readouterr().out)  # de gebruikte grens staat op stdout
    assert ts.GRENS_VOORINVULLING == 65.0


def test_r3_toets_rand_van_de_grens_65_kleine_etiketten(tmp_path, monkeypatch):
    for boek, verwacht in ((64.60, "gestart"), (64.70, "geweigerd")):  # + 6 × 0,06: 64,96 en 65,06
        argv, t, _ = toets_r3(tmp_path / str(boek), 6, boek=boek)
        client = vervang(monkeypatch, Opname(LEEG, stop=Gestart()))
        assert start(lambda: mod("toets").main(argv)) == verwacht, boek
    assert not client.zdr and not client.calls and not (t / "voorinvulling.json").exists()


def test_r3_toets_projectie_per_aanroep_groot_etiket_twee_aanroepen(tmp_path, monkeypatch):
    for boek, verwacht in ((64.85, "gestart"), (64.90, "geweigerd")):  # + 2 × 0,06 (25 tegels): 64,97 en 65,02
        argv, t, _ = toets_r3(tmp_path / str(boek), 1, groot=(0,), boek=boek)
        client = vervang(monkeypatch, Opname(LEEG, stop=Gestart()))
        assert start(lambda: mod("toets").main(argv)) == verwacht, boek  # per etiket 0,06 zou beide laten starten
    assert not client.zdr and not client.calls


def test_r3_toets_projectie_telt_alleen_open_etiketten(tmp_path, monkeypatch):
    for boek, verwacht in ((64.90, "gestart"), (64.95, "geweigerd")):
        argv, t, docs = toets_r3(tmp_path / str(boek), 2, groot=(0,), boek=boek)
        schrijf(t / "voorinvulling.json", {docs[0]: {**LEEG, "keurmerken": {}, "hinttegels": {}},  # groot, klaar
                                           docs[1]: {**LEEG, "keurmerken": {}, "fout": "geweigerd"}})  # klein, opnieuw
        client = vervang(monkeypatch, Opname(LEEG, stop=Gestart()))
        assert start(lambda: mod("toets").main(argv)) == verwacht, boek  # alleen docs[1]: + 0,06


@pytest.mark.parametrize("extra", [["--grens", "70"], ["--grens", "70", "--besluit", "  "]], ids=["zonder", "leeg"])
def test_r3_toets_grens_zonder_besluit_weigert_voor_elke_aanroep(tmp_path, monkeypatch, capsys, extra):
    argv, t, _ = toets_r3(tmp_path, 2)
    client = vervang(monkeypatch, Opname(LEEG))
    rc, tekst = uitkomst(capsys, lambda: mod("toets").main(argv + extra))
    assert rc not in (0, None)
    assert "besluit" in tekst and "unrecognized arguments" not in tekst  # geweigerd om het besluit, niet als onbekende optie
    assert not client.zdr and not client.calls and not (t / "voorinvulling.json").exists()


@pytest.mark.parametrize("grens", ["inf", "nan", "-1"])
def test_r3_toets_grens_niet_eindig_of_negatief_weigert_voor_elke_aanroep(tmp_path, monkeypatch, capsys, grens):
    argv, t, _ = toets_r3(tmp_path, 2)
    client = vervang(monkeypatch, Opname(LEEG))
    rc, _ = uitkomst(capsys, lambda: mod("toets").main(argv + [f"--grens={grens}", "--besluit", "besluit Friso r3"]))
    assert rc not in (0, None)
    assert not client.zdr and not client.calls and not (t / "voorinvulling.json").exists()


def test_r3_toets_grens_met_besluit_geldt_en_staat_op_stdout(tmp_path, monkeypatch, capsys):
    argv, t, _ = toets_r3(tmp_path, 6, boek=64.90)  # 64,90 + 0,36: boven 65, onder 70
    client = vervang(monkeypatch, Opname(LEEG))
    besluit = "besluit Friso 01-11-2026 r3-proef"
    assert mod("toets").main(argv + ["--grens", "70", "--besluit", besluit]) == 0
    assert client.kw["bewaker"].grens == pytest.approx(70.0)
    out = capsys.readouterr().out
    assert re.search(r"\b70\b", out) and besluit in out
    proef = json.loads((t / "zdr-proef.json").read_text())
    assert (proef["grens"], proef["besluit"]) == (70.0, besluit)


def test_r3_toets_main_laat_beeldtype_weg_bij_overgenomen_etiket(tmp_path, monkeypatch):
    argv, t, docs = toets_r3(tmp_path, 2)
    schrijf(t / "voorinvulling.json", {docs[0]: {**LEEG, "keurmerken": {}, "hinttegels": {}}})  # PNG-tijdperk, geslaagd
    vervang(monkeypatch, Opname(LEEG))
    assert mod("toets").main(argv) == 0
    vi = json.loads((t / "voorinvulling.json").read_text())
    items = {i["id"]: i["voorinvulling"] for i in json.loads((t / "items.json").read_text())}
    for bron in (vi, items):
        assert "beeldtype" not in bron[docs[0]] and bron[docs[1]]["beeldtype"] == "jpeg"


def test_r3_toets_vijf_keer_te_groot_stopt_de_run_niet(tmp_path, monkeypatch):
    argv, t, docs = toets_r3(tmp_path, 6)
    client = vervang(monkeypatch, Opname(LEEG))
    budget(monkeypatch, 10)
    assert mod("toets").main(argv) == 0
    vi = json.loads((t / "voorinvulling.json").read_text())
    assert [vi[d].get("fout") for d in docs] == ["te_groot"] * 6 and client.calls == []


# --- echt.voorlabels: splitsing op bytes met vakjes in etiketcoördinaten, te_groot ----------------------------------

def test_r3_voorlabels_splitst_op_bytes_vakjes_in_etiketcoordinaten(monkeypatch):
    ec = mod("echt")
    heel, klein, groot = jpeg((200, 100), (200, 200, 200)), jpeg((100, 100), (90, 90, 90)), jpeg((100, 100), ruis=1)
    assert len(groot) > len(heel)  # dan splitst het hieronder op dezelfde plek, met of zonder het overzicht
    beelden_ = [klein, groot, groot, groot, klein]
    tegels = [(b, (100 * i, 50, 100 * i + 100, 150)) for i, b in enumerate(beelden_)]
    budget(monkeypatch, len(heel) + len(klein) + 2 * len(groot))  # past: klein + 2 groot; daarna groot + klein
    a1 = {"vakjes": [{"beeld": 3, "code": GD, "box": [10, 20, 40, 60], "onzeker": False}]}
    a2 = {"vakjes": [{"beeld": 2, "code": EU, "box": [5, 5, 55, 45], "onzeker": True},
                     {"beeld": 1, "code": WM, "box": [10, 10, 50, 40], "onzeker": False},
                     {"beeld": 0, "code": NSA, "box": [150, 10, 190, 40], "onzeker": False},
                     {"beeld": 3, "code": GD, "box": [1, 1, 30, 30], "onzeker": False}]}  # beeld 3 bestaat niet in aanroep 2
    client = NepClient(a1, a2, model=FLASH)
    uit = ec.voorlabels(client, heel, tegels)
    assert [len(c) for c in client.calls] == [4, 3] and all(c[0] == heel for c in client.calls)
    assert [b for c in client.calls for b in c[1:]] == beelden_
    assert sorted((v["code"], tuple(v["box"]), v["onzeker"]) for v in uit) == sorted([
        (GD, (210, 70, 240, 110), False), (EU, (405, 55, 455, 95), True), (WM, (310, 60, 350, 90), False),
        (NSA, (150, 10, 190, 40), False)])


def test_r3_voorlabels_te_groot_zonder_aanroep(monkeypatch):
    orq, ec = mod("openrouter"), mod("echt")
    heel, tegel = jpeg((200, 100)), jpeg((100, 100))
    budget(monkeypatch, len(heel) + len(tegel) - 1)  # de tegel alleen past, met het overzicht niet (§5)
    client = NepClient({"vakjes": []}, model=FLASH)
    with pytest.raises(orq.EtiketFout) as e:
        ec.voorlabels(client, heel, [(tegel, (0, 0, 100, 100))])
    assert e.value.klasse == "te_groot" and client.calls == []


# --- echt.main voorlabels: JPEG, grens 1,5 × raming, besluitverwijzing, projectie per aanroep ------------------------

def test_r3_echt_main_stuurt_overzicht_en_tegels_als_jpeg(tmp_path, monkeypatch):
    argv, uit, items = echt_r3(tmp_path, 2)
    client = vervang(monkeypatch, Opname({"vakjes": []}, model=FLASH))
    assert mod("echt").main(argv) == 0
    assert len(client.calls) == 2 and all(b[:3] == JPEG for c in client.calls for b in c)
    assert client.zdr[0][:8] == PNG
    assert all(json.loads(uit.read_text())[e["doc_id"]] == {"vakjes": []} for e in items)


@pytest.mark.parametrize("extra", [["--grens", "30"], ["--grens", "30", "--besluit", " "]], ids=["zonder", "leeg"])
def test_r3_echt_grens_zonder_besluit_weigert_voor_elke_aanroep(tmp_path, monkeypatch, capsys, extra):
    argv, uit, _ = echt_r3(tmp_path, 2)
    client = vervang(monkeypatch, Opname({"vakjes": []}, model=FLASH))
    rc, tekst = uitkomst(capsys, lambda: mod("echt").main(argv + extra))
    assert rc not in (0, None)
    assert "besluit" in tekst and "unrecognized arguments" not in tekst
    assert not client.zdr and not client.calls and not uit.exists()


def test_r3_echt_grens_met_besluit_geldt_en_staat_op_stdout(tmp_path, monkeypatch, capsys):
    argv, uit, _ = echt_r3(tmp_path, 2, boek=14.99)  # 14,99 + 2 × 0,012: boven 15, onder 30
    client = vervang(monkeypatch, Opname({"vakjes": []}, model=FLASH))
    besluit = "besluit Friso voorlabels r3-proef"
    assert mod("echt").main(argv + ["--grens", "30", "--besluit", besluit]) == 0
    assert client.kw["bewaker"].grens == pytest.approx(30.0) and len(client.calls) == 2
    out = capsys.readouterr().out
    assert re.search(r"\b30\b", out) and besluit in out
    proef = json.loads(uit.read_text())["_zdr_proef"]
    assert (proef["grens"], proef["besluit"]) == (30.0, besluit)


def test_r3_echt_te_groot_breekt_de_reeks_van_vijf_weigeringen(tmp_path, monkeypatch):
    orq = mod("openrouter")
    argv, uit, items = echt_r3(tmp_path, 9)
    for i, e in enumerate(items):  # klein ±2 kB per beeld; etiket 4 ruis 1200 px: overzicht en tegel elk > 200 kB
        Path(e["pad"]).write_bytes(png((1200, 1200), ruis=i) if i == 4 else png((300, 300)))
    budget(monkeypatch, 200_000)
    client = vervang(monkeypatch, Opname(model=FLASH, fout=orq.EtiketFout("geweigerd")))
    assert mod("echt").main(argv) == 0  # 4 geweigerd, te_groot, 4 geweigerd: nooit vijf op rij
    vl = json.loads(uit.read_text())
    assert [vl[e["doc_id"]].get("fout") for e in items] == ["geweigerd"] * 4 + ["te_groot"] + ["geweigerd"] * 4
    assert len(client.calls) == 8


# --- kosten.Bewaker: vaste grens naast 1,5 × de raming --------------------------------------------------------------

def test_r3_bewaker_grens_none_is_raming_maal_factor_anders_precies_de_grens():
    ko = mod("kosten")
    assert ko.Bewaker("p", 21.0, grens=None).grens == pytest.approx(31.5)
    assert ko.Bewaker("p", 10.0, factor=2.0, grens=None).grens == pytest.approx(20.0)
    b = ko.Bewaker(POST_VI, 21.0, grens=65.0)
    assert b.grens == 65.0 and ko.Bewaker("p", 10.0, factor=2.0, grens=7.0).grens == 7.0
    b.controleer_start(65.0)
    with pytest.raises(ko.BudgetOverschreden):
        b.controleer_start(65.01)
    assert ko.Bewaker("p", 10.0, grens=0.0).grens == 0.0  # 0 is een gegeven grens, niet "niet opgegeven"


# --- DRAAIPLAN: stap 3, 6, 9 en de kostennotitie --------------------------------------------------------------------

BESLUIT = re.compile(r"--besluit\s+(\"[^\"]*\S[^\"]*\"|'[^']*\S[^']*'|[^\s\"'-]\S*)")


def test_r3_draaiplan_stap_3_grens_65_met_besluit_en_kosten_0_12():
    s3 = stap(3)
    cmd, kosten = regel(s3, "Commando:"), regel(s3, "Kosten:")
    assert re.search(r"--grens\s+65\b", cmd)
    assert BESLUIT.search(cmd), "--grens zonder niet-lege --besluit weigert (contract toets.py)"
    assert all(w in kosten for w in ("$0,12", "$65", "Friso", "01-11-2026")), kosten
    assert "$31,50" not in s3


def test_r3_draaiplan_stap_6_kosten_0_12_per_extra_etiket():
    kosten = regel(stap(6), "Kosten:")
    assert "$0,12 per extra etiket" in kosten and "$0,06" not in kosten


def test_r3_draaiplan_kostennotitie_noemt_de_grens_per_post():
    blokken = re.findall(r"^> \[!note\][^\n]*Kosten[^\n]*\n(?:>[^\n]*\n?)*", draaiplan(), re.M)
    assert blokken
    assert re.search(r"per post|\$65", blokken[0]), blokken[0]
