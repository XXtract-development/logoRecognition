"""CAP-3 "Ronde 10, browser" (ATDD ronde 11d, 12-11-2026): de glutenvrij-rij van de lokale invulpagina expliciet getoetst
(SPEC CAP-3, toetsset §6 "Glutenvrij op de pagina"). De pagina zelf verandert in ronde 11d niet; deze tests leggen het
ronde-10-contract vast dat tot nu toe alleen in de broncode werd gecontroleerd. Verzonnen ids (999…), tijdelijke map.
"""
import pytest
from playwright.sync_api import expect

from conftest import laad_klaar
from test_cap03_invulpagina_browser import (  # noqa: F401 (browser is een fixture)
    browser,
    lees_uitslag,
    radio,
    volg_posts,
    wacht_op_lopende_opslagen,
)
from test_ronde7_browser_20261102 import page, start_server, tid, tussenstand, verwacht_actief  # noqa: F401
from test_ronde9_browser_20261102 import (
    LOS12,
    NOTITIE,
    OUD,
    PP,
    R5,
    klein,
    oud_bevestigd,
    schrijf_uitslag,
    vi12,
)

pytestmark = pytest.mark.browser
expect.set_options(timeout=5_000)

GV = "DIET_FREE_FROM_GLUTEN"
NS = "NUTRISCORE"
VEERTIEN = LOS12 + (GV, NS)
NAAR_PP = VEERTIEN.index(PP)  # pijl-omlaag vanaf de eerste rij tot PlanetProof
NAAR_GV = VEERTIEN.index(GV)
NAAR_NS = VEERTIEN.index(NS)


def vi_gv(gv=True, aanwezig=(), nutriscore=("B",)):
    v = vi12(set(aanwezig), list(nutriscore))
    v["keurmerken"][GV] = gv
    return v


def test_r11d_glutenvrij_rij_na_planetproof_voor_nutriscore_met_alle_delen(page, start_server):
    laad_klaar(page, start_server([klein(951, vi_gv(True))]))
    rijen = page.locator('#standen [data-testid^="rij-"]')
    expect(rijen).to_have_count(14)
    assert [r.get_attribute("data-testid") for r in rijen.all()] == [f"rij-{c}" for c in VEERTIEN]
    groepen = page.locator('#keuzes [role="radiogroup"]')
    expect(groepen).to_have_count(13)
    rij = page.locator("#standen").get_by_test_id(f"rij-{GV}")
    for deel in (f"keuze-{GV}", f"stand-{GV}", f"ai-{GV}", f"gewijzigd-{GV}"):
        expect(rij.get_by_test_id(deel)).to_have_count(1)
    expect(rij.get_by_test_id(f"keuze-{GV}")).to_have_attribute("aria-label", "Glutenvrij")
    expect(radio(page, GV, "aanwezig")).to_be_checked()  # voorgevuld uit de voorinvulling
    expect(radio(page, GV, "aanwezig").locator("xpath=..")).to_have_attribute("data-ai", "true")
    expect(tid(page, f"stand-{GV}")).to_contain_text("16")


def test_r11d_bevestigen_zonder_glutenvrij_slaat_op_zonder_glutenvrij(page, start_server, tmp_path):
    posts = volg_posts(page)
    e = klein(952, vi12(set(), ["B"]))  # voorinvulling zonder glutenvrij: geen keuze in die rij
    laad_klaar(page, start_server([e]))
    for w in ("aanwezig", "afwezig", "onzeker"):
        expect(radio(page, GV, w)).not_to_be_checked()
    page.keyboard.press("b")
    expect(page.locator("#melding")).to_contain_text("Opgeslagen")
    expect(page.locator("#melding")).not_to_have_class("fout")
    wacht_op_lopende_opslagen(posts)
    r = lees_uitslag(tmp_path)[e["id"]]
    assert r["status"] == "bevestigd" and GV not in r["keurmerken"] and GV not in r["bevestigde_codes"]
    assert sorted(r["bevestigde_codes"]) == sorted(LOS12)


