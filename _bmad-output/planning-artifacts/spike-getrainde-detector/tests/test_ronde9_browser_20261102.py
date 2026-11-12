"""CAP-3 ronde 9 (ATDD, rode fase): 13 rijen (sinds ronde 10: 14, SPEC CAP-3 "Ronde 10, browser") en nalopen op de invulpagina (SPEC CAP-3 "Ronde 9, browser", toetsset §6
"13 keurmerkrijen", "Nalopen", "Opslaan", invul-ux/EXPERIENCE.md *Nalopen*, invul-ux/DESIGN.md rij 32 px).

Contract: atdd-checklist, "Ronde 9" → "Interfacecontract ronde 9", delen `uitslag.py`, `invul/server.py` en
`invul/index.html`. Rood zolang de pagina de vier nieuwe rijen (FSC, Triman, kunststofcode, PlanetProof) niet kent,
een bevestigd etiket van vóór ronde 9 niet als na te lopen herkent en de server de vier codes weigert.

Zelfde opzet als ronde 7 en 8 (fixtures en helpers komen daarvandaan): verzonnen ids (GLN-GTIN-528 met 999…-nummers),
PIL-beelden en `uitslag.json` in `tmp_path`, alleen 127.0.0.1 op een vrije poort.
"""
import json

import pytest
from playwright.sync_api import expect

from conftest import laad_klaar
from test_cap03_invulpagina_browser import (  # noqa: F401 (browser is een fixture)
    browser,
    is_pad,
    lees_uitslag,
    radio,
    volg_posts,
    wacht_op_lopende_opslagen,
)
from test_ronde7_browser_20261102 import (  # noqa: F401 (page en start_server zijn fixtures)
    ZWAAR,
    binnen_venster,
    doc,
    etiket,
    page,
    start_server,
    tid,
    tussenstand,
    verwacht_actief,
    wacht_beeld,
)

pytestmark = pytest.mark.browser
expect.set_options(timeout=5_000)

R5 = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING",
      "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO", "EUROPEAN_V_LABEL_VEGAN")
FSC, TRIMAN, SPI, PP = ("FOREST_STEWARDSHIP_COUNCIL_LABEL", "TRIMAN", "SOCIETY_PLASTICS_INDUSTRY",
                        "ON_THE_WAY_TO_PLANETPROOF")
NIEUW = (FSC, TRIMAN, SPI, PP)
LOS12 = R5 + NIEUW
NS = "NUTRISCORE"
GV = "DIET_FREE_FROM_GLUTEN"
VEERTIEN = LOS12 + (GV, NS)  # ronde 10: glutenvrij na PlanetProof, vóór Nutri-Score
V = "EUROPEAN_V_LABEL_VEGAN"
NAMEN = {FSC: "FSC", TRIMAN: "Triman", SPI: "Kunststofcode (1–7)", PP: "PlanetProof"}
NOTITIE = "Al bevestigd: controleer alleen de vier nieuwe keurmerken (FSC, Triman, kunststofcode, PlanetProof)."
WEIGER = "Kies eerst bij alle 12 keurmerken (ook het V-label en de vier nieuwe) en bij Nutri-Score; niets opgeslagen."
VENSTERS = [(1440, 800), (1920, 970)]


def vi12(aanwezig=(), nutriscore=(), codes=LOS12, hints=()):
    """AI-voorinvulling zoals `items.json` na ronde 9 (`toets.samenvoegen`): standaard alle 12 losse codes. Met
    `codes=R5` de voorinvulling van een etiket waarvan de ronde-9-voorinvulling mislukte of nog niet draaide."""
    tegels = {}
    for code, tegel in hints:
        tegels.setdefault(code, []).append(tegel)
    return {"keurmerken": {c: c in aanwezig for c in codes}, "nutriscore": list(nutriscore), "hinttegels": tegels,
            "gelijkend": [], "model": "anthropic/claude-sonnet-5.5", "kosten": 0.004}


def klein(n, voor):
    return etiket(doc(n), (800, 600), [], voor)


