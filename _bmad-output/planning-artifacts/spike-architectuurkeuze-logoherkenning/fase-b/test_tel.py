"""Acceptatietoets telscript fase B (CAP-3/CAP-5; meetopzet §0, §3.1-3.10, §5, §6). Verzonnen mini-sets, bekende uitkomst.
Draaien: ~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/.venv/bin/python -m pytest test_tel.py"""
import json

import pytest

import tel

MSC, FSC, GD, REC = "MARINE_STEWARDSHIP_COUNCIL_LABEL", "FOREST_STEWARDSHIP_COUNCIL_MIX", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM"
NSB, NSC, VLAB, VEGAN, WM = "NUTRISCORE_B", "NUTRISCORE_C", "EUROPEAN_V_LABEL_VEGAN", "VEGAN", "WEIDEMELK"


def m(code, vak, score=1.0, orde=(0, 0)):
    return {"code": code, "vak": vak, "score": score, "orde": orde}


def ok(*meldingen, w=1000, h=1000):
    return {"ok": True, "meldingen": list(meldingen), "w": w, "h": h}


def et(gln="1", herkomst="kern-x", *vakken):
    return {"gln": gln, "herkomst": herkomst, "vakken": [{"code": c, "box": b} for c, b in vakken]}


def pc(r, code):
    return r["per_code"][code]


# §3.1 melding: begrenzen, vak zonder oppervlak, codes buiten de 15, code zonder vak, samenvoegen
def test_begrens_tot_etiket_en_vak_zonder_oppervlak_vervalt():
    assert tel.begrens([-10, 50, 120, 1200], 1000, 1000) == [0, 50, 120, 1000]
    assert tel.begrens([1100, 0, 1200, 10], 1000, 1000) is None
    assert tel.begrens([5, 5, 5, 50], 1000, 1000) is None
    assert tel.begrens([-10, 0, 20, 20], None, None) == [-10, 0, 20, 20]  # maat onbekend: niet begrenzen


def test_samenvoegen_keten_houdt_lid_met_hoogste_zekerheid_geen_omhullende():
    a, b, c = [0, 0, 100, 100], [20, 0, 120, 100], [40, 0, 140, 100]  # a~b, b~c (IoU .67), a!~c (IoU .43)
    uit = tel.samenvoegen([m(MSC, a, .85), m(MSC, b, .95), m(MSC, c, .90), m(FSC, a, .9)])
    assert sorted((x["code"], x["vak"]) for x in uit) == [(FSC, a), (MSC, b)]


def test_samenvoegen_k1_bij_gelijke_stand_eerst_teruggegeven_lid():
    uit = tel.samenvoegen([m(MSC, [1, 0, 101, 100], 0, (2, 0)), m(MSC, [0, 0, 100, 100], 0, (0, 1)), m(MSC, [2, 0, 102, 100], 0, (0, 3))])
    assert [x["vak"] for x in uit] == [[0, 0, 100, 100]]


def test_code_zonder_vak_telt_als_onterecht_en_wordt_niet_samengevoegd():
    r = tel.tel_etiket([m(MSC, None), m(MSC, None)], [])
    assert pc(r, MSC)["onterecht"] == 2 and pc(r, MSC)["meldingen"] == 2


# §3.2 raakt
def test_raakt_middelpunt_in_vergroot_vak_of_iou_en_oppervlakgrens():
    w = [100, 100, 200, 200]
    assert tel.raakt([210, 210, 230, 230], w)          # middelpunt in 25%-vergroot vak, IoU 0
    assert not tel.raakt([230, 230, 260, 260], w)      # middelpunt buiten, IoU 0
    assert tel.raakt([100, 100, 400, 200], w)          # middelpunt buiten, IoU 0,33
    assert tel.raakt([0, 0, 300, 300], w)              # oppervlak precies 4x vergroot vak
    assert not tel.raakt([0, 0, 301, 301], w)          # te groot vak


def test_een_melding_over_twee_waarheidsvakken_telt_voor_grootste_iou():
    r = tel.tel_etiket([m(MSC, [40, 0, 140, 100])], [{"code": MSC, "box": [0, 0, 100, 100]}, {"code": MSC, "box": [100, 0, 200, 100]}])
    assert (pc(r, MSC)["geraakt"], pc(r, MSC)["onterecht"], pc(r, MSC)["gevonden"]) == (1, 0, True)


