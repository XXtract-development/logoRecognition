"""CAP-21 ronde 12 (ATDD, 13-11-2026; besluiten Friso "Eerst aanvullen", "60 etiketten", "Alle keurmerken"): aanvulling
glutenvrij met volledige voorinvulling en een pagina met alleen de nieuwe etiketten (SPEC CAP-21, toetsset §4, §5, §6a).
Verzonnen GLN's, GTIN's en beelden; geen netwerk (client nagebootst); alles in `tmp_path`.
"""
import copy
import importlib
import json
import struct

import pytest

from conftest import HIER
from ronde11_hulp import GV, LOS12, vul  # noqa: F401
from test_cap02_kandidaten import GLN, gtins, toets_rijen
from test_review_20261101 import TOETS_GLN, png, schrijf, toets_pm

HAIKU = "anthropic/claude-haiku-5.5"


def mod(naam):
    return importlib.import_module(naam)


# --- kandidaten: glutenvrij-rij ------------------------------------------------------------------------------------------
def proefmap_declaraties(tmp_path, regels):
    """Kleinste proefmap waarop `_toets_rijen` draait: declaraties (doc_id, t3777, dieet, nutriscore), lege referenties,
    lege fase-B-set, leverancier C aan de trainingskant."""
    pm = tmp_path / "pm"
    inv = pm / "invoer"
    (inv / "momentopname").mkdir(parents=True)
    (inv / "declaraties-prod-basiseenheden-20261008.tsv").write_text(
        "doc_id\tt3777\tdieet\tnutriscore\n" + "".join(f"{d}\t{t}\t{di}\t\n" for d, t, di in regels))
    (inv / "alcohol-kandidaten.tsv").write_text("")
    (inv / "momentopname" / "actieve-refs.json").write_text("[]")
    (inv / "momentopname" / "training-data-actief.tsv").write_text("")
    (inv / "voorlopige-selectie.json").write_text(json.dumps({"etiketten": []}))
    schrijf(pm / "scheiding.json", {"trainingsleveranciers": [GLN["C"]]})
    return pm


def test_r12_toets_rijen_kent_een_glutenvrij_rij_alleen_aan_de_toetskant(tmp_path):
    a1, a2, c1 = "99900000000011", "99900000000012", "99900000000031"
    pm = proefmap_declaraties(tmp_path, [
        (f"{GLN['A']}-{a1}-528", "", "FREE_FROM_GLUTEN"),
        (f"{GLN['A']}-{a2}-528", "GREEN_DOT", ""),
        (f"{GLN['C']}-{c1}-528", "", "FREE_FROM_GLUTEN"),  # trainingsleverancier
    ])
    rijen, _ = mod("toets")._toets_rijen(pm, "toets")
    assert rijen[GV] == {GLN["A"]: {a1}}
    assert mod("toets")._toets_rijen(pm, "train")[0][GV] == {GLN["C"]: {c1}}


def gv_aanvul(tmp_path, monkeypatch):
    pm = tmp_path / "pm"
    gv_a, gv_b = sorted(gtins("A", 5, "7")), sorted(gtins("B", 4, "7"))
    rijen = toets_rijen(GREEN_DOT={"A": gtins("A", 3, "5")})
    rijen[GV] = {GLN["A"]: set(gv_a), GLN["B"]: set(gv_b)}
    monkeypatch.setattr(mod("toets"), "_toets_rijen", lambda _pm, kant="toets": (copy.deepcopy(rijen), {}))
    (pm / "invoer").mkdir(parents=True)
    pool = [(GLN["B"], g) for g in gv_b[:2]]  # twee met print-laag bij B
    (pm / "invoer" / mod("toets").POOL).write_text("".join(f"{l}-{g}-528\n" for l, g in pool))
    kand = schrijf(pm / "toets" / "kandidaten.json", [{"gtin": gv_a[0], "gln": GLN["A"], "reden": GV}])
    return pm, kand, gv_a, gv_b


