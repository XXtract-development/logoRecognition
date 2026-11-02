"""CAP-3 ronde 8 (ATDD, rode fase): het hele etiket passend in beeld, inzoomen alleen op verzoek (SPEC CAP-3, toetsset
§6, invul-ux/EXPERIENCE.md paragraaf *Etiketbeeld*).

Contract: atdd-checklist, "Ronde 8" → "Interfacecontract ronde 8". `data-stand` is alleen nog `passend` | `in`. Rood
zolang de pagina een hoog etiket op breedte zet, passend niet in beide richtingen centreert, de kaders van de actieve
rij niet vult en bovenop legt, of een klik in de witte rand laat inzoomen.

Zelfde opzet als ronde 7 (fixtures en helpers komen daarvandaan): verzonnen ids, PIL-beelden in `tmp_path`, alleen
127.0.0.1.
"""
import json
import re

import pytest
from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import expect

from conftest import laad_klaar
from test_cap03_invulpagina_browser import browser, radio  # noqa: F401 (browser is een fixture)
from test_ronde7_browser_20261102 import (  # noqa: F401 (page en start_server zijn fixtures)
    A1,
    H1,
    LOS,
    NAVY,
    ZWAAR,
    beeldvlak,
    doc,
    etiket,
    kader_in_vak,
    page,
    start_server,
    tid,
    tussenstand,
    vakmaat,
    verwacht_actief,
    vi,
    wacht_beeld,
    zichtbaar_midden,
)

pytestmark = pytest.mark.browser

RC, PW, MSC = "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING", "MARINE_STEWARDSHIP_COUNCIL_LABEL"
# Hoog (tegels y0 = 0, 768, 1536, 2304, 2896): `hint` staat op code gesorteerd, dus het onderste kader komt eerst.
H_OMGEKEERD = [("GREEN_DOT", 4), (RC, 2)]
HOOG = etiket(doc(401), (200, 3920), H_OMGEKEERD, vi({"GREEN_DOT", RC}, ["A"], hints=H_OMGEKEERD))
BREED = etiket(doc(402), (4096, 780), H1, vi(A1, ["C"], hints=H1))  # tegel 4 gedeeld door RECYCLABLE en PREGNANCY
KLEIN = etiket(doc(403), (428, 354), [("GREEN_DOT", 0)], vi({"GREEN_DOT"}, ["B"], hints=[("GREEN_DOT", 0)]))
# Klein etiket met twee uitsneden: hier wint 3× passend van de ware breedte, ook bij de tweede klik vanuit `in`.
KLEIN2 = etiket(doc(404), (428, 354), [("GREEN_DOT", 0), (RC, 0)], vi({"GREEN_DOT", RC}, ["B"], hints=[("GREEN_DOT", 0), (RC, 0)]))
R8 = [HOOG, BREED, KLEIN]
VENSTERS = [(1440, 800), (1920, 970), (1280, 700)]
vid = lambda v: f"{v[0]}x{v[1]}"  # noqa: E731


def open8(page, start_server, venster=(1440, 800), lijst=R8):
    page.set_viewport_size({"width": venster[0], "height": venster[1]})
    laad_klaar(page, start_server(lijst))
    expect(tid(page, "etiket-id")).to_have_text(lijst[0]["id"])
    wacht_beeld(page, lijst[0]["maat"][0])


def naar8(page, e):
    for _ in range(R8.index(e)):
        page.keyboard.press("ArrowRight")
    expect(tid(page, "etiket-id")).to_have_text(e["id"])
    wacht_beeld(page, e["maat"][0])