def test_grof_vak_alleen_middelpunt_en_hoogstens_een_terechte_melding():
    grof = [{"code": MSC, "box": [0, 0, 300, 300], "grof": True}]
    schuin = m(MSC, [160, 0, 460, 300])  # middelpunt (310,150) buiten de cel, IoU 0,30
    assert not tel.tel_etiket([schuin], grof)["per_code"][MSC]["gevonden"]
    assert tel.tel_etiket([schuin], [dict(grof[0], grof=False)])["per_code"][MSC]["gevonden"]
    r = tel.tel_etiket([m(MSC, [0, 0, 50, 50], .9), m(MSC, [200, 200, 250, 250], .8)], grof)
    assert (pc(r, MSC)["geraakt"], pc(r, MSC)["onterecht"]) == (1, 1)


# §3.3 Nutri-Score-letter is de soort; §3.8 verwarbare paren
def test_nutriscore_letter_is_de_soort_en_verwarbaar_paar_apart():
    r = tel.tel_etiket([m(NSC, [0, 0, 100, 100])], [{"code": NSB, "box": [0, 0, 100, 100]}])
    assert pc(r, NSC)["onterecht"] == 1 and pc(r, NSB)["positief"] and not pc(r, NSB)["gevonden"]
    assert r["verwar"] == {(NSC, NSB): 1}


def test_verwarbaar_vlabel_vegan_en_groene_punt_niet_voor_andere_paren():
    r = tel.tel_etiket([m(VLAB, [0, 0, 100, 100]), m(REC, [500, 500, 600, 600]), m(MSC, [800, 0, 900, 100])],
                       [{"code": VEGAN, "box": [0, 0, 100, 100]}, {"code": GD, "box": [500, 500, 600, 600]}, {"code": FSC, "box": [800, 0, 900, 100]}])
    assert r["verwar"] == {(VLAB, VEGAN): 1, (REC, GD): 1}


# Adapters (§3.10): B0, K1, stap 2, K4
def b0rec(dets, post=202, status="done", variant="origineel-png"):
    return {"invoer": {"variant": variant, "w": 1000, "h": 800}, "post": {"status": post},
            "get": {"body": {"status": status, "logoResults": {"detections": dets}}}}


def det(code, conf, method="embedding", x=10, y=20, w=30, h=40):
    return {"t3777_code": code, "confidence": conf, "method": method, "bbox": {"x": x, "y": y, "width": w, "height": h}}


def test_b0_adapter_methode_drempel_en_negeren():
    r = tel.lees_b0(b0rec([det(MSC, .80), det(FSC, .79), det(NSB, .80, "nutriscore-head"), det(NSC, .50, "nutriscore-a2"),
                           det(WM, .49, "nutriscore-a2"), det(GD, .99, "ghs-specialist"), det("CERTIFIED_B_CORPORATION", .99)]), .80)
    assert r["ok"] and (r["w"], r["h"]) == (1000, 800)
    assert sorted(x["code"] for x in r["meldingen"]) == [MSC, NSB, NSC]
    assert [x["vak"] for x in r["meldingen"] if x["code"] == MSC] == [[10, 20, 40, 60]]


def test_b0_adapter_mislukt_en_herpakt():
    assert not tel.lees_b0(b0rec([], post=429), .8)["ok"]
    assert not tel.lees_b0(b0rec([], status="failed"), .8)["ok"]
    assert tel.lees_b0(b0rec([], variant="jpeg-q92"), .8)["herpakt"] and not tel.lees_b0(b0rec([]), .8)["herpakt"]


def test_k1_adapter_ander_vak_null_volgorde_en_geen_dubbele_omrekening():
    rec = {"status": "ok", "w": 2000, "h": 1000, "meldingen": [
        {"code": "ander", "vak": [0, 0, 10, 10], "volgorde": 0, "venster": 0},
        {"code": MSC, "vak": [1500, 500, 1600, 600], "volgorde": 1, "venster": 3},
        {"code": FSC, "vak": None, "volgorde": 0, "venster": 2}]}
    r = tel.lees_k1(rec)
    assert r["ok"] and [(x["code"], x["vak"], x["orde"]) for x in r["meldingen"]] == [(MSC, [1500, 500, 1600, 600], (3, 1)), (FSC, None, (2, 0))]
    assert not tel.lees_k1({"status": "mislukt", "meldingen": []})["ok"]


