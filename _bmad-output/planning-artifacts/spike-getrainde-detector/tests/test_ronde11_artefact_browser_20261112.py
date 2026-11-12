"""CAP-19 ronde 11 (ATDD; groen sinds de bouw van 12-11-2026): de beoordelingspagina als artefact laat glutenvrij nalopen (SPEC CAP-19,
toetsset.md §6a).

De pagina draait hier tegen een nagebootste `window.claude` (opslag in het geheugen van de pagina, nooit de echte
database van het artefact). Alle etiketcodes zijn verzonnen (GLN 9999999000000).

Rode run 12-11-2026: tegen het sjabloon van versie 4 (glutenvrij optioneel; na te lopen = een van de vier codes van
ronde 9 ontbreekt) en zonder `invul/artefact/bouw.py`.
"""
import json

import pytest
from playwright.sync_api import expect

from conftest import wacht_klaar
from ronde11_hulp import GV, LOS12, bevestigd, eid, item, keuzes12, vi, vul
from test_cap03_invulpagina_browser import browser  # noqa: F401 (fixture)

pytestmark = pytest.mark.browser
expect.set_options(timeout=5_000)

NOTITIE = "Al bevestigd: controleer alleen glutenvrij."

# Nagebootste window.claude: use("db") met doc().set() en collection().onSnapshot(), use("user").can().
# Een opslag voor een id in window.__houd blijft hangen tot window.__laatLos(id) (antwoord te laat, deterministisch).
NEP_CLAUDE = """
(() => {
  const opslag = {docs: JSON.parse(JSON.stringify(window.__START || {})), writes: []};
  window.__opslag = opslag; window.__houd = {};
  window.__laatLos = (id) => { const q = window.__houd[id] || []; delete window.__houd[id]; q.forEach((f) => f()); };
  const db = {
    doc: (pad) => ({set: (data) => new Promise((klaar) => {
      const id = pad.split("/")[1];
      const doe = () => { opslag.docs[id] = JSON.parse(JSON.stringify(data)); opslag.writes.push({id, data}); klaar(); };
      if (window.__houd[id]) window.__houd[id].push(doe); else doe();
    })}),
    collection: () => ({onSnapshot: (cb) => { Promise.resolve().then(() => cb({docs: Object.entries(opslag.docs)
      .map(([id, d]) => ({id, exists: true, data: () => JSON.parse(JSON.stringify(d))}))})); return () => {}; }}),
  };
  const user = {can: async () => true};
  window.claude = {use: async (naam) => (naam === "db" ? db : naam === "user" ? user : null)};
})();
"""


A, B, C, D, W = eid(1), eid(2), eid(3), eid(4), eid(5)


# A: bevestigd met de 12 codes (geen glutenvrij) -> na te lopen; B: bevestigd met glutenvrij -> afgehandeld;
# C: onleesbaar -> afgehandeld; D: tussenstand (status open) -> open.
A_KEUZES = keuzes12(GREEN_DOT="aanwezig", FOREST_STEWARDSHIP_COUNCIL_LABEL="onzeker")
B_KEUZES = {**keuzes12(), GV: "afwezig"}
RECORDS = {
    A: bevestigd(A_KEUZES, nutriscore=("C",), veranderd=("GREEN_DOT", "FOREST_STEWARDSHIP_COUNCIL_LABEL"),
                 opmerking="eerder"),
    B: bevestigd(B_KEUZES, nutriscore=()),
    C: {"status": "onleesbaar", "keurmerken": {}, "veranderd": [], "opmerking": "", "bijgewerkt": "2026-11-11T10:00:00.000Z"},
    D: {"status": "open", "keurmerken": {"GREEN_DOT": "afwezig"}, "veranderd": [], "opmerking": "",
        "bijgewerkt": "2026-11-11T10:00:00.000Z"},  # tussenstand: niet afgehandeld, niet na te lopen
}
VOOR = {A: False, B: False, C: False, D: True}  # glutenvrij-oordeel van de AI per etiket
ITEMS_ZONDER_GV = [item(i, vi()) for i in (A, B, C, D)]