# Passend-regel van het contract, in vensterpixels: binnenbox van het vak (client*), inhoudsbox van `overzicht`.
PASSEND = """([W, H]) => {
  const v = document.querySelector('[data-testid="beeldvak"]'), i = document.querySelector('[data-testid="overzicht"]');
  const r = v.getBoundingClientRect(), vx = r.left + v.clientLeft, vy = r.top + v.clientTop;
  const vw = v.clientWidth, vh = v.clientHeight;
  const q = i.getBoundingClientRect(), s = getComputedStyle(i), p = (k) => parseFloat(s[k]) || 0;
  const bx = q.left + p('borderLeftWidth') + p('paddingLeft'), by = q.top + p('borderTopWidth') + p('paddingTop');
  const bw = q.right - p('borderRightWidth') - p('paddingRight') - bx, bh = q.bottom - p('borderBottomWidth') - p('paddingBottom') - by;
  const k = Math.min(vw / W, vh / H), fouten = [];
  if (Math.abs(bw - W * k) > 2 || Math.abs(bh - H * k) > 2) fouten.push('schaal is niet min(vak/etiket)');
  if (Math.min(Math.abs(bw - vw), Math.abs(bh - vh)) > 2) fouten.push('geen kant raakt het vak');
  if (bx < vx - 1 || by < vy - 1 || bx + bw > vx + vw + 1 || by + bh > vy + vh + 1) fouten.push('beeld steekt buiten het vak');
  if (v.scrollWidth > vw + 1 || v.scrollHeight > vh + 1) fouten.push('vak scrollt');
  if (Math.abs(bx + bw / 2 - (vx + vw / 2)) > 2) fouten.push('niet horizontaal gecentreerd');
  if (Math.abs(by + bh / 2 - (vy + vh / 2)) > 2) fouten.push('niet verticaal gecentreerd');
  if (v.scrollTop || v.scrollLeft) fouten.push('scroll niet 0,0');
  return {fouten, vak: [vx, vy, vw, vh, v.scrollWidth, v.scrollHeight], beeld: [bx, by, bw, bh], schaal: k};
}"""


def verwacht_passend(page, maat):
    """`data-stand="passend"` en de passend-regel; na een maatwijziging mag de pagina even herberekenen."""
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "passend")
    try:
        page.wait_for_function(f"m => ({PASSEND})(m).fouten.length === 0", arg=list(maat), timeout=2_000)
    except PlaywrightTimeout:
        pass  # de assert hieronder zegt wat er mis is
    m = page.evaluate(PASSEND, list(maat))
    assert m["fouten"] == [], m
    return m


def geen_zoom(page, wanneer):
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "passend")
    v = vakmaat(page)
    assert v["st"] == 0 and v["sl"] == 0, (wanneer, v)


def beeldbreedte_wordt(page, doel):
    page.wait_for_function("w => Math.abs(document.querySelector('[data-testid=\"overzicht\"]')"
                           ".getBoundingClientRect().width - w) <= 2", arg=doel)


def klik_midden_beeld(page):
    bx, by, bw, bh = (beeldvlak(page)[k] for k in ("x", "y", "w", "h"))
    page.mouse.click(bx + bw / 2, by + bh / 2)


def na_resize(page, maat):
    page.evaluate("() => { window.__resized = false; addEventListener('resize', () => { window.__resized = true; }); }")
    page.set_viewport_size({"width": maat[0], "height": maat[1]})
    page.wait_for_function("() => window.__resized")  # na de eigen resize-handler van de pagina


# --- passend -----------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("venster", VENSTERS, ids=vid)
@pytest.mark.parametrize("nr", [0, 1], ids=["breed-4096x780", "hoog-200x3920"])
def test_r8_passend_hele_etiket_in_beeld(page, start_server, venster, nr):
    open8(page, start_server, venster, ZWAAR)
    e = ZWAAR[nr]
    if nr:
        page.keyboard.press("ArrowRight")
        expect(tid(page, "etiket-id")).to_have_text(e["id"])
        wacht_beeld(page, e["maat"][0])
    expect(tid(page, "kader")).to_have_count(6)
    verwacht_passend(page, e["maat"])


@pytest.mark.parametrize("venster", [(1280, 700), (1920, 970)], ids=["breedte-raakt", "hoogte-raakt"])
def test_r8_klein_etiket_wordt_vergroot(page, start_server, venster):
    open8(page, start_server, venster, [KLEIN])
    m = verwacht_passend(page, KLEIN["maat"])
    assert m["beeld"][2] > 428 and m["beeld"][3] > 354, m