def test_stap2_adapter_drempel_top15_en_k3c():
    rec = {"status": "ok", "vakken": [{"vak": [0, 0, 9, 9], "top": [[MSC, .80], [FSC, .7]]}, {"vak": [1, 1, 9, 9], "top": [[FSC, .79]]},
                                      {"vak": [2, 2, 9, 9], "top": [["ECC_HALAL", .99], [MSC, .9]]}, {"vak": [3, 3, 9, 9], "top": []},
                                      {"vak": [4, 4, 9, 9], "top": [[GD, .95]], "owl_score": .31}]}
    r = tel.lees_stap2(rec, .80)
    assert r["ok"] and [(x["code"], x["score"]) for x in r["meldingen"]] == [(MSC, .80), (GD, .95)] and r["w"] is None


def test_k4_poort_drie_verschillende_soorten_zonder_drempel_vak_null_blijft():
    k1 = {"status": "ok", "w": 100, "h": 100, "meldingen": [
        {"code": MSC, "vak": [0, 0, 9, 9], "volgorde": 0, "venster": 0}, {"code": FSC, "vak": [1, 1, 9, 9], "volgorde": 1, "venster": 0},
        {"code": GD, "vak": None, "volgorde": 2, "venster": 0}, {"code": "ander", "vak": [2, 2, 9, 9], "volgorde": 3, "venster": 0}]}
    k2 = {"status": "ok", "vakken": [{"vak": [0, 0, 9, 9], "top": [["X", .9], ["X", .8], ["Y", .7], [MSC, .1]]},
                                     {"vak": [1, 1, 9, 9], "top": [["X", .9], ["Y", .8], ["Z", .7], [FSC, .6]]},
                                     {"vak": None, "top": []}, {"vak": [2, 2, 9, 9], "top": []}]}
    r = tel.lees_k4(k1, k2)
    assert r["ok"] and [x["code"] for x in r["meldingen"]] == [MSC, GD]  # MSC is 3e verschillende soort; FSC 4e
    assert not tel.lees_k4(k1, dict(k2, vakken=k2["vakken"][:3]))["ok"]  # index past niet: mislukt
    assert not tel.lees_k4(k1, None)["ok"] and not tel.lees_k4(k1, {"status": "mislukt"})["ok"]
    omgedraaid = dict(k2, vakken=[k2["vakken"][1], k2["vakken"][0]] + k2["vakken"][2:])
    assert not tel.lees_k4(k1, omgedraaid)["ok"]  # poortvak hoort niet bij het K1-vak: mislukt


def test_lees_waarheid_formaat_voorlopige_selectie(tmp_path):
    p = tmp_path / "w.json"
    p.write_text(json.dumps({"etiketten": [{"kaart": "e1", "doc_id": "871-0871-528", "herkomst": "aanvulling-MSC",
                                            "positieve_vakken": [{"code": MSC, "box": [1, 2, 3, 4], "vak": 1}, {"code": FSC, "box": [0, 0, 9, 9], "grof": True}]}]}))
    assert tel.lees_waarheid(p) == {"e1": {"gln": "871", "herkomst": "aanvulling-MSC", "vakken": [
        {"code": MSC, "box": [1, 2, 3, 4], "grof": False}, {"code": FSC, "box": [0, 0, 9, 9], "grof": True}]}}


# Statistiek
def test_wilson_bekende_waarde():
    lo, hi = tel.wilson(8, 10)
    assert round(lo, 3) == 0.490 and round(hi, 3) == 0.943 and tel.wilson(0, 0) is None


def test_bootstrap_gln_reproduceerbaar():
    t, n = {"a": 3, "b": 1, "c": 4}, {"a": 4, "b": 4, "c": 5}
    d1, d2 = tel.trekkingen(["a", "b", "c"], 7, 300), tel.trekkingen(["a", "b", "c"], 7, 300)
    assert tel.bootstrap(t, n, d1) == tel.bootstrap(t, n, d2)
    lo, hi = tel.bootstrap(t, n, d1)
    assert lo <= 8 / 13 <= hi and tel.bootstrap({"a": 2}, {"a": 4}, tel.trekkingen(["a"], 1, 50)) == (0.5, 0.5)
    d = tel.trekkingen(["a", "b"], 2, 50)   # trekkingen met noemer 0 vervallen; alle noemers 0 → geen interval
    assert tel.bootstrap({"a": 1}, {"a": 1, "b": 0}, d) == (1.0, 1.0) and tel.bootstrap({}, {"a": 0, "b": 0}, d) is None