def test_r12_aanvulling_glutenvrij_print_laag_eerst_maximum_en_geen_eerdere(tmp_path, monkeypatch, capsys):
    pm, kand, gv_a, gv_b = gv_aanvul(tmp_path, monkeypatch)
    argv = ["kandidaten", "--proef-map", str(pm), "--alleen", GV, "--max-per", "4", "--print-laag-eerst",
            "--bestaand", str(kand), "--naam", "kandidaten-aanvulling-3"]
    assert mod("toets").main(argv) == 0
    lijst = json.loads((pm / "toets" / "kandidaten-aanvulling-3.json").read_text())
    assert len(lijst) == 4 and {i["reden"] for i in lijst} == {GV}
    assert {i["gtin"] for i in lijst[:2]} == set(gv_b[:2])  # print-laag eerst
    assert gv_a[0] not in {i["gtin"] for i in lijst}  # eerdere kandidaat komt niet terug
    melding = json.loads(capsys.readouterr().out)
    assert melding["per_keurmerk"][GV]["toegevoegd"] == 4


def test_r12_gewone_kandidatenrun_kiest_geen_glutenvrij(tmp_path, monkeypatch):
    pm, kand, *_ = gv_aanvul(tmp_path, monkeypatch)
    kand.unlink()
    assert mod("toets").main(["kandidaten", "--proef-map", str(pm)]) == 0
    lijst = json.loads((pm / "toets" / "kandidaten.json").read_text())
    assert lijst and GV not in {i["reden"] for i in lijst}


# --- ontdubbel: lijst van de nieuwe docs ---------------------------------------------------------------------------------
def test_r12_ontdubbel_schrijft_de_nieuwe_docs(tmp_path):
    pm, mf, docs = toets_pm(tmp_path, 5)
    t = pm / "toets"
    schrijf(t / "toets-docs.json", docs[:2])
    kand = schrijf(t / "kandidaten-aanvulling-3.json", [{"gtin": d.split("-")[1], "gln": TOETS_GLN, "reden": GV}
                                                        for d in docs[2:]])
    argv = ["ontdubbel", "--proef-map", str(pm), "--manifest", str(mf / "manifest.json"), "--kandidaten", str(kand)]
    assert mod("toets").main(argv) == 0
    nieuw = json.loads((t / "kandidaten-aanvulling-3-nieuw.json").read_text())
    assert nieuw == docs[2:] and json.loads((t / "toets-docs.json").read_text()) == docs
    assert mod("toets").main(argv) == 0  # herhaalde run (bijvoorbeeld na een onderbroken ophaalronde)
    assert json.loads((t / "kandidaten-aanvulling-3-nieuw.json").read_text()) == docs[2:]


def test_r12_ontdubbel_zonder_kandidatenlijst_schrijft_geen_nieuw_bestand(tmp_path):
    pm, mf, docs = toets_pm(tmp_path, 3)
    t = pm / "toets"
    schrijf(t / "kandidaten.json", [{"gtin": d.split("-")[1], "gln": TOETS_GLN, "reden": "GREEN_DOT"} for d in docs])
    assert mod("toets").main(["ontdubbel", "--proef-map", str(pm), "--manifest", str(mf / "manifest.json")]) == 0
    assert not (t / "kandidaten-nieuw.json").exists()


def test_r12_lege_glutenvrij_rij_schrijft_geen_lijst(tmp_path, monkeypatch, capsys):
    pm, kand, *_ = gv_aanvul(tmp_path, monkeypatch)
    monkeypatch.setattr(mod("toets"), "_toets_rijen", lambda _pm, kant="toets": (toets_rijen() | {GV: {}}, {}))
    argv = ["kandidaten", "--proef-map", str(pm), "--alleen", GV, "--bestaand", str(kand), "--naam", "leeg"]
    with pytest.raises(SystemExit):
        mod("toets").main(argv)
    assert not (pm / "toets" / "leeg.json").exists()


