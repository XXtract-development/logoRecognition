"""ATDD ronde 4 (01-11-2026): aanvulling vóór de bevestiging en grens voorlabels $50 (SPEC CAP-2, CAP-14, CAP-15,
CAP-10; toetsset §3–§4, randvoorwaarden §3; interfacecontract ronde 4 in de ATDD-checklist; besluiten Friso
01-11-2026). Rode fase: `kandidaten(bestaand=, maxima=, voorkeur=)`, `--alle`/`--naam`/`--print-laag-eerst`, meerdere
`--bestaand`, de JSON-melding per keurmerk, het aanvullen van `certificaten.json`, `GRENS_VOORLABELS` en het
bijgewerkte draaiplan bestaan nog niet. Verzonnen GLN's en GTIN's; geen netwerk (toetsrijen, pdftotext en client
nagebootst); alles in `tmp_path`."""
import collections
import copy
import hashlib
import json
import re
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from test_besluiten_20261101 import draaiplan, stap
from test_cap02_kandidaten import GLN, gtins, toets_rijen
from test_review_20261101 import GD, WM, mod, png, schrijf, toets_pm
from test_ronde3_20261101 import FLASH, LEEG, Gestart, Opname, echt_r3, start, uitkomst, vervang

PW, MSC, VG = "PREGNANCY_WARNING", "MARINE_STEWARDSHIP_COUNCIL_LABEL", "VEGAN_SOCIETY_VEGAN_LOGO"
POOL = "pool-met-converted-laag-20261008.txt"
BESLUIT = "besluit Friso 01-11-2026"


def sha(gtins_, seed="20261031"):
    """De vaste volgorde binnen één leverancier: sha256(seed + GTIN)."""
    return sorted(gtins_, key=lambda g: hashlib.sha256((seed + g).encode()).hexdigest())


def volgorde(**per_rij):
    """Bestaand gedrag als orakel: de vaste volgorde (om de beurt per leverancier) van alles in deze rijen."""
    return [i["gtin"] for i in mod("toets").kandidaten(toets_rijen(**per_rij), {}, max_per=10_000)]


def soort(i):
    return "NUTRISCORE" if i["reden"].startswith("NUTRISCORE_") else i["reden"]


# --- toets.kandidaten: bestaand, maxima, voorkeur (CAP-2 aanvulling) ---------------------------------------------------

def test_r4_bestaande_kandidaten_komen_niet_terug_en_tellen_niet_mee():  # P0
    ts = mod("toets")
    rijen = toets_rijen(PREGNANCY_WARNING={"A": gtins("A", 20), "B": gtins("B", 15)})
    vol = ts.kandidaten(rijen, {}, max_per=10_000)  # de volledige vaste volgorde, om de beurt over twee leveranciers
    bestaand = {vol[k]["gtin"] for k in (0, 1, 2, 7, 8, 20)}  # vier ervan horen bij de eerste tien
    uit = ts.kandidaten(rijen, {}, max_per=10, bestaand=bestaand)
    assert uit == [i for i in vol if i["gtin"] not in bestaand][:10]  # de "volgende" tien, niet tien min de bestaande
    assert len(uit) == 10 and not {i["gtin"] for i in uit} & bestaand
    assert ts.kandidaten(rijen, {}, max_per=10) == vol[:10]  # zonder de nieuwe argumenten: bestaand gedrag