# Volledige telling per variant/run
def mini():
    w = {"e1": et("A", "kern-x", (MSC, [0, 0, 100, 100])), "e2": et("A", "aanvulling-x", (MSC, [0, 0, 100, 100])),
         "e3": et("B", "aanvulling-x", (FSC, [0, 0, 100, 100])), "e4": et("C", "kern-x")}
    u = {"k1a": {"1": {"e1": ok(m(MSC, [0, 0, 100, 100])), "e2": ok(), "e3": ok(m(FSC, [0, 0, 90, 90]), m(FSC, [500, 500, 600, 600])),
                       "e4": ok(m(MSC, [0, 0, 50, 50]))},
                 "2": {"e1": ok(m(MSC, [0, 0, 100, 100])), "e2": ok(m(MSC, [0, 0, 100, 100])), "e3": ok(m(FSC, [0, 0, 90, 90]))}}}
    return w, u


def test_tellers_noemers_vals_en_vals_alarm_mislukt_eruit():
    w, u = mini()
    res = tel.bereken(w, u, seed=1, n_trekkingen=50)
    r1, r2 = res["tabellen"]["alle"]["k1a"]["1"], res["tabellen"]["alle"]["k1a"]["2"]
    assert (r1[MSC]["positief"], r1[MSC]["gevonden"], r1[MSC]["gemist"]) == (2, 1, 1)
    assert (r1[FSC]["onterecht"], r1[FSC]["geraakt"], r1[FSC]["vals_pct"]["waarde"]) == (1, 1, 0.5)
    assert (r1[MSC]["vals_alarm"], r1[MSC]["negatief"]) == (1, 2)    # e4 heeft onterechte MSC; e3, e4 negatief
    assert (r2[MSC]["gevonden"], r2[MSC]["negatief"], r2[MSC]["vals_alarm"]) == (2, 1, 0)  # e4 mislukt: uit noemer
    assert res["runs"]["k1a"]["2"] == {"etiketten": 4, "mislukt": 1, "ongeldig": True}
    assert r1[MSC]["gln"] == 1 and r1[FSC]["gln"] == 1
    assert set(r1[MSC]["gevonden_pct"]) == {"waarde", "wilson", "bootstrap"} and r1[MSC]["gevonden_pct"]["waarde"] == 0.5
    assert res["rangorde"]["alle"][0]["ongeldige_run"] and res["winnaar"] is None  # §3.7: ongeldige run → geen winnaar
    assert res["rangorde"]["alle"][0]["beoordeeld"] == 0 and res["rangorde"]["alle"][0]["gepoold"] == {"gevonden": 0, "positief": 0, "wilson": None}
    assert res["niet_gelabeld"]["k1a"]["1"] == {"onterecht": 2, "meldingen": 4, "waarde": 0.5}


def test_mislukte_verwerking_telt_positieve_paren_als_gemist_en_grens_twee_procent():
    w = {f"e{i}": et(str(i % 5), "kern-x", (MSC, [0, 0, 10, 10])) for i in range(50)}
    goed = {k: ok(m(MSC, [0, 0, 10, 10])) for k in w}
    u = {"k2a": {"1": dict(goed, e0={"ok": False, "meldingen": []}), "2": {k: v for k, v in goed.items() if k not in ("e0", "e1")}}}
    res = tel.bereken(w, u, seed=1, n_trekkingen=20)
    assert res["tabellen"]["alle"]["k2a"]["1"][MSC]["gemist"] == 1 and not res["runs"]["k2a"]["1"]["ongeldig"]  # 1/50 = 2%
    assert res["runs"]["k2a"]["2"]["ongeldig"]  # 2/50 = 4%


def test_deelverzamelingen_lekpaarfilter_kern_aanvulling_en_b0_herpakt():
    w, u = mini()
    u["b0"] = {"1": {"e1": dict(ok(m(MSC, [0, 0, 100, 100])), herpakt=True), "e2": ok(), "e3": ok(), "e4": ok()}}
    res = tel.bereken(w, u, lekparen=[("e1", MSC), ("e4", MSC)], seed=1, n_trekkingen=20)
    t = res["tabellen"]
    assert (t["zonder_lekparen"]["k1a"]["1"][MSC]["positief"], t["zonder_lekparen"]["k1a"]["1"][MSC]["onterecht"]) == (1, 0)
    assert t["zonder_lekparen"]["k1a"]["1"][MSC]["negatief"] == 1   # e4-MSC is lekpaar: geen negatief paar meer
    assert t["kern"]["k1a"]["1"][MSC]["positief"] == 1 and t["aanvulling"]["k1a"]["1"][FSC]["positief"] == 1
    assert t["zonder_herpakt"]["b0"]["1"][MSC]["positief"] == 1 and "k1a" not in t["zonder_herpakt"]