def open_pagina(browser, tmp_path, html, records):  # noqa: F811
    pad = tmp_path / "pagina.html"
    pad.write_text(html, encoding="utf-8")
    page = browser.new_context(viewport={"width": 1440, "height": 800}).new_page()
    page.add_init_script(f"window.__START = {json.dumps(records)};" + NEP_CLAUDE)
    page.goto(pad.as_uri())
    wacht_klaar(page)
    return page


@pytest.fixture
def gebouwd(browser, tmp_path):  # noqa: F811
    """De pagina zoals het bouwscript hem maakt: nep-bron (ITEMS zonder glutenvrij) + nep-voorinvulling."""
    from invul.artefact import bouw

    bron = tmp_path / "bron.html"
    bron.write_text(vul(ITEMS_ZONDER_GV), encoding="utf-8")
    r10 = tmp_path / "voorinvulling-r10.json"
    r10.write_text(json.dumps({i: {"keurmerken": {GV: v}, "model": "nep"} for i, v in VOOR.items()}), encoding="utf-8")
    uit = tmp_path / "uit" / "pagina.html"
    bouw.bouw(bron, r10, uit)
    page = open_pagina(browser, tmp_path, uit.read_text(encoding="utf-8"), RECORDS)
    yield page
    page.context.close()


def opslag(page, i):
    return page.evaluate("(i) => window.__opslag.docs[i] || null", i)


def gekozen(page, code):
    return page.evaluate(f"""() => {{ const r = document.querySelector('input[name="k-{code}"]:checked');
                                      return r ? r.value : null; }}""")


def tid(page, naam):
    return page.locator(f'[data-testid="{naam}"]')


# --- P0: telling en nalopen --------------------------------------------------------------------------------------------
def test_teller_telt_alleen_ontbrekend_glutenvrij_als_na_te_lopen(gebouwd):
    """A (12 codes, geen glutenvrij) is na te lopen; B (met glutenvrij) en C (onleesbaar) zijn afgehandeld; D (open)
    is geen van beide."""
    expect(gebouwd.locator("#voortgang")).to_have_text("2 van 4 etiketten afgehandeld · 1 na te lopen")


def test_opent_op_na_te_lopen_etiket_met_glutenvrij_actief_en_notitie(gebouwd):
    expect(tid(gebouwd, "etiket-id")).to_have_text(A)
    expect(gebouwd.locator("#notitie")).to_have_text(NOTITIE)
    expect(tid(gebouwd, "rij-" + GV)).to_have_attribute("data-actief", "true")
    # de eerdere antwoorden van de opslag staan er
    assert gekozen(gebouwd, "GREEN_DOT") == "aanwezig"
    assert gekozen(gebouwd, "FOREST_STEWARDSHIP_COUNCIL_LABEL") == "onzeker"


def test_glutenvrij_voorgevuld_met_ai_merkje(gebouwd):
    """Het AI-oordeel (A: afwezig) staat voorgevuld en draagt het AI-merkje, zoals bij de andere keurmerken."""
    assert gekozen(gebouwd, GV) == "afwezig"
    expect(gebouwd.locator(f'input[name="k-{GV}"][value="afwezig"]').locator("xpath=..")).to_have_attribute("data-ai", "true")


def test_bevestigen_houdt_12_keuzes_en_nutriscore_en_voegt_glutenvrij_toe(gebouwd):
    gebouwd.locator("#opslaan").click()
    expect(gebouwd.locator("#melding")).to_have_text("Opgeslagen (bevestigd).")
    doc = opslag(gebouwd, A)
    assert set(doc) == {"status", "keurmerken", "veranderd", "opmerking", "bijgewerkt", "nutriscore", "bevestigde_codes"}
    assert doc["status"] == "bevestigd"
    assert {c: doc["keurmerken"][c] for c in LOS12} == A_KEUZES
    assert doc["keurmerken"][GV] == "afwezig"
    assert doc["nutriscore"] == ["C"]
    assert doc["bevestigde_codes"] == sorted(LOS12 + (GV,))
    assert sorted(doc["veranderd"]) == ["FOREST_STEWARDSHIP_COUNCIL_LABEL", "GREEN_DOT"]  # glutenvrij = AI-oordeel
    assert doc["opmerking"] == "eerder"
    expect(gebouwd.locator("#voortgang")).to_have_text("3 van 4 etiketten afgehandeld")  # y = 0: deel weg