def test_r4_print_laag_eerst_daarna_de_rest_maximum_over_beide_delen():  # P0
    ts = mod("toets")
    a, b = sha(gtins("A", 8)), sha(gtins("B", 5))
    # print-laag = de laatste in de vaste volgorde van elke leverancier (A 2, B 1): zonder voorkeur kwamen ze als laatste
    voorkeur = {(GLN["A"], g) for g in a[6:]} | {(GLN["B"], g) for g in b[4:]} | {(GLN["C"], "29999999999999")}
    eerst, rest = volgorde(PREGNANCY_WARNING={"A": set(a[6:]), "B": set(b[4:])}), \
        volgorde(PREGNANCY_WARNING={"A": set(a[:6]), "B": set(b[:4])})
    assert len(eerst) == 3 and not set(eerst) & set(volgorde(PREGNANCY_WARNING={"A": set(a), "B": set(b)})[:9])
    rijen = toets_rijen(PREGNANCY_WARNING={"A": set(a), "B": set(b)})
    gtin = lambda uit: [i["gtin"] for i in uit]  # noqa: E731
    assert gtin(ts.kandidaten(rijen, {}, max_per=10_000, voorkeur=voorkeur)) == eerst + rest
    assert gtin(ts.kandidaten(rijen, {}, max_per=5, voorkeur=voorkeur)) == eerst + rest[:2]  # 3 print-laag + 2 rest
    assert gtin(ts.kandidaten(rijen, {}, max_per=2, voorkeur=voorkeur)) == eerst[:2]  # klein maximum: alleen print-laag


def test_r4_eigen_maximum_per_keurmerk_none_is_alles_ook_boven_40():  # P0
    ts = mod("toets")
    pw_a = gtins("A", 30, "4")
    rijen = toets_rijen(PREGNANCY_WARNING={"A": pw_a, "B": gtins("B", 27, "4")}, WEIDEMELK={"C": gtins("C", 12, "5")},
                        NUTRISCORE_A={"A": gtins("A", 5, "6")}, NUTRISCORE_B={"B": gtins("B", 5, "6")},
                        GREEN_DOT={"B": gtins("B", 9, "7")})
    bestaand = set(sorted(pw_a)[:3])
    uit = ts.kandidaten(rijen, {}, max_per=3, bestaand=bestaand, maxima={PW: None, WM: 5, "NUTRISCORE": 4})
    tel = collections.Counter(soort(i) for i in uit)
    assert tel == {PW: 57 - 3, WM: 5, "NUTRISCORE": 4, GD: 3}  # GD (geen sleutel): max_per
    assert tel[PW] > 40
    assert [i for i in uit if i["reden"] == WM] == ts.kandidaten(toets_rijen(WEIDEMELK={"C": gtins("C", 12, "5")}), {},
                                                                  max_per=5)


def test_r4_gtin_bij_twee_keurmerken_een_keer_gekozen():  # P0
    ts = mod("toets")
    gedeeld, m, v = gtins("A", 4, "3"), gtins("A", 3, "4"), gtins("A", 2, "5")
    rijen = toets_rijen(MARINE_STEWARDSHIP_COUNCIL_LABEL={"A": gedeeld | m}, VEGAN_SOCIETY_VEGAN_LOGO={"A": gedeeld | v})
    uit = ts.kandidaten(rijen, {}, max_per=1, maxima={MSC: None, VG: None})
    assert max(collections.Counter(i["gtin"] for i in uit).values()) == 1
    assert {i["gtin"] for i in uit} == gedeeld | m | v and len(uit) == 9
    assert {i["reden"] for i in uit} <= {MSC, VG}


# --- toets.py kandidaten: aanvulling op de opdrachtregel ---------------------------------------------------------------