def test_stabiliteit_en_verwarbaar_in_resultaat():
    w, u = mini()
    u["k1a"]["1"]["e1"] = ok(m(NSC, [0, 0, 100, 100]))
    res = tel.bereken(w, u, seed=1, n_trekkingen=20)
    assert res["stabiliteit"]["alle"]["k1a"] == {"wisselt": 2, "paren": 3}   # e1-MSC en e2-MSC wisselen tussen run 1 en 2
    assert res["verwarbaar"]["alle"]["k1a"]["1"] == {}  # NSC op MSC-vak is geen verwarbaar paar


# §0 Rangorde vóór adjudicatie, §5 erna
def run(g, p, o=0, ger=None):
    return {"gevonden": g, "positief": p, "onterecht": o, "geraakt": g if ger is None else ger}


def test_oordeel_voor_en_na_adjudicatie():
    assert tel.oordeel([run(40, 40)], 6, True, False) == "te weinig voorbeelden"
    assert tel.oordeel([run(40, 40), run(40, 40)], 5, False, False) == "vindt het"
    assert tel.oordeel([run(10, 10), run(10, 10)], 5, False, False) == "vindt het, onzeker"   # Wilson-ondergrens 72%
    assert tel.oordeel([run(40, 40), run(40, 40)], 4, False, False) == "vindt het, onzeker"   # < 5 GLN's
    assert tel.oordeel([run(40, 40), run(31, 40)], 9, False, False) == "vindt het niet"
    assert tel.oordeel([run(40, 40, o=99)], 9, False, False) == "vindt het"                   # vals% telt vóór adjudicatie niet
    assert tel.oordeel([run(40, 40), run(40, 40)], 9, False, True) == "haalt het"
    assert tel.oordeel([run(40, 40, o=1), run(40, 40)], 9, False, True) == "haalt het, onzeker"  # Wilson-bovengrens vals > 10%
    assert tel.oordeel([run(40, 40, o=10), run(40, 40)], 9, False, True) == "haalt het niet"


def rangset():
    w = {f"x{i}": et(str(i), "kern-x", (MSC, [0, 0, 10, 10])) for i in range(12)}
    w.update({f"y{i}": et(str(i), "aanvulling-x", (FSC, [0, 0, 10, 10])) for i in range(9)})
    hit = lambda keys, code: {k: ok(m(code, [0, 0, 10, 10])) if k in keys else ok() for k in w}
    xs = [f"x{i}" for i in range(12)]
    u = {"v1": {"1": hit(xs[:10], MSC), "2": hit(xs[:10], MSC)}, "v3": {"1": hit(xs[:10], MSC), "2": hit(xs[:10], MSC)},
         "v2": {"1": hit(xs, MSC), "2": hit(xs[:9], MSC)}, "b0": {"1": hit(xs, MSC)}}
    return w, u


def test_rangorde_voor_adjudicatie_te_weinig_vast_b0_erbuiten_kosten_beslissen():
    w, u = rangset()
    res = tel.bereken(w, u, kosten={"v1": 0.02, "v3": 0.01, "v2": 0.001}, seed=1, n_trekkingen=20)
    assert res["te_weinig"] == sorted(c for c in tel.TOP15 if c != MSC)  # FSC 9 positieven, rest 0
    assert [r["variant"] for r in res["rangorde"]["alle"]] == ["v3", "v1", "v2"]
    assert res["rangorde"]["aanvulling"][0]["variant"] == "v2" and res["winnaar"] is None  # beste wisselt: geen winnaar
    assert res["rangorde"]["alle"][0]["vindt"] == 1 and round(res["rangorde"]["alle"][0]["gemiddeld"], 4) == round(10 / 12, 4)
    assert res["oordeel"]["alle"]["b0"][MSC] == "vindt het, onzeker" and res["oordeel"]["alle"]["v1"][FSC] == "te weinig voorbeelden"
    w2 = dict(w, y9=et("9", "aanvulling-x", (FSC, [0, 0, 10, 10])))   # adjudicatie voegt 10e FSC-positief toe
    res2 = tel.bereken(w2, u, bevroren=w, seed=1, n_trekkingen=20, na_adjudicatie=True)
    assert FSC in res2["te_weinig"]


# §6 Adjudicatie
def adjset():
    w = {"e1": et("A", "kern-x", (MSC, [0, 0, 100, 100])), "e2": et("B", "kern-x")}
    u = {"k1a": {"1": {"e1": ok(m(GD, [400, 400, 500, 500])), "e2": ok(m(GD, [0, 0, 100, 100]), m(FSC, None))}},
         "k1b": {"1": {"e1": ok(m(GD, [410, 410, 510, 510]), m(MSC, [0, 0, 100, 100])), "e2": ok()}}}
    return w, u