def test_r11d_bevestigen_met_glutenvrij_zet_glutenvrij_in_bevestigde_codes(page, start_server, tmp_path):
    posts = volg_posts(page)
    e = klein(958, vi_gv(False))
    laad_klaar(page, start_server([e]))
    expect(radio(page, GV, "afwezig")).to_be_checked()  # voorgevuld uit de voorinvulling
    page.keyboard.press("b")
    expect(page.locator("#melding")).to_contain_text("Opgeslagen")
    wacht_op_lopende_opslagen(posts)
    r = lees_uitslag(tmp_path)[e["id"]]
    assert r["keurmerken"][GV] == "afwezig" and GV in r["bevestigde_codes"]
    assert sorted(r["bevestigde_codes"]) == sorted(LOS12 + (GV,))


def test_r11d_123_schuift_door_tot_glutenvrij_en_blijft_daar(page, start_server):
    laad_klaar(page, start_server([klein(953, vi_gv(False))]))
    for _ in range(NAAR_PP):
        page.keyboard.press("ArrowDown")
    verwacht_actief(page, PP)
    assert tussenstand(page, "3")["waarde"]["keurmerken"][PP] == "onzeker"
    verwacht_actief(page, GV)  # PlanetProof schuift door naar glutenvrij
    assert tussenstand(page, "1")["waarde"]["keurmerken"][GV] == "aanwezig"
    verwacht_actief(page, GV)  # laatste keuzerij: blijft, nooit automatisch naar Nutri-Score
    assert tussenstand(page, "2")["waarde"]["keurmerken"][GV] == "afwezig"
    verwacht_actief(page, GV)


def test_r11d_456_en_0_doen_niets_op_glutenvrij(page, start_server):
    posts = volg_posts(page)
    laad_klaar(page, start_server([klein(954, vi_gv(True))]))
    for _ in range(NAAR_GV):
        page.keyboard.press("ArrowDown")
    verwacht_actief(page, GV)
    wacht_op_lopende_opslagen(posts)
    n = len(posts)
    for toets in ("4", "5", "0"):
        page.keyboard.press(toets)
    expect(radio(page, GV, "aanwezig")).to_be_checked()
    for x in "ABCDE":
        expect(tid(page, f"ns-{x}")).to_be_checked() if x == "B" else expect(tid(page, f"ns-{x}")).not_to_be_checked()
    expect(tid(page, "ns-onleesbaar")).not_to_be_checked()
    verwacht_actief(page, GV)
    body = tussenstand(page, "3")  # ijkpunt: alleen deze POST mag erbij zijn gekomen
    wacht_op_lopende_opslagen(posts)
    assert len(posts) == n + 1 and body["waarde"]["keurmerken"][GV] == "onzeker"


def test_r11d_pijlen_13_omlaag_is_nutriscore_en_terug_is_glutenvrij(page, start_server):
    laad_klaar(page, start_server([klein(955, vi_gv(True))]))
    verwacht_actief(page, R5[0])
    for _ in range(NAAR_NS):
        page.keyboard.press("ArrowDown")
    verwacht_actief(page, NS)
    page.keyboard.press("ArrowDown")
    verwacht_actief(page, NS)  # grens: index 13
    page.keyboard.press("ArrowUp")
    verwacht_actief(page, GV)
    for _ in range(len(VEERTIEN)):
        page.keyboard.press("ArrowUp")
    verwacht_actief(page, R5[0])  # grens: index 0


def test_r11d_glutenvrij_valt_buiten_het_nalopen(page, start_server, tmp_path):
    """Een bevestigd etiket met de 12 losse codes maar zonder glutenvrij is op de lokale pagina niet na te lopen;
    een etiket van vóór ronde 9 blijft na te lopen met de notitie over de vier."""
    a, b = klein(956, vi_gv(True)), klein(957, vi_gv(True))
    twaalf = {**oud_bevestigd(OUD), "keurmerken": {c: "afwezig" for c in LOS12}, "bevestigde_codes": sorted(LOS12)}
    schrijf_uitslag(tmp_path, {a["id"]: twaalf, b["id"]: oud_bevestigd(OUD)})
    laad_klaar(page, start_server([a, b]))
    expect(page.locator("#voortgang")).to_have_text("1 van 2 etiketten afgehandeld · 1 na te lopen")
    expect(tid(page, "etiket-id")).to_have_text(b["id"])
    expect(page.locator("#notitie")).to_have_text(NOTITIE)
