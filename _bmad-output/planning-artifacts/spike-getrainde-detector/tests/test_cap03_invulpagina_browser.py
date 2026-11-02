"""CAP-3 browsertest (ATDD, rode fase): wat Friso typt raakt nooit kwijt (toetsset.md §6).

Rood tot `invul/server.py` + `invul/index.html` bestaan: de server wordt in de fixture
geïmporteerd, dus elke test faalt afzonderlijk. Alle etiketten, nummers en beelden zijn verzonnen.

Selectors buiten het contract (`#opmerking`, `#voortgang`, `#opslaan`), die de pagina moet hebben:
- `data-testid="etiket-id"`: tekst is precies de `id` van het getoonde etiket;
- `data-testid="stand-<KEURMERK>"` voor elk van de 8 keurmerken, met `data-met` en `data-zonder`
  (getallen uit `/stand`) en een zichtbare tekst die de doelen 16 en 50 noemt;
- `data-testid="keuze-<CODE>"` per keurmerk van de 7: een radiogroep met inputs `value` =
  aanwezig/afwezig/onzeker, voorgevuld uit de voorinvulling;
- `data-testid="ns-<A..E>"` en `data-testid="ns-onleesbaar"`: checkboxes voor de Nutri-Score;
- `data-testid="overzicht"` (overzichtsbeeld) binnen een link `data-testid="volledig"` naar het
  beeld op volledige resolutie.
"""
import json
import threading
from urllib.parse import urljoin, urlparse

import pytest
from PIL import Image
from playwright.sync_api import expect, sync_playwright

from conftest import laad_klaar

pytestmark = pytest.mark.browser
expect.set_options(timeout=5_000)

KEURMERKEN7 = (
    "EU_ORGANIC_FARMING",
    "GREEN_DOT",
    "RECYCLABLE_GENERAL_CLAIM",
    "PREGNANCY_WARNING",
    "MARINE_STEWARDSHIP_COUNCIL_LABEL",
    "WEIDEMELK",
    "VEGAN_SOCIETY_VEGAN_LOGO",
)
KEURMERKEN8 = KEURMERKEN7 + ("NUTRISCORE",)
V_LABEL = "EUROPEAN_V_LABEL_VEGAN"  # ronde 5: 8e losse keuze, voorgevuld afwezig

# Verzonnen doc_id's (GLN-GTIN-doelmarkt); geen klantdata.
E1 = "9990000000017-09990000000011-528"
E2 = "9990000000017-09990000000028-528"
E3 = "9990000000024-09990000000035-528"
VOORGEVULD = {
    E1: ({"EU_ORGANIC_FARMING", "RECYCLABLE_GENERAL_CLAIM"}, ["B"]),
    E2: ({"GREEN_DOT"}, []),
    E3: (set(), ["A"]),
}

SPION_FOCUS = """
window.__focusSpion = true;
window.__vreemdeFocus = [];
const naam = (el) => (el ? el.id || el.getAttribute('data-testid') || el.tagName : null);
const bespied = (proto, methode) => {
  const echt = proto[methode];
  proto[methode] = function (...args) {
    if (this !== document.activeElement) {
      window.__vreemdeFocus.push({ methode, doel: naam(this), actief: naam(document.activeElement) });
    }
    return echt.apply(this, args);
  };
};
bespied(HTMLElement.prototype, 'focus');
bespied(HTMLInputElement.prototype, 'select');
bespied(HTMLTextAreaElement.prototype, 'select');
"""

WAARNEMER_VELDEN = """
window.__verwijderdeVelden = [];
window.__meten = false;
const isVeld = (n) => n.nodeType === 1
  && (n.matches('input, textarea, select') || n.querySelector('input, textarea, select') !== null);
const verwerk = (records) => {
  if (!window.__meten) return;
  for (const r of records) for (const n of r.removedNodes) if (isVeld(n)) window.__verwijderdeVelden.push(n.id || n.tagName);
};
const waarnemer = new MutationObserver(verwerk);
waarnemer.observe(document, { childList: true, subtree: true });
window.__startMeten = () => { waarnemer.takeRecords(); window.__meten = true; window.__veld = document.getElementById('opmerking'); };
window.__leesVerwijderd = () => { verwerk(waarnemer.takeRecords()); return window.__verwijderdeVelden; };
"""


