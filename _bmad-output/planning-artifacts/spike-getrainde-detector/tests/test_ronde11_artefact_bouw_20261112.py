"""CAP-19 ronde 11 (ATDD; groen sinds de bouw van 12-11-2026): bouwscript van de beoordelingspagina (SPEC CAP-19, toetsset.md §6a "Bron en bouw").

Contract: `invul/artefact/bouw.py` met `bouw(bron, voorinvulling, uit) -> {"etiketten", "aanwezig", "afwezig"}`; een
weigering is een `ValueError` en schrijft niets; `main` geeft dan 1. Rode run 12-11-2026: script bestond niet.
Verzonnen etiketcodes; zonder Playwright te draaien.
"""
import json
import re

import pytest

from conftest import HIER
from ronde11_hulp import GV, eid, item, vi, vul

ARTEFACT = HIER / "invul" / "artefact"
SJABLOON = ARTEFACT / "sjabloon.html"
IDS = [eid(n) for n in range(1, 5)]


def bouw_mod():
    from invul.artefact import bouw
    return bouw


def schrijf(tmp_path, items, oordelen):
    bron = tmp_path / "bron.html"
    bron.write_text(vul(items), encoding="utf-8")
    r10 = tmp_path / "r10.json"
    r10.write_text(json.dumps({i: {"keurmerken": {GV: v}, "model": "nep"} for i, v in oordelen.items()}), encoding="utf-8")
    return bron, r10


def items_uit(html):
    regels = [r for r in html.split("\n") if r.startswith("const ITEMS = ")]
    assert len(regels) == 1
    return json.loads(regels[0][len("const ITEMS = "):].rstrip(";"))


@pytest.fixture
def basis(tmp_path):
    items = [item(i, vi(aanwezig=("GREEN_DOT",) if n == 0 else ())) for n, i in enumerate(IDS)]
    oordelen = {IDS[0]: True, IDS[1]: False, IDS[2]: False, IDS[3]: True}
    return items, oordelen


# --- P0 -----------------------------------------------------------------------------------------------------------------
def test_zet_glutenvrij_in_items_en_laat_de_rest_gelijk(tmp_path, basis):
    items, oordelen = basis
    bron, r10 = schrijf(tmp_path, items, oordelen)
    uit = tmp_path / "nieuw" / "pagina.html"
    telling = bouw_mod().bouw(bron, r10, uit)
    assert telling == {"etiketten": 4, "aanwezig": 2, "afwezig": 2, "totaal": 4}
    nieuw = items_uit(uit.read_text(encoding="utf-8"))
    verwacht = json.loads(json.dumps(items))
    for it in verwacht:
        it["voorinvulling"]["keurmerken"][GV] = oordelen[it["id"]]
    assert nieuw == verwacht


def test_buiten_items_regel_bytegelijk_aan_sjabloon(tmp_path, basis):
    bron, r10 = schrijf(tmp_path, *basis)
    uit = tmp_path / "pagina.html"
    bouw_mod().bouw(bron, r10, uit)
    zonder = lambda t: [r for r in t.split("\n") if not r.startswith("const ITEMS = ")]  # noqa: E731
    assert zonder(uit.read_text(encoding="utf-8")) == zonder(SJABLOON.read_text(encoding="utf-8"))
    assert uit.read_bytes().endswith(b"</html>\n")


def test_herbouwen_vanaf_gebouwde_bron_geeft_hetzelfde(tmp_path, basis):
    """Een bron die al het oordeel draagt (vorige bouw), met hetzelfde oordeel: geen weigering, zelfde uitkomst."""
    bron, r10 = schrijf(tmp_path, *basis)
    eerst = tmp_path / "a.html"
    bouw_mod().bouw(bron, r10, eerst)
    tweede = tmp_path / "b.html"
    bouw_mod().bouw(eerst, r10, tweede)
    assert tweede.read_bytes() == eerst.read_bytes()


@pytest.mark.parametrize("geval", ["ontbreekt", "geen_bool", "onbekend_id", "dubbel_id", "zonder_voorinvulling",
                                   "afwijkend_bestaand"])
