"""CAP-3 ronde 7 (ATDD, rode fase): de invulpagina op één scherm (toetsset §6, SPEC CAP-3, invul-ux/EXPERIENCE.md en
DESIGN.md).

Contract: atdd-checklist, "Ronde 7" → "Interfacecontract ronde 7". Nieuwe selectors: `kopregel`, `#positie`,
`etiket-status`, `beeldvak` (`data-stand`), `kader` (`data-code`, `data-tegel`, `data-vak`, `data-actief`), `uitsneden`,
`uitsnede`, `beeld-fout`, `rij-<CODE>` (`data-actief`, `data-ai-aanwezig`), `label[data-ai]`, `ai-<CODE>`,
`gewijzigd-<CODE>`, `#volgende`, `sneltoetsen`. Rood zolang de pagina die elementen en het gedrag niet heeft.

Alle etiketten zijn verzonnen (GLN-GTIN-528 met 999…-nummers), alle beelden komen uit PIL in `tmp_path`; alleen
127.0.0.1. De zwaarste gemeten vormen (02-11-2026, alleen aantallen): 4096×780 (h/b 0,19) met 6 uitsneden en
200×3920 (h/b 19,6).

Ronde 8 (contract "Interfacecontract ronde 8", "Vervalt uit ronde 7"): `data-stand="breedte"` bestaat niet meer; elk
etiket begint `passend`. De beeldtests hieronder zijn daarop aangepast; de nieuwe beeldregels staan in
`test_ronde8_browser_20261102.py`.
"""
import json
import re
import sys
import threading
from urllib.parse import urlparse

import pytest
from PIL import Image
from playwright.sync_api import expect

import herken
from conftest import laad_klaar
from test_cap03_invulpagina_browser import (  # noqa: F401 (browser is een fixture)
    SPION_FOCUS,
    browser,
    is_pad,
    lees_uitslag,
    radio,
    volg_posts,
    wacht_op_lopende_opslagen,
)

pytestmark = pytest.mark.browser
expect.set_options(timeout=5_000)

LOS = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING",
       "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO", "EUROPEAN_V_LABEL_VEGAN")
NEGEN = LOS + ("NUTRISCORE",)
V = "EUROPEAN_V_LABEL_VEGAN"
NS = "NUTRISCORE"
VENSTERS = [(1440, 800), (1920, 970)]


def doc(n):
    return f"9990000000{n:03d}-0999000000{n:04d}-528"


E1, E2, E3, E4, E5, E6, E7 = (doc(n) for n in range(101, 108))


def vi(aanwezig=(), nutriscore=(), weg=(), hints=()):
    """AI-voorinvulling in de vorm van `items.json` (zoals `voorinvulling()` in test_cap03)."""
    tegels = {}
    for h in hints:
        if isinstance(h, tuple):
            tegels.setdefault(h[0], []).append(h[1])
    return {
        "keurmerken": {c: c in aanwezig for c in LOS if c not in weg},
        "nutriscore": list(nutriscore),
        "hinttegels": tegels,
        "gelijkend": [],
        "model": "anthropic/claude-sonnet-5.5",
        "kosten": 0.004,
    }


def etiket(id_, maat, hints, voor):
    """maat None = beeld bestaat niet; hint = (CODE, tegelnummer) of een ruwe bestandsnaam onder beelden/."""
    return {"id": id_, "maat": maat, "hints": list(hints), "voor": voor}


H1 = [("PREGNANCY_WARNING", 0), (V, 1), ("MARINE_STEWARDSHIP_COUNCIL_LABEL", 2), ("VEGAN_SOCIETY_VEGAN_LOGO", 3),
      ("RECYCLABLE_GENERAL_CLAIM", 4), ("PREGNANCY_WARNING", 4)]
H2 = [("GREEN_DOT", 3), ("WEIDEMELK", 4)]  # kaders laag op een hoog etiket (ronde 8: toch passend, geen scroll)
H3 = [("EU_ORGANIC_FARMING", 5), ("GREEN_DOT", 1)]  # 5 = laatste tegel (lengte - tegel in x én y)
H4 = [("PREGNANCY_WARNING", 2)]
H6 = [("GREEN_DOT", 0), "x-tegel-0.png", ("MARINE_STEWARDSHIP_COUNCIL_LABEL", 3)]  # 3 valt buiten 1 tegel

A1 = {"PREGNANCY_WARNING", V, "MARINE_STEWARDSHIP_COUNCIL_LABEL", "VEGAN_SOCIETY_VEGAN_LOGO", "RECYCLABLE_GENERAL_CLAIM"}
ALLE = [
    etiket(E1, (4096, 780), H1, vi(A1, ["C"], hints=H1)),
    etiket(E2, (200, 3920), H2, vi({"GREEN_DOT", "WEIDEMELK"}, ["A"], hints=H2)),
    etiket(E3, (2500, 1100), H3, vi({"EU_ORGANIC_FARMING", "GREEN_DOT"}, ["B"], hints=H3)),
    etiket(E4, (900, 3000), H4, vi({"PREGNANCY_WARNING"}, [], hints=H4)),
    etiket(E5, (300, 1200), [], {}),  # geen voorinvulling, geen uitsneden, hoog beeld zonder kaders
    etiket(E6, (800, 600), H6, vi({"GREEN_DOT"}, [], weg={"WEIDEMELK"}, hints=H6)),
    etiket(E7, None, [], vi({"GREEN_DOT"}, [])),  # beeld ontbreekt; laatste etiket
]
NR = {e["id"]: i for i, e in enumerate(ALLE)}
PER_ID = {e["id"]: e for e in ALLE}

# Zwaarste vormen zonder voorinvulling (dus #notitie gevuld) en met 6 uitsneden met lange codenamen.
H_HOOG = [("PREGNANCY_WARNING", 0), (V, 1), ("MARINE_STEWARDSHIP_COUNCIL_LABEL", 2), ("VEGAN_SOCIETY_VEGAN_LOGO", 3),
          ("RECYCLABLE_GENERAL_CLAIM", 4), ("EU_ORGANIC_FARMING", 4)]
ZWAAR = [etiket(doc(201), (4096, 780), H1, {}), etiket(doc(202), (200, 3920), H_HOOG, {})]


def hintpad(id_, h):
    return f"beelden/{id_}-{h[0]}-{h[1]}.png" if isinstance(h, tuple) else f"beelden/{h}"


def beeldpad(e):
    return f"beelden/{e['id']}.png" if e["maat"] else f"beelden/ontbreekt-{e['id']}.png"


def leesbaar(e):
    """De uitsneden waarvan code en tegelnummer van rechts te lezen zijn en binnen herken.tegels vallen."""
    if not e["maat"]:
        return []
    n = len(herken.tegels(*e["maat"]))
    return [h for h in e["hints"] if isinstance(h, tuple) and h[1] < n]