def voorinvulling(aanwezig, nutriscore):
    return {
        "keurmerken": {c: c in aanwezig for c in KEURMERKEN7 + (V_LABEL,)},
        "nutriscore": nutriscore,
        "hinttegels": {c: [0] for c in sorted(aanwezig)},
        "gelijkend": [],
        "model": "anthropic/claude-sonnet-5.5",
        "kosten": 0.004,
    }


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.fixture
def invulmap(tmp_path):
    (tmp_path / "beelden").mkdir()
    items = []
    for n, (doc, (aanwezig, nutriscore)) in enumerate(VOORGEVULD.items()):
        Image.new("RGB", (40, 30), (40 * n, 120, 200)).save(tmp_path / f"beelden/{n}.png")
        Image.new("RGB", (16, 16), (200, 40 * n, 90)).save(tmp_path / f"beelden/{n}-tegel-0.png")
        items.append({
            "id": doc,
            "beeld": f"beelden/{n}.png",
            "hint": [f"beelden/{n}-tegel-0.png"],
            "voorinvulling": voorinvulling(aanwezig, nutriscore),
        })
    (tmp_path / "items.json").write_text(json.dumps(items))
    return tmp_path


@pytest.fixture
def basis_url(invulmap):
    from invul.server import maak_server  # rood tot de bouw: module ontbreekt nog

    server = maak_server(invulmap, 0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    host, poort = server.server_address[:2]
    yield f"http://{host}:{poort}/"
    server.shutdown()
    server.server_close()


@pytest.fixture
def page(basis_url, browser):
    context = browser.new_context()
    pagina = context.new_page()
    pagina.set_default_timeout(5_000)
    yield pagina
    context.close()


def is_pad(pad):
    return lambda r: urlparse(r.url).path == pad


def openen(page, url):
    """Open de pagina en wacht op het klaar-teken (geen asserts)."""
    laad_klaar(page, url)


def houd_opslaan_vast(page):
    """Klik #opslaan en houd het verzoek vast tot de test het loslaat (geen asserts)."""
    gehouden = []
    page.route("**/opslaan", lambda route: gehouden.append(route))
    with page.expect_request(is_pad("/opslaan")):
        page.locator("#opslaan").click()
    return gehouden


def lees_uitslag(map_):
    pad = map_ / "uitslag.json"
    return json.loads(pad.read_text()) if pad.exists() else {}


def concept(page, doc):
    return page.evaluate("k => sessionStorage.getItem(k)", f"concept:{doc}")


def test_p0_cursor_en_tekst_blijven_staan_bij_opslaan_en_tellerupdate(page, basis_url):
    openen(page, basis_url)
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)
    gehouden = houd_opslaan_vast(page)

    tekst = "Logo deels bedekt"
    page.locator("#opmerking").click()
    page.keyboard.type(tekst)
    for _ in range(3):
        page.keyboard.press("ArrowLeft")
    etiket_tijdens = page.get_by_test_id("etiket-id").text_content()
    voortgang_voor = page.locator("#voortgang").text_content()
    assert page.evaluate("() => document.getElementById('opmerking').selectionStart") == len(tekst) - 3
    assert len(gehouden) == 1

    with page.expect_response(is_pad("/opslaan")) as antwoord:
        gehouden[0].continue_()
    assert antwoord.value.status == 200
    expect(page.locator("#voortgang")).not_to_have_text(voortgang_voor)

    assert page.evaluate("() => document.activeElement.id") == "opmerking"
    expect(page.locator("#opmerking")).to_have_value(tekst)
    assert page.evaluate(
        "() => { const v = document.getElementById('opmerking'); return [v.selectionStart, v.selectionEnd]; }"
    ) == [len(tekst) - 3, len(tekst) - 3]
    expect(page.get_by_test_id("etiket-id")).to_have_text(etiket_tijdens)


def test_p0_sneltoetsen_doen_niets_in_het_tekstveld(page, basis_url, invulmap):
    posts = []
    page.on("request", lambda r: posts.append(r) if r.method == "POST" else None)
    openen(page, basis_url)
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)

    page.locator("#opmerking").click()
    page.keyboard.type("notitie")
    page.keyboard.press("ArrowLeft")
    page.keyboard.press("ArrowRight")
    page.keyboard.press("b")
    expect(page.locator("#opmerking")).to_have_value("notitieb")
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)

    # Tegenproef buiten het tekstveld: dezelfde toetsen werken wél.
    page.locator("#opmerking").blur()
    page.keyboard.press("ArrowRight")
    expect(page.get_by_test_id("etiket-id")).to_have_text(E2)
    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.keyboard.press("b")
    assert antwoord.value.status == 200

    # De enige POST is die van de tegenproef; een POST uit het tekstveld was eerder gekomen.
    assert [r.post_data_json["id"] for r in posts] == [E2]
    uitslag = lees_uitslag(invulmap)
    assert E1 not in uitslag
    assert uitslag[E2]["status"] == "bevestigd"
    assert uitslag[E2]["veranderd"] == []