def test_r8_geen_automatisch_inzoomen(page, start_server):
    open8(page, start_server)  # HOOG: beide kaders liggen laag op het etiket
    expect(tid(page, "kader")).to_have_count(2)
    geen_zoom(page, "na laden")
    page.keyboard.press("ArrowDown")
    verwacht_actief(page, "GREEN_DOT")  # kader op tegel 4, onderaan
    geen_zoom(page, "na ↓")
    assert tussenstand(page, "3")["waarde"]["keurmerken"]["GREEN_DOT"] == "onzeker"
    verwacht_actief(page, RC)
    geen_zoom(page, "na cijfertoets met rijwissel")
    page.keyboard.press("ArrowUp")
    verwacht_actief(page, "GREEN_DOT")
    geen_zoom(page, "na ↑")
    tid(page, f"stand-{RC}").click()
    verwacht_actief(page, RC)
    geen_zoom(page, "na klik in een rij")
    radio(page, "GREEN_DOT", "onzeker").click()  # al gekozen: geen POST, wel focus in die rij
    verwacht_actief(page, "GREEN_DOT")
    page.keyboard.press("Tab")
    verwacht_actief(page, RC)
    geen_zoom(page, "na Tab")

    page.keyboard.press("ArrowRight")
    expect(tid(page, "etiket-id")).to_have_text(BREED["id"])
    geen_zoom(page, "na etiketwissel")
    klik_midden_beeld(page)
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "in")
    page.keyboard.press("ArrowRight")
    expect(tid(page, "etiket-id")).to_have_text(KLEIN["id"])
    geen_zoom(page, "na wissel vanuit ingezoomd")
    page.keyboard.press("ArrowLeft")
    page.keyboard.press("ArrowLeft")
    expect(tid(page, "etiket-id")).to_have_text(HOOG["id"])
    geen_zoom(page, "terug op het hoge etiket")


# --- markering ---------------------------------------------------------------------------------------------------------
KADERSTIJL = """() => [...document.querySelectorAll('[data-testid="kader"]')].map((k) => { const s = getComputedStyle(k);
  return {code: k.dataset.code, tegel: k.dataset.tegel, actief: k.getAttribute('data-actief') === 'true',
          rand: ['Top', 'Right', 'Bottom', 'Left'].map((z) => [s['border' + z + 'Width'], s['border' + z + 'Color']]),
          bg: s.backgroundColor, z: s.zIndex === 'auto' ? 0 : Number(s.zIndex)}; })"""


def alfa(kleur):
    if kleur == "transparent":
        return 0.0
    getallen = re.findall(r"[\d.]+", kleur)
    return float(getallen[3]) if len(getallen) > 3 else 1.0


def verwacht_markering(page, code, n):
    """Alle n kaders van `code` gemarkeerd (3 px navy, gevuld, bovenop); alle andere zonder vulling en niet actief."""
    expect(page.locator(f'[data-testid="kader"][data-code="{code}"][data-actief="true"]')).to_have_count(n)
    kaders = page.evaluate(KADERSTIJL)
    actief = [k for k in kaders if k["code"] == code]
    rest = [k for k in kaders if k["code"] != code]
    assert len(actief) == n, kaders
    for k in actief:
        assert k["actief"] and k["rand"] == [["3px", NAVY]] * 4, k
        assert alfa(k["bg"]) > 0, ("geen vulling", k)
    for k in rest:
        assert not k["actief"] and alfa(k["bg"]) == 0, k
    if actief and rest:
        assert min(k["z"] for k in actief) > max(k["z"] for k in rest), ("niet bovenop", kaders)


def test_r8_markering_alle_kaders_van_actieve_rij(page, start_server):
    open8(page, start_server)
    naar8(page, BREED)
    expect(tid(page, "kader")).to_have_count(6)
    verwacht_markering(page, "EU_ORGANIC_FARMING", 0)
    page.keyboard.press("ArrowDown")
    page.keyboard.press("ArrowDown")
    verwacht_markering(page, RC, 1)  # tegel 4 gedeeld met PREGNANCY: RECYCLABLE ligt bovenop
    page.keyboard.press("ArrowDown")
    verwacht_markering(page, PW, 2)  # tegels 0 en 4, nu PREGNANCY bovenop
    tid(page, "stand-VEGAN_SOCIETY_VEGAN_LOGO").click()
    verwacht_markering(page, "VEGAN_SOCIETY_VEGAN_LOGO", 1)

    x, y, _, _ = zichtbaar_midden(page)
    page.mouse.click(x, y)
    vak = tid(page, "beeldvak")
    expect(vak).to_have_attribute("data-stand", "in")
    beeldbreedte_wordt(page, 4096)
    voor = (beeldvlak(page)["w"], vakmaat(page)["st"], vakmaat(page)["sl"])
    for toets, code, n in (("ArrowUp", "WEIDEMELK", 0), ("ArrowUp", MSC, 1), ("ArrowUp", PW, 2), ("ArrowUp", RC, 1)):
        page.keyboard.press(toets)
        verwacht_markering(page, code, n)
        expect(vak).to_have_attribute("data-stand", "in")
        na = (beeldvlak(page)["w"], vakmaat(page)["st"], vakmaat(page)["sl"])
        assert all(abs(a - b) <= 1 for a, b in zip(voor, na)), (code, voor, na)


