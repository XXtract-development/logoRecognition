"""Standaardmodel voorinvulling = anthropic/claude-haiku-5.5 (besluit Friso 03-11-2026, SPEC.md Assumptions).

ATDD: deze tests waren eerst rood (4 rood, 1 groen, zie de checklist in _bmad-output/test-artifacts); na de build groen.
Geen netwerk en geen betaalde aanroep: de transport-stub en de Client-stub breken af zodra er een aanroep komt.
"""
import argparse
import importlib
import json
from pathlib import Path

import pytest

PROEFMAP = Path(__file__).resolve().parents[1]
HAIKU = "anthropic/claude-haiku-5.5"
SONNET = "anthropic/claude-sonnet-5.5"
FLASH = "google/gemini-3.8-flash"


class _Gestopt(Exception):
    """Gooid na de argumentparse, zodat main() niets verder doet (geen bestanden, geen aanroep)."""


@pytest.fixture
def toets():
    return importlib.import_module("toets")


@pytest.fixture
def kosten():
    return importlib.import_module("kosten")


ORIGINELE_PARSE_ARGS = argparse.ArgumentParser.parse_args  # vóór elke monkeypatch, dus ook bij meerdere aanroepen per test


def _parse(monkeypatch, toets, argv):
    """Laat toets.main de argumenten parsen en stop direct daarna; geeft het Namespace terug."""
    vang = {}

    def vangen(self, args=None, namespace=None):
        vang["ns"] = ORIGINELE_PARSE_ARGS(self, args, namespace)
        raise _Gestopt

    monkeypatch.setattr(argparse.ArgumentParser, "parse_args", vangen)
    with pytest.raises(_Gestopt):
        toets.main(argv)
    return vang["ns"]


BASIS = ["--proef-map", "/geen/proef", "--manifest", "/geen/manifest.json", "--zdr-logo", "/geen/logo.png"]


@pytest.mark.parametrize("stap", ["voorinvulling", "voorinvulling-r9"])
def test_standaardmodel_voorinvulling_is_haiku(monkeypatch, toets, stap):
    # Given: de subcommando's met alleen verplichte argumenten (geen --model)
    # When: de argumenten worden geparset
    ns = _parse(monkeypatch, toets, [stap, *BASIS])
    # Then: het standaardmodel is Haiku 5.5
    assert ns.model == HAIKU, f"{stap}: standaardmodel is {ns.model}, verwacht {HAIKU}"


def test_sonnet_blijft_kiesbaar_via_model(monkeypatch, toets):
    # Given: een expliciete --model keuze
    # When: de argumenten worden geparset
    # Then: Sonnet komt onveranderd door, voor beide subcommando's
    assert _parse(monkeypatch, toets, ["voorinvulling", *BASIS, "--model", SONNET]).model == SONNET
    assert _parse(monkeypatch, toets, ["voorinvulling-r9", *BASIS, "--model", SONNET]).model == SONNET


@pytest.mark.parametrize("model, toegestaan", [(SONNET, True), (HAIKU, True), (FLASH, False)])
def test_client_voor_voorinvulling_weigert_alleen_het_k4aa_model(model, toegestaan):
    # Given: de client voor de voorinvulling
    # When: de client met het model wordt gemaakt (geen aanroep)
    # Then: Sonnet en Haiku slagen; Gemini (K4-aa-model) wordt geweigerd
    openrouter = importlib.import_module("openrouter")
    if toegestaan:
        assert openrouter.Client(model, "voorinvulling", sleutel="NEP-TEST-sleutel", transport=_geen_aanroep).model == model
    else:
        with pytest.raises(ValueError):
            openrouter.Client(model, "voorinvulling", sleutel="NEP-TEST-sleutel", transport=_geen_aanroep)


def _geen_aanroep(*args, **kwargs):
    raise AssertionError("geen aanroep in een test (geen betaalde call)")


class _ClientGestopt(Exception):
    """Gooid door de Client-stub: het model is vastgelegd, de aanroep stopt hier."""


@pytest.fixture
def proefmap(tmp_path):
    from PIL import Image

    Image.new("RGB", (64, 64), "white").save(tmp_path / "doc1.png")
    (tmp_path / "manifest.json").write_text(json.dumps({"doc1": {"sha256": "x"}}))
    return tmp_path