def test_p0_concept_per_toetsaanslag_en_gaat_voor_op_serverstand(page, basis_url):
    openen(page, basis_url)
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)

    tekst = "conceptje"
    page.locator("#opmerking").click()
    for i, teken in enumerate(tekst, 1):
        page.keyboard.type(teken)
        page.wait_for_function(
            "([k, v]) => (sessionStorage.getItem(k) || '').includes(v)", arg=[f"concept:{E1}", tekst[:i]]
        )

    aanwezig, nutriscore = VOORGEVULD[E1]
    andere_stand = page.request.post(basis_url + "opslaan", data={"id": E1, "waarde": {
        "status": "bevestigd",
        "keurmerken": {c: "aanwezig" if c in aanwezig else "afwezig" for c in KEURMERKEN7 + (V_LABEL,)},
        "nutriscore": nutriscore,
        "veranderd": [],
        "opmerking": "servertekst",
        "tijd": "2026-10-31T12:00:00+00:00",
    }})
    assert andere_stand.status == 200

    laad_klaar(page)
    page.keyboard.press("ArrowLeft")  # opent de pagina op het eerste open etiket, dan terug naar E1
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)
    expect(page.locator("#opmerking")).to_have_value(tekst)


def test_p0_concept_verdwijnt_pas_na_bevestigde_opslag(page, basis_url, invulmap):
    openen(page, basis_url)
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)
    tekst = "na controle"
    page.locator("#opmerking").click()
    page.keyboard.type(tekst)

    page.route("**/opslaan", lambda route: route.fulfill(status=500, body="{}"), times=1)
    with page.expect_response(is_pad("/opslaan")) as mislukt:
        page.locator("#opslaan").click()
    assert mislukt.value.status == 500
    assert tekst in concept(page, E1)

    page.keyboard.press("ArrowLeft")  # terug naar E1, ook als de pagina na de klik doorschoof
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)
    expect(page.locator("#opmerking")).to_have_value(tekst)
    with page.expect_response(is_pad("/opslaan")) as gelukt:
        page.locator("#opslaan").click()
    assert gelukt.value.status == 200
    page.wait_for_function("k => sessionStorage.getItem(k) === null", arg=f"concept:{E1}")
    assert lees_uitslag(invulmap)[E1]["opmerking"] == tekst


def test_p0_geen_focus_of_select_op_een_ander_veld(page, basis_url):
    page.add_init_script(SPION_FOCUS)
    openen(page, basis_url)
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)

    page.locator("#opmerking").click()
    page.keyboard.type("eerste")
    voortgang_voor = page.locator("#voortgang").text_content()
    with page.expect_response(is_pad("/opslaan")):
        page.locator("#opslaan").click()
    expect(page.locator("#voortgang")).not_to_have_text(voortgang_voor)
    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowLeft")
    page.locator("#opmerking").click()
    page.keyboard.type(" tweede")
    page.locator("#opmerking").blur()
    with page.expect_response(is_pad("/opslaan")):
        page.keyboard.press("b")

    assert page.evaluate("() => window.__focusSpion") is True
    assert page.evaluate("() => window.__vreemdeFocus") == []


def test_p0_geen_invoerveld_vervangen_tijdens_typen(page, basis_url):
    page.add_init_script(WAARNEMER_VELDEN)
    openen(page, basis_url)
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)
    gehouden = houd_opslaan_vast(page)  # herbouwen na de klik op opslaan mag

    page.evaluate("() => window.__startMeten()")
    page.locator("#opmerking").click()
    page.keyboard.type("tijdens het opslaan")
    voortgang_voor = page.locator("#voortgang").text_content()
    assert len(gehouden) == 1
    with page.expect_response(is_pad("/opslaan")):
        gehouden[0].continue_()
    expect(page.locator("#voortgang")).not_to_have_text(voortgang_voor)

    assert page.evaluate("() => window.__leesVerwijderd()") == []
    assert page.evaluate("() => document.getElementById('opmerking') === window.__veld && window.__veld.isConnected")


def test_p1_stand_per_keurmerk_tegen_het_doel(page, basis_url):
    openen(page, basis_url)
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)
    for code in KEURMERKEN8:
        expect(page.get_by_test_id(f"stand-{code}")).to_contain_text("16")
        expect(page.get_by_test_id(f"stand-{code}")).to_contain_text("50")
    expect(page.get_by_test_id("stand-EU_ORGANIC_FARMING")).to_have_attribute("data-met", "0")

    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.locator("#opslaan").click()
    assert antwoord.value.status == 200
    expect(page.get_by_test_id("stand-EU_ORGANIC_FARMING")).to_have_attribute("data-met", "1")
    expect(page.get_by_test_id("stand-GREEN_DOT")).to_have_attribute("data-zonder", "1")
    expect(page.get_by_test_id("stand-NUTRISCORE")).to_have_attribute("data-met", "1")


def volg_posts(page):
    posts = []
    page.on("request", lambda r: posts.append(r) if r.method == "POST" else None)
    return posts