def test_weigert_en_schrijft_niets(tmp_path, basis, geval):
    items, oordelen = basis
    items = json.loads(json.dumps(items))
    if geval == "ontbreekt":
        del oordelen[IDS[2]]
    elif geval == "geen_bool":
        oordelen[IDS[2]] = "ja"
    elif geval == "onbekend_id":
        oordelen[eid(99)] = True
    elif geval == "dubbel_id":
        items.append(json.loads(json.dumps(items[0])))
    elif geval == "zonder_voorinvulling":
        items[1]["voorinvulling"] = {}
    elif geval == "afwijkend_bestaand":
        items[1]["voorinvulling"]["keurmerken"][GV] = True  # oordeel zegt False
    bron, r10 = schrijf(tmp_path, items, oordelen)
    uit = tmp_path / "pagina.html"
    with pytest.raises(ValueError):
        bouw_mod().bouw(bron, r10, uit)
    assert not uit.exists()


def test_weigert_uitvoer_binnen_git_werkboom(tmp_path, basis):
    bron, r10 = schrijf(tmp_path, *basis)
    uit = HIER / "invul" / "artefact" / "nog-niet-bestaand" / "pagina.html"
    with pytest.raises(ValueError):
        bouw_mod().bouw(bron, r10, uit)
    assert not uit.parent.exists()


def test_main_drukt_telling_af(tmp_path, basis, capsys):
    bron, r10 = schrijf(tmp_path, *basis)
    uit = tmp_path / "pagina.html"
    assert bouw_mod().main(["--bron", str(bron), "--voorinvulling", str(r10), "--uit", str(uit)]) == 0
    tekst = capsys.readouterr().out
    assert tekst.startswith("4 etiketten; glutenvrij aanwezig 2, afwezig 2;") and uit.exists()


def test_main_weigert_met_code_1_en_schrijft_niets(tmp_path, basis, capsys):
    items, oordelen = basis
    del oordelen[IDS[2]]
    bron, r10 = schrijf(tmp_path, items, oordelen)
    uit = tmp_path / "pagina.html"
    assert bouw_mod().main(["--bron", str(bron), "--voorinvulling", str(r10), "--uit", str(uit)]) == 1
    assert capsys.readouterr().err.startswith("geweigerd: ")
    assert not uit.exists()


def test_weigert_uitvoer_in_git_map(tmp_path, basis):
    bron, r10 = schrijf(tmp_path, *basis)
    uit = tmp_path / "x" / ".git" / "pagina.html"
    with pytest.raises(ValueError):
        bouw_mod().bouw(bron, r10, uit)
    assert not (tmp_path / "x").exists()


def test_scriptafsluiting_in_items_wordt_onschadelijk(tmp_path, basis):
    items, oordelen = basis
    items[0]["hint"] = [{"u": "/x", "n": "a</script><b>.png"}]
    bron, r10 = schrijf(tmp_path, items, oordelen)
    uit = tmp_path / "pagina.html"
    bouw_mod().bouw(bron, r10, uit)
    html = uit.read_text(encoding="utf-8")
    assert html.count("</script>") == 1
    assert items_uit(html)[0]["hint"][0]["n"] == "a</script><b>.png"


# --- P0: publieke repository --------------------------------------------------------------------------------------------
def test_documenten_van_de_proef_bevatten_geen_etiketcodes():
    """Publieke repository: geen GLN/GTIN (13+ cijfers) in de spec, companions en memlog van de proefmap."""
    for pad in [*HIER.glob("*.md"), HIER / ".memlog.md", *(HIER / "invul-ux").glob("*.md")]:
        assert not re.search(r"\d{13,}", pad.read_text(encoding="utf-8")), pad