def test_sneltoets_1_op_glutenvrij_rij_kiest_aanwezig(gebouwd):
    gebouwd.locator("body").press("1")
    assert gekozen(gebouwd, GV) == "aanwezig"
    gebouwd.wait_for_function("(i) => (window.__opslag.docs[i].keurmerken || {}).DIET_FREE_FROM_GLUTEN === 'aanwezig'", arg=A)
    doc = opslag(gebouwd, A)  # tussenstand: status en bevestigde_codes blijven, dus nog na te lopen
    assert doc["status"] == "bevestigd" and GV not in doc["bevestigde_codes"]
    expect(gebouwd.locator("#voortgang")).to_have_text("2 van 4 etiketten afgehandeld · 1 na te lopen")


# --- P0: antwoord te laat, het scherm is al verder ---------------------------------------------------------------------
def test_late_opslag_van_a_overschrijft_b_niet(gebouwd):
    gebouwd.evaluate("(i) => { window.__houd[i] = []; }", A)
    gebouwd.locator("#volgende").click()  # bevestigen en volgende: opslag van A hangt, het scherm gaat naar B
    expect(tid(gebouwd, "etiket-id")).to_have_text(B)
    gebouwd.locator("#opmerking").click()
    gebouwd.keyboard.type("typt op B")
    assert opslag(gebouwd, A)["bevestigde_codes"] == sorted(LOS12)  # nog niet geschreven
    gebouwd.evaluate("(i) => window.__laatLos(i)", A)
    expect(gebouwd.locator("#melding")).to_have_text(f"Opgeslagen (bevestigd). (etiket {A})")
    expect(gebouwd.locator("#voortgang")).to_have_text("3 van 4 etiketten afgehandeld")
    assert GV in opslag(gebouwd, A)["bevestigde_codes"]
    # B is niet aangeraakt: zelfde etiket, getypte tekst en cursor staan, keuzes van B uit de opslag
    expect(tid(gebouwd, "etiket-id")).to_have_text(B)
    expect(gebouwd.locator("#opmerking")).to_have_value("typt op B")
    expect(gebouwd.locator("#opmerking")).to_be_focused()
    assert gekozen(gebouwd, GV) == "afwezig"
    assert opslag(gebouwd, B) == RECORDS[B]


# --- P0: weigeren zonder glutenvrij-keuze -------------------------------------------------------------------------------
def test_bevestigen_zonder_glutenvrij_keuze_wordt_geweigerd(browser, tmp_path):  # noqa: F811
    """Een etiket zonder glutenvrij-oordeel en zonder keuze: bevestigen weigert en schrijft niets."""
    page = open_pagina(browser, tmp_path, vul([item(W, vi())]), {W: bevestigd(keuzes12())})
    try:
        expect(tid(page, "etiket-id")).to_have_text(W)
        assert gekozen(page, GV) is None
        page.locator("#opslaan").click()
        expect(page.locator("#melding")).to_have_class("fout")
        expect(page.locator("#melding")).to_contain_text("glutenvrij")
        expect(page.locator("#melding")).to_contain_text("niets opgeslagen")
        assert page.evaluate("window.__opslag.writes.length") == 0
        assert opslag(page, W)["bevestigde_codes"] == sorted(LOS12)
    finally:
        page.context.close()


# --- P1: ongewijzigd: downloadknop ------------------------------------------------------------------------------------
def test_downloadknop_geeft_alle_opgeslagen_beoordelingen(gebouwd):
    gebouwd.locator("#download").click()
    vak = gebouwd.locator("#exportvak")
    expect(vak).to_be_visible()
    data = json.loads(vak.input_value())
    assert data["aantal"] == 4 and set(data["beoordelingen"]) == {A, B, C, D}