def wacht_op_lopende_opslagen(posts):
    """Wacht tot elke al verstuurde POST (bv. een directe opslag per keuze) een antwoord heeft."""
    for verzoek in list(posts):
        verzoek.response()


def radio(page, code, waarde):
    return page.get_by_test_id(f"keuze-{code}").locator(f'input[value="{waarde}"]')


def test_p0_keuzes_voorgevuld_uit_voorinvulling(page, basis_url):
    openen(page, basis_url)
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)

    aanwezig, _ = VOORGEVULD[E1]
    for code in KEURMERKEN7:
        for waarde in ("aanwezig", "afwezig", "onzeker"):
            expect(radio(page, code, waarde)).to_have_attribute("type", "radio")
        expect(radio(page, code, "aanwezig" if code in aanwezig else "afwezig")).to_be_checked()
        expect(radio(page, code, "onzeker")).not_to_be_checked()
    expect(page.get_by_test_id("ns-B")).to_be_checked()
    for letter in "ACDE":
        expect(page.get_by_test_id(f"ns-{letter}")).not_to_be_checked()
    expect(page.get_by_test_id("ns-onleesbaar")).not_to_be_checked()


def test_p0_gewijzigde_keuze_gaat_mee_met_opslaan(page, basis_url, invulmap):
    posts = volg_posts(page)
    openen(page, basis_url)
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)

    radio(page, "GREEN_DOT", "onzeker").check()
    page.get_by_test_id("ns-C").check()
    wacht_op_lopende_opslagen(posts)
    with page.expect_request(is_pad("/opslaan")) as verzoek:
        page.locator("#opslaan").click()
    assert verzoek.value.response().status == 200

    body = verzoek.value.post_data_json
    assert body["id"] == E1
    assert body["waarde"]["status"] == "bevestigd"
    assert body["waarde"]["keurmerken"]["GREEN_DOT"] == "onzeker"
    assert body["waarde"]["keurmerken"]["EU_ORGANIC_FARMING"] == "aanwezig"
    assert sorted(body["waarde"]["nutriscore"]) == ["B", "C"]
    assert sorted(body["waarde"]["veranderd"]) == ["GREEN_DOT", "NUTRISCORE"]
    assert lees_uitslag(invulmap)[E1]["keurmerken"]["GREEN_DOT"] == "onzeker"


def test_p1_letter_onleesbaar_wordt_opgeslagen(page, basis_url):
    posts = volg_posts(page)
    openen(page, basis_url)
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)

    page.get_by_test_id("ns-onleesbaar").check()
    wacht_op_lopende_opslagen(posts)
    with page.expect_request(is_pad("/opslaan")) as verzoek:
        page.locator("#opslaan").click()
    assert verzoek.value.response().status == 200

    waarde = verzoek.value.post_data_json["waarde"]
    assert waarde["nutriscore"] == "onleesbaar"
    assert "NUTRISCORE" in waarde["veranderd"]


def test_p0_keuze_wijzigen_verplaatst_geen_focus_en_vervangt_geen_veld(page, basis_url):
    posts = volg_posts(page)
    page.add_init_script(SPION_FOCUS)
    page.add_init_script(WAARNEMER_VELDEN)
    openen(page, basis_url)
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)
    expect(page.get_by_test_id("ns-B")).to_be_checked()

    page.evaluate("() => window.__startMeten()")
    page.locator("#opmerking").click()
    page.keyboard.type("eerst een opmerking")
    radio(page, "GREEN_DOT", "onzeker").check()
    page.get_by_test_id("ns-C").check()
    wacht_op_lopende_opslagen(posts)
    expect(page.locator("#opmerking")).to_have_value("eerst een opmerking")

    assert page.evaluate("() => document.activeElement.getAttribute('data-testid')") == "ns-C"
    assert page.evaluate("() => window.__focusSpion") is True
    assert page.evaluate("() => window.__vreemdeFocus") == []
    assert page.evaluate("() => window.__leesVerwijderd()") == []
    assert page.evaluate("() => document.getElementById('opmerking') === window.__veld && window.__veld.isConnected")


def test_p1_overzichtsbeeld_linkt_naar_volledige_resolutie(page, basis_url, invulmap):
    openen(page, basis_url)
    expect(page.get_by_test_id("etiket-id")).to_have_text(E1)
    volledig = page.get_by_test_id("volledig")
    expect(volledig.get_by_test_id("overzicht")).to_be_visible()

    beeld = page.request.get(urljoin(page.url, volledig.get_attribute("href")))
    assert beeld.status == 200
    assert beeld.body() == (invulmap / "beelden/0.png").read_bytes()

    page.keyboard.press("ArrowRight")
    expect(page.get_by_test_id("etiket-id")).to_have_text(E2)
    beeld = page.request.get(urljoin(page.url, volledig.get_attribute("href")))
    assert beeld.body() == (invulmap / "beelden/1.png").read_bytes()
