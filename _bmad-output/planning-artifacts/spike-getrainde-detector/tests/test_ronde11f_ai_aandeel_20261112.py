"""CAP-9 ronde 11f (ATDD, 12-11-2026; besluit Friso "Ja, erbij bouwen"): het eindrapport van `tel_proef` toont per
keurmerk hoeveel etiketten aan de zonder-kant hun oordeel alleen van de AI hebben (`herkomst_codes[code]` exact
`{"bron": "ai-r10"}`), zodat de glutenvrij-score niet als volledig nagekeken gelezen wordt. Verzonnen etiketten.
"""
import copy
import importlib
import json

import pytest

from ronde11_hulp import GV, LOS12, eid

AI = {"bron": "ai-r10"}
GD = "GREEN_DOT"


@pytest.fixture
def tp():
    return importlib.import_module("tel_proef")


def rec(gv=None, herkomst=None, in_bc=True, status="bevestigd"):
    k = {c: "afwezig" for c in LOS12}
    bc = sorted(LOS12)
    if gv is not None:
        k[GV] = gv
        if in_bc:
            bc = sorted(bc + [GV])
    r = {"status": status, "keurmerken": k, "nutriscore": [], "veranderd": [], "opmerking": "",
         "tijd": "2026-11-12T10:00:00+01:00", "bevestigde_codes": bc}
    if herkomst is not None:
        r["herkomst_codes"] = {GV: herkomst}
    return r


A1, A2, A3, A4, A5, A6, A7 = (eid(n) for n in range(81, 88))
UITSLAG = {
    A1: rec("afwezig", AI),                    # telt: zonder, alleen AI
    A2: rec("afwezig"),                         # zonder, mens
    A3: rec("afwezig", AI, in_bc=False),        # niet bevestigd voor glutenvrij: telt nergens
    A4: rec("aanwezig", AI),                    # mét: geen zonder_ai
    A5: rec("onzeker", AI),                     # onzeker telt nergens
    A6: rec("afwezig", AI, status="onleesbaar"),  # niet bevestigd
    A7: rec("afwezig", {"bron": "artefact", "bijgewerkt": "2026-11-12T09:00:00.000Z"}),  # mens via export
}
MELD = {d: set() for d in UITSLAG} | {A1: {GV}}  # één valse melding op een AI-oordeel


def test_r11f_zonder_ai_telt_alleen_afwezig_met_ai_markering(tp):
    r = tp.tel(UITSLAG, MELD)
    assert r[GV]["zonder"] == 3 and r[GV]["zonder_ai"] == 1  # A1, A2, A7 zonder; alleen A1 door de AI
    assert r[GV]["vals"] == 1
    for k in (GD, "NUTRISCORE", "NUTRISCORE_A", "NUTRISCORE_E"):
        assert r[k]["zonder_ai"] == 0, k
    for k, v in r.items():
        if isinstance(v, dict) and "zonder" in v:
            assert 0 <= v["zonder_ai"] <= v["zonder"], k


def test_r11f_besluit_en_grenzen_veranderen_niet(tp):
    zonder_markering = copy.deepcopy(UITSLAG)
    for r in zonder_markering.values():
        r.pop("herkomst_codes", None)
    met, zonder = tp.tel(UITSLAG, MELD), tp.tel(zonder_markering, MELD)
    for k in (GV, GD):
        for veld in ("met", "gevonden", "zonder", "vals", "ondergrens", "bovengrens", "besluit"):
            assert met[k][veld] == zonder[k][veld], (k, veld)
    assert zonder[GV]["zonder_ai"] == 0


def test_r11f_md_toont_ai_aantal_alleen_waar_het_er_is(tp):
    tab = {"D+A": tp.tabel(UITSLAG, MELD, {})}
    regels = tp._md(tab).splitlines()
    kop = next(r for r in regels if r.startswith("| keurmerk |"))
    rij_gv = next(r for r in regels if r.startswith(f"| {GV} |"))
    rij_gd = next(r for r in regels if r.startswith(f"| {GD} |"))
    assert "| 1/3 (AI 1) |" in rij_gv
    assert "(AI" not in rij_gd
    assert rij_gv.count("|") == kop.count("|") == rij_gd.count("|")
    toelichting = [r for r in regels if r.startswith("AI n:")]
    assert len(toelichting) == 1 and "ai-r10" in toelichting[0] and "niet door een mens nagekeken" in toelichting[0]
    zonder_ai = copy.deepcopy(UITSLAG)
    for r in zonder_ai.values():
        r.pop("herkomst_codes", None)
    md = tp._md({"D+A": tp.tabel(zonder_ai, MELD, {})})
    assert "(AI" not in md and "AI n:" not in md