def oud_bevestigd(keuzes, nutriscore=("D",), opmerking="eerder bevestigd", **extra):
    """Een bevestigd record van vóór ronde 9: de 8 codes van ronde 5, zonder `bevestigde_codes`."""
    return {"status": "bevestigd", "keurmerken": dict(keuzes), "nutriscore": list(nutriscore), "veranderd": [],
            "opmerking": opmerking, "tijd": "2026-11-01T10:00:00+01:00", **extra}


def vol_bevestigd(keuzes=None):
    """Bevestigd na ronde 9: alle 12 keuzes, `bevestigde_codes` door de server gezet."""
    k = keuzes or {c: "afwezig" for c in LOS12}
    return {**oud_bevestigd(k, opmerking=""), "bevestigde_codes": sorted(k)}


def schrijf_uitslag(map_, uitslag):
    (map_ / "uitslag.json").write_text(json.dumps(uitslag, ensure_ascii=False, indent=1, sort_keys=True))


def stand_server(page, basis):
    r = page.request.get(basis + "stand")
    assert r.status == 200
    return r.json()


# Serverantwoorden van een oud bevestigd etiket, bewust anders dan de voorinvulling (die zegt overal "afwezig").
OUD = {"EU_ORGANIC_FARMING": "aanwezig", "GREEN_DOT": "onzeker", "RECYCLABLE_GENERAL_CLAIM": "aanwezig",
       "PREGNANCY_WARNING": "afwezig", "MARINE_STEWARDSHIP_COUNCIL_LABEL": "afwezig", "WEIDEMELK": "aanwezig",
       "VEGAN_SOCIETY_VEGAN_LOGO": "afwezig", V: "onzeker"}
VI_NIEUW = {FSC: "aanwezig", TRIMAN: "afwezig", SPI: "aanwezig", PP: "afwezig"}  # uit vi12({FSC, SPI}, ["A"])


# --- rijen: 13 in ronde 9, sinds ronde 10 14 (VEERTIEN) --------------------------------------------------------------
def test_r9b_vier_nieuwe_rijen_na_v_label_en_voor_nutriscore(page, start_server):
    laad_klaar(page, start_server([klein(901, vi12({FSC, SPI}, ["A"]))]))
    rijen = page.locator('#standen [data-testid^="rij-"]')
    expect(rijen).to_have_count(14)  # ronde 10
    assert [r.get_attribute("data-testid") for r in rijen.all()] == [f"rij-{c}" for c in VEERTIEN]

    groepen = page.locator('#keuzes [role="radiogroup"]')
    expect(groepen).to_have_count(13)  # ronde 10: plus glutenvrij
    assert [g.get_attribute("data-testid") for g in groepen.all()] == [f"keuze-{c}" for c in LOS12 + (GV,)]
    for code, naam in NAMEN.items():
        rij = page.locator("#standen").get_by_test_id(f"rij-{code}")
        for deel in (f"keuze-{code}", f"stand-{code}", f"ai-{code}", f"gewijzigd-{code}"):
            expect(rij.get_by_test_id(deel)).to_have_count(1)
        expect(rij.get_by_test_id(f"keuze-{code}")).to_have_attribute("aria-label", naam)
        for w in ("aanwezig", "afwezig", "onzeker"):
            expect(radio(page, code, w)).to_have_attribute("type", "radio")
        expect(radio(page, code, VI_NIEUW[code])).to_be_checked()  # voorgevuld uit de voorinvulling
        expect(tid(page, f"stand-{code}")).to_have_attribute("data-met", "0")
        expect(tid(page, f"stand-{code}")).to_contain_text("16")


ZWAAR_NA = [{**e, "voor": vi12(codes=R5)} for e in ZWAAR]  # oude voorinvulling, nieuwe vier ontbreken