@pytest.fixture
def start_server(tmp_path):
    from invul.server import maak_server

    servers = []

    def start(lijst=ALLE):
        (tmp_path / "beelden").mkdir(exist_ok=True)
        items = []
        for n, e in enumerate(lijst):
            if e["maat"]:
                Image.new("RGB", e["maat"], (30 * n % 255, 160, 210)).save(tmp_path / beeldpad(e))
            for h in e["hints"]:
                Image.new("RGB", (400, 400), (200, 30 * n % 255, 90)).save(tmp_path / hintpad(e["id"], h))
            items.append({"id": e["id"], "beeld": beeldpad(e), "hint": [hintpad(e["id"], h) for h in e["hints"]],
                          "voorinvulling": e["voor"]})
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
    context = browser.new_context(viewport={"width": 1440, "height": 800})
    pagina = context.new_page()
    pagina.set_default_timeout(5_000)
    yield pagina
    context.close()


# --- helpers (geen asserts behalve waar de naam het zegt) ------------------------------------------------------------
def tid(page, naam):
    return page.get_by_test_id(naam)


def naar(page, id_):
    """Vanaf het eerste etiket met → naar `id_` (focus niet in een tekstveld)."""
    for _ in range(NR[id_]):
        page.keyboard.press("ArrowRight")
    expect(tid(page, "etiket-id")).to_have_text(id_)


def wacht_beeld(page, breedte):
    page.wait_for_function(
        "w => { const i = document.querySelector('[data-testid=\"overzicht\"]'); "
        "return !!i && i.complete && i.naturalWidth === w; }", arg=breedte)


def beeldvlak(page):
    """Inhoudsvak van het overzichtsbeeld (zonder rand en opvulling), in vensterpixels."""
    return page.evaluate("""() => {
      const i = document.querySelector('[data-testid="overzicht"]'), r = i.getBoundingClientRect(), s = getComputedStyle(i);
      const p = (k) => parseFloat(s[k]) || 0;
      const l = p('borderLeftWidth') + p('paddingLeft'), t = p('borderTopWidth') + p('paddingTop');
      return {x: r.left + l, y: r.top + t, w: r.width - l - p('borderRightWidth') - p('paddingRight'),
              h: r.height - t - p('borderBottomWidth') - p('paddingBottom')};
    }""")


def vakmaat(page):
    """Zichtbaar binnendeel van het beeldvak en zijn scrollmaten."""
    expect(page.get_by_test_id("beeldvak")).to_have_count(1)
    return page.evaluate("""() => {
      const v = document.querySelector('[data-testid="beeldvak"]'), r = v.getBoundingClientRect();
      return {x: r.left + v.clientLeft, y: r.top + v.clientTop, w: v.clientWidth, h: v.clientHeight,
              sw: v.scrollWidth, sh: v.scrollHeight, st: v.scrollTop, sl: v.scrollLeft};
    }""")


def kader_in_vak(page, selector):
    """Wacht tot het (eerste) kader `selector` het zichtbare deel van het beeldvak overlapt (een tegel van 1024 px is
    na schalen vaak groter dan het vak, dus "in beeld" = overlap van minstens 8 px in beide richtingen)."""
    page.wait_for_function("""s => {
      const v = document.querySelector('[data-testid="beeldvak"]'), k = document.querySelector(s);
      if (!v || !k) return false;
      const r = v.getBoundingClientRect(), b = k.getBoundingClientRect();
      const x = v.clientLeft + r.left, y = v.clientTop + r.top;
      const ox = Math.min(b.right, x + v.clientWidth) - Math.max(b.left, x);
      const oy = Math.min(b.bottom, y + v.clientHeight) - Math.max(b.top, y);
      return b.width > 0 && ox >= 8 && oy >= 8;
    }""", arg=selector)


def actieve_rijen(page):
    return page.evaluate(
        "() => [...document.querySelectorAll('[data-testid^=\"rij-\"][data-actief=\"true\"]')]"
        ".map((e) => e.getAttribute('data-testid'))")


def verwacht_actief(page, code):
    expect(tid(page, f"rij-{code}")).to_have_attribute("data-actief", "true")
    assert actieve_rijen(page) == [f"rij-{code}"]


def gekozen(page):
    return page.evaluate("""() => {
      const k = {};
      for (const g of document.querySelectorAll('#keuzes [role="radiogroup"]')) {
        const r = g.querySelector('input:checked'); k[g.getAttribute('data-testid')] = r ? r.value : null;
      }
      for (const c of document.querySelectorAll('#keuzes input[type="checkbox"]')) k[c.getAttribute('data-testid')] = c.checked;
      return k;
    }""")


def focus_op_keuze(page):
    return page.evaluate("""() => { const a = document.activeElement;
      return !!(a && a.closest('#keuzes') && a.matches('button, input[type="radio"], input[type="checkbox"]')); }""")


def binnen_venster(page, loc, naam):
    loc.wait_for(state="visible")
    b = loc.bounding_box()
    vw, vh = page.viewport_size["width"], page.viewport_size["height"]
    assert b and b["width"] > 0 and b["height"] > 0, naam
    assert b["x"] >= -0.5 and b["y"] >= -0.5, (naam, b)
    assert b["x"] + b["width"] <= vw + 0.5 and b["y"] + b["height"] <= vh + 0.5, (naam, b, vw, vh)
    return b


def tussenstand(page, toets):
    """Druk `toets` en geef de body van de tussenstand-POST terug (geen asserts)."""
    with page.expect_request(is_pad("/opslaan")) as verzoek:
        page.keyboard.press(toets)
    verzoek.value.response()
    return verzoek.value.post_data_json


# --- één scherm --------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("venster", VENSTERS, ids=lambda v: f"{v[0]}x{v[1]}")
@pytest.mark.parametrize("nr", [0, 1], ids=["breed-4096x780", "hoog-200x3920"])
def test_r7_alles_op_een_scherm_zonder_paginascroll(page, start_server, venster, nr):
    page.set_viewport_size({"width": venster[0], "height": venster[1]})
    laad_klaar(page, start_server(ZWAAR))
    if nr:
        page.keyboard.press("ArrowRight")
    e = ZWAAR[nr]
    expect(tid(page, "etiket-id")).to_have_text(e["id"])
    wacht_beeld(page, e["maat"][0])
    expect(tid(page, "kader")).to_have_count(6)
    page.keyboard.press("b")  # geen voorinvulling: onvolledig → foutmelding zichtbaar
    expect(page.locator("#melding")).to_contain_text("Kies eerst")
    expect(page.locator("#notitie")).not_to_have_text("")

    maat = page.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight, "
                         "innerWidth, innerHeight]")
    assert maat[0] <= maat[2] and maat[1] <= maat[3], maat

    kop = binnen_venster(page, tid(page, "kopregel"), "kopregel")
    assert kop["height"] <= 48, kop
    assert tid(page, "kopregel").evaluate("e => getComputedStyle(e).whiteSpace") == "nowrap"
    for naam in ("beeldvak", "uitsneden", "sneltoetsen"):
        binnen_venster(page, tid(page, naam), naam)
    for sel in ("#notitie", "#opmerking", "#volgende", "#opslaan", "#onleesbaar", "#melding"):
        binnen_venster(page, page.locator(sel), sel)
    for code in NEGEN:
        rij = binnen_venster(page, tid(page, f"rij-{code}"), code)
        assert rij["height"] <= 44, (code, rij)


