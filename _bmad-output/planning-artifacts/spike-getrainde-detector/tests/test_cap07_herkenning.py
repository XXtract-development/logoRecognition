"""ATDD CAP-7 herkenning op het hele etiket (trainingsset-en-herkenning §6, §8; contract `herken.py`).
Rode fase: `herken` bestaat nog niet. Verzonnen vakjes, scores en validatiesets met bekende uitkomst.
Vastgelegd: bij `hoog` telt alleen een kandidaat van dezelfde code op een etiket zonder die code (een vals alarm voor die code)."""
import importlib

import numpy as np
import pytest

GD, EU, MSC, WM = "GREEN_DOT", "EU_ORGANIC_FARMING", "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK"
NSA, NSB, NSC = "NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C"


@pytest.fixture
def hk():
    return importlib.import_module("herken")


@pytest.mark.parametrize("w,h,tegel,overlap", [(250, 130, 100, 25), (2048, 1024, 1024, 256), (3000, 700, 1024, 256)])
def test_cap07_tegels_dekken_het_hele_etiket_met_overlap(hk, w, h, tegel, overlap):
    tg = hk.tegels(w, h, tegel=tegel, overlap=overlap)
    dekking = np.zeros((h, w), bool)
    for x0, y0, x1, y1 in tg:
        assert 0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h and x1 - x0 <= tegel and y1 - y0 <= tegel
        dekking[y0:y1, x0:x1] = True
    assert dekking.all()
    for as_ in (0, 1):
        starts = sorted({t[as_] for t in tg})
        assert all(b - a <= tegel - overlap for a, b in zip(starts, starts[1:]))
    assert hk.tegels(w, h, tegel=tegel, overlap=overlap) == tg


def test_cap07_klein_etiket_is_een_tegel(hk):
    assert [tuple(t) for t in hk.tegels(500, 400)] == [(0, 0, 500, 400)]


def test_cap07_vakje_terug_naar_etiketcoordinaten(hk):
    assert tuple(hk.naar_etiket((10, 20, 30, 40), (768, 512, 1792, 1536))) == (778, 532, 798, 552)


def k(code, box, score):
    return {"code": code, "box": box, "score": score}


def kort(lijst):
    return {(x["code"], tuple(x["box"]), x["score"]) for x in lijst}


def test_cap07_samenvoegen_vanaf_iou_een_half_per_klasse(hk):
    a, b, c = (0, 0, 100, 100), (0, 0, 100, 50), (0, 0, 100, 49)
    assert kort(hk.nms([k(GD, a, 0.9), k(GD, b, 0.8)])) == {(GD, a, 0.9)}  # IoU 0,50
    assert kort(hk.nms([k(GD, a, 0.9), k(GD, c, 0.7)])) == {(GD, a, 0.9), (GD, c, 0.7)}  # IoU 0,49
    assert kort(hk.nms([k(GD, a, 0.9), k(EU, a, 0.6)])) == {(GD, a, 0.9), (EU, a, 0.6)}  # andere klasse


def test_cap07_samenvoegen_over_de_nutriscore_letters(hk):
    a = (0, 0, 120, 60)
    assert kort(hk.nms([k(NSA, a, 0.6), k(NSC, a, 0.8), k(NSB, (2, 0, 122, 60), 0.7)])) == {(NSC, a, 0.8)}
    assert kort(hk.nms([k(NSB, a, 0.6), k(GD, a, 0.5)])) == {(NSB, a, 0.6), (GD, a, 0.5)}


@pytest.mark.parametrize("score,verwacht", [(0.8, "melding"), (0.95, "melding"), (0.79, "beoordelaar"), (0.3, "beoordelaar"), (0.29, "niets")])
def test_cap07_bandregel(hk, score, verwacht):
    assert hk.band(score, 0.3, 0.8) == verwacht


POS = [0.30, 0.30, 0.30, 0.50, 0.55, 0.60, 0.65, 0.70, 0.72, 0.75, 0.78, 0.80, 0.82, 0.85, 0.88, 0.90, 0.92, 0.94, 0.96, 0.98]


def validatie_x(neg_max=0.62):
    v = [{"codes": {GD}, "kandidaten": [k(GD, (0, 0, 9, 9), s), k(GD, (50, 0, 59, 9), s / 2)]} for s in POS]
    v += [{"codes": {GD}, "kandidaten": []} for _ in range(2)]  # zonder kandidaat: telt niet mee voor laag
    v += [{"codes": set(), "kandidaten": [k(GD, (0, 0, 9, 9), s)]} for s in np.linspace(0.05, neg_max, 30).round(4)]
    return v


def test_cap07_drempels_per_code_uit_mini_validatieset(hk):
    d = hk.drempels(validatie_x(), [GD])
    assert d[GD] == (pytest.approx(0.30), pytest.approx(0.65))


def test_cap07_hoog_wordt_1_01_als_geen_waarde_valse_kandidaten_uitsluit(hk):
    v = validatie_x()
    v[-1]["kandidaten"] = [k(GD, (0, 0, 9, 9), 0.99)]  # hoger dan elke echte kandidaat
    assert hk.drempels(v, [GD])[GD] == (pytest.approx(0.30), pytest.approx(1.01))


def test_cap07_laag_heeft_vloer_0_05(hk):
    v = [{"codes": {MSC}, "kandidaten": [k(MSC, (0, 0, 9, 9), s)]} for s in [0.01, 0.01, 0.01] + [0.5 + i / 100 for i in range(9)]]
    v += [{"codes": set(), "kandidaten": []} for _ in range(30)]
    assert hk.drempels(v, [MSC])[MSC] == (pytest.approx(0.05), pytest.approx(0.5))