# --- voorinvulling met glutenvrij ------------------------------------------------------------------------------------------
class Haiku:
    def __init__(self, antwoord, kosten=0.004):
        self.antwoord, self.kosten, self.model, self.calls, self.kw = antwoord, kosten, HAIKU, [], None

    def zdr_proef(self, beeld):
        return {"model": self.model, "tijd": "t", "ok": True}

    def vraag(self, tekst, beelden, schema, verwacht=0.0):
        self.calls.append({"tekst": tekst, "schema": schema, "verwacht": verwacht, "n": len(beelden)})
        return copy.deepcopy(self.antwoord), self.kosten


def antwoord(gv=True, zonder=()):
    k = [{"code": c, "aanwezig": c == "GREEN_DOT", "tegels": [0] if c == "GREEN_DOT" else []}
         for c in LOS12 if c not in zonder]
    if GV not in zonder:
        k.append({"code": GV, "aanwezig": gv, "tegels": [0] if gv else []})
    return {"keurmerken": k, "nutriscore": ["B"], "gelijkend": []}


def draai_r12(tmp_path, monkeypatch, client, extra=()):
    pm, mf, docs = toets_pm(tmp_path, 3)
    monkeypatch.setattr(mod("openrouter"), "Client", lambda *a, **k: client)
    schrijf(pm / "toets" / "nieuw.json", docs[1:])
    argv = ["voorinvulling", "--proef-map", str(pm), "--manifest", str(mf / "manifest.json"), "--zdr-logo",
            str(pm / "logo.png"), "--docs", str(pm / "toets" / "nieuw.json"), "--model", HAIKU, "--met-glutenvrij", *extra]
    return pm, docs, mod("toets").main(argv)


def test_r12_voorinvulling_met_glutenvrij_vraagt_alles_en_schrijft_eigen_bestanden(tmp_path, monkeypatch):
    client = Haiku(antwoord(gv=True))
    pm, docs, rc = draai_r12(tmp_path, monkeypatch, client)
    assert rc == 0
    schema = client.calls[0]["schema"]
    codes = schema["properties"]["keurmerken"]["items"]["properties"]["code"]["enum"]
    assert set(codes) == set(LOS12) | {GV} and GV in client.calls[0]["tekst"]
    t = pm / "toets"
    vi = json.loads((t / "voorinvulling-r12-claude-haiku-5-5.json").read_text())
    assert set(vi) == set(docs[1:])
    for v in vi.values():
        assert v["ronde"] == 12 and v["keurmerken"][GV] is True and set(v["keurmerken"]) == set(LOS12) | {GV}
        assert v["nutriscore"] == ["B"]
    items = json.loads((t / "items-r12-claude-haiku-5-5.json").read_text())
    assert [i["id"] for i in items] == docs[1:]
    assert any(f"-{GV}-" in h for i in items for h in i["hint"])  # hintbeeld ook voor glutenvrij
    assert not (t / "voorinvulling-claude-haiku-5-5.json").exists() and not (t / "items-claude-haiku-5-5.json").exists()


def test_r12_ontbrekende_code_is_fout_onvolledig(tmp_path, monkeypatch):
    pm, docs, rc = draai_r12(tmp_path, monkeypatch, Haiku(antwoord(zonder=(GV,))))
    vi = json.loads((pm / "toets" / "voorinvulling-r12-claude-haiku-5-5.json").read_text())
    assert all(v.get("fout") == "onvolledig" for v in vi.values())


def test_r12_zonder_vlag_blijft_haiku_op_de_oude_verwachting(tmp_path, monkeypatch):
    pm, mf, docs = toets_pm(tmp_path, 3)
    client = Haiku(antwoord())
    monkeypatch.setattr(mod("openrouter"), "Client", lambda *a, **k: client)
    argv = ["voorinvulling", "--proef-map", str(pm), "--manifest", str(mf / "manifest.json"), "--zdr-logo",
            str(pm / "logo.png"), "--model", HAIKU, "--grens", "0.05", "--besluit", "test"]
    with pytest.raises(Exception):  # 3 × $0,06 boven $0,05: de startcontrole weigert vóór elke aanroep
        mod("toets").main(argv)
    assert client.calls == []


