"""CAP-3 "Ronde 11e" (ATDD, 12-11-2026; besluit Friso "35, gelijk aan de eis"): op de lokale invulpagina toont de
glutenvrij-rij het doel zonder 35 (gelijk aan gate C); de andere rijen houden zonder 50. Tekst, tooltip en de stip
"gehaald" volgen per keurmerk het eigen doel. De stand komt nagebootst via `/stand`; verzonnen ids, tijdelijke map.
"""
import json
import re

import pytest
from playwright.sync_api import expect

from conftest import HIER, laad_klaar
from test_cap03_invulpagina_browser import browser  # noqa: F401 (fixture)
from test_ronde7_browser_20261102 import page, start_server, tid, wacht_beeld  # noqa: F401
from test_ronde9_browser_20261102 import OUD, VENSTERS, VEERTIEN as RIJEN, ZWAAR_NA, klein, oud_bevestigd, schrijf_uitslag, vi12

pytestmark = pytest.mark.browser
expect.set_options(timeout=5_000)

GV = "DIET_FREE_FROM_GLUTEN"
GD = "GREEN_DOT"
GEHAALD = re.compile(r"(^|\s)gehaald(\s|$)")


def nep_stand(page, stand):
    body = json.dumps({"uitslag": {}, "stand": stand})
    page.route("**/stand", lambda route: route.fulfill(status=200, content_type="application/json", body=body))


def test_r11e_glutenvrij_doel_35_en_andere_50(page, start_server):
    nep_stand(page, {GV: {"met": 16, "zonder": 35}, GD: {"met": 16, "zonder": 35}})
    laad_klaar(page, start_server([klein(961, vi12(set(), ["B"]))]))
    gv, gd = tid(page, f"stand-{GV}"), tid(page, f"stand-{GD}")
    expect(gv).to_have_text("mét 16/16 · zonder 35/35")
    expect(gv).to_have_class(GEHAALD)
    expect(gv).to_have_attribute("title", "Glutenvrij: mét 16/16 · zonder 35/35 (doel gehaald)")
    expect(gd).to_have_text("mét 16/16 · zonder 35/50")
    expect(gd).not_to_have_class(GEHAALD)
    expect(gd).to_have_attribute("title", "Groene Punt: mét 16/16 · zonder 35/50")


def test_r11e_glutenvrij_34_zonder_is_niet_gehaald(page, start_server):
    nep_stand(page, {GV: {"met": 20, "zonder": 34}})
    laad_klaar(page, start_server([klein(962, vi12(set(), ["B"]))]))
    gv = tid(page, f"stand-{GV}")
    expect(gv).to_have_text("mét 20/16 · zonder 34/35")
    expect(gv).not_to_have_class(GEHAALD)
    expect(gv).to_have_attribute("title", "Glutenvrij: mét 20/16 · zonder 34/35")


def test_r11e_glutenvrij_met_te_weinig_mét_niet_gehaald_en_ontbrekend_valt_terug(page, start_server):
    nep_stand(page, {GV: {"met": 15, "zonder": 40}, GD: {"met": 16, "zonder": 49}, "WEIDEMELK": {"met": 16, "zonder": 50}})
    laad_klaar(page, start_server([klein(963, vi12(set(), ["B"]))]))
    expect(tid(page, f"stand-{GV}")).to_have_text("mét 15/16 · zonder 40/35")
    expect(tid(page, f"stand-{GV}")).not_to_have_class(GEHAALD)
    expect(tid(page, f"stand-{GD}")).not_to_have_class(GEHAALD)
    expect(tid(page, "stand-WEIDEMELK")).to_have_class(GEHAALD)


def test_r11e_glutenvrij_zonder_stand_toont_nul_van_35(page, start_server):
    nep_stand(page, {})
    laad_klaar(page, start_server([klein(964, vi12(set(), ["B"]))]))
    expect(tid(page, f"stand-{GV}")).to_have_text("mét 0/16 · zonder 0/35")
    expect(tid(page, f"stand-{GD}")).to_have_text("mét 0/16 · zonder 0/50")


def test_r11e_paginadoel_glutenvrij_gelijk_aan_gate_c():
    import train

    tekst = (HIER / "invul" / "index.html").read_text(encoding="utf-8")
    m = re.search(r"DOEL_ZONDER_PER = \{DIET_FREE_FROM_GLUTEN: (\d+)\}", tekst)
    assert m and int(m.group(1)) == train.MIN_ZONDER


def test_r11e_paginabestanden_blijven_gelijk():
    assert (HIER / "invul" / "index.html").read_bytes() == (HIER / "invul" / "index-ronde10.html").read_bytes()


@pytest.mark.parametrize("venster", VENSTERS, ids=lambda v: f"{v[0]}x{v[1]}")
def test_r11e_langste_standtekst_houdt_alles_op_een_scherm(page, start_server, tmp_path, venster):
    """Langste stand in elke rij (352 etiketten): 'mét 352/16 · zonder 352/35' of '/50'; het paneel heeft geen speling (ronde 11d)."""
    page.set_viewport_size({"width": venster[0], "height": venster[1]})
    nep_stand(page, {c: {"met": 352, "zonder": 352} for c in RIJEN})  # langste tekst in elke rij
    schrijf_uitslag(tmp_path, {e["id"]: oud_bevestigd(OUD) for e in ZWAAR_NA})  # notitie zichtbaar
    laad_klaar(page, start_server(ZWAAR_NA))
    wacht_beeld(page, ZWAAR_NA[0]["maat"][0])
    page.keyboard.press("b")  # lange weigermelding zichtbaar
    expect(tid(page, f"stand-{GV}")).to_have_text("mét 352/16 · zonder 352/35")
    maat = page.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight, "
                         "innerWidth, innerHeight]")
    assert maat[0] <= maat[2] and maat[1] <= maat[3], maat
    paneel = page.locator("#keuzes").evaluate("e => [e.scrollHeight, e.clientHeight]")
    assert paneel[0] <= paneel[1] + 1, paneel
    for code in RIJEN:
        m = tid(page, f"rij-{code}").evaluate("""(r) => {
          const s = r.querySelector('[data-testid^="stand-"]'), regel = s.parentElement;
          return {h: r.getBoundingClientRect().height, sw: regel.scrollWidth, cw: regel.clientWidth}; }""")
        assert m["h"] <= 32.5 and m["sw"] <= m["cw"], (code, m)