def aanvul(tmp_path, monkeypatch):
    """Proefmap met `kandidaten.json` en nagebootste toetsrijen (één leverancier per deel, dus één vaste volgorde):
    zwangerschap A 6 (alle print-laag, 2 al kandidaat) en B 7 (geen print-laag, 1 al kandidaat); Weidemelk A 7 (de
    laatste 3 print-laag, de eerste al kandidaat); MSC A 3 (alle al kandidaat); niet-gekozen Green Dot (print-laag),
    Nutri-Score en gelijkende kandidaten."""
    pm = tmp_path / "pm"
    pw_a, pw_b, wm, msc, gd = sha(gtins("A", 6, "4")), sha(gtins("B", 7, "4")), sha(gtins("A", 7, "5")), \
        sha(gtins("A", 3, "6")), gtins("B", 5, "7")
    rijen = toets_rijen(PREGNANCY_WARNING={"A": set(pw_a), "B": set(pw_b)}, WEIDEMELK={"A": set(wm)},
                        MARINE_STEWARDSHIP_COUNCIL_LABEL={"A": set(msc)}, GREEN_DOT={"B": gd},
                        NUTRISCORE_A={"B": gtins("B", 3, "3")}, NUTRISCORE_C={"C": gtins("C", 3, "3")})
    gelijkend = {PW: {GLN["C"]: gtins("C", 4, "8")}, GD: {GLN["C"]: gtins("C", 3, "9")}}
    monkeypatch.setattr(mod("toets"), "_toets_rijen", lambda _pm, kant="toets": copy.deepcopy((rijen, gelijkend)))
    pool = [(GLN["A"], g) for g in pw_a + wm[4:]] + [(GLN["B"], g) for g in sorted(gd)]
    (pm / "invoer").mkdir(parents=True)
    (pm / "invoer" / POOL).write_text("".join(f"{l}-{g}-528\n" for l, g in pool))
    oud = [(GLN["A"], g, PW) for g in pw_a[:2]] + [(GLN["B"], pw_b[0], PW), (GLN["A"], wm[0], WM)] + \
        [(GLN["A"], g, MSC) for g in msc]
    kand = schrijf(pm / "toets" / "kandidaten.json", [{"gtin": g, "gln": l, "reden": r} for l, g, r in oud])
    return SimpleNamespace(pm=pm, t=pm / "toets", kand=kand, pw_a=pw_a, pw_b=pw_b, wm=wm, msc=msc,
                           argv=["kandidaten", "--proef-map", str(pm)])


def stand(map_):
    return {p.name: p.read_bytes() for p in sorted(map_.iterdir())}


def test_r4_cli_aanvulling_meerdere_keurmerken_print_laag_eerst_en_melding(tmp_path, monkeypatch, capsys):  # P0
    p = aanvul(tmp_path, monkeypatch)
    voor = p.kand.read_bytes()
    argv = p.argv + ["--alleen", PW, "--max-per", "6", "--alle", WM, "--alle", MSC, "--bestaand", str(p.kand),
                     "--naam", "kandidaten-aanvulling-1", "--print-laag-eerst"]
    assert mod("toets").main(argv) == 0
    lijst = json.loads((p.t / "kandidaten-aanvulling-1.json").read_text())
    verwacht = [(GLN["A"], g, PW) for g in p.pw_a[2:]] + [(GLN["B"], g, PW) for g in p.pw_b[1:3]] + \
        [(GLN["A"], g, WM) for g in p.wm[4:] + p.wm[1:4]]  # per keurmerk eerst print-laag; MSC had niets meer over
    assert [(i["gln"], i["gtin"], i["reden"]) for i in lijst] == verwacht
    assert not any(i["reden"].startswith("gelijkend:") for i in lijst)  # er waren wel gelijkende en andere rijen
    assert (p.t / "kandidaten-aanvulling-1-paren.tsv").read_text() == \
        "gln\tgtin\n" + "".join(f"{l}\t{g}\n" for l, g, _ in verwacht)
    melding = json.loads(capsys.readouterr().out)
    assert melding["kandidaten"] == 12
    assert Path(melding["bestand"]).resolve() == (p.t / "kandidaten-aanvulling-1.json").resolve()
    assert melding["per_keurmerk"] == {PW: {"toegevoegd": 6, "over": 4}, WM: {"toegevoegd": 6, "over": 0},
                                       MSC: {"toegevoegd": 0, "over": 0}}
    assert p.kand.read_bytes() == voor