def test_adjudicatielijst_blind_ontdubbeld_willekeurig_met_gemiste_paren():
    w, u = adjset()
    res = tel.bereken(w, u, seed=1, n_trekkingen=20)
    lijst, sleutel = tel.adjudicatielijst(w, u, res, seed=3)
    meld = [x for x in lijst if x["soort"] == "melding"]
    assert sorted((x["kaart"], x["code"], len(sleutel[x["id"]])) for x in meld) == [("e1", GD, 2), ("e2", GD, 1)]  # zonder-vak FSC niet
    assert all(set(x) == {"id", "soort", "kaart", "code", "vak"} for x in meld)  # geen leden of variant in het blinde item
    assert [x for x in lijst if x["soort"] == "gemist"] == []  # beste variant (k1b) mist e1-MSC niet
    assert "k1a" not in json.dumps(lijst) and "k1b" not in json.dumps(lijst)
    assert {v["variant"] for x in meld if x["kaart"] == "e1" for v in sleutel[x["id"]]} == {"k1a", "k1b"}
    assert tel.adjudicatielijst(w, u, res, seed=3) == (lijst, sleutel)
    u2 = {"k1a": u["k1a"]}  # nu is k1a de beste en mist hij e1-MSC
    gem = [x for x in tel.adjudicatielijst(w, u2, tel.bereken(w, u2, seed=1, n_trekkingen=20), seed=3)[0] if x["soort"] == "gemist"]
    assert [(x["kaart"], x["code"]) for x in gem] == [("e1", MSC)]


def test_adjudicatie_toepassen_8_procent_en_vervallen_waarheid_en_herberekening():
    w, u = adjset()
    lijst = [{"id": "v1", "soort": "melding", "kaart": "e1", "code": GD, "vak": [100, 100, 300, 150]},
             {"id": "v2", "soort": "gemist", "kaart": "e1", "code": MSC, "vakken": [[0, 0, 100, 100]]},
             {"id": "v3", "soort": "melding", "kaart": "e2", "code": GD, "vak": [0, 0, 100, 100]}]
    w2, toegevoegd = tel.pas_adjudicatie_toe(w, lijst, {"v1": "ja", "v2": "nee", "v3": "nee"}, {"e1": (1000, 900)})
    assert w2["e1"]["vakken"] == [{"code": GD, "box": [160, 100, 240, 150], "grof": False}] and toegevoegd == {GD: 1}
    assert w["e1"]["vakken"][0]["code"] == MSC  # origineel onaangetast
    u = {"k1a": {"1": {"e1": ok(m(GD, [150, 100, 250, 150])), "e2": ok()}}}
    voor, na = tel.bereken(w, u, seed=1, n_trekkingen=20), tel.bereken(w2, u, bevroren=w, seed=1, n_trekkingen=20, na_adjudicatie=True)
    assert na["tabellen"]["alle"]["k1a"]["1"][GD]["gevonden"] == 1 and tel.omgezet(voor, na) == {"k1a": 1}
    assert na["oordeel"]["alle"]["k1a"][GD] == "te weinig voorbeelden"  # verzameling ligt vast op de bevroren waarheid (0 GD)
    with pytest.raises(ValueError):
        tel.pas_adjudicatie_toe(w, lijst, {"v1": "Ja"}, {})
    with pytest.raises(ValueError):
        tel.pas_adjudicatie_toe(w, lijst, {"v9": "ja"}, {})