def test_r7_opbouw_kopregel_rijen_en_knoppen(page, start_server):
    basis = start_server()
    html = page.request.get(basis).text()
    tag = re.search(r'<[a-z]+\b[^>]*\bid="keuzes"[^>]*>', html)
    assert tag and re.search(r"\binert\b", tag.group(0)), "#keuzes moet in de HTML inert zijn tot klaar"

    laad_klaar(page, basis)
    kop = tid(page, "kopregel")
    expect(kop).to_have_count(1)
    for loc in (kop.locator("#voortgang"), kop.locator("#positie"), kop.get_by_test_id("etiket-status"),
                kop.get_by_test_id("etiket-id")):
        expect(loc).to_have_count(1)
    expect(kop.locator("#positie")).to_have_text(f"1 / {len(ALLE)}")
    expect(page.locator("#voortgang")).to_have_text(f"0 van {len(ALLE)} etiketten afgehandeld")

    groepen = page.locator('#keuzes [role="radiogroup"]')
    expect(groepen).to_have_count(8)
    assert [g.get_attribute("data-testid") for g in groepen.all()] == [f"keuze-{c}" for c in LOS]
    for code in NEGEN:
        rij = page.locator("#standen").get_by_test_id(f"rij-{code}")
        expect(rij).to_have_count(1)
        for deel in (f"stand-{code}", f"gewijzigd-{code}", f"ai-{code}"):
            expect(rij.get_by_test_id(deel)).to_have_count(1)
        if code == NS:
            for x in ("ns-A", "ns-B", "ns-C", "ns-D", "ns-E", "ns-onleesbaar"):
                expect(rij.get_by_test_id(x)).to_have_count(1)
        else:
            expect(rij.get_by_test_id(f"keuze-{code}")).to_have_count(1)
    keuzes = page.locator("#keuzes")
    expect(keuzes.locator("#volgende")).to_have_text("Bevestigen en volgende")
    expect(keuzes.locator("#opslaan")).to_have_text("Bevestigen")
    expect(keuzes.locator("#onleesbaar")).to_have_text("Etiket onleesbaar")
    expect(keuzes.get_by_test_id("sneltoetsen")).to_have_count(1)
    expect(tid(page, "beeldvak").get_by_test_id("volledig").get_by_test_id("overzicht")).to_have_count(1)


# --- beeld: kaders, beginstand, zoom ----------------------------------------------------------------------------------
@pytest.mark.parametrize("id_", [E1, E3, E4], ids=["4096x780", "2500x1100-laatste-tegel", "900x3000"])
def test_r7_kaders_volgen_herken_tegels(page, start_server, id_):
    verzoeken = []
    page.on("request", lambda r: verzoeken.append(r.url))
    basis = start_server()
    laad_klaar(page, basis)
    naar(page, id_)
    e = PER_ID[id_]
    w, h = e["maat"]
    wacht_beeld(page, w)
    vlakken = herken.tegels(w, h)
    verwacht = leesbaar(e)
    kaders = tid(page, "kader")
    expect(kaders).to_have_count(len(verwacht))

    gezien = sorted((k.get_attribute("data-code"), int(k.get_attribute("data-tegel"))) for k in kaders.all())
    assert gezien == sorted(verwacht)
    bv = beeldvlak(page)
    for k in kaders.all():
        i = int(k.get_attribute("data-tegel"))
        assert k.get_attribute("data-vak") == ",".join(map(str, vlakken[i]))
        b = k.evaluate("e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }")
        x0, y0, x1, y1 = vlakken[i]
        moet = [bv["x"] + x0 / w * bv["w"], bv["y"] + y0 / h * bv["h"], bv["x"] + x1 / w * bv["w"], bv["y"] + y1 / h * bv["h"]]
        assert all(abs(a - m) <= 1.5 for a, m in zip(b, moet)), (k.get_attribute("data-code"), i, b, moet)

    uitsneden = tid(page, "uitsnede")
    assert [u.get_attribute("src") for u in uitsneden.all()] == [hintpad(id_, x) for x in e["hints"]]
    eigen = urlparse(basis).netloc
    assert verzoeken and all(urlparse(u).netloc == eigen for u in verzoeken), verzoeken


def test_r7_uitsneden_zonder_leesbare_naam_en_zonder_uitsneden(page, start_server):
    laad_klaar(page, start_server())
    naar(page, E5)
    wacht_beeld(page, 300)
    expect(tid(page, "uitsneden")).to_have_count(1)
    expect(tid(page, "uitsneden")).to_have_js_property("hidden", True)
    expect(tid(page, "uitsneden")).to_be_hidden()
    expect(tid(page, "kader")).to_have_count(0)

    page.keyboard.press("ArrowRight")
    expect(tid(page, "etiket-id")).to_have_text(E6)
    wacht_beeld(page, 800)
    expect(tid(page, "uitsneden")).to_have_js_property("hidden", False)
    expect(tid(page, "uitsnede")).to_have_count(3)
    expect(page.locator('[data-testid="uitsnede"][data-code]')).to_have_count(1)
    expect(page.locator('[data-testid="uitsnede"]:not([data-code]):not([data-tegel])')).to_have_count(2)
    expect(page.locator('[data-testid="uitsnede"][data-code="GREEN_DOT"][data-tegel="0"]')).to_have_count(1)
    expect(tid(page, "kader")).to_have_count(1)
    expect(tid(page, "kader")).to_have_attribute("data-code", "GREEN_DOT")


# Ronde 8: elk etiket begint passend, ook de hoge (h/b > 3) die in ronde 7 op "breedte" begonnen.
@pytest.mark.parametrize("id_", [E1, E3, E2, E4, E5], ids=["4096x780", "2500x1100", "200x3920", "900x3000", "300x1200"])
def test_r7_beginstand_passend_of_breedte(page, start_server, id_):
    """Naam behouden voor de trace; sinds ronde 8 alleen nog `passend`. De volledige passend-regel (raakt een kant,
    gecentreerd) staat in `test_r8_passend_hele_etiket_in_beeld`."""
    laad_klaar(page, start_server())
    naar(page, id_)
    e = PER_ID[id_]
    wacht_beeld(page, e["maat"][0])
    vak = tid(page, "beeldvak")
    expect(vak).to_have_attribute("data-stand", "passend")
    v, b = vakmaat(page), beeldvlak(page)
    assert v["sw"] <= v["w"] + 1 and v["sh"] <= v["h"] + 1, v
    assert b["x"] >= v["x"] - 1 and b["y"] >= v["y"] - 1, (b, v)
    assert b["x"] + b["w"] <= v["x"] + v["w"] + 1 and b["y"] + b["h"] <= v["y"] + v["h"] + 1, (b, v)


