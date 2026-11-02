"""CAP-3 ronde 5 (ATDD, rode fase): het V-label als 8e losse keuze op de invulpagina (toetsset §6, SPEC CAP-3).

Contract (atdd-checklist, "Interfacecontract ronde 5", `invul/index.html` en `uitslag`): radiogroep
`data-testid="keuze-EUROPEAN_V_LABEL_VEGAN"`, naam "V-label (vegan of vegetarisch)", als 8e radiogroep in `#keuzes`,
voorgevuld uit `voorinvulling.keurmerken`; de stand toont 9 (`stand-EUROPEAN_V_LABEL_VEGAN`); `b` en opslaan als
bevestigd vragen ook de V-label-keuze; een concept zonder V-label houdt zijn keuzes en toont voor V-label de
voorinvulling. De invoerregels van §6 gelden ongewijzigd.

Rood zolang de pagina het V-label niet kent. Fixtures en helpers komen uit de bestaande browsertests; alle etiketten en
beelden zijn verzonnen; alleen 127.0.0.1.
"""
import pytest
from playwright.sync_api import expect

from conftest import laad_klaar
from test_cap03_invulpagina_browser import SPION_FOCUS, WAARNEMER_VELDEN, lees_uitslag, radio, volg_posts
from test_ronde3_browser_20261101 import E1, E2, K7, browser, is_pad, page, start_server  # noqa: F401 (fixtures)

pytestmark = pytest.mark.browser
expect.set_options(timeout=5_000)

V = "EUROPEAN_V_LABEL_VEGAN"
# Ronde 9: bevestigen vraagt ook de vier nieuwe codes; de voorinvulling vult ze (afwezig), de tests gaan over het V-label.
NIEUW_R9 = ("FOREST_STEWARDSHIP_COUNCIL_LABEL", "TRIMAN", "SOCIETY_PLASTICS_INDUSTRY", "ON_THE_WAY_TO_PLANETPROOF")
KEUZES = ("aanwezig", "afwezig", "onzeker")
E3 = "9990000000024-09990000000035-528"


def voorinvulling(aanwezig, nutriscore, v_label):
    """v_label: True/False in `keurmerken`, of None = sleutel ontbreekt (oude voorinvulling)."""
    keurmerken = {c: c in aanwezig for c in K7}
    keurmerken.update({c: False for c in NIEUW_R9})
    if v_label is not None:
        keurmerken[V] = v_label
    return {"keurmerken": keurmerken, "nutriscore": nutriscore, "hinttegels": {}, "gelijkend": []}


ITEMS = [
    {"id": E1, "beeld": "beelden/0.png", "hint": [], "voorinvulling": voorinvulling({"EU_ORGANIC_FARMING"}, ["B"], True)},
    {"id": E2, "beeld": "beelden/0.png", "hint": [], "voorinvulling": voorinvulling({"GREEN_DOT"}, [], None)},
    {"id": E3, "beeld": "beelden/0.png", "hint": [], "voorinvulling": voorinvulling(set(), ["A"], False)},
]
# Een concept van vóór ronde 5: de 7 oude keurmerken (anders dan de voorinvulling van E1), geen V-label.
OUD_CONCEPT = {
    "keurmerken": {c: {"EU_ORGANIC_FARMING": "afwezig", "GREEN_DOT": "onzeker"}.get(c, "afwezig") for c in K7},
    "nutriscore": ["C"],
    "opmerking": "oud concept",
    "nsGekozen": True,
}


def etiket(page):
    return page.get_by_test_id("etiket-id")


def test_r5_browser_v_label_keuze_bestaat_en_is_voorgevuld(page, start_server):
    laad_klaar(page, start_server(ITEMS))
    expect(etiket(page)).to_have_text(E1)

    groep = page.get_by_role("radiogroup", name="V-label (vegan of vegetarisch)", exact=True)
    expect(groep).to_have_attribute("data-testid", f"keuze-{V}")
    groepen = page.locator('#keuzes [role="radiogroup"]')
    expect(groepen).to_have_count(12)  # ronde 9: 12 losse keuzes; het V-label blijft de 8e
    expect(groepen.nth(7)).to_have_attribute("data-testid", f"keuze-{V}")
    for w in KEUZES:
        expect(radio(page, V, w)).to_have_attribute("type", "radio")

    for n, (doc, keuze) in enumerate({E1: "aanwezig", E2: None, E3: "afwezig"}.items()):
        if n:
            page.keyboard.press("ArrowRight")
        expect(etiket(page)).to_have_text(doc)
        for w in KEUZES:
            if w == keuze:
                expect(radio(page, V, w)).to_be_checked()
            else:
                expect(radio(page, V, w)).not_to_be_checked()


def test_r5_browser_stand_toont_9_en_telt_bevestigd_v_label(page, start_server):
    laad_klaar(page, start_server(ITEMS))
    expect(etiket(page)).to_have_text(E1)

    standen = page.locator('#standen [data-testid^="stand-"]')
    expect(standen).to_have_count(13)  # ronde 9: 13 keurmerken
    assert {s.get_attribute("data-testid") for s in standen.all()} == {f"stand-{c}" for c in K7 + (V,) + NIEUW_R9 + ("NUTRISCORE",)}
    stand_v = page.get_by_test_id(f"stand-{V}")
    expect(stand_v).to_contain_text("16")
    expect(stand_v).to_contain_text("50")
    expect(stand_v).to_have_attribute("data-met", "0")
    expect(stand_v).to_have_attribute("data-zonder", "0")

    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.locator("#opslaan").click()  # E1: V-label voorgevuld aanwezig
    assert antwoord.value.status == 200
    expect(stand_v).to_have_attribute("data-met", "1")

    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowRight")
    expect(etiket(page)).to_have_text(E3)
    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.locator("#opslaan").click()  # E3: V-label voorgevuld afwezig
    assert antwoord.value.status == 200
    expect(stand_v).to_have_attribute("data-zonder", "1")
    expect(stand_v).to_have_attribute("data-met", "1")


