"""CAP-3 ronde 3 (ATDD, rode fase): het klaar-teken van de invulpagina (toetsset §6, SPEC CAP-3).

Contract (atdd-checklist, "Interfacecontract ronde 3", `invul/index.html` en Tests): `#keuzes` heeft in de HTML `inert`;
`start()` haalt het pas weg na het eerste `toon()` en `koppel()`, dus het klaar-teken is `#keuzes:not([inert])`. Lege
`items.json` → blijft `inert`, `#voortgang` bevat "geen etiketten"; `items.json` of `/stand` zonder 2xx, zonder geldige
JSON of met een mislukte fetch → blijft `inert`, `#voortgang` bevat "laden mislukt".

Rood zolang de pagina nooit `inert` zet. Alle etiketten en beelden zijn verzonnen; alleen 127.0.0.1.
"""
import json
import threading
from urllib.parse import urlparse

import pytest
from PIL import Image
from playwright.sync_api import expect, sync_playwright

from conftest import laad_klaar, wacht_klaar

pytestmark = pytest.mark.browser
expect.set_options(timeout=5_000)

K7 = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING",
      "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO")
E1, E2 = "9990000000017-09990000000011-528", "9990000000017-09990000000028-528"
VOLLEDIG = {"keurmerken": {c: c == "GREEN_DOT" for c in K7 + ("EUROPEAN_V_LABEL_VEGAN",)}, "nutriscore": [], "hinttegels": {},
            "gelijkend": []}  # ronde 5: V-label hoort bij volledig
# E1 mist WEIDEMELK in de voorinvulling: `b` moet daar weigeren ("Kies eerst …") en blijven staan.
ZONDER_WM = {**VOLLEDIG, "keurmerken": {c: v for c, v in VOLLEDIG["keurmerken"].items() if c != "WEIDEMELK"}}
ITEMS = [{"id": E1, "beeld": "beelden/0.png", "hint": [], "voorinvulling": ZONDER_WM},
         {"id": E2, "beeld": "beelden/0.png", "hint": [], "voorinvulling": VOLLEDIG}]
CONCEPT = "concept van eerder"

# Vertraagt in de pagina zelf de fetch van items.json, zodat /stand er altijd eerder is (geen wachttijd in de test).
VERTRAAG_ITEMS = """
const echt = window.fetch;
window.fetch = (bron, ...rest) => String(bron).includes('items.json')
  ? new Promise((klaar) => setTimeout(klaar, 1000)).then(() => echt.call(window, bron, ...rest))
  : echt.call(window, bron, ...rest);
"""
ZET_CONCEPT = f"sessionStorage.setItem('concept:{E1}', JSON.stringify({{opmerking: '{CONCEPT}'}}));"
GEEN_FOCUS = "() => { const t = document.getElementById('opmerking'); t.focus(); return document.activeElement === t; }"


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.fixture
def start_server(tmp_path):
    """Start de invulserver op een map met de gegeven items; geeft de basis-URL terug."""
    from invul.server import maak_server

    servers = []

    def start(items):
        (tmp_path / "beelden").mkdir()
        Image.new("RGB", (40, 30), "white").save(tmp_path / "beelden/0.png")
        (tmp_path / "items.json").write_text(json.dumps(items))
        srv = maak_server(tmp_path, 0)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        servers.append(srv)
        return f"http://127.0.0.1:{srv.server_address[1]}/"

    yield start
    for srv in servers:
        srv.shutdown()
        srv.server_close()


@pytest.fixture
def page(browser):
    context = browser.new_context()
    pagina = context.new_page()
    pagina.set_default_timeout(5_000)
    yield pagina
    context.close()


def is_pad(pad):
    return lambda r: urlparse(r.url).path == pad


def test_p0_oude_wachtregel_is_te_vroeg_klaar_teken_niet(page, start_server):
    """Deterministische demonstratie van de wankele test: /stand is binnen, items.json nog niet."""
    url = start_server(ITEMS)
    posts, gehouden = [], []
    page.on("request", lambda r: posts.append(r) if r.method == "POST" else None)
    page.route("**/items.json", lambda route: gehouden.append(route))  # items.json vastgehouden tot de test loslaat
    with page.expect_response(is_pad("/stand")):  # de OUDE wachtregel
        page.goto(url)

    assert page.evaluate("() => document.getElementById('keuzes').hasAttribute('inert')"), "nog niet klaar: inert"
    assert page.evaluate(GEEN_FOCUS) is False, "tijdens laden kan het tekstveld geen focus krijgen"
    page.keyboard.type("x")
    assert page.locator("#opmerking").input_value() == ""
    page.keyboard.press("b")  # sneltoets vóór het klaar-teken: doet niets
    assert page.locator("#melding").text_content() == ""

    assert len(gehouden) == 1
    gehouden[0].continue_()
    wacht_klaar(page)
    page.keyboard.press("b")
    expect(page.locator("#melding")).to_contain_text("Kies eerst")
    assert page.get_by_test_id("etiket-id").text_content() == E1
    assert posts == []


def test_p0_klaar_pas_na_eerste_tonen_met_concept(page, start_server):
    url = start_server(ITEMS)
    page.add_init_script(VERTRAAG_ITEMS)
    page.add_init_script(ZET_CONCEPT)

    laad_klaar(page, url)
    # Momentopnamen, geen auto-retry: op het klaar-teken staat het eerste etiket er al, mét concept.
    assert page.get_by_test_id("etiket-id").text_content() == E1
    assert page.locator("#opmerking").input_value() == CONCEPT

    laad_klaar(page)  # herladen: zelfde regel
    assert page.get_by_test_id("etiket-id").text_content() == E1
    assert page.locator("#opmerking").input_value() == CONCEPT


def test_p0_lege_items_blijft_inert(page, start_server):
    url = start_server([])
    page.goto(url)
    expect(page.locator("#voortgang")).to_contain_text("geen etiketten")
    expect(page.locator("#keuzes[inert]")).to_be_attached()  # na de melding: blijft onbruikbaar


@pytest.mark.parametrize("pad, antwoord", [
    ("items.json", {"status": 500, "body": json.dumps(ITEMS)}),  # geldige JSON, maar geen 2xx
    ("items.json", {"status": 200, "body": "geen json"}),
    ("items.json", None),  # fetch faalt
    ("stand", {"status": 500, "body": json.dumps({"uitslag": {}, "stand": {}})}),
    ("stand", {"status": 200, "body": "geen json"}),
    ("stand", {"status": 200, "body": "null"}),  # geldige JSON in de verkeerde vorm
], ids=["items-500", "items-geen-json", "items-afgebroken", "stand-500", "stand-geen-json", "stand-null"])
def test_p0_laadfout_blijft_inert_en_meldt_het(page, start_server, pad, antwoord):
    url = start_server(ITEMS)
    page.route(f"**/{pad}", lambda route: route.abort() if antwoord is None else route.fulfill(**antwoord))
    page.goto(url)
    expect(page.locator("#voortgang")).to_contain_text("laden mislukt")
    expect(page.locator("#keuzes[inert]")).to_be_attached()  # na de melding: blijft onbruikbaar