@pytest.mark.parametrize("naam", ["kandidaten-aanvulling-1", "kandidaten-aanvulling"], ids=["eigen-naam", "standaard"])
def test_r4_cli_aanvulling_overschrijft_nooit_een_bestaande_lijst(tmp_path, monkeypatch, capsys, naam):  # P0
    p = aanvul(tmp_path, monkeypatch)
    (p.t / f"{naam}.json").write_text('[{"gtin": "oud"}]\n')
    (p.t / f"{naam}-paren.tsv").write_text("gln\tgtin\noud\toud\n")
    voor = stand(p.t)
    extra = ["--naam", naam] if naam != "kandidaten-aanvulling" else []
    rc, tekst = uitkomst(capsys, lambda: mod("toets").main(p.argv + ["--alleen", WM, "--bestaand", str(p.kand), *extra]))
    assert rc not in (0, None), tekst
    assert "unrecognized arguments" not in tekst  # geweigerd om de bestaande lijst, niet als onbekende optie
    assert stand(p.t) == voor


def test_r4_cli_meerdere_bestaande_lijsten_geen_enkele_gtin_komt_terug(tmp_path, monkeypatch):  # P0
    p = aanvul(tmp_path, monkeypatch)
    eerder = schrijf(p.t / "kandidaten-aanvulling-1.json",
                     [{"gtin": g, "gln": GLN["A"], "reden": WM} for g in p.wm[4:]] +
                     [{"gtin": p.pw_b[1], "gln": GLN["B"], "reden": PW}])
    argv = p.argv + ["--alle", WM, "--alle", PW, "--bestaand", str(p.kand), "--bestaand", str(eerder),
                     "--naam", "kandidaten-aanvulling-2"]
    assert mod("toets").main(argv) == 0
    lijst = json.loads((p.t / "kandidaten-aanvulling-2.json").read_text())
    oud = {i["gtin"] for f in (p.kand, eerder) for i in json.loads(f.read_text())}
    assert not {i["gtin"] for i in lijst} & oud
    pw = [g for g in volgorde(PREGNANCY_WARNING={"A": set(p.pw_a), "B": set(p.pw_b)}) if g not in oud]  # om de beurt
    assert [(i["gtin"], i["reden"]) for i in lijst] == [(g, PW) for g in pw] + [(g, WM) for g in p.wm[1:4]]


@pytest.mark.parametrize("extra", [["--alleen", "ONBEKEND_LOGO", "--bestaand", "K"], ["--alle", "ONBEKEND_LOGO", "--bestaand", "K"],
                                   ["--alle", WM]], ids=["alleen-onbekend", "alle-onbekend", "alle-zonder-bestaand"])
def test_r4_cli_onbekende_code_of_alle_zonder_bestaand_exit_2_niets_geschreven(tmp_path, monkeypatch, capsys, extra):  # P0
    p = aanvul(tmp_path, monkeypatch)
    voor = stand(p.t)
    argv = p.argv + [str(p.kand) if x == "K" else x for x in extra]
    rc, tekst = uitkomst(capsys, lambda: mod("toets").main(argv))
    assert rc == 2, tekst
    assert "unrecognized arguments" not in tekst  # de code of het ontbrekende --bestaand, niet een onbekende optie
    assert stand(p.t) == voor


@pytest.mark.parametrize("extra, bestaat, rc_verwacht", [
    (["--naam", "lijst-x"], "lijst-x.json", "niet-0"),  # --naam zonder --bestaand: ook geen overschrijven
    (["--naam", "lijst-x"], "lijst-x-paren.tsv", "niet-0"),  # alleen het parenbestand bestaat
    (["--alleen", WM, "--bestaand", "K", "--naam", "../buiten"], None, 2),
    (["--alleen", WM, "--bestaand", "K", "--naam", "sub/x"], None, 2),
    (["--alleen", WM, "--bestaand", "K", "--naam", ".."], None, 2),
    (["--bestaand", "K"], None, 2),  # aanvulling zonder --alleen/--alle: zou gelijkende kandidaten nemen
    (["--alleen", WM, "--alle", WM, "--bestaand", "K"], None, 2),  # zelfde code bij beide: maximum zou vervallen
], ids=["naam-json-bestaat", "naam-paren-bestaat", "naam-buiten", "naam-submap", "naam-ouder", "bestaand-zonder-keuze",
        "alleen-en-alle-zelfde-code"])