@pytest.mark.parametrize("toestand", ["open", "na-te-lopen"])
@pytest.mark.parametrize("venster", VENSTERS, ids=lambda v: f"{v[0]}x{v[1]}")
@pytest.mark.parametrize("nr", [0, 1], ids=["breed-4096x780", "hoog-200x3920"])
def test_r9b_alle_rijen_op_een_scherm_zonder_paginascroll(page, start_server, tmp_path, venster, nr, toestand):
    page.set_viewport_size({"width": venster[0], "height": venster[1]})
    lijst = ZWAAR if toestand == "open" else ZWAAR_NA
    if toestand == "na-te-lopen":  # zwaarste paneel: notitie "Al bevestigd …" plus de lange weigermelding
        schrijf_uitslag(tmp_path, {e["id"]: oud_bevestigd(OUD) for e in lijst})
    laad_klaar(page, start_server(lijst))
    if nr:
        page.keyboard.press("ArrowRight")
    e = lijst[nr]
    expect(tid(page, "etiket-id")).to_have_text(e["id"])
    wacht_beeld(page, e["maat"][0])
    expect(tid(page, "kader")).to_have_count(6)
    expect(page.locator("#standen [data-testid^=\"rij-\"]")).to_have_count(14)  # ronde 10
    page.keyboard.press("b")  # onvolledig (vier nieuwe zonder keuze) → lange weigermelding zichtbaar
    expect(page.locator("#melding")).to_have_text(WEIGER)
    if toestand == "na-te-lopen":
        expect(page.locator("#notitie")).to_have_text(NOTITIE)
    else:
        expect(page.locator("#notitie")).not_to_have_text("")

    maat = page.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight, "
                         "innerWidth, innerHeight]")
    assert maat[0] <= maat[2] and maat[1] <= maat[3], maat
    paneel = page.locator("#keuzes").evaluate("e => [e.scrollHeight, e.clientHeight]")
    assert paneel[0] <= paneel[1] + 1, ("paneel moet niet scrollen", paneel)
    for naam in ("kopregel", "beeldvak", "uitsneden", "sneltoetsen"):
        binnen_venster(page, tid(page, naam), naam)
    for sel in ("#notitie", "#opmerking", "#volgende", "#opslaan", "#onleesbaar", "#melding"):
        binnen_venster(page, page.locator(sel), sel)
    for code in VEERTIEN:
        rij = binnen_venster(page, tid(page, f"rij-{code}"), code)
        assert rij["height"] <= 32.5, (code, rij)  # DESIGN: rij 32 px


# --- nalopen: voortgang en startetiket ---------------------------------------------------------------------------------
P1, P2, P3, P4, P5 = (klein(n, vi12({FSC}, ["B"])) for n in range(911, 916))
VIJF = [P1, P2, P3, P4, P5]


def test_r9b_voortgang_toont_aantal_na_te_lopen_alleen_als_er_zijn(page, start_server, tmp_path):
    deels = {**vol_bevestigd(), "bevestigde_codes": sorted(R5)}  # 12 keuzes, maar de vier nooit bevestigd
    schrijf_uitslag(tmp_path, {
        P1["id"]: vol_bevestigd(),                    # afgehandeld
        P2["id"]: oud_bevestigd(OUD),                 # na te lopen (van vóór ronde 9)
        P3["id"]: {"status": "onleesbaar", "keurmerken": {}, "veranderd": [], "opmerking": ""},  # afgehandeld
        P4["id"]: deels,                              # na te lopen (bevestigde_codes zonder de vier)
    })
    basis = start_server(VIJF)
    laad_klaar(page, basis)
    expect(page.locator("#voortgang")).to_have_text("2 van 5 etiketten afgehandeld · 2 na te lopen")
    assert stand_server(page, basis)["na_te_lopen"] == 2

    schrijf_uitslag(tmp_path, {P1["id"]: vol_bevestigd(),
                               P3["id"]: {"status": "onleesbaar", "keurmerken": {}, "veranderd": [], "opmerking": ""}})
    laad_klaar(page)
    expect(page.locator("#voortgang")).to_have_text("2 van 5 etiketten afgehandeld")  # geen "· 0 na te lopen"
    assert stand_server(page, basis)["na_te_lopen"] == 0


ONL = {"status": "onleesbaar", "keurmerken": {}, "veranderd": [], "opmerking": ""}