# --- inzoomen op verzoek -----------------------------------------------------------------------------------------------
@pytest.mark.parametrize("e,venster", [(BREED, (1440, 800)), (KLEIN, (1280, 700)), (HOOG, (1440, 800))],
                         ids=["breed-ware-breedte", "klein-3x-passend", "hoog"])
def test_r8_klik_op_beeld_zoomt_in_en_terug_naar_passend(page, start_server, e, venster):
    popups = []
    page.on("popup", lambda p: popups.append(p))
    open8(page, start_server, venster, [e])
    w0 = verwacht_passend(page, e["maat"])["beeld"][2]
    url, vak = page.url, tid(page, "beeldvak")

    klik_midden_beeld(page)
    expect(vak).to_have_attribute("data-stand", "in")
    beeldbreedte_wordt(page, max(e["maat"][0], 3 * w0))
    assert abs(beeldvlak(page)["w"] - max(e["maat"][0], 3 * w0)) <= 2
    x, y, _, _ = zichtbaar_midden(page)
    page.mouse.click(x, y)  # klik op het ingezoomde beeld = terug
    verwacht_passend(page, e["maat"])

    klik_midden_beeld(page)
    expect(vak).to_have_attribute("data-stand", "in")
    page.keyboard.press("Escape")
    verwacht_passend(page, e["maat"])
    assert page.url == url and popups == []


@pytest.mark.parametrize("e,venster", [(HOOG, (1440, 800)), (KLEIN, (1920, 970)), (BREED, (1440, 800))],
                         ids=["hoog-rand-opzij", "klein-rand-opzij", "breed-rand-boven-onder"])
def test_r8_klik_in_witte_rand_doet_niets(page, start_server, e, venster):
    popups = []
    page.on("popup", lambda p: popups.append(p))
    open8(page, start_server, venster, [e])
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "passend")
    url = page.url
    v, b = vakmaat(page), beeldvlak(page)
    rand = {"links": b["x"] - v["x"], "rechts": v["x"] + v["w"] - b["x"] - b["w"],
            "boven": b["y"] - v["y"], "onder": v["y"] + v["h"] - b["y"] - b["h"]}
    kant = max(rand, key=rand.get)
    assert rand[kant] >= 10, rand
    punt = {"links": (v["x"] + rand["links"] / 2, v["y"] + v["h"] / 2),
            "rechts": (b["x"] + b["w"] + rand["rechts"] / 2, v["y"] + v["h"] / 2),
            "boven": (v["x"] + v["w"] / 2, v["y"] + rand["boven"] / 2),
            "onder": (v["x"] + v["w"] / 2, b["y"] + b["h"] + rand["onder"] / 2)}[kant]
    page.mouse.click(*punt)
    geen_zoom(page, ("klik in de rand", kant, punt))
    assert page.url == url and popups == []


@pytest.mark.parametrize("e,eerste,tweede", [(HOOG, (RC, 2), ("GREEN_DOT", 4)), (BREED, (MSC, 2), (PW, 4)),
                                             (KLEIN2, ("GREEN_DOT", 0), (RC, 0))],
                         ids=["hoog", "breed", "klein-3x-passend"])