def test_cap07_te_weinig_validatie_etiketten_valt_terug_op_gezamenlijke_drempels(hk):
    v = validatie_x() + [{"codes": {WM}, "kandidaten": [k(WM, (0, 0, 9, 9), s)]} for s in (0.8, 0.8, 0.8, 0.9, 0.95)]
    d = hk.drempels(v, [GD, WM])
    assert d[GD] == (pytest.approx(0.30), pytest.approx(0.65))
    assert d[WM] == (pytest.approx(0.30), pytest.approx(0.65))  # eigen drempels zouden (0,8; 0,8) zijn


@pytest.mark.parametrize("tekst,verwacht", [
    ("Gevangen in de Noordzee. MSC-C-12345 www.msc.org", {MSC}),
    ("MSC – C – 54321", {MSC}),
    ("NL-BIO-01 Landbouw EU", {"EU_ORGANIC_FARMING"}),
    ("DE-ÖKO-006", {"EU_ORGANIC_FARMING"}),
    ("BE BIO 02 en MSC C 10293", {"EU_ORGANIC_FARMING", MSC}),
    ("FSC® C123456", {"FOREST_STEWARDSHIP_COUNCIL_LABEL"}),  # ronde 9: FSC is een keurmerk met certificaatnummer (trainingsset §8)
    ("MSC-C-1234", set()),         # vier cijfers
    ("XNL-BIO-01", set()),         # geen woordgrens
    ("", set()),
])
def test_cap07_certificaatnummers(hk, tekst, verwacht):
    assert hk.certificaten(tekst) == verwacht


def test_cap07_geen_pdf_tekst_is_niet_van_toepassing(hk):
    assert hk.certificaten(None) is None


DREMPELS = {GD: (0.3, 0.8), EU: (0.3, 0.8), MSC: (0.3, 0.8), WM: (0.3, 0.8)}


class Beoordeel:
    def __init__(self, antwoorden=None, standaard="nee"):
        self.antwoorden, self.standaard, self.calls = antwoorden or {}, standaard, []

    def __call__(self, kandidaat):
        self.calls.append(kandidaat)
        return self.antwoorden.get((kandidaat["code"], kandidaat["score"]), self.standaard)


def test_cap07_hoog_is_melding_band_naar_beoordelaar_laag_niets(hk):
    b = Beoordeel()
    uit = hk.beslis([k(GD, (0, 0, 9, 9), 0.9), k(EU, (20, 0, 29, 9), 0.5), k(MSC, (40, 0, 49, 9), 0.2)], DREMPELS, None, b)
    assert uit["meldingen"] == {GD} and uit["beoordeeld"] == 1
    assert [(c["code"], c["score"]) for c in b.calls] == [(EU, 0.5)]


def test_cap07_per_code_van_hoog_naar_laag_tot_ja(hk):
    b = Beoordeel({(EU, 0.6): "ja"})
    uit = hk.beslis([k(EU, (0, 0, 9, 9), 0.4), k(EU, (20, 0, 29, 9), 0.7), k(EU, (40, 0, 49, 9), 0.6)], DREMPELS, None, b)
    assert uit["meldingen"] == {EU} and [c["score"] for c in b.calls] == [0.7, 0.6] and uit["beoordeeld"] == 2


def test_cap07_twijfel_en_nee_worden_geen_melding(hk):
    uit = hk.beslis([k(EU, (0, 0, 9, 9), 0.5), k(WM, (20, 0, 29, 9), 0.5)], DREMPELS, set(), Beoordeel({(WM, 0.5): "twijfel"}))
    assert uit["meldingen"] == set()


def test_cap07_hoogstens_tien_beoordelingen_per_etiket(hk):
    b = Beoordeel()
    kand = [k([GD, EU, MSC, WM][i % 4], (i * 20, 0, i * 20 + 9, 9), 0.4 + i / 100) for i in range(12)]
    uit = hk.beslis(kand, DREMPELS, None, b)
    assert len(b.calls) == 10 and uit["beoordeeld"] == 10 and uit["meldingen"] == set()
    b3 = Beoordeel()
    assert hk.beslis(kand, DREMPELS, None, b3, max_beoordelingen=3)["beoordeeld"] == 3 and len(b3.calls) == 3


def test_cap07_certificaat_bevestigt_alleen_een_kandidaat_in_de_band(hk):
    b = Beoordeel()
    uit = hk.beslis([k(MSC, (0, 0, 9, 9), 0.5), k(GD, (20, 0, 29, 9), 0.1)], DREMPELS, {MSC, GD, "EU_ORGANIC_FARMING"}, b)
    assert uit["meldingen"] == {MSC}  # GD onder laag en EU zonder kandidaat: geen melding
    assert not [c for c in b.calls if c["code"] == MSC]


def test_cap07_certificaat_haalt_nooit_een_melding_weg(hk):
    kand = [k(GD, (0, 0, 9, 9), 0.9), k(EU, (20, 0, 29, 9), 0.5)]
    for cert in (None, set(), {MSC}):
        assert hk.beslis(kand, DREMPELS, cert, Beoordeel({(EU, 0.5): "ja"}))["meldingen"] == {GD, EU}


@pytest.mark.parametrize("maat", ["XL", "s", ""])
def test_cap07_laad_model_weigert_een_onbekende_maat(hk, tmp_path, maat):
    with pytest.raises(ValueError):
        hk.laad_model(tmp_path / "checkpoint.pth", maat)