@pytest.mark.parametrize("extra", [["--model", "anthropic/claude-sonnet-5.5"], ["zonder-docs"]], ids=["sonnet", "zonder-docs"])
def test_r12_met_glutenvrij_alleen_met_haiku_en_docs(tmp_path, monkeypatch, capsys, extra):
    pm, mf, docs = toets_pm(tmp_path, 2)
    client = Haiku(antwoord())
    monkeypatch.setattr(mod("openrouter"), "Client", lambda *a, **k: client)
    schrijf(pm / "toets" / "nieuw.json", docs)
    argv = ["voorinvulling", "--proef-map", str(pm), "--manifest", str(mf / "manifest.json"), "--zdr-logo",
            str(pm / "logo.png"), "--met-glutenvrij"]
    argv += ["--docs", str(pm / "toets" / "nieuw.json")] if extra != ["zonder-docs"] else []
    argv += extra if extra != ["zonder-docs"] else ["--model", HAIKU]
    with pytest.raises(SystemExit):
        mod("toets").main(argv)
    assert client.calls == [] and not (pm / "toets" / "voorinvulling-r12-claude-haiku-5-5.json").exists()


def test_r12_vijf_keer_onvolledig_op_rij_stopt(tmp_path, monkeypatch):
    pm, mf, docs = toets_pm(tmp_path, 7)
    client = Haiku(antwoord(zonder=(GV,)))
    monkeypatch.setattr(mod("openrouter"), "Client", lambda *a, **k: client)
    schrijf(pm / "toets" / "nieuw.json", docs)
    argv = ["voorinvulling", "--proef-map", str(pm), "--manifest", str(mf / "manifest.json"), "--zdr-logo",
            str(pm / "logo.png"), "--docs", str(pm / "toets" / "nieuw.json"), "--model", HAIKU, "--met-glutenvrij"]
    with pytest.raises(SystemExit):
        mod("toets").main(argv)
    assert len(client.calls) == 5


def test_r12_haiku_verwachting_per_aanroep_in_reservering_en_startprojectie(tmp_path, monkeypatch):
    client = Haiku(antwoord())
    pm, docs, rc = draai_r12(tmp_path, monkeypatch, client, extra=("--grens", "0.05", "--besluit", "test"))
    assert rc == 0  # 2 kleine etiketten × $0,005 past onder $0,05; met $0,06 per aanroep zou de start weigeren
    assert {c["verwacht"] for c in client.calls} == {mod("toets").PER_AANROEP_HAIKU} == {0.005}


# --- bouw.py: pagina met alleen de nieuwe etiketten ----------------------------------------------------------------------
def png_maat(pad):
    with open(pad, "rb") as f:
        kop = f.read(24)
    return struct.unpack(">II", kop[16:24])


def items_map(tmp_path, n=2, leeg=None, deels=None):
    """Proefmap-achtige toetsmap met items-r12 (beelden/<doc>.png plus één uitsnede) en een koppeltabel."""
    t = tmp_path / "toets"
    (t / "beelden").mkdir(parents=True)
    items, assets = [], {}
    for i in range(n):
        d = f"9999999000000-{9999990000100 + i:014d}-528"
        (t / "beelden" / f"{d}.png").write_bytes(png((300 + i, 120)))
        h = f"{d}-{GV}-0.png"
        (t / "beelden" / h).write_bytes(png((40, 40)))
        k = {c: False for c in LOS12} | {GV: True}
        v = {"keurmerken": k, "nutriscore": ["C"], "hinttegels": {GV: [0]}, "model": HAIKU, "ronde": 12}
        if leeg == i:
            v = {"keurmerken": {}, "nutriscore": [], "fout": "geweigerd", "model": HAIKU, "ronde": 12}
        if deels == i:
            del v["keurmerken"][GV]
        items.append({"id": d, "beeld": f"beelden/{d}.png", "hint": [f"beelden/{h}"], "voorinvulling": v})
        assets[f"{d}.png"] = f"/_blob/{'a' * 31}{i}"
        assets[h] = f"/_blob/{'b' * 31}{i}"
    ip = schrijf(t / "items-r12-claude-haiku-5-5.json", items)
    ap = schrijf(tmp_path / "koppeltabel.json", assets)
    return ip, ap, items, assets