def test_r5_browser_b_weigert_zonder_v_label_keuze_en_slaat_hem_op(page, start_server, tmp_path):
    posts = volg_posts(page)
    laad_klaar(page, start_server(ITEMS))
    expect(etiket(page)).to_have_text(E1)
    page.keyboard.press("ArrowRight")
    expect(etiket(page)).to_have_text(E2)  # alle 7 en Nutri-Score voorgevuld, V-label niet

    page.keyboard.press("b")
    expect(page.locator("#melding")).to_contain_text("Kies eerst")
    expect(etiket(page)).to_have_text(E2)
    page.locator("#opslaan").click()
    expect(etiket(page)).to_have_text(E2)
    assert posts == [], "zonder V-label-keuze geen opslag als bevestigd"

    with page.expect_request(is_pad("/opslaan")) as tussenstand:
        radio(page, V, "afwezig").check()
    assert tussenstand.value.response().status == 200
    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.keyboard.press("b")
    assert antwoord.value.status == 200
    expect(etiket(page)).to_have_text(E3)

    assert [r.post_data_json["waarde"].get("status") for r in posts] == [None, "bevestigd"]
    r = lees_uitslag(tmp_path)[E2]
    assert r["status"] == "bevestigd"
    assert r["keurmerken"][V] == "afwezig"


def test_r5_browser_typen_blijft_staan_bij_opslaan_van_v_label_klik(page, start_server):
    page.add_init_script(SPION_FOCUS)
    page.add_init_script(WAARNEMER_VELDEN)
    laad_klaar(page, start_server(ITEMS))
    expect(etiket(page)).to_have_text(E1)
    with page.expect_response(is_pad("/opslaan")) as eerst:
        page.locator("#opslaan").click()  # E1 bevestigd met V-label aanwezig
    assert eerst.value.status == 200
    expect(page.locator("#voortgang")).to_contain_text("1 van 3")

    gehouden = []
    page.route("**/opslaan", lambda route: gehouden.append(route))
    page.evaluate("() => window.__startMeten()")
    with page.expect_request(is_pad("/opslaan")):
        radio(page, V, "afwezig").check()  # tussenstand; vastgehouden tot de invuller typt

    tekst = "V-label klein in de hoek"
    page.locator("#opmerking").click()
    page.keyboard.type(tekst)
    for _ in range(3):
        page.keyboard.press("ArrowLeft")
    assert page.evaluate("() => document.getElementById('opmerking').selectionStart") == len(tekst) - 3
    assert len(gehouden) == 1

    with page.expect_response(is_pad("/opslaan")) as antwoord:
        gehouden[0].continue_()
    assert antwoord.value.status == 200
    stand_v = page.get_by_test_id(f"stand-{V}")  # bevestigd blijft: de klik verschuift mét naar zonder
    expect(stand_v).to_have_attribute("data-zonder", "1")
    expect(stand_v).to_have_attribute("data-met", "0")

    assert page.evaluate("() => document.activeElement.id") == "opmerking"
    expect(page.locator("#opmerking")).to_have_value(tekst)
    assert page.evaluate(
        "() => { const v = document.getElementById('opmerking'); return [v.selectionStart, v.selectionEnd]; }"
    ) == [len(tekst) - 3, len(tekst) - 3]
    expect(etiket(page)).to_have_text(E1)
    expect(radio(page, V, "afwezig")).to_be_checked()
    assert page.evaluate("() => window.__focusSpion") is True
    assert page.evaluate("() => window.__vreemdeFocus") == []
    assert page.evaluate("() => window.__leesVerwijderd()") == []
    assert page.evaluate("() => document.getElementById('opmerking') === window.__veld && window.__veld.isConnected")


def test_r5_browser_oud_concept_zonder_v_label_houdt_keuzes_en_toont_voorinvulling(page, start_server, tmp_path):
    laad_klaar(page, start_server(ITEMS))
    expect(etiket(page)).to_have_text(E1)
    # Sleutel uit de pagina zelf (`conceptSleutel`), zoals een oudere pagina hem achterliet.
    page.evaluate("([id, c]) => sessionStorage.setItem(conceptSleutel(id), JSON.stringify(c))", [E1, OUD_CONCEPT])

    laad_klaar(page)
    expect(etiket(page)).to_have_text(E1)
    for code, keuze in OUD_CONCEPT["keurmerken"].items():
        expect(radio(page, code, keuze)).to_be_checked()
    expect(page.locator("#opmerking")).to_have_value("oud concept")
    expect(page.get_by_test_id("ns-C")).to_be_checked()
    expect(page.get_by_test_id("ns-B")).not_to_be_checked()
    expect(radio(page, V, "aanwezig")).to_be_checked()  # V-label uit de voorinvulling

    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.locator("#opslaan").click()
    assert antwoord.value.status == 200
    r = lees_uitslag(tmp_path)[E1]
    assert r["status"] == "bevestigd"
    assert r["keurmerken"] == {**OUD_CONCEPT["keurmerken"], V: "aanwezig", **{c: "afwezig" for c in NIEUW_R9}}
    assert r["nutriscore"] == ["C"]
    assert r["opmerking"] == "oud concept"