def test_r11f_nakijkoordeel_maakt_het_menselijk_ook_als_het_gelijk_is(tp):
    voor = copy.deepcopy(UITSLAG)
    waar = tp.corrigeer(UITSLAG, {A1: {GV: "afwezig"}, A4: {GD: "aanwezig"}})
    assert UITSLAG == voor  # de invoer verandert niet
    assert GV not in waar[A1].get("herkomst_codes", {})  # zelfde oordeel als de AI, nu menselijk
    assert waar[A4]["herkomst_codes"] == {GV: AI}  # andere code nagekeken: markering voor glutenvrij blijft
    assert tp.tel(waar, MELD)[GV]["zonder_ai"] == 0


def test_r11f_gelijk_aan_gate_c_van_de_samenvoeging(tp, tmp_path):
    from test_ronde11c_samenvoeg_20261112 import exp, mod, schrijf
    from test_ronde11c_samenvoeg_20261112 import rec as urec

    ids = [eid(90 + n) for n in range(6)]
    uitslag = {i: urec() for i in ids}
    export = {ids[0]: exp(gv="aanwezig"), ids[1]: exp(gv="afwezig")}
    voor = {i: 2 <= n < 5 for n, i in enumerate(ids)}  # AI true: ids[2..4]; AI false: ids[0], ids[1] (mens), ids[5]
    u, e, v = schrijf(tmp_path, uitslag, export, voor)
    rapport = mod().samenvoeg(u, e, v)
    na = json.loads(u.read_text(encoding="utf-8"))
    r = tp.tel(na, {d: set() for d in na})
    assert r[GV]["zonder_ai"] == rapport["gate_c"]["na"]["zonder_ai"] == 1  # ids[5]
    assert r[GV]["zonder"] == rapport["gate_c"]["na"]["zonder_mens"] + rapport["gate_c"]["na"]["zonder_ai"]


def test_r11f_nakijklijst_en_verschil_blijven_zonder_herkomst(tp):
    lijst, sleutel = tp.nakijklijst(UITSLAG, {"D+A": MELD, "D": {d: set() for d in UITSLAG}})
    assert "herkomst" not in json.dumps(lijst) and "ai" not in {k for r in lijst for k in r}
    t = tp.tabel(UITSLAG, MELD, {})
    assert "zonder_ai" not in json.dumps(tp.verschil(t, t))


def test_r11f_nakijken_haalt_alleen_de_ai_markering_weg(tp):
    waar = tp.corrigeer(UITSLAG, {A7: {GV: "afwezig"}})
    assert waar[A7]["herkomst_codes"] == UITSLAG[A7]["herkomst_codes"]  # menselijke markering (artefact) blijft


def test_r11f_blind_nakijken_eerste_en_tweede_ronde_maken_ai_oordelen_menselijk(tmp_path):
    """Volledig pad via `main`: 40 zonder-etiketten met een AI-markering voor GREEN_DOT. Na de eerste ronde zijn alleen de
    nagekeken zonder-paren menselijk; na de tweede ronde (alle overeenkomende paren) is er geen AI-oordeel meer over."""
    from test_besluiten_20261101 import GD as GD_B
    from test_besluiten_20261101 import antwoorden, na, proef, ronde1_met_fout, schrijf

    tpm = importlib.import_module("tel_proef")
    p = proef(tmp_path)
    zonder = [d for d, r in p.u.items() if r["keurmerken"][GD_B] == "afwezig"]
    for d in zonder:
        p.u[d]["herkomst_codes"] = {GD_B: dict(AI)}
    schrijf(p.tmp / "uitslag.json", p.u)
    r1, ronde2 = ronde1_met_fout(p)  # één zonder-paar nagekeken als "onzeker"
    voor = json.loads((p.uit / "tabellen.json").read_text())
    assert {voor[r][GD_B]["zonder_ai"] for r in voor} == {40}
    lijst = json.loads((p.uit / "nakijklijst.json").read_text())
    nagekeken = {r["doc_id"] for r in lijst if r["keurmerk"] == GD_B and r["doc_id"] in zonder}
    t = na(p)
    assert {t[r][GD_B]["zonder_ai"] for r in t} == {40 - len(nagekeken)}
    md = (p.uit / "tabellen-na-nakijken.md").read_text(encoding="utf-8").splitlines()
    kop = next(r for r in md if r.startswith("| keurmerk |"))
    rij = next(r for r in md if r.startswith(f"| {GD_B} |"))
    assert f"(AI {40 - len(nagekeken)})" in rij and rij.count("|") == kop.count("|")
    assert tpm.main(p.argv + ["--nakijken", r1, "--nakijken-ronde2", f"{GD_B}={antwoorden(p, ronde2, naam='r2.json')}"]) == 0
    t2 = na(p)
    assert {t2[r][GD_B]["zonder_ai"] for r in t2} == {0}
    assert "AI n:" not in (p.uit / "tabellen-na-nakijken.md").read_text(encoding="utf-8")