KLIKSPION = """() => { window.__kliks = [];
  window.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('[data-testid="volledig"]')) return;
    const mod = e.ctrlKey || e.metaKey;
    window.__kliks.push({mod, voorkomen: e.defaultPrevented});
    if (mod) e.preventDefault();  // de test opent geen tabbladen; de pagina zelf mag dit niet voorkomen
  }); }"""


def zichtbaar_midden(page):
    """Midden van het zichtbare deel van het beeld binnen het beeldvak, als (x, y, fractie x, fractie y)."""
    v, b = vakmaat(page), beeldvlak(page)
    x = (max(v["x"], b["x"]) + min(v["x"] + v["w"], b["x"] + b["w"])) / 2
    y = (max(v["y"], b["y"]) + min(v["y"] + v["h"], b["y"] + b["h"])) / 2
    return x, y, (x - b["x"]) / b["w"], (y - b["y"]) / b["h"]


@pytest.mark.parametrize("id_", [E1, E2], ids=["breed-4096x780", "hoog-200x3920"])  # ronde 8: ook het hoge etiket (E2) begint passend
def test_r7_klik_zoomt_in_en_esc_en_wissel_terug(page, start_server, id_):
    begin = "passend"
    popups = []
    page.on("popup", lambda p: popups.append(p))
    basis = start_server()
    laad_klaar(page, basis)
    naar(page, id_)
    w = PER_ID[id_]["maat"][0]
    wacht_beeld(page, w)
    vak = tid(page, "beeldvak")
    expect(vak).to_have_attribute("data-stand", begin)
    page.evaluate(KLIKSPION)
    w0 = beeldvlak(page)["w"]
    url = page.url

    # Cmd/Ctrl-klik blijft een gewone link. Op macOS is Ctrl-klik een rechterklik (contextmenu, geen `click`).
    mods = ("Meta",) if sys.platform == "darwin" else ("Control", "Meta")
    for mod in mods:
        x, y, _, _ = zichtbaar_midden(page)
        page.keyboard.down(mod)
        page.mouse.click(x, y)
        page.keyboard.up(mod)
    assert page.evaluate("() => window.__kliks") == [{"mod": True, "voorkomen": False}] * len(mods)
    expect(vak).to_have_attribute("data-stand", begin)

    x, y, fx, _ = zichtbaar_midden(page)
    page.mouse.click(x, y)
    expect(vak).to_have_attribute("data-stand", "in")
    assert page.evaluate("() => window.__kliks")[-1] == {"mod": False, "voorkomen": True}
    assert page.url == url and popups == []
    page.wait_for_function("w => Math.abs(document.querySelector('[data-testid=\"overzicht\"]')"
                           ".getBoundingClientRect().width - w) <= 2", arg=max(w, 3 * w0))
    assert abs(beeldvlak(page)["w"] - max(w, 3 * w0)) <= 2
    if id_ == E1:  # passend breed beeld: het aangeklikte punt staat horizontaal in het midden van het vak
        v, b = vakmaat(page), beeldvlak(page)
        assert abs(b["x"] + fx * b["w"] - (v["x"] + v["w"] / 2)) <= 10, (b, v, fx)

    page.keyboard.press("Escape")
    expect(vak).to_have_attribute("data-stand", begin)
    assert abs(beeldvlak(page)["w"] - w0) <= 2

    x, y, _, _ = zichtbaar_midden(page)
    page.mouse.click(x, y)
    expect(vak).to_have_attribute("data-stand", "in")
    x, y, _, _ = zichtbaar_midden(page)
    page.mouse.click(x, y)  # nogmaals klikken = terug
    expect(vak).to_have_attribute("data-stand", begin)

    x, y, _, _ = zichtbaar_midden(page)
    page.mouse.click(x, y)
    expect(vak).to_have_attribute("data-stand", "in")
    page.keyboard.press("ArrowRight")  # ander etiket: altijd passend
    volgende = ALLE[NR[id_] + 1]
    expect(tid(page, "etiket-id")).to_have_text(volgende["id"])
    expect(vak).to_have_attribute("data-stand", "passend")
    page.keyboard.press("ArrowLeft")
    expect(vak).to_have_attribute("data-stand", begin)
    assert page.url == url and popups == []


def test_r7_klik_op_uitsnede_zoomt_in_en_maakt_rij_actief(page, start_server):
    laad_klaar(page, start_server())
    wacht_beeld(page, 4096)
    msc = "MARINE_STEWARDSHIP_COUNCIL_LABEL"
    verwacht_actief(page, "EU_ORGANIC_FARMING")
    page.locator(f'[data-testid="uitsnede"][data-code="{msc}"]').click()
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "in")
    verwacht_actief(page, msc)
    kader = f'[data-testid="kader"][data-code="{msc}"][data-tegel="2"]'
    kader_in_vak(page, kader)
    expect(page.locator(kader)).to_have_attribute("data-actief", "true")
    expect(page.locator('[data-testid="kader"][data-actief="true"]')).to_have_count(1)
    assert page.url.endswith("/")

    page.locator('[data-testid="uitsnede"][data-code="PREGNANCY_WARNING"]').nth(1).click()  # tegel 4
    verwacht_actief(page, "PREGNANCY_WARNING")
    kader_in_vak(page, '[data-testid="kader"][data-code="PREGNANCY_WARNING"][data-tegel="4"]')
    expect(page.locator('[data-testid="kader"][data-actief="true"]')).to_have_count(2)


def test_r7_beeld_niet_te_laden(page, start_server):
    posts = volg_posts(page)
    laad_klaar(page, start_server())
    wacht_beeld(page, 4096)
    expect(tid(page, "beeld-fout")).to_have_count(1)
    expect(tid(page, "beeld-fout")).to_have_js_property("hidden", True)
    expect(tid(page, "beeld-fout")).to_be_hidden()
    naar(page, E7)
    expect(tid(page, "beeld-fout")).to_be_visible()
    expect(tid(page, "beeld-fout")).to_have_text("Beeld niet te laden")
    with page.expect_response(is_pad("/opslaan")) as antwoord:
        radio(page, "GREEN_DOT", "onzeker").check()
    assert antwoord.value.status == 200
    wacht_op_lopende_opslagen(posts)
    page.keyboard.press("ArrowLeft")
    expect(tid(page, "beeld-fout")).to_have_js_property("hidden", True)
    expect(tid(page, "beeld-fout")).to_be_hidden()