@pytest.mark.parametrize("stap", ["voorinvulling", "voorinvulling-r9"])
def test_main_zonder_model_geeft_haiku_door_aan_de_client(monkeypatch, toets, proefmap, stap):
    # Given: een proefmap met één leeg etiket, en een Client-stub die het model vastlegt en stopt
    # When: toets.main draait zonder --model
    # Then: de client krijgt Haiku (de parse-test alleen bewijst dat niet: de bedrading tot de client wel)
    gebruikt = {}

    class ClientStub:
        def __init__(self, model, rol, *args, **kwargs):
            gebruikt["model"] = model
            raise _ClientGestopt

    monkeypatch.setattr(toets.openrouter, "Client", ClientStub)
    with pytest.raises(_ClientGestopt):
        toets.main([stap, "--proef-map", str(proefmap), "--manifest", str(proefmap / "manifest.json"),
                    "--zdr-logo", str(proefmap / "doc1.png")])
    assert gebruikt["model"] == HAIKU


def test_tarief_haiku_bestaat_en_bestaande_regels_blijven(kosten):
    # Given: de TARIEF-tabel in kosten.py
    # When: de regels van Haiku, Sonnet en Gemini worden opgevraagd
    # Then: Haiku heeft het OpenRouter-tarief van 03-11-2026, de andere regels zijn ongewijzigd
    assert kosten.TARIEF[HAIKU] == pytest.approx((1e-7, 5e-7))
    assert kosten.TARIEF[SONNET] == pytest.approx((2e-6, 10e-6))
    assert kosten.TARIEF[FLASH] == pytest.approx((0.825e-6, 4.125e-6))


def test_kosten_zonder_usage_cost_telt_tokens_maal_haiku_tarief(kosten):
    # Given: een antwoord zonder usage.cost van 1.000.000 invoer- en 100.000 uitvoertokens
    # When: de kosten worden berekend voor Haiku
    # Then: 1e6 * 1e-7 + 1e5 * 5e-7 = 0,15 dollar
    env = {"usage": {"prompt_tokens": 1_000_000, "completion_tokens": 100_000}}
    assert kosten.kosten_uit(env, HAIKU) == pytest.approx(0.15)


def test_uitvoernamen_per_model_sonnet_houdt_oude_namen_haiku_krijgt_eigen_bestand(toets):
    # Given: de uitvoerbasis en twee modellen (besluit Friso 03-11-2026: nieuw bestand per model)
    # When: de bestandsnaam wordt bepaald
    # Then: Sonnet houdt de oude namen; Haiku schrijft naar een eigen bestand
    assert toets.bestandsnaam("voorinvulling", SONNET) == "voorinvulling.json"
    assert toets.bestandsnaam("items-r9", SONNET) == "items-r9.json"
    assert toets.bestandsnaam("voorinvulling", HAIKU) == "voorinvulling-claude-haiku-5-5.json"
    assert toets.bestandsnaam("voorinvulling-r9", HAIKU) == "voorinvulling-r9-claude-haiku-5-5.json"


def test_zdr_gedrag_van_de_client_ongewijzigd():
    # Characterisatie (trace-gat AC5, geen rood-eerst: het gedrag bestaat al): zdr en geen dataverzameling
    # Given: de gedeelde OpenRouter-client
    # When: het providerblok wordt opgevraagd
    # Then: zdr staat aan en data_collection staat op deny
    openrouter = importlib.import_module("openrouter")
    assert openrouter.PROVIDER == {"zdr": True, "data_collection": "deny"}


DOCS = ["randvoorwaarden.md", "DRAAIPLAN.md", "toetsset.md"]


@pytest.mark.parametrize("doc", DOCS)
def test_documenten_noemen_haiku_met_datum_en_besluit(doc):
    # Characterisatie (trace-gat AC6): elk document noemt het model, de datum en het besluit van Friso
    # Given: de drie documenten van de proef
    # When: de tekst wordt gelezen
    # Then: Haiku 5.5, de datum 03-11-2026 en het besluit staan erin
    tekst = (PROEFMAP / doc).read_text(encoding="utf-8")
    assert "claude-haiku-5.5" in tekst
    assert "03-11-2026" in tekst
    assert "Gebruik voortaan haiku" in tekst or "besluit Friso" in tekst


def test_client_met_haiku_start_zonder_fout_en_roept_niets_aan():
    # Given: een transport dat faalt zodra er een aanroep gedaan wordt
    # When: de client met Haiku voor de voorinvulling wordt gemaakt
    # Then: de constructor slaagt zonder aanroep en het model staat goed
    openrouter = importlib.import_module("openrouter")

    def transport_zonder_aanroep(*args, **kwargs):
        raise AssertionError("de constructor mag geen aanroep doen (geen betaalde call in een test)")

    client = openrouter.Client(HAIKU, "voorinvulling", sleutel="NEP-TEST-sleutel", transport=transport_zonder_aanroep)
    assert client.model == HAIKU
    assert client.rol == "voorinvulling"