@pytest.mark.parametrize("uitslag, start", [
    ({P1["id"]: vol_bevestigd(), P2["id"]: oud_bevestigd(OUD), P4["id"]: oud_bevestigd(OUD)}, P2),
    ({P1["id"]: vol_bevestigd(), P2["id"]: ONL, P4["id"]: oud_bevestigd(OUD)}, P3),
    ({P1["id"]: vol_bevestigd(), P2["id"]: ONL, P3["id"]: vol_bevestigd(), P4["id"]: vol_bevestigd(),
      P5["id"]: oud_bevestigd(OUD)}, P5),
    ({e["id"]: vol_bevestigd() for e in VIJF}, P1),  # alles afgehandeld: eerste etiket (ongewijzigd)
], ids=["na-te-lopen-eerst", "open-eerst", "laatste-na-te-lopen", "alles-af"])
def test_r9b_startetiket_eerste_niet_afgehandeld_of_na_te_lopen(page, start_server, tmp_path, uitslag, start):
    schrijf_uitslag(tmp_path, uitslag)
    basis = start_server(VIJF)
    laad_klaar(page, basis)
    expect(tid(page, "etiket-id")).to_have_text(start["id"])
    expect(page.locator("#positie")).to_have_text(f"{VIJF.index(start) + 1} / 5")
    na = sum(1 for r in uitslag.values() if r.get("status") == "bevestigd" and "bevestigde_codes" not in r)
    klaar = len(uitslag) - na
    verwacht = f"{klaar} van 5 etiketten afgehandeld" + (f" · {na} na te lopen" if na else "")
    expect(page.locator("#voortgang")).to_have_text(verwacht)
    assert stand_server(page, basis)["na_te_lopen"] == na  # zelfde regel als de server


# --- nalopen: het etiket zelf ----------------------------------------------------------------------------------------
L = klein(921, vi12({FSC, SPI}, ["A"]))  # voorinvulling: oude 8 afwezig (≠ OUD), FSC en kunststofcode aanwezig
OPEN = klein(922, vi12({"GREEN_DOT"}, []))


@pytest.mark.parametrize("record, eerste", [
    (oud_bevestigd(OUD), FSC),
    # een lijst waarin FSC al bevestigd is: de eerste nieuwe rij zónder bevestigde code is Triman
    (oud_bevestigd({**OUD, FSC: "afwezig"}, bevestigde_codes=sorted(R5 + (FSC,))), TRIMAN),
], ids=["oud-zonder-lijst", "fsc-al-bevestigd"])
def test_r9b_na_te_lopen_etiket_toont_serverantwoorden_en_b_bewaart_ze(page, start_server, tmp_path, record, eerste):
    schrijf_uitslag(tmp_path, {L["id"]: record})
    posts = volg_posts(page)
    laad_klaar(page, start_server([L, OPEN]))
    expect(tid(page, "etiket-id")).to_have_text(L["id"])
    expect(tid(page, "etiket-status")).to_have_text("bevestigd")
    expect(page.locator("#notitie")).to_have_text(NOTITIE)
    verwacht_actief(page, eerste)

    getoond = {**VI_NIEUW, **record["keurmerken"]}  # oude rijen (en een bevestigde FSC) van de server, rest voorinvulling
    for code in LOS12:
        expect(radio(page, code, getoond[code])).to_be_checked()
    expect(tid(page, "ns-D")).to_be_checked()
    expect(tid(page, "ns-A")).not_to_be_checked()  # voorinvulling zegt A; de server D
    expect(page.locator("#opmerking")).to_have_value("eerder bevestigd")

    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.keyboard.press("b")
    assert antwoord.value.status == 200
    waarde = antwoord.value.request.post_data_json["waarde"]
    assert waarde["status"] == "bevestigd"
    assert "bevestigde_codes" not in waarde  # zet alleen de server
    expect(tid(page, "etiket-id")).to_have_text(OPEN["id"])
    wacht_op_lopende_opslagen(posts)
    assert len(posts) == 1, "alleen de bevestiging; de oude antwoorden zijn niet aangeklikt"

    r = lees_uitslag(tmp_path)[L["id"]]
    assert r["status"] == "bevestigd"
    assert r["keurmerken"] == getoond
    assert r["nutriscore"] == ["D"] and r["opmerking"] == "eerder bevestigd"
    assert sorted(r["bevestigde_codes"]) == sorted(LOS12)
    assert not set(NIEUW) & set(r.get("veranderd", [])), "de vier volgen de voorinvulling"
    expect(page.locator("#voortgang")).to_have_text("1 van 2 etiketten afgehandeld")
    expect(tid(page, f"stand-{FSC}")).to_have_attribute("data-met" if getoond[FSC] == "aanwezig" else "data-zonder", "1")