def bouw():
    return mod("invul.artefact.bouw")


def test_r12_bouw_alleen_nieuwe_etiketten_met_assets_en_ware_maat(tmp_path):
    ip, ap, items, assets = items_map(tmp_path)
    uit = tmp_path / "uit" / "pagina.html"
    telling = bouw().bouw_nieuw(ip, ap, uit)
    assert telling["etiketten"] == 2
    tekst = uit.read_text(encoding="utf-8")
    regel = next(r for r in tekst.split("\n") if r.startswith("const ITEMS = "))
    nieuw = json.loads(regel[len("const ITEMS = "):-1].replace("<\\/", "</"))
    assert [i["id"] for i in nieuw] == [i["id"] for i in items]
    for it, bron in zip(nieuw, items):
        assert it["beeld"] == assets[f"{bron['id']}.png"]
        naam = bron["hint"][0].split("/")[-1]
        assert it["hint"] == [{"u": assets[naam], "n": naam}]
        assert (it["ww"], it["wh"]) == png_maat(ip.parent / bron["beeld"])
        assert set(it["voorinvulling"]["keurmerken"]) == set(LOS12) | {GV} and it["voorinvulling"]["nutriscore"] == ["C"]
    zonder = lambda t_: [r for r in t_.split("\n") if not r.startswith("const ITEMS = ")]  # noqa: E731
    assert zonder(tekst) == zonder((HIER / "invul" / "artefact" / "sjabloon.html").read_text(encoding="utf-8"))


def test_r12_bouw_neemt_een_lege_voorinvulling_mee(tmp_path):
    ip, ap, items, _ = items_map(tmp_path, leeg=1)
    uit = tmp_path / "pagina.html"
    bouw().bouw_nieuw(ip, ap, uit)
    regel = next(r for r in uit.read_text(encoding="utf-8").split("\n") if r.startswith("const ITEMS = "))
    nieuw = json.loads(regel[len("const ITEMS = "):-1])
    assert nieuw[1]["voorinvulling"] == {"keurmerken": {}, "nutriscore": []}


@pytest.mark.parametrize("geval", ["koppeling_mist", "deels", "dubbel", "git", "nutriscore", "koppel_geen_object",
                                   "url_leeg", "zonder_beeld", "png_afgekapt"])