# CLI: varianten uit submappen, ruwe bestanden, uitvoerbestanden, adjudicatie zonder nieuwe lijst
def test_cli_end_to_end(tmp_path):
    (tmp_path / "w.json").write_text(json.dumps({"etiketten": [
        {"kaart": "e1", "doc_id": "871-1-528", "herkomst": "kern-x", "positieve_vakken": [{"code": MSC, "box": [0, 0, 100, 100]}]},
        {"kaart": "e2", "doc_id": "872-1-528", "herkomst": "aanvulling-x", "positieve_vakken": []}]}))
    ruw = tmp_path / "ruw"
    k1 = {"status": "ok", "w": 1000, "h": 1000, "meldingen": [{"code": MSC, "vak": [0, 0, 100, 100], "volgorde": 0, "venster": 0},
                                                                {"code": GD, "vak": [500, 500, 550, 550], "volgorde": 1, "venster": 0}]}
    k2 = {"status": "ok", "vakken": [{"vak": [0, 0, 100, 100], "top": [[MSC, .9]]}, {"vak": [500, 500, 550, 550], "top": [[FSC, .9]]}]}
    for d, rec in (("k1a", k1), ("k2a", k2), ("k2a-op-k1a", k2), ("vtf", {"status": "ok"})):
        for r in ("run1", "run2"):
            (ruw / d / r).mkdir(parents=True)
            for k in ("e1", "e2"):
                (ruw / d / r / f"{k}.json").write_text(json.dumps(rec))
    (tmp_path / "b0").mkdir()
    (tmp_path / "b0" / "e1.json").write_text(json.dumps(b0rec([det(MSC, .9, x=0, y=0, w=100, h=100)])))
    (tmp_path / "lek.json").write_text(json.dumps([["e2", GD]]))
    uit = tmp_path / "uit"
    args = ["--waarheid", str(tmp_path / "w.json"), "--ruw", str(ruw), "--b0", str(tmp_path / "b0"), "--lekparen", str(tmp_path / "lek.json"),
            "--uit", str(uit), "--trekkingen", "20"]
    tel.main(args)
    res = json.loads((uit / "resultaat.json").read_text())
    assert set(res["tabellen"]["alle"]) == {"b0", "k1a", "k2a", "k4-aa"}
    assert res["tabellen"]["alle"]["k4-aa"]["1"][GD]["meldingen"] == 0 and res["tabellen"]["alle"]["k1a"]["1"][GD]["meldingen"] == 2
    assert res["runs"]["b0"]["1"]["mislukt"] == 1   # e2 ontbreekt in b0
    lijst = json.loads((uit / "adjudicatielijst.json").read_text()); sleutel = json.loads((uit / "adjudicatie-sleutel.json").read_text())
    assert set(sleutel) == {x["id"] for x in lijst}
    gd = [x["id"] for x in lijst if x["code"] == GD and x["kaart"] == "e1"]
    (tmp_path / "adj.json").write_text(json.dumps({gd[0]: "ja"}))
    tel.main(args + ["--adjudicatie", str(tmp_path / "adj.json")])
    na = json.loads((uit / "resultaat-na-adjudicatie.json").read_text())
    assert "adjudicatie" not in json.loads((uit / "resultaat.json").read_text())  # vóór-adjudicatie blijft staan
    assert na["adjudicatie"]["toegevoegd"] == {GD: 1} and na["adjudicatie"]["omgezet"]["k1a"] == 2
    assert json.loads((uit / "adjudicatielijst.json").read_text()) == lijst
    assert na["adjudicatie"]["onbeantwoord"] == sorted(set(sleutel) - {gd[0]}) and na["parameters"]["drempel"] == 0.8
    assert len(na["parameters"]["waarheid_sha256"]) == 64
    (uit / "adjudicatielijst.json").write_text(json.dumps(lijst[::-1] + [{"id": "x"}]))
    with pytest.raises(SystemExit):
        tel.main(args + ["--adjudicatie", str(tmp_path / "adj.json")])


def test_lees_ruw_varianten_k4_naam_vtf_en_lege_map_overgeslagen(tmp_path):
    for d in ("k1a/run1", "k2a-op-k1a/run1", "k3b-op-k1a/run1", "vtf/run1", "k2b"):
        (tmp_path / d).mkdir(parents=True)
    assert set(tel.lees_ruw(tmp_path, ["e1"])) == {"k1a", "k4-aa"}


def test_etiketmaat_geleend_van_andere_variant_bij_begrenzen():
    w = {"e1": et("A", "kern-x", (MSC, [50, 50, 100, 100]))}
    u = {"k1a": {"1": {"e1": ok(w=100, h=100)}}, "k2a": {"1": {"e1": {"ok": True, "meldingen": [m(MSC, [50, 50, 400, 400])], "w": None, "h": None}}}}
    assert tel.bereken(w, u, seed=1, n_trekkingen=10)["tabellen"]["alle"]["k2a"]["1"][MSC]["gevonden"] == 1  # onbegrensd: te groot vak