def test_sjabloon_en_map_bevatten_geen_klantdata():
    tekst = SJABLOON.read_text(encoding="utf-8")
    assert tekst.count("const ITEMS = [];\n") == 1
    for pad in ARTEFACT.rglob("*"):
        if pad.is_file() and "__pycache__" not in pad.parts:
            inhoud = pad.read_text(encoding="utf-8")
            assert not re.search(r"/_blob/[0-9a-f]", inhoud), pad
            assert not re.search(r"\d{13,}", inhoud), pad



# --- Ronde 11b (besluit Friso 12-11-2026, "35, rest volgt de AI"): --alleen-ai-glutenvrij -------------------------------
def test_11b_filter_houdt_precies_de_ai_glutenvrij_etiketten_in_bronvolgorde(tmp_path, basis):
    items, oordelen = basis  # IDS[0] en IDS[3] true, IDS[1] en IDS[2] false
    bron, r10 = schrijf(tmp_path, items, oordelen)
    uit = tmp_path / "pagina.html"
    telling = bouw_mod().bouw(bron, r10, uit, alleen_ai_glutenvrij=True)
    assert telling == {"etiketten": 2, "aanwezig": 2, "afwezig": 0, "totaal": 4}
    nieuw = items_uit(uit.read_text(encoding="utf-8"))
    verwacht = [json.loads(json.dumps(it)) for it in items if oordelen[it["id"]]]
    for it in verwacht:
        it["voorinvulling"]["keurmerken"][GV] = True
    assert nieuw == verwacht
    assert [it["id"] for it in nieuw] == [IDS[0], IDS[3]]


@pytest.mark.parametrize("geval", ["geen_bool", "zonder_voorinvulling", "afwijkend_bestaand"])
def test_11b_weigeringen_gelden_over_de_hele_bron_voor_het_filter(tmp_path, basis, geval):
    items, oordelen = basis  # IDS[1] is false: het filter zou dit etiket weglaten
    items = json.loads(json.dumps(items))
    if geval == "geen_bool":
        oordelen[IDS[1]] = "nee"
    elif geval == "zonder_voorinvulling":
        items[1]["voorinvulling"] = {}
    else:
        items[1]["voorinvulling"]["keurmerken"][GV] = True
    bron, r10 = schrijf(tmp_path, items, oordelen)
    uit = tmp_path / "pagina.html"
    with pytest.raises(ValueError, match=IDS[1]):
        bouw_mod().bouw(bron, r10, uit, alleen_ai_glutenvrij=True)
    assert not uit.exists()


def test_11b_nul_getoonde_etiketten_wordt_geweigerd(tmp_path, basis):
    items, oordelen = basis
    bron, r10 = schrijf(tmp_path, items, {i: False for i in oordelen})
    uit = tmp_path / "pagina.html"
    with pytest.raises(ValueError, match="geen enkel etiket"):
        bouw_mod().bouw(bron, r10, uit, alleen_ai_glutenvrij=True)
    assert not uit.exists()


def test_11b_verwacht_aantal_wijkt_af_wordt_geweigerd(tmp_path, basis, capsys):
    bron, r10 = schrijf(tmp_path, *basis)
    uit = tmp_path / "pagina.html"
    args = ["--bron", str(bron), "--voorinvulling", str(r10), "--uit", str(uit), "--alleen-ai-glutenvrij"]
    assert bouw_mod().main(args + ["--verwacht", "3"]) == 1
    assert "getoond 2 van 4, verwacht 3" in capsys.readouterr().err and not uit.exists()
    assert bouw_mod().main(args + ["--verwacht", "2"]) == 0 and uit.exists()


def test_11b_main_met_optie_drukt_getoond_x_van_y_af(tmp_path, basis, capsys):
    bron, r10 = schrijf(tmp_path, *basis)
    uit = tmp_path / "pagina.html"
    args = ["--bron", str(bron), "--voorinvulling", str(r10), "--uit", str(uit), "--alleen-ai-glutenvrij"]
    assert bouw_mod().main(args) == 0
    assert capsys.readouterr().out.startswith("getoond 2 van 4 etiketten (alleen AI-glutenvrij);")
    assert len(items_uit(uit.read_text(encoding="utf-8"))) == 2