def test_r7_kaders_horen_altijd_bij_het_getoonde_etiket(page, start_server):
    gehouden = []
    page.route(f"**/beelden/{E2}.png", lambda route: gehouden.append(route))  # beeld van E2 komt pas laat
    laad_klaar(page, start_server())
    wacht_beeld(page, 4096)
    expect(tid(page, "kader")).to_have_count(len(leesbaar(ALLE[0])))
    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowRight")
    expect(tid(page, "etiket-id")).to_have_text(E3)
    wacht_beeld(page, 2500)
    expect(tid(page, "kader")).to_have_count(len(leesbaar(PER_ID[E3])))
    for route in gehouden:  # laat het oude beeld alsnog binnenkomen
        try:
            route.continue_()
        except Exception:  # verzoek al afgebroken door de wissel: ook goed
            pass
    page.evaluate("() => new Promise((klaar) => requestAnimationFrame(() => requestAnimationFrame(klaar)))")
    kaders = tid(page, "kader")
    expect(kaders).to_have_count(len(leesbaar(PER_ID[E3])))
    w, h = PER_ID[E3]["maat"]
    for k in kaders.all():
        assert (k.get_attribute("data-code"), int(k.get_attribute("data-tegel"))) in leesbaar(PER_ID[E3])
        assert k.get_attribute("data-vak") == ",".join(map(str, herken.tegels(w, h)[int(k.get_attribute("data-tegel"))]))
    assert all(E3 in u.get_attribute("src") for u in tid(page, "uitsnede").all())


# --- toetsen ----------------------------------------------------------------------------------------------------------
def test_r7_toetsen_123_en_pijlen_per_rij(page, start_server):
    page.add_init_script(SPION_FOCUS)
    # Het concept wordt na de bevestigde opslag weer gewist (toetsset §6), dus het geschreven concept bespieden.
    page.add_init_script("""window.__concepten = []; const echt = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { window.__concepten.push([k, v]); return echt.call(this, k, v); };""")
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    verwacht_actief(page, "EU_ORGANIC_FARMING")

    body = tussenstand(page, "3")
    assert body["id"] == E1 and "status" not in body["waarde"]
    assert body["waarde"]["keurmerken"]["EU_ORGANIC_FARMING"] == "onzeker"
    expect(radio(page, "EU_ORGANIC_FARMING", "onzeker")).to_be_checked()
    concepten = [json.loads(v) for k, v in page.evaluate("() => window.__concepten") if k == f"concept:{E1}"]
    assert concepten and concepten[-1].get("keurmerken", {}).get("EU_ORGANIC_FARMING") == "onzeker"
    verwacht_actief(page, "GREEN_DOT")

    for code in LOS[2:]:
        page.keyboard.press("ArrowDown")
        verwacht_actief(page, code)
    body = tussenstand(page, "2")  # V-label: aanwezig → afwezig, blijft actief
    assert body["waarde"]["keurmerken"][V] == "afwezig"
    verwacht_actief(page, V)
    body = tussenstand(page, "3")
    assert body["waarde"]["keurmerken"][V] == "onzeker"
    verwacht_actief(page, V)  # nooit automatisch naar Nutri-Score

    page.keyboard.press("ArrowDown")
    verwacht_actief(page, NS)
    page.keyboard.press("ArrowDown")
    verwacht_actief(page, NS)  # blijft op de laatste
    for _ in range(9):
        page.keyboard.press("ArrowUp")
    verwacht_actief(page, "EU_ORGANIC_FARMING")  # blijft op de eerste
    body = tussenstand(page, "1")
    assert body["waarde"]["keurmerken"]["EU_ORGANIC_FARMING"] == "aanwezig"
    verwacht_actief(page, "GREEN_DOT")
    expect(tid(page, "etiket-id")).to_have_text(E1)
    assert page.evaluate("() => window.__vreemdeFocus") == []


def test_r7_nutriscore_toetsen_en_456_0_elders_niets(page, start_server):
    posts = volg_posts(page)
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    for _ in range(8):
        page.keyboard.press("ArrowDown")
    verwacht_actief(page, NS)

    for toets, ns in (("1", ["A", "C"]), ("3", ["A"]), ("0", "onleesbaar"), ("0", ["A"]), ("5", ["A", "E"])):
        body = tussenstand(page, toets)
        got = body["waarde"]["nutriscore"]
        assert (got if isinstance(got, str) else sorted(got)) == ns, (toets, got)
        verwacht_actief(page, NS)
    expect(tid(page, "ns-A")).to_be_checked()
    expect(tid(page, "ns-E")).to_be_checked()
    expect(tid(page, "ns-onleesbaar")).not_to_be_checked()

    page.keyboard.press("ArrowUp")
    verwacht_actief(page, V)
    wacht_op_lopende_opslagen(posts)
    voor, n = gekozen(page), len(posts)
    for toets in ("4", "5", "0"):
        page.keyboard.press(toets)
    verwacht_actief(page, V)
    assert gekozen(page) == voor
    body = tussenstand(page, "3")  # ijkpunt: alleen deze POST mag erbij zijn gekomen
    wacht_op_lopende_opslagen(posts)
    assert len(posts) == n + 1
    assert body["waarde"]["keurmerken"][V] == "onzeker"


def test_r7_ingedrukt_gehouden_cijfer_doet_niets(page, start_server):
    posts = volg_posts(page)
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    voor = gekozen(page)
    page.evaluate("""() => { for (const key of ['1', '2', '3', 'b', 'Escape']) document.body.dispatchEvent(
        new KeyboardEvent('keydown', {key, repeat: true, bubbles: true, cancelable: true})); }""")
    verwacht_actief(page, "EU_ORGANIC_FARMING")
    expect(tid(page, "etiket-id")).to_have_text(E1)
    expect(page.locator("#melding")).to_have_text("")  # een herhaalde b bevestigt niets (ook geen "Kies eerst")
    assert gekozen(page) == voor
    body = tussenstand(page, "3")
    wacht_op_lopende_opslagen(posts)
    assert len(posts) == 1
    assert body["waarde"]["keurmerken"]["EU_ORGANIC_FARMING"] == "onzeker"
    assert body["waarde"]["keurmerken"]["GREEN_DOT"] == "afwezig"
    verwacht_actief(page, "GREEN_DOT")


