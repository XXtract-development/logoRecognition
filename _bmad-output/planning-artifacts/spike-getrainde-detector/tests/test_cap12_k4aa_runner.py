"""ATDD CAP-12 lokale K4-aa-runner (trainingsset-en-herkenning §9, meetregels §7; contract `k4aa_lokaal.py`).
Rode fase: `k4aa_lokaal` bestaat nog niet. Nagebootste `k4aa`-module met dezelfde vorm als apps/ml-service k4aa.scan
(async, `remaining()`, resultaat {"detections": [...], "stats": {...}}, K4aaError(klasse)). Verzonnen GLN's/GTIN's.
Vastgelegd: `requires_review` in de uitvoer is de verzameling gemelde codes met requires_review."""
import importlib
from types import SimpleNamespace

import pytest

GD, WM, MSC = "GREEN_DOT", "WEIDEMELK", "MARINE_STEWARDSHIP_COUNCIL_LABEL"
TRAIN_GLN, TOETS_GLN = "1000000000001", "1000000000002"
GTIN_GLN = {"10000000000017": TRAIN_GLN, "10000000000024": TOETS_GLN}


@pytest.fixture
def kl():
    return importlib.import_module("k4aa_lokaal")


def det(code, review=False):
    return {"t3777_code": code, "confidence": 0.9, "method": "k4aa", "uncertain": review, "requires_review": review,
            "bbox": {"x": 0.1, "y": 0.1, "width": 0.05, "height": 0.05}}


RESULTAAT = {
    "detections": [det(GD), det(WM, review=True), det("FOREST_STEWARDSHIP_COUNCIL_MIX", review=True), det("NUTRISCORE_D"), det("NUTRISCORE_B")],
    "stats": {"calls": 3, "attempts": 3, "tokens_in": 9000, "tokens_out": 300, "cost_usd": 0.0123},
}


def nep_k4aa(resultaat=RESULTAAT, fout=None):
    class K4aaError(Exception):
        def __init__(self, klasse):
            super().__init__(klasse)
            self.klasse = klasse

    gezien = {}

    async def scan(data, remaining):
        gezien["data"], gezien["remaining"] = data, remaining()
        if fout:
            raise K4aaError(fout)
        return resultaat

    return SimpleNamespace(scan=scan, K4aaError=K4aaError, gezien=gezien)


def test_cap12_publieke_bronnen(kl):
    assert set(kl.PUBLIEK) == {"gs1-packaging-label-guide", "synthetic-nutriscore-bootstrap"}


def test_cap12_alleen_referenties_van_trainingsleveranciers_en_publieke_bronnen(kl):
    refs = [
        {"id": "r1", "code": GD, "source": "review-confirmed", "path": "artwork-crops/10000000000017/a.png"},     # train: blijft
        {"id": "r2", "code": GD, "source": "review-confirmed", "path": "artwork-crops/10000000000024/b.png"},     # toets: weg
        {"id": "r3", "code": WM, "source": "realref-live-poc", "path": "artwork-crops/10000000000099/c.png"},     # onbekend: weg
        {"id": "r4", "code": MSC, "source": "gs1-packaging-label-guide", "path": "gs1/msc.png"},                  # publiek
        {"id": "r5", "code": "NUTRISCORE_A", "source": "synthetic-nutriscore-bootstrap", "path": "synth/a.png"},  # publiek
        {"id": "r6", "code": "EU_ORGANIC_FARMING", "source": "https://commons.wikimedia.org/wiki/File:Organic-Logo.svg", "path": "wiki/eu.png"},
        {"id": "r7", "code": GD, "source": "review-confirmed", "path": "zonder-gtin/d.png"},                       # niet te herleiden: weg
    ]
    assert {r["id"] for r in kl.filter_referenties(refs, GTIN_GLN, {TRAIN_GLN})} == {"r1", "r4", "r5", "r6"}


def test_cap12_elke_detectie_binnen_de_8_keurmerken_is_een_melding(kl):
    assert kl.meldingen_uit(RESULTAAT) == {GD, WM, "NUTRISCORE_B"}  # ook requires_review; FSC en D vallen af
    assert kl.meldingen_uit({"detections": [], "stats": {}}) == set()


@pytest.mark.parametrize("budget", [300, 120])
def test_cap12_tijdsbudget_per_etiket_wordt_doorgegeven(kl, budget):
    k4 = nep_k4aa()
    kl.draai_etiket(k4, b"etiketbytes", budget_s=budget)
    assert budget - 1 < k4.gezien["remaining"] <= budget


def test_cap12_standaard_tijdsbudget_300_s(kl):
    k4 = nep_k4aa()
    kl.draai_etiket(k4, b"etiketbytes")
    assert 299 < k4.gezien["remaining"] <= 300


def test_cap12_uitvoer_per_etiket_met_kosten_en_tijd(kl):
    k4 = nep_k4aa()
    uit = kl.draai_etiket(k4, b"\x89PNG-verzonnen")
    assert k4.gezien["data"] == b"\x89PNG-verzonnen"
    assert uit["meldingen"] == {GD, WM, "NUTRISCORE_B"}
    assert uit["kosten"] == pytest.approx(0.0123)
    assert isinstance(uit["tijd"], float) and uit["tijd"] >= 0
    assert uit["requires_review"] == {WM}


@pytest.mark.parametrize("klasse", ["budget_exhausted", "provider_error", "image_invalid", "references_incomplete"])
def test_cap12_k4aa_fout_is_een_routefout_voor_dit_etiket(kl, klasse):
    assert kl.draai_etiket(nep_k4aa(fout=klasse), b"x") == {"fout": klasse}


def test_cap12_no_zdr_provider_stopt_de_run(kl):
    orq = importlib.import_module("openrouter")
    with pytest.raises(orq.RunStop) as e:
        kl.draai_etiket(nep_k4aa(fout="no_zdr_provider"), b"x")
    assert e.value.reden == "geen_zdr"