def test_r4_cli_weigert_zonder_iets_te_schrijven(tmp_path, monkeypatch, capsys, extra, bestaat, rc_verwacht):  # P0
    p = aanvul(tmp_path, monkeypatch)
    if bestaat:
        (p.t / bestaat).write_text("oud\n")
    voor, buiten = stand(p.t), sorted(p.pm.rglob("*"))
    rc, tekst = uitkomst(capsys, lambda: mod("toets").main(p.argv + [str(p.kand) if x == "K" else x for x in extra]))
    assert (rc not in (0, None)) if rc_verwacht == "niet-0" else rc == rc_verwacht, (rc, tekst)
    assert "unrecognized arguments" not in tekst
    assert stand(p.t) == voor and sorted(p.pm.rglob("*")) == buiten  # ook niets naast of onder de toetsmap


def test_r4_cli_gewone_run_naar_toets_en_kant_train_naar_train(tmp_path, monkeypatch, capsys):  # P1, bestaand gedrag
    p = aanvul(tmp_path, monkeypatch)
    ts = mod("toets")
    rijen, gelijkend = ts._toets_rijen(p.pm)
    assert ts.main(p.argv) == 0  # zonder --bestaand/--naam: kandidaten.json wordt overschreven (stap 2 opnieuw)
    verwacht = ts.kandidaten(rijen, gelijkend)
    assert json.loads((p.t / "kandidaten.json").read_text()) == verwacht
    assert any(i["reden"].startswith("gelijkend:") for i in verwacht)
    assert (p.t / "kandidaten-paren.tsv").read_text() == "gln\tgtin\n" + "".join(f"{i['gln']}\t{i['gtin']}\n" for i in verwacht)
    assert set(json.loads(capsys.readouterr().out)["per_keurmerk"]) == set(ts.CODES)
    toets_voor = stand(p.t)
    assert ts.main(p.argv + ["--kant", "train"]) == 0
    assert json.loads((p.pm / "train" / "kandidaten.json").read_text()) == ts.kandidaten(rijen, {})  # geen gelijkende
    assert (p.pm / "train" / "kandidaten-paren.tsv").exists()
    assert stand(p.t) == toets_voor


def test_r4_cli_nutriscore_is_een_geldige_code_en_telt_per_letter(tmp_path, monkeypatch, capsys):  # P0
    p = aanvul(tmp_path, monkeypatch)
    assert mod("toets").main(p.argv + ["--alleen", "NUTRISCORE", "--max-per", "4", "--bestaand", str(p.kand)]) == 0
    lijst = json.loads((p.t / "kandidaten-aanvulling.json").read_text())  # standaardnaam bij --bestaand
    assert len(lijst) == 4 and all(i["reden"].startswith("NUTRISCORE_") for i in lijst)
    melding = json.loads(capsys.readouterr().out)
    assert melding["per_keurmerk"] == {"NUTRISCORE": {"toegevoegd": 4, "over": 2}} and melding["kandidaten"] == 4


# --- beelden.py pdftekst: certificaattekst aanvullen (CAP-15) ----------------------------------------------------------

def test_r4_pdftekst_vult_bestaande_certificaten_aan(tmp_path):  # P0
    doc = {k: f"9990000000017-0999000000{i:04d}-528" for i, k in enumerate(("oud", "her", "nul", "nieuw", "faal"))}
    cert = schrijf(tmp_path / "t" / "certificaten.json",
                   {doc["oud"]: "oude tekst", doc["her"]: "oude her", doc["nul"]: None, doc["faal"]: "oude faal"})
    tsv = tmp_path / "t" / "aanvulling-1" / "pdf-originelen.tsv"
    tsv.parent.mkdir()
    tsv.write_text("doc_id\tlocation\n" + "".join(
        f"{doc[k]}\t9990000000017/PACKAGING_ARTWORK/x/{doc[k].split('-')[1]}/528/{k}.pdf\n" for k in ("her", "nieuw", "faal")))

    def run(args):
        assert args[0] == "pdftotext"
        naam = Path(next(a for a in args if a.endswith(".pdf"))).stem
        if naam == "faal":
            raise subprocess.CalledProcessError(1, list(args))
        return f"nieuwe tekst {naam}".encode()

    argv = ["pdftekst", "--originelen", str(tsv), "--bron", str(tmp_path / "bron-raw"), "--uit", str(cert)]
    assert mod("beelden").main(argv, run=run) == 0
    assert json.loads(cert.read_text()) == {doc["oud"]: "oude tekst", doc["nul"]: None,  # buiten de lijst: ongewijzigd
                                            doc["her"]: "nieuwe tekst her", doc["nieuw"]: "nieuwe tekst nieuw",
                                            doc["faal"]: None}  # uit de lijst: de nieuwe uitkomst, ook null