def test_r7_sneltoetsen_doen_niets_in_opmerking(page, start_server, tmp_path):
    posts = volg_posts(page)
    laad_klaar(page, start_server())
    wacht_beeld(page, 4096)
    x, y, _, _ = zichtbaar_midden(page)
    page.mouse.click(x, y)
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "in")
    verwacht_actief(page, "EU_ORGANIC_FARMING")
    voor = gekozen(page)

    tekst = "2 logo's 1x 0"
    page.locator("#opmerking").click()
    page.keyboard.type(tekst)
    for toets in ("ArrowUp", "ArrowDown", "Escape", "ArrowLeft", "ArrowRight", "b"):
        page.keyboard.press(toets)
    expect(page.locator("#opmerking")).to_have_value(tekst + "b")
    assert page.evaluate("() => document.activeElement.id") == "opmerking"
    expect(tid(page, "etiket-id")).to_have_text(E1)
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "in")
    verwacht_actief(page, "EU_ORGANIC_FARMING")
    assert gekozen(page) == voor

    page.locator("#opmerking").blur()
    body = tussenstand(page, "3")  # ijkpunt buiten het tekstveld
    wacht_op_lopende_opslagen(posts)
    assert len(posts) == 1
    assert body["waarde"]["keurmerken"]["EU_ORGANIC_FARMING"] == "onzeker"
    assert body["waarde"]["opmerking"] == tekst + "b"
    assert lees_uitslag(tmp_path)[E1].get("status") is None


def test_r7_pijlen_op_keuze_met_focus_navigeren_zonder_keuze_te_wijzigen(page, start_server, tmp_path):
    posts = volg_posts(page)
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    radio(page, "MARINE_STEWARDSHIP_COUNCIL_LABEL", "aanwezig").click()  # al gekozen: geen wijziging, wel focus
    assert page.evaluate("() => document.activeElement.value") == "aanwezig"
    voor = gekozen(page)

    for pijl, rij in (("ArrowDown", "WEIDEMELK"), ("ArrowUp", "MARINE_STEWARDSHIP_COUNCIL_LABEL"),
                      ("ArrowUp", "PREGNANCY_WARNING")):  # ↑/↓ op de keuze met focus: rij wisselt, keuze niet
        page.keyboard.press(pijl)
        verwacht_actief(page, rij)
    assert page.evaluate("() => document.activeElement.value") == "aanwezig"
    assert gekozen(page) == voor

    page.keyboard.press("ArrowRight")
    expect(tid(page, "etiket-id")).to_have_text(E2)
    assert not focus_op_keuze(page)
    page.keyboard.press("ArrowLeft")
    expect(tid(page, "etiket-id")).to_have_text(E1)
    assert gekozen(page) == voor
    wacht_op_lopende_opslagen(posts)
    assert posts == [], "pijlen op een keuze met focus slaan niets op"

    tid(page, "ns-C").click()  # zet C uit (tussenstand) en geeft de letter focus
    wacht_op_lopende_opslagen(posts)
    n, voor = len(posts), gekozen(page)
    page.keyboard.press("ArrowRight")
    expect(tid(page, "etiket-id")).to_have_text(E2)
    page.keyboard.press("ArrowLeft")
    expect(tid(page, "etiket-id")).to_have_text(E1)
    assert gekozen(page) == voor
    tussenstand(page, "3")  # ijkpunt
    wacht_op_lopende_opslagen(posts)
    assert len(posts) == n + 1
    assert lees_uitslag(tmp_path)[E1]["keurmerken"]["MARINE_STEWARDSHIP_COUNCIL_LABEL"] == "aanwezig"


# --- bevestigen en volgende -------------------------------------------------------------------------------------------
def test_r7_volgende_en_b_bevestigen_en_door(page, start_server, tmp_path):
    page.add_init_script(SPION_FOCUS)
    posts = volg_posts(page)
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    expect(page.locator("#keuzes #volgende")).to_have_count(1)

    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.locator("#volgende").click()
    assert antwoord.value.status == 200
    expect(tid(page, "etiket-id")).to_have_text(E2)
    assert not focus_op_keuze(page)
    assert posts[-1].post_data_json["id"] == E1
    assert posts[-1].post_data_json["waarde"]["status"] == "bevestigd"
    expect(page.locator("#melding")).to_contain_text("Opgeslagen (bevestigd)")
    expect(page.locator("#melding")).to_contain_text(E1)

    radio(page, "GREEN_DOT", "aanwezig").click()  # al gekozen: alleen focus op de keuze
    with page.expect_response(is_pad("/opslaan")):
        page.keyboard.press("b")
    expect(tid(page, "etiket-id")).to_have_text(E3)
    assert not focus_op_keuze(page)
    assert posts[-1].post_data_json["id"] == E2 and posts[-1].post_data_json["waarde"]["status"] == "bevestigd"

    with page.expect_response(is_pad("/opslaan")):
        page.locator("#opslaan").click()  # blijft staan
    expect(tid(page, "etiket-id")).to_have_text(E3)
    assert posts[-1].post_data_json["waarde"]["status"] == "bevestigd"

    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowRight")
    expect(tid(page, "etiket-id")).to_have_text(E6)  # WEIDEMELK ontbreekt in de voorinvulling
    wacht_op_lopende_opslagen(posts)
    n = len(posts)
    page.locator("#volgende").click()
    expect(page.locator("#melding")).to_contain_text("Kies eerst")
    expect(tid(page, "etiket-id")).to_have_text(E6)
    page.locator("#melding").evaluate("e => { e.textContent = ''; }")
    page.locator("#volgende").blur()
    page.keyboard.press("b")
    expect(page.locator("#melding")).to_contain_text("Kies eerst")
    expect(tid(page, "etiket-id")).to_have_text(E6)
    assert len(posts) == n

    page.keyboard.press("ArrowRight")
    expect(tid(page, "etiket-id")).to_have_text(E7)
    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.keyboard.press("b")
    assert antwoord.value.status == 200
    expect(tid(page, "etiket-id")).to_have_text(E7)  # laatste etiket: opslaan en blijven
    with page.expect_response(is_pad("/opslaan")):
        page.locator("#volgende").click()
    expect(tid(page, "etiket-id")).to_have_text(E7)
    uit = lees_uitslag(tmp_path)
    assert [uit[d]["status"] for d in (E1, E2, E3, E7)] == ["bevestigd"] * 4
    assert page.evaluate("() => window.__vreemdeFocus") == []


def test_r7_opslagfout_van_ander_etiket_noemt_etiketcode(page, start_server):
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    page.route("**/opslaan", lambda route: route.fulfill(status=500, body="{}"), times=1)
    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.keyboard.press("b")
    assert antwoord.value.status == 500
    expect(tid(page, "etiket-id")).to_have_text(E2)
    expect(page.locator("#melding")).to_contain_text("Opslaan mislukt")
    expect(page.locator("#melding")).to_contain_text(E1)