def test_r9b_tussenstand_op_nieuwe_rij_houdt_bevestigd_en_telt_pas_na_bevestigen(page, start_server, tmp_path):
    schrijf_uitslag(tmp_path, {L["id"]: oud_bevestigd(OUD)})
    posts = volg_posts(page)
    basis = start_server([L, OPEN])
    laad_klaar(page, basis)
    expect(tid(page, "etiket-id")).to_have_text(L["id"])
    verwacht_actief(page, FSC)
    expect(tid(page, "stand-GREEN_DOT")).to_have_attribute("data-met", "0")  # OUD: onzeker telt niet
    expect(tid(page, "stand-EU_ORGANIC_FARMING")).to_have_attribute("data-met", "1")  # oud bevestigd telt voor de 9

    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.keyboard.press("2")  # FSC: voorinvulling aanwezig → afwezig
    assert antwoord.value.status == 200
    body = antwoord.value.request.post_data_json
    assert "status" not in body["waarde"] and body["waarde"]["keurmerken"][FSC] == "afwezig"
    verwacht_actief(page, TRIMAN)
    wacht_op_lopende_opslagen(posts)

    r = lees_uitslag(tmp_path)[L["id"]]
    assert r["status"] == "bevestigd", "een tussenstand op een nieuwe rij houdt de status"
    assert r["keurmerken"][FSC] == "afwezig"
    assert {c: r["keurmerken"][c] for c in R5} == OUD
    assert sorted(r["bevestigde_codes"]) == sorted(R5), "een tussenstand houdt de lijst van het oude record"
    s = stand_server(page, basis)
    assert s["stand"][FSC] == {"met": 0, "zonder": 0}, "een keuze op een nieuwe rij telt pas na Bevestigen"
    assert s["stand"]["EU_ORGANIC_FARMING"]["met"] == 1
    assert s["na_te_lopen"] == 1
    expect(tid(page, f"stand-{FSC}")).to_have_attribute("data-zonder", "0")
    expect(tid(page, "etiket-status")).to_have_text("bevestigd")
    expect(page.locator("#voortgang")).to_have_text("0 van 2 etiketten afgehandeld · 1 na te lopen")

    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.keyboard.press("b")
    assert antwoord.value.status == 200
    s = stand_server(page, basis)
    assert s["stand"][FSC] == {"met": 0, "zonder": 1} and s["na_te_lopen"] == 0
    expect(page.locator("#voortgang")).to_have_text("1 van 2 etiketten afgehandeld")


def test_r9b_oud_concept_met_8_codes_houdt_keuzes_en_vier_uit_voorinvulling(page, start_server, tmp_path):
    concept = {"keurmerken": dict(OUD), "nutriscore": ["C"], "opmerking": "concept van vóór ronde 9", "nsGekozen": True}
    page.add_init_script(f"""try {{ sessionStorage.setItem({json.dumps("concept:" + L["id"])},
      {json.dumps(json.dumps(concept))}); }} catch (e) {{}}""")  # about:blank heeft geen sessionStorage
    laad_klaar(page, start_server([L, OPEN]))
    expect(tid(page, "etiket-id")).to_have_text(L["id"])
    for code, keuze in {**OUD, **VI_NIEUW}.items():
        expect(radio(page, code, keuze)).to_be_checked()
    expect(tid(page, "ns-C")).to_be_checked()
    expect(page.locator("#opmerking")).to_have_value("concept van vóór ronde 9")

    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.locator("#opslaan").click()
    assert antwoord.value.status == 200
    r = lees_uitslag(tmp_path)[L["id"]]
    assert r["status"] == "bevestigd"
    assert r["keurmerken"] == {**OUD, **VI_NIEUW}
    assert r["nutriscore"] == ["C"] and r["opmerking"] == "concept van vóór ronde 9"