def test_r4_bouwen_en_bouwen_origineel_vullen_het_manifest_aan(tmp_path):  # P0, gegevensverlies bij aanvullen
    bl, uit, bron = mod("beelden"), tmp_path / "gecombineerd", tmp_path / "bron-raw"
    oud = {"9990000000017-09990000000001-528": {"sha256": "a" * 64, "w": 1, "h": 1},
           "9990000000017-09990000000002-528": {"fout": "OSError", "bron": "origineel"}}
    mp = schrijf(uit / "manifest.json", oud)
    print_doc, orig_doc = "9990000000017-09990000000003-528", "9990000000017-09990000000004-528"
    (bron / "p").mkdir(parents=True)
    (bron / "p" / "laag.png").write_bytes(png())
    (bron / "p" / "orig.png").write_bytes(png(kleur=(10, 120, 200)))
    (tmp_path / "ophaallijst.tsv").write_text(f"doc_id\tmediaId\tconvId\tlocation\n{print_doc}\t1\t0\t/p/laag.png\n")
    (tmp_path / "originelen.tsv").write_text(f"doc_id\tlocation\n{orig_doc}\tp/orig.png\n")
    assert bl.main(["bouwen", "--ophaallijst", str(tmp_path / "ophaallijst.tsv"), "--bron", str(bron), "--uit", str(uit)]) == 0
    assert bl.main(["bouwen-origineel", "--originelen", str(tmp_path / "originelen.tsv"), "--bron", str(bron),
                    "--uit", str(uit)]) == 0
    manifest = json.loads(mp.read_text())
    assert {d: manifest[d] for d in oud} == oud  # eerdere rondes ongewijzigd
    assert "sha256" in manifest[print_doc] and manifest[orig_doc]["bron"] == "origineel" and "sha256" in manifest[orig_doc]
    assert set(manifest) == set(oud) | {print_doc, orig_doc}


# --- echt.py voorlabels: standaardgrens $50 (CAP-14, besluit Friso 01-11-2026) ----------------------------------------

def test_r4_echt_voorlabels_standaardgrens_50_projectie_per_aanroep(tmp_path, monkeypatch, capsys):  # P0
    ec = mod("echt")
    for boek, verwacht in ((49.92, "gestart"), (49.93, "geweigerd")):  # 3 grote etiketten × 2 aanroepen × 0,012 = 0,072
        argv, uit, _ = echt_r3(tmp_path / str(boek), 3, groot=True, boek=boek)
        client = vervang(monkeypatch, Opname({"vakjes": []}, model=FLASH, stop=Gestart()))
        assert start(lambda: ec.main(argv)) == verwacht, boek
        out = capsys.readouterr().out
        if verwacht == "gestart":
            assert client.kw["bewaker"].grens == pytest.approx(50.0)
            assert re.search(r"\b50\b", out), out  # de gebruikte grens staat op stdout
    assert not client.zdr and not client.calls and not uit.exists()
    assert getattr(ec, "GRENS_VOORLABELS", None) == 50.0


# --- toets.py voorinvulling na een aanvulling: alle docs op de pagina, alleen de nieuwe betaald (regressie) ------------