def test_r8_uitsnede_zoomt_in_op_haar_kader_ook_vanuit_in(page, start_server, e, eerste, tweede):
    open8(page, start_server, lijst=[e])
    vak = tid(page, "beeldvak")
    expect(vak).to_have_attribute("data-stand", "passend")
    w0 = beeldvlak(page)["w"]
    for code, tegel in (eerste, tweede):  # de tweede klik gebeurt al ingezoomd
        page.locator(f'[data-testid="uitsnede"][data-code="{code}"][data-tegel="{tegel}"]').click()
        expect(vak).to_have_attribute("data-stand", "in")
        verwacht_actief(page, code)
        kader_in_vak(page, f'[data-testid="kader"][data-code="{code}"][data-tegel="{tegel}"]')
        assert abs(beeldvlak(page)["w"] - max(e["maat"][0], 3 * w0)) <= 2, code


# --- maatwijziging -----------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("e,nieuw", [(HOOG, (1280, 700)), (BREED, (1920, 970))], ids=["hoog-kleiner", "breed-groter"])
def test_r8_maatwijziging_passend_blijft_passend(page, start_server, e, nieuw):
    open8(page, start_server, lijst=[e])
    verwacht_passend(page, e["maat"])
    na_resize(page, nieuw)
    verwacht_passend(page, e["maat"])


@pytest.mark.parametrize("e", [HOOG, BREED], ids=["hoog", "breed"])
def test_r8_maatwijziging_ingezoomd_houdt_zoom_en_scroll(page, start_server, e):
    open8(page, start_server, lijst=[e])
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "passend")
    w0 = beeldvlak(page)["w"]
    klik_midden_beeld(page)
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "in")
    beeldbreedte_wordt(page, max(e["maat"][0], 3 * w0))
    w, (st, sl) = beeldvlak(page)["w"], page.evaluate("""() => { const v = document.querySelector('[data-testid="beeldvak"]');
      v.scrollTop = Math.floor((v.scrollHeight - v.clientHeight) / 3); v.scrollLeft = Math.floor((v.scrollWidth - v.clientWidth) / 3);
      return [v.scrollTop, v.scrollLeft]; }""")
    assert st + sl > 0
    na_resize(page, (1400, 780))
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "in")
    v = vakmaat(page)
    assert abs(beeldvlak(page)["w"] - w) <= 2 and abs(v["st"] - st) <= 2 and abs(v["sl"] - sl) <= 2, (w, st, sl, v)


# --- concept uit ronde 7 (Friso's open tabblad) ------------------------------------------------------------------------
def test_r8_concept_van_ronde_7_gaat_voor_op_serverstand(page, start_server):
    concept = {"keurmerken": {"GREEN_DOT": "onzeker", "WEIDEMELK": "aanwezig"}, "nutriscore": ["B", "E"],
               "opmerking": "uit het concept", "nsGekozen": True}
    server = {"keurmerken": {c: "afwezig" for c in LOS}, "nutriscore": ["A"], "opmerking": "van de server",
              "veranderd": []}
    page.add_init_script(f"""try {{ sessionStorage.setItem({json.dumps("concept:" + HOOG["id"])},
      {json.dumps(json.dumps(concept))}); }} catch (e) {{}}""")  # about:blank heeft geen sessionStorage
    page.route("**/stand", lambda route: route.fulfill(status=200, content_type="application/json",
                                                       body=json.dumps({"uitslag": {HOOG["id"]: server}, "stand": {}})))
    open8(page, start_server)
    expect(radio(page, "GREEN_DOT", "onzeker")).to_be_checked()
    expect(radio(page, "WEIDEMELK", "aanwezig")).to_be_checked()
    expect(radio(page, RC, "afwezig")).to_be_checked()  # niet in het concept: serverstand
    expect(tid(page, "ns-B")).to_be_checked()
    expect(tid(page, "ns-E")).to_be_checked()
    expect(tid(page, "ns-A")).not_to_be_checked()
    expect(page.locator("#opmerking")).to_have_value("uit het concept")


# --- reviewronde bmad-build ronde 8 ------------------------------------------------------------------------------------
# Playwright start headless Chromium met `--hide-scrollbars`; zonder die vlag en met deze stijl krijgt het beeldvak
# klassieke scrollbalken van 15 px (zoals macOS met "scrollbalken altijd tonen" of Windows), zodat meten mét
# scrollbalken getoetst wordt.
SCROLLBALKEN = "#beeldvak::-webkit-scrollbar { width: 15px; height: 15px; background: #ddd; }"