# --- weigeren en toetsen ---------------------------------------------------------------------------------------------
def test_r9b_bevestigen_zonder_keuze_bij_de_vier_wordt_geweigerd(page, start_server, tmp_path):
    zonder = klein(931, vi12({"GREEN_DOT"}, ["B"], codes=R5))  # ronde-9-voorinvulling ontbreekt
    oud = klein(932, vi12(set(), ["D"], codes=R5))
    schrijf_uitslag(tmp_path, {oud["id"]: oud_bevestigd(OUD)})
    voor_oud = lees_uitslag(tmp_path)[oud["id"]]
    posts = volg_posts(page)
    laad_klaar(page, start_server([zonder, oud]))
    expect(tid(page, "etiket-id")).to_have_text(zonder["id"])
    for code in NIEUW:
        expect(tid(page, f"ai-{code}")).to_have_text("AI: —")
        expect(tid(page, f"keuze-{code}").locator("input:checked")).to_have_count(0)

    page.keyboard.press("b")
    expect(page.locator("#melding")).to_have_text(WEIGER)
    expect(tid(page, "etiket-id")).to_have_text(zonder["id"])
    page.locator("#melding").evaluate("e => { e.textContent = ''; }")
    page.locator("#volgende").click()
    expect(page.locator("#melding")).to_have_text(WEIGER)
    page.locator("#volgende").blur()
    assert posts == [], "zonder keuze bij de vier geen opslag"

    for _ in range(8):
        page.keyboard.press("ArrowDown")
    verwacht_actief(page, FSC)
    for code in NIEUW:  # 2 = afwezig, schuift door tot PlanetProof
        assert tussenstand(page, "2")["waarde"]["keurmerken"][code] == "afwezig"
    with page.expect_response(is_pad("/opslaan")) as antwoord:
        page.keyboard.press("b")
    assert antwoord.value.status == 200
    assert {c: lees_uitslag(tmp_path)[zonder["id"]]["keurmerken"][c] for c in NIEUW} == {c: "afwezig" for c in NIEUW}

    expect(tid(page, "etiket-id")).to_have_text(oud["id"])  # na te lopen, vier zonder voorinvulling
    expect(page.locator("#melding")).to_contain_text("Opgeslagen (bevestigd)")  # eerst de vorige melding binnen
    wacht_op_lopende_opslagen(posts)
    n = len(posts)
    page.keyboard.press("b")
    expect(page.locator("#melding")).to_have_text(WEIGER)
    expect(tid(page, "etiket-id")).to_have_text(oud["id"])
    assert len(posts) == n
    assert lees_uitslag(tmp_path)[oud["id"]] == voor_oud


def test_r9b_123_schuift_door_de_vier_nieuwe_rijen_maar_nooit_naar_nutriscore(page, start_server):
    laad_klaar(page, start_server([klein(941, vi12({"GREEN_DOT"}, ["B"]))]))
    verwacht_actief(page, "EU_ORGANIC_FARMING")
    for _ in range(7):
        page.keyboard.press("ArrowDown")
    verwacht_actief(page, V)
    assert tussenstand(page, "3")["waarde"]["keurmerken"][V] == "onzeker"
    for code, volgende in ((FSC, TRIMAN), (TRIMAN, SPI), (SPI, PP)):
        verwacht_actief(page, code)
        assert tussenstand(page, "3")["waarde"]["keurmerken"][code] == "onzeker"
        verwacht_actief(page, volgende)
    assert tussenstand(page, "3")["waarde"]["keurmerken"][PP] == "onzeker"
    verwacht_actief(page, GV)  # ronde 10: PlanetProof schuift door naar glutenvrij
    assert tussenstand(page, "1")["waarde"]["keurmerken"][GV] == "aanwezig"
    verwacht_actief(page, GV)  # laatste keuzerij: nooit automatisch naar Nutri-Score
    page.keyboard.press("ArrowDown")
    verwacht_actief(page, NS)