def test_r7_statusmerkje_in_de_kopregel(page, start_server):
    basis = start_server()
    laad_klaar(page, basis)
    status = tid(page, "etiket-status")
    expect(status).to_have_count(1)
    expect(status).to_have_js_property("hidden", True)
    expect(status).to_have_text("")

    with page.expect_response(is_pad("/opslaan")):
        page.keyboard.press("b")
    expect(tid(page, "etiket-id")).to_have_text(E2)
    expect(status).to_have_js_property("hidden", True)
    with page.expect_response(is_pad("/opslaan")):
        page.locator("#onleesbaar").click()
    expect(status).to_have_text("onleesbaar")
    page.keyboard.press("ArrowLeft")
    expect(tid(page, "etiket-id")).to_have_text(E1)
    expect(status).to_be_visible()
    expect(status).to_have_text("bevestigd")

    laad_klaar(page)  # uit de serverstand: opent op het eerste open etiket (E3)
    expect(tid(page, "etiket-id")).to_have_text(E3)
    expect(tid(page, "kopregel").locator("#positie")).to_have_text(f"3 / {len(ALLE)}")
    page.keyboard.press("ArrowLeft")
    expect(status).to_have_text("onleesbaar")
    page.keyboard.press("ArrowLeft")
    expect(status).to_have_text("bevestigd")


# --- AI-merkje, gewijzigd, actieve rij --------------------------------------------------------------------------------
def test_r7_ai_merkjes_en_rijmarkering(page, start_server):
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    for code in LOS:
        merk = tid(page, f"keuze-{code}").locator('label[data-ai="true"]')
        expect(merk).to_have_count(1)
        expect(merk.locator("input")).to_have_value("aanwezig" if code in A1 else "afwezig")
        assert merk.evaluate("e => getComputedStyle(e, '::after').content") == '"AI"'
        expect(tid(page, f"ai-{code}")).to_have_text("")
        if code in A1:
            expect(tid(page, f"rij-{code}")).to_have_attribute("data-ai-aanwezig", "true")
        else:
            expect(tid(page, f"rij-{code}")).not_to_have_attribute("data-ai-aanwezig", "true")
    ns_merk = tid(page, f"rij-{NS}").locator('label[data-ai="true"]')
    expect(ns_merk).to_have_count(1)
    expect(ns_merk.locator("input")).to_have_attribute("data-testid", "ns-C")
    expect(tid(page, f"rij-{NS}")).to_have_attribute("data-ai-aanwezig", "true")
    expect(tid(page, f"ai-{NS}")).to_have_text("")

    naar(page, E5)  # geen voorinvulling: nergens een merkje, wel de notitie
    expect(page.locator("#notitie")).to_be_visible()
    expect(page.locator("#notitie")).to_contain_text("AI-voorinvulling ontbreekt")
    expect(page.locator("[data-ai]")).to_have_count(0)
    expect(page.locator('[data-ai-aanwezig="true"]')).to_have_count(0)
    expect(tid(page, "uitsneden")).to_have_js_property("hidden", True)

    page.keyboard.press("ArrowRight")
    expect(tid(page, "etiket-id")).to_have_text(E6)
    expect(tid(page, "ai-WEIDEMELK")).to_have_text("AI: —")
    expect(tid(page, "keuze-WEIDEMELK").locator("label[data-ai]")).to_have_count(0)
    expect(tid(page, f"ai-{NS}")).to_have_text("AI: geen letter")
    expect(tid(page, f"rij-{NS}").locator("label[data-ai]")).to_have_count(0)
    expect(tid(page, f"rij-{NS}")).not_to_have_attribute("data-ai-aanwezig", "true")
    expect(tid(page, "rij-GREEN_DOT")).to_have_attribute("data-ai-aanwezig", "true")
    expect(page.locator("#notitie")).to_have_text("")


def test_r7_gewijzigd_volgt_veranderd(page, start_server):
    posts = volg_posts(page)
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    for code in NEGEN:
        expect(tid(page, f"gewijzigd-{code}")).to_have_count(1)
        expect(tid(page, f"gewijzigd-{code}")).to_have_js_property("hidden", True)

    for actie in (lambda: radio(page, "GREEN_DOT", "onzeker").check(), lambda: tid(page, "ns-A").check(),
                  lambda: radio(page, "GREEN_DOT", "afwezig").check(), lambda: radio(page, V, "onzeker").check()):
        with page.expect_request(is_pad("/opslaan")) as verzoek:
            actie()
        verzoek.value.response()
        veranderd = set(verzoek.value.post_data_json["waarde"]["veranderd"])
        for code in NEGEN:
            g = tid(page, f"gewijzigd-{code}")
            expect(g).to_have_js_property("hidden", code not in veranderd)
            if code in veranderd:
                expect(g).to_have_text("gewijzigd")
    wacht_op_lopende_opslagen(posts)
    assert set(posts[-1].post_data_json["waarde"]["veranderd"]) == {"NUTRISCORE", V}


def test_r7_rij_actief_bij_klik_en_bij_tab(page, start_server):
    page.add_init_script(SPION_FOCUS)
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    verwacht_actief(page, "EU_ORGANIC_FARMING")
    tid(page, "rij-PREGNANCY_WARNING").get_by_test_id("stand-PREGNANCY_WARNING").click()
    verwacht_actief(page, "PREGNANCY_WARNING")

    radio(page, "MARINE_STEWARDSHIP_COUNCIL_LABEL", "aanwezig").click()  # al gekozen: geen POST, wel focus
    verwacht_actief(page, "MARINE_STEWARDSHIP_COUNCIL_LABEL")
    page.keyboard.press("Tab")
    rij_focus = page.evaluate(
        "() => { const r = document.activeElement.closest('[data-testid^=\"rij-\"]'); return r && r.getAttribute('data-testid'); }")
    assert rij_focus == "rij-WEIDEMELK"
    assert actieve_rijen(page) == [rij_focus]
    page.keyboard.press("Shift+Tab")
    verwacht_actief(page, "MARINE_STEWARDSHIP_COUNCIL_LABEL")
    assert page.evaluate("() => window.__vreemdeFocus") == []


def test_r7_nutriscore_letter_zet_onleesbaar_uit(page, start_server):
    """Letters óf "letter onleesbaar": met onleesbaar aan zet een letter (klik of toets) onleesbaar uit."""
    posts = volg_posts(page)
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    for _ in range(8):
        page.keyboard.press("ArrowDown")
    verwacht_actief(page, NS)
    assert tussenstand(page, "0")["waarde"]["nutriscore"] == "onleesbaar"
    body = tussenstand(page, "1")  # toets: letter A aan, onleesbaar uit
    assert sorted(body["waarde"]["nutriscore"]) == ["A", "C"]
    expect(tid(page, "ns-onleesbaar")).not_to_be_checked()

    assert tussenstand(page, "0")["waarde"]["nutriscore"] == "onleesbaar"
    with page.expect_request(is_pad("/opslaan")) as verzoek:  # klik: letter E aan, onleesbaar uit
        tid(page, "ns-E").click()
    verzoek.value.response()
    assert sorted(verzoek.value.post_data_json["waarde"]["nutriscore"]) == ["A", "C", "E"]
    expect(tid(page, "ns-onleesbaar")).not_to_be_checked()
    wacht_op_lopende_opslagen(posts)