@pytest.fixture(scope="module")
def browser_scrollbalken(browser):  # noqa: F811 — zelfde Playwright-instantie (twee sync-instanties botsen)
    b = browser.browser_type.launch(ignore_default_args=["--hide-scrollbars"])
    yield b
    b.close()


@pytest.fixture
def spage(browser_scrollbalken):
    context = browser_scrollbalken.new_context(viewport={"width": 1440, "height": 800})
    pagina = context.new_page()
    pagina.set_default_timeout(5_000)
    yield pagina
    context.close()


def met_scrollbalken(page):
    page.add_style_tag(content=SCROLLBALKEN)
    klik_midden_beeld(page)
    breedte = page.evaluate("() => { const v = document.querySelector('[data-testid=\"beeldvak\"]'); return v.offsetWidth - v.clientWidth; }")
    assert breedte >= 10, f"geen klassieke scrollbalk ({breedte} px): de test zou niets bewijzen"
    page.keyboard.press("Escape")


@pytest.mark.parametrize("e", [BREED, HOOG], ids=["breed", "hoog"])
def test_r8_met_scrollbalken_terug_naar_passend(spage, start_server, e):
    page = spage
    open8(page, start_server, lijst=[e])
    met_scrollbalken(page)
    verwacht_passend(page, e["maat"])
    klik_midden_beeld(page)
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "in")
    page.keyboard.press("Escape")
    verwacht_passend(page, e["maat"])
    klik_midden_beeld(page)
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "in")
    klik_midden_beeld(page)  # klik op het ingezoomde beeld: ook terug
    verwacht_passend(page, e["maat"])


def test_r8_met_scrollbalken_tweede_uitsnede_houdt_de_zoombreedte(spage, start_server):
    page = spage
    open8(page, start_server, lijst=[KLEIN2])
    met_scrollbalken(page)
    m = verwacht_passend(page, KLEIN2["maat"])
    doel = max(428, 3 * m["beeld"][2])
    for code in ("GREEN_DOT", RC):
        page.locator(f'[data-testid="uitsnede"][data-code="{code}"]').click()
        expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "in")
        beeldbreedte_wordt(page, doel)


MIDDEN = """s => {
  const v = document.querySelector('[data-testid="beeldvak"]'), k = document.querySelector(s);
  const r = v.getBoundingClientRect(), b = k.getBoundingClientRect();
  const cx = b.left + b.width / 2 - (r.left + v.clientLeft) + v.scrollLeft, cy = b.top + b.height / 2 - (r.top + v.clientTop) + v.scrollTop;
  const klem = (x, max) => Math.min(Math.max(x, 0), max);
  return {sl: v.scrollLeft, st: v.scrollTop,
          verwacht_sl: klem(cx - v.clientWidth / 2, v.scrollWidth - v.clientWidth),
          verwacht_st: klem(cy - v.clientHeight / 2, v.scrollHeight - v.clientHeight)};
}"""


@pytest.mark.parametrize("e,code,tegel", [(HOOG, RC, 2), (BREED, MSC, 2)], ids=["hoog", "breed"])
def test_r8_uitsnede_zet_haar_kader_zo_veel_mogelijk_in_het_midden(page, start_server, e, code, tegel):
    open8(page, start_server, lijst=[e])
    page.locator(f'[data-testid="uitsnede"][data-code="{code}"][data-tegel="{tegel}"]').click()
    expect(tid(page, "beeldvak")).to_have_attribute("data-stand", "in")
    sel = f'[data-testid="kader"][data-code="{code}"][data-tegel="{tegel}"]'
    m = page.evaluate(MIDDEN, sel)
    assert abs(m["sl"] - m["verwacht_sl"]) <= 2 and abs(m["st"] - m["verwacht_st"]) <= 2, m


def test_r8_zoomcursor_alleen_op_het_etiket(page, start_server):
    open8(page, start_server, lijst=[HOOG])
    cur = page.evaluate("""() => [getComputedStyle(document.getElementById('omhulsel')).cursor,
                                  getComputedStyle(document.querySelector('[data-testid="volledig"]')).cursor]""")
    assert cur == ["zoom-in", "default"], cur