def test_opent_op_eerste_open_etiket_in_items_volgorde(browser, tmp_path):  # noqa: F811
    """Volgorde B (af), D (open), A (na te lopen): de pagina opent op D, zonder notitie."""
    items = [item(B, vi(glutenvrij=False)), item(D, vi(glutenvrij=True)), item(A, vi(glutenvrij=False))]
    page = open_pagina(browser, tmp_path, vul(items), RECORDS)
    try:
        expect(tid(page, "etiket-id")).to_have_text(D)
        expect(page.locator("#notitie")).to_have_text("")
        expect(page.locator("#voortgang")).to_have_text("1 van 3 etiketten afgehandeld · 1 na te lopen")
    finally:
        page.context.close()


# --- Ronde 11b (besluit Friso 12-11-2026, "35, rest volgt de AI"): gefilterde bouw -----------------------------------
# Getoond: X1 (na te lopen) en X2 (nog niets). Niet getoond: H1 (afgehandeld, glutenvrij bevestigd afwezig) en
# H2 (na te lopen). Hun records blijven in de opslag.
X1, X2, H1, H2 = eid(11), eid(12), eid(13), eid(14)
VOOR_11B = {X1: True, H1: False, H2: False, X2: True}  # bronvolgorde X1, H1, H2, X2
RECORDS_11B = {
    X1: bevestigd(keuzes12(), opmerking="x1"),
    H1: bevestigd({**keuzes12(), GV: "afwezig"}),
    H2: bevestigd(keuzes12(GREEN_DOT="aanwezig")),
}


@pytest.fixture
def gefilterd(browser, tmp_path):  # noqa: F811
    from invul.artefact import bouw

    bron = tmp_path / "bron.html"
    bron.write_text(vul([item(i, vi()) for i in VOOR_11B]), encoding="utf-8")
    r10 = tmp_path / "voorinvulling-r10.json"
    r10.write_text(json.dumps({i: {"keurmerken": {GV: v}} for i, v in VOOR_11B.items()}), encoding="utf-8")
    uit = tmp_path / "uit" / "pagina.html"
    assert bouw.bouw(bron, r10, uit, alleen_ai_glutenvrij=True)["etiketten"] == 2
    page = open_pagina(browser, tmp_path, uit.read_text(encoding="utf-8"), RECORDS_11B)
    yield page
    page.context.close()


def test_11b_teller_en_nalopen_over_de_getoonde_etiketten(gefilterd):
    expect(gefilterd.locator("#voortgang")).to_have_text("0 van 2 etiketten afgehandeld · 1 na te lopen")
    expect(tid(gefilterd, "etiket-id")).to_have_text(X1)
    expect(gefilterd.locator("#positie")).to_have_text("1 / 2")
    expect(gefilterd.locator("#notitie")).to_have_text(NOTITIE)


def test_11b_stand_telt_bevestigde_records_van_niet_getoonde_etiketten(gefilterd):
    expect(tid(gefilterd, "stand-" + GV)).to_have_attribute("data-zonder", "1")  # H1


def test_11b_download_exporteert_alle_records_ook_niet_getoonde(gefilterd):
    gefilterd.locator("#download").click()
    data = json.loads(gefilterd.locator("#exportvak").input_value())
    assert data["aantal"] == 3 and set(data["beoordelingen"]) == {X1, H1, H2}
    assert gefilterd.evaluate("window.__opslag.writes.length") == 0


def test_11b_late_opslag_raakt_niet_getoonde_records_en_het_volgende_etiket_niet(gefilterd):
    gefilterd.evaluate("(i) => { window.__houd[i] = []; }", X1)
    gefilterd.locator("#volgende").click()
    expect(tid(gefilterd, "etiket-id")).to_have_text(X2)
    gefilterd.locator("#opmerking").click()
    gefilterd.keyboard.type("typt op X2")
    gefilterd.evaluate("(i) => window.__laatLos(i)", X1)
    expect(gefilterd.locator("#melding")).to_have_text(f"Opgeslagen (bevestigd). (etiket {X1})")
    expect(gefilterd.locator("#voortgang")).to_have_text("1 van 2 etiketten afgehandeld")
    expect(gefilterd.locator("#opmerking")).to_have_value("typt op X2")
    assert [w["id"] for w in gefilterd.evaluate("window.__opslag.writes")] == [X1]
    assert opslag(gefilterd, H1) == RECORDS_11B[H1] and opslag(gefilterd, H2) == RECORDS_11B[H2]