# Bevindingen review 30-10: winnaarregel, alle groepsleden na "ja", vaste B0-drempel, lijst niet overschrijven
def test_winnaar_vraagt_twee_geldige_runs_en_niet_overlappende_wilson():
    w = {f"x{i}": et(str(i), "kern-x" if i % 2 else "aanvulling-x", (MSC, [0, 0, 10, 10])) for i in range(40)}
    hit = lambda n: {k: ok(m(MSC, [0, 0, 10, 10])) if int(k[1:]) < n else ok() for k in w}
    u = {"goed": {"1": hit(40), "2": hit(40)}, "slecht": {"1": hit(4), "2": hit(4)}}
    res = tel.bereken(w, u, seed=1, n_trekkingen=10)
    assert res["winnaar"] == "goed" and res["rangorde"]["alle"][1]["gepoold"]["gevonden"] == 4
    assert (res["rangorde"]["alle"][0]["gepoold"]["positief"], res["rangorde"]["alle"][0]["beoordeeld"]) == (40, 1)
    assert tel.bereken(w, dict(u, slecht={"1": hit(38), "2": hit(38)}), seed=1, n_trekkingen=10)["winnaar"] is None  # intervallen overlappen
    een = tel.bereken(w, dict(u, goed={"1": hit(40)}), seed=1, n_trekkingen=10)
    assert een["rangorde"]["alle"][0]["runs"] == 1 and een["winnaar"] is None  # één run: geen winnaar
    b = een["beste_per_keurmerk"]["alle"][MSC]
    assert (b["variant"], b["gevonden"], b["positief"], b["gat_pp"]) == ("goed", 40, 40, 0.0)
    assert tel.bereken(w, u, seed=1, n_trekkingen=10)["beste_per_keurmerk"]["alle"][FSC] is None  # geen positieven


def test_ja_geldt_voor_alle_leden_van_een_ketengroep():
    w = {"e1": et("A", "kern-x")}
    u = {"b0": {"1": {"e1": ok(m(GD, [0, 0, 100, 100]))}}, "k1a": {"1": {"e1": ok(m(GD, [60, 0, 160, 100]))}},
         "k1b": {"1": {"e1": ok(m(GD, [120, 0, 220, 100]))}}}
    res = tel.bereken(w, u, seed=1, n_trekkingen=10)
    lijst, sleutel = tel.adjudicatielijst(w, u, res, seed=1)
    assert len(lijst) == 1 and len(sleutel[lijst[0]["id"]]) == 3
    w2, toegevoegd = tel.pas_adjudicatie_toe(w, lijst, {lijst[0]["id"]: "ja"}, {}, sleutel)
    assert toegevoegd == {GD: 1}
    na = tel.bereken(w2, u, bevroren=w, seed=1, n_trekkingen=10, na_adjudicatie=True)
    assert all(st == [True] for v in na["meldingstatus"].values() for st in v["1"].values())
    assert tel.omgezet(res, na) == {"b0": 1, "k1a": 1, "k1b": 1}


def test_cli_b0_drempel_vast_en_lijst_niet_overschrijven(tmp_path):
    (tmp_path / "w.json").write_text(json.dumps({"etiketten": [
        {"kaart": "e1", "doc_id": "871-1-528", "herkomst": "kern-x", "positieve_vakken": [{"code": MSC, "box": [0, 0, 100, 100]}]}]}))
    (tmp_path / "ruw").mkdir(); (tmp_path / "b0").mkdir()
    (tmp_path / "b0" / "e1.json").write_text(json.dumps(b0rec([det(MSC, .85, x=0, y=0, w=100, h=100), det(GD, .9, x=500, y=500)])))
    args = ["--waarheid", str(tmp_path / "w.json"), "--ruw", str(tmp_path / "ruw"), "--b0", str(tmp_path / "b0"), "--uit", str(tmp_path / "uit"),
            "--trekkingen", "10", "--drempel", "0.95"]
    tel.main(args)
    res = json.loads((tmp_path / "uit" / "resultaat.json").read_text())
    assert res["tabellen"]["alle"]["b0"]["1"][MSC]["gevonden"] == 1  # 0,85 telt: --drempel raakt B0 niet
    lijst = json.loads((tmp_path / "uit" / "adjudicatielijst.json").read_text())
    tel.main(args)  # zelfde invoer → zelfde lijst: mag
    (tmp_path / "uit" / "adjudicatielijst.json").write_text(json.dumps(lijst + [{"id": "oud"}]))
    with pytest.raises(SystemExit):
        tel.main(args)  # afwijkende bestaande lijst wordt niet overschreven
    (tmp_path / "uit" / "adjudicatielijst.json").write_text(json.dumps(lijst))
    (tmp_path / "adj.json").write_text(json.dumps({lijst[0]["id"]: "ja"}))
    tel.main(args + ["--adjudicatie", str(tmp_path / "adj.json")])
    na = json.loads((tmp_path / "uit" / "resultaat-na-adjudicatie.json").read_text())
    assert na["adjudicatie"]["niet_lekgetoetst"] == [["e1", GD]]
