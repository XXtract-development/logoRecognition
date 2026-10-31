"""ATDD CAP-14 uitgavenbewaking (randvoorwaarden §3; contract `kosten.py`).
Rode fase: `kosten` bestaat nog niet. Verzonnen bedragen met bekende uitkomst; geen netwerk.
Dat de client de aanroep die de grens passeert niet verstuurt, staat in test_openrouter.py."""
import importlib

import pytest

SONNET, FLASH = "anthropic/claude-sonnet-5.5", "google/gemini-3.8-flash"


@pytest.fixture
def ko():
    return importlib.import_module("kosten")


def envelop(usage):
    return {"choices": [{"finish_reason": "stop", "message": {"content": "{}"}}], "usage": usage}


def test_cap14_tarieven_uit_de_raming(ko):
    assert ko.TARIEF[SONNET] == pytest.approx((2e-6, 10e-6))
    assert ko.TARIEF[FLASH] == pytest.approx((0.825e-6, 4.125e-6))


def test_cap14_kosten_komen_uit_usage_cost(ko):
    assert ko.kosten_uit(envelop({"prompt_tokens": 1000, "completion_tokens": 100, "cost": 0.0421}), SONNET) == pytest.approx(0.0421)
    assert ko.kosten_uit(envelop({"prompt_tokens": 1000, "completion_tokens": 100, "cost": 0}), SONNET) == 0.0


@pytest.mark.parametrize("usage", [
    {"prompt_tokens": 1000, "completion_tokens": 100},
    {"prompt_tokens": 1000, "completion_tokens": 100, "cost": None},
    {"prompt_tokens": 1000, "completion_tokens": 100, "cost": "0.5"},
])
def test_cap14_zonder_usage_cost_tokens_maal_tarief(ko, usage):
    assert ko.kosten_uit(envelop(usage), SONNET) == pytest.approx(1000 * 2e-6 + 100 * 10e-6)
    assert ko.kosten_uit(envelop(usage), FLASH) == pytest.approx(1000 * 0.825e-6 + 100 * 4.125e-6)


def test_cap14_grens_is_anderhalf_keer_de_raming(ko):
    b = ko.Bewaker("voorinvulling toets", raming=21.0)
    assert b.grens == pytest.approx(31.5) and b.uitgegeven == 0
    assert ko.Bewaker("beoordelaar", raming=3.0, factor=2.0).grens == pytest.approx(6.0)


def test_cap14_post_met_verwachte_uitgave_boven_de_grens_start_niet(ko):
    b = ko.Bewaker("voorinvulling toets", raming=21.0)
    with pytest.raises(ko.BudgetOverschreden):
        b.controleer_start(350 * 0.091)  # 31,85 > 31,5
    b.controleer_start(31.5)  # precies op de grens mag
    assert issubclass(ko.BudgetOverschreden, Exception)


def test_cap14_aanroep_die_de_grens_zou_passeren_mag_niet(ko):
    b = ko.Bewaker("beoordelaar", raming=1.0)  # grens 1,5; bedragen exact in binaire breuken
    b.boek(1.25)
    b.boek(0.125)
    assert b.uitgegeven == 1.375
    assert b.mag(0.125) is True and b.mag(0.1250001) is False


def test_cap14_post_stopt_voor_de_grens(ko):
    b = ko.Bewaker("K4-aa", raming=0.1)  # grens 0,15; 30 aanroepen van 0,012 gepland
    for _ in range(12):
        assert b.mag(0.012) is True
        b.boek(0.012)
    assert b.mag(0.012) is False  # de 13e zou op 0,156 uitkomen
    assert b.uitgegeven == pytest.approx(0.144) and b.uitgegeven <= b.grens