def test_r12_bouw_nieuw_weigert_en_schrijft_niets(tmp_path, geval):
    ip, ap, items, assets = items_map(tmp_path, deels=0 if geval == "deels" else None)
    uit = tmp_path / "pagina.html"
    if geval == "koppeling_mist":
        del assets[items[1]["hint"][0].split("/")[-1]]
        schrijf(ap, assets)
    elif geval == "dubbel":
        schrijf(ip, items + [items[0]])
    elif geval == "git":
        uit = HIER / "invul" / "artefact" / "nog-niet" / "pagina.html"
    elif geval == "nutriscore":
        items[0]["voorinvulling"]["nutriscore"] = ["F"]
        schrijf(ip, items)
    elif geval == "koppel_geen_object":
        ap.write_text("[1]")
    elif geval == "url_leeg":
        schrijf(ap, {k: "" for k in assets})
    elif geval == "zonder_beeld":
        del items[0]["beeld"]
        schrijf(ip, items)
    elif geval == "png_afgekapt":
        (ip.parent / items[0]["beeld"]).write_bytes(b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR")
    with pytest.raises(ValueError):
        bouw().bouw_nieuw(ip, ap, uit)
    assert not uit.exists()


def test_r12_lijst_schrijft_de_te_uploaden_beelden(tmp_path):
    ip, _, items, _ = items_map(tmp_path)
    lijst = tmp_path / "upload.txt"
    assert bouw().main(["--items", str(ip), "--lijst", str(lijst)]) == 0
    regels = lijst.read_text().splitlines()
    verwacht = sorted({str((ip.parent / p).resolve()) for i in items for p in [i["beeld"], *i["hint"]]})
    assert sorted(regels) == verwacht


def test_r12_lijst_in_git_werkboom_geweigerd(tmp_path):
    ip, *_ = items_map(tmp_path)
    doel = HIER / "invul" / "artefact" / "nog-niet" / "upload.txt"
    assert bouw().main(["--items", str(ip), "--lijst", str(doel)]) == 1
    assert not doel.exists()


@pytest.mark.parametrize("geval", ["items_met_filter", "lijst_en_uit", "assets_zonder_uit", "niets", "assets_zonder_items"])
def test_r12_main_weigert_verkeerde_combinaties(tmp_path, geval):
    ip, ap, *_ = items_map(tmp_path)
    uit = str(tmp_path / "p.html")
    argv = {"items_met_filter": ["--items", str(ip), "--assets", str(ap), "--uit", uit, "--alleen-ai-glutenvrij"],
            "lijst_en_uit": ["--items", str(ip), "--lijst", str(tmp_path / "l.txt"), "--uit", uit],
            "assets_zonder_uit": ["--items", str(ip), "--assets", str(ap)],
            "niets": [],
            "assets_zonder_items": ["--bron", str(ip), "--voorinvulling", str(ip), "--uit", uit, "--assets", str(ap)]}[geval]
    with pytest.raises(SystemExit) as e:
        bouw().main(argv)
    assert e.value.code == 2 and not (tmp_path / "p.html").exists()


def test_r12_main_bouwt_nieuw_en_drukt_af(tmp_path, capsys):
    ip, ap, *_ = items_map(tmp_path)
    uit = tmp_path / "pagina.html"
    assert bouw().main(["--items", str(ip), "--assets", str(ap), "--uit", str(uit)]) == 0
    assert capsys.readouterr().out.startswith("2 nieuwe etiketten") and uit.exists()


# --- browser: nieuwe etiketten open naast oude records ---------------------------------------------------------------
@pytest.mark.browser
def test_r12_pagina_nieuwe_etiketten_open_en_lege_voorinvulling_weigert(browser, tmp_path):  # noqa: F811
    from playwright.sync_api import expect

    from test_ronde11_artefact_browser_20261112 import bevestigd, keuzes12, open_pagina, tid

    ip, ap, items, _ = items_map(tmp_path, leeg=1)
    uit = tmp_path / "pagina.html"
    bouw().bouw_nieuw(ip, ap, uit)
    oud = {"9999999000000-09999990000999-528": bevestigd(keuzes12())}  # oud etiket, niet op deze pagina
    page = open_pagina(browser, tmp_path, uit.read_text(encoding="utf-8"), oud)
    try:
        expect(page.locator("#voortgang")).to_have_text("0 van 2 etiketten afgehandeld")
        expect(tid(page, "etiket-id")).to_have_text(items[0]["id"])
        page.keyboard.press("ArrowRight")
        expect(page.locator("#notitie")).to_have_text("AI-voorinvulling ontbreekt of is mislukt: vul alles zelf in.")
        page.locator("#opslaan").click()
        expect(page.locator("#melding")).to_have_class("fout")
        assert page.evaluate("window.__opslag.writes.length") == 0
    finally:
        page.context.close()


from test_cap03_invulpagina_browser import browser  # noqa: E402,F401 (fixture)


def test_r12_geen_klantcodes_in_de_nieuwe_bestanden():
    import re

    for pad in (HIER / "tests" / "test_ronde12_aanvulling_glutenvrij_20261113.py", HIER / "toets.py",
                HIER / "invul" / "artefact" / "bouw.py"):
        tekst = pad.read_text(encoding="utf-8")
        assert not re.search(r"/_blob/[0-9a-f]{32}", tekst), pad
        assert not [g for g in re.findall(r"\d{13,}", tekst) if not g.lstrip("0").startswith("999")], pad