# --- automate (trace run 9): gedrag uit reviewronde 1 dat nog geen onderscheidende test had ---------------------------
def test_r7_opslagfout_blijft_staan_tot_dat_etiket_opslaat(page, start_server):  # R7-17b
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    page.route("**/opslaan", lambda route: route.fulfill(status=500, body="{}"), times=1)
    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.keyboard.press("b")
    assert antwoord.value.status == 500
    melding = page.locator("#melding")
    for doel, toets in ((E2, None), (E3, "ArrowRight"), (E2, "ArrowLeft"), (E1, "ArrowLeft")):
        if toets:
            page.keyboard.press(toets)
        expect(tid(page, "etiket-id")).to_have_text(doel)
        expect(melding).to_contain_text("Opslaan mislukt")
        expect(melding).to_contain_text(E1)

    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.locator("#opslaan").click()  # E1 slaat nu wél op
    assert antwoord.value.status == 200
    expect(melding).to_contain_text("Opgeslagen (bevestigd)")
    page.locator("#opslaan").blur()
    page.keyboard.press("ArrowRight")
    expect(tid(page, "etiket-id")).to_have_text(E2)
    expect(melding).not_to_contain_text("Opslaan mislukt")
    expect(melding).to_have_text("")


def test_r7_stand_volledig_zichtbaar_naast_gewijzigd_en_ai_tekst(page, start_server):  # R7-24
    stand = {"uitslag": {}, "stand": {c: {"met": 16, "zonder": 50} for c in NEGEN}}  # doel gehaald: ook het bolletje
    page.route("**/stand", lambda route: route.fulfill(status=200, content_type="application/json",
                                                       body=json.dumps(stand)))
    posts = volg_posts(page)
    laad_klaar(page, start_server())
    naar(page, E6)
    expect(tid(page, f"ai-{NS}")).to_have_text("AI: geen letter")
    expect(tid(page, "ai-WEIDEMELK")).to_have_text("AI: —")
    with page.expect_response(is_pad("/opslaan")):
        radio(page, "GREEN_DOT", "onzeker").check()
    wacht_op_lopende_opslagen(posts)
    expect(tid(page, "gewijzigd-GREEN_DOT")).to_be_visible()
    for code in ("GREEN_DOT", NS, "WEIDEMELK"):
        expect(tid(page, f"stand-{code}")).to_have_text("mét 16/16 · zonder 50/50")
        m = tid(page, f"rij-{code}").evaluate("""(r) => {
          const s = r.querySelector('[data-testid^="stand-"]'), regel = s.parentElement, naam = r.querySelector('.naam');
          const b = s.getBoundingClientRect(), n = naam.getBoundingClientRect();
          return {sw: regel.scrollWidth, cw: regel.clientWidth, rechts: b.right, naamRechts: n.right, w: b.width}; }""")
        assert m["w"] > 0 and m["sw"] <= m["cw"] and m["rechts"] <= m["naamRechts"] + 0.5, (code, m)


def test_r7_uitsnedenamen_voor_het_laden_van_het_beeld(page, start_server):  # R7-25
    gehouden = []
    page.route(f"**/beelden/{E1}.png", lambda route: gehouden.append(route))
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    namen = ["Zwangerschapswaarschuwing", "V-label (vegan of vegetarisch)", "MSC", "Vegan Society", "Recyclebaar",
             "Zwangerschapswaarschuwing"]
    expect(page.locator('[data-testid="uitsneden"] figcaption')).to_have_text(namen)
    assert page.evaluate("() => document.querySelector('[data-testid=\"overzicht\"]').naturalWidth") == 0
    for route in gehouden:
        route.continue_()
    wacht_beeld(page, 4096)
    expect(page.locator('[data-testid="uitsneden"] figcaption')).to_have_text(namen)


def test_r7_enter_op_beeldlink_zoomt_op_het_midden(page, start_server):  # R7-26
    laad_klaar(page, start_server())
    wacht_beeld(page, 4096)
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "passend")
    tid(page, "volledig").focus()
    page.keyboard.press("Enter")
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "in")
    v = vakmaat(page)
    assert v["sl"] > 0 and v["sw"] > v["w"], v
    _, _, fx, fy = zichtbaar_midden(page)
    assert abs(fx - 0.5) <= 0.02 and abs(fy - 0.5) <= 0.02, (fx, fy, v)


def test_r7_paneel_scrollt_in_laag_venster(page, start_server):  # R7-28 (paneel)
    page.set_viewport_size({"width": 1440, "height": 600})
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    m = page.locator("#keuzes").evaluate(
        "e => ({sh: e.scrollHeight, ch: e.clientHeight, oy: getComputedStyle(e).overflowY})")
    assert m["oy"] == "auto" and m["sh"] > m["ch"], m
    page.locator("#volgende").scroll_into_view_if_needed()
    binnen_venster(page, page.locator("#volgende"), "#volgende")
    with page.expect_response(is_pad("/opslaan")):
        page.locator("#volgende").click()
    expect(tid(page, "etiket-id")).to_have_text(E2)


def test_r7_titel_krimpt_voor_de_etiketcode(page, start_server):  # R7-28 (kopregel)
    page.set_viewport_size({"width": 600, "height": 800})
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    m = page.evaluate("""() => { const h = document.querySelector('header h1'),
      i = document.querySelector('[data-testid="etiket-id"]');
      return {h: [h.scrollWidth, h.clientWidth], i: [i.scrollWidth, i.clientWidth]}; }""")
    assert m["h"][0] > m["h"][1], m  # titel afgekapt
    assert 0 < m["i"][1] and m["i"][0] <= m["i"][1], m  # etiketcode volledig


NAVY = "rgb(47, 90, 122)"


def test_r7_letters_gedempt_zolang_onleesbaar_aan_staat(page, start_server):  # R7-29
    laad_klaar(page, start_server())
    expect(tid(page, "etiket-id")).to_have_text(E1)
    letter = tid(page, "ns-C").locator("xpath=..")
    expect(tid(page, "ns-C")).to_be_checked()
    expect(letter).to_have_css("background-color", NAVY)
    for _ in range(8):
        page.keyboard.press("ArrowDown")
    verwacht_actief(page, NS)
    assert tussenstand(page, "0")["waarde"]["nutriscore"] == "onleesbaar"
    expect(tid(page, "ns-C")).to_be_checked()  # de letter blijft aangevinkt, maar gedempt
    expect(letter).not_to_have_css("background-color", NAVY)
    assert sorted(tussenstand(page, "0")["waarde"]["nutriscore"]) == ["C"]
    expect(letter).to_have_css("background-color", NAVY)