def test_r4_voorinvulling_na_aanvulling_alleen_nieuwe_docs_betaald(tmp_path, monkeypatch):  # P1, bestaand gedrag
    pm, mf, docs = toets_pm(tmp_path, 5)
    t = pm / "toets"
    oud = {d: {**LEEG, "keurmerken": {}, "hinttegels": {}, "model": "oud-model"} for d in docs[:3]}
    schrijf(t / "voorinvulling.json", oud)
    schrijf(t / "toets-docs.json", docs)  # oude plus de nieuwe docs uit de aanvulling
    client = vervang(monkeypatch, Opname(LEEG))
    argv = ["voorinvulling", "--proef-map", str(pm), "--manifest", str(mf / "manifest.json"), "--zdr-logo",
            str(pm / "logo.png"), "--docs", str(t / "toets-docs.json")]
    assert mod("toets").main(argv) == 0
    assert len(client.calls) == 2  # één aanroep per klein nieuw etiket
    vi = json.loads((t / "voorinvulling.json").read_text())
    assert {d: vi[d] for d in docs[:3]} == oud and all(vi[d]["model"] == client.model for d in docs[3:])
    assert [i["id"] for i in json.loads((t / "items.json").read_text())] == docs


# --- DRAAIPLAN: stap 4, 6, 9 en de kostennotitie (CAP-10) --------------------------------------------------------------

def opdrachten(tekst, script):
    """Elke opdracht `python <script> …` tot een backtick, een `#`-commentaar of het einde van de regel."""
    return [m.group(0) for m in re.finditer(rf"python3?\s+{script}\b[^`\n#]*", tekst)]


def uit_van(opdracht):
    m = re.search(r"--uit\s+(\S+)", opdracht)
    return m.group(1).strip("\"'").rstrip("/") if m else None


def test_r4_draaiplan_stap_6_aanvulling_met_eigen_naam_en_eigen_mappen():  # P2
    s6 = stap(6)
    kand = opdrachten(s6, r"toets\.py\s+kandidaten")
    assert kand and all("--bestaand" in c and "--naam" in c for c in kand), kand
    assert any("--print-laag-eerst" in c and re.search(r"--alle\s", c) for c in kand), kand
    for script in ("ophaallijst", "origineel-paden"):
        cmds = opdrachten(s6, rf"beelden\.py\s+{script}")
        assert cmds, f"stap 6 schrijft `beelden.py {script}` niet uit"
        assert all(uit_van(c) == "$T/$N" for c in cmds), cmds  # eigen map per aanvulling, geen vaste gedeelde map
    for script, doel in (("bouwen", "$T/gecombineerd"), ("bouwen-origineel", "$T/gecombineerd"),
                         ("pdftekst", "$T/certificaten.json")):
        cmds = opdrachten(s6, rf"beelden\.py\s+{script}(?![\w-])")
        assert cmds and all(uit_van(c) == doel for c in cmds), (script, cmds)
    assert opdrachten(s6, r"beelden\.py\s+ophalen")
    assert BESLUIT in s6 and re.search(r"v[oó]{2}r de bevestiging", s6)


def test_r4_draaiplan_stap_4_noemt_de_aanvulling_voor_de_bevestiging():  # P2
    s4 = stap(4)
    assert re.search(r"aanvul", s4) and re.search(r"v[oó]{2}r de bevestiging", s4) and BESLUIT in s4


def test_r4_draaiplan_stap_9_voorlabels_standaardgrens_50_zonder_grens_optie():  # P2
    s9 = stap(9)
    cmds = opdrachten(s9, r"echt\.py\s+voorlabels")
    assert cmds and not any("--grens" in c for c in cmds), cmds
    assert "GRENS_VOORLABELS" not in s9
    assert "$50" in s9 and BESLUIT in s9
    assert not re.search(r"\$15\b", s9)


def test_r4_draaiplan_kostennotitie_noemt_50_naast_65():  # P2
    blokken = re.findall(r"^> \[!note\][^\n]*Kosten[^\n]*\n(?:>[^\n]*\n?)*", draaiplan(), re.M)
    assert blokken and "$50" in blokken[0] and "$65" in blokken[0], blokken
