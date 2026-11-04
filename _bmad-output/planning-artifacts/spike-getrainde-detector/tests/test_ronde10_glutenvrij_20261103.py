"""ATDD ronde 10: glutenvrij als 14e keurmerk en 18e klasse, met de drie poorten (spec-spike-getrainde-detector-ronde10).

Rode fase: de bouwonderdelen bestaan nog niet. Gate A (licentie) is opgeheven door Friso (03-11-2026); daarom geen test
dat een licentie blokkeert. Gate B: cap $1 voor de route voorinvulling-r10 met Haiku, eigen bestand. Gate C: poort in de
code vóór de training (16 bevestigde mét, 35 zonder). Geen netwerk, geen betaalde aanroep.
"""
import argparse
import pathlib
import importlib
import io
import json
from pathlib import Path

import pytest
from PIL import Image

HAIKU = "anthropic/claude-haiku-5.5"
GLUTEN = "DIET_FREE_FROM_GLUTEN"
PROEFMAP = Path(__file__).resolve().parents[1]


@pytest.fixture
def uitslag():
    return importlib.import_module("uitslag")


@pytest.fixture
def train():
    return importlib.import_module("train")


@pytest.fixture
def toets():
    return importlib.import_module("toets")


# --- Aantallen: 14 keurmerken, 18 klassen -----------------------------------------------------------------------------

def test_glutenvrij_is_veertiende_keurmerk_en_achttiende_klasse(uitslag, train):
    assert uitslag.NIEUW_R10 == (GLUTEN,)
    assert len(uitslag.KEURMERKEN) == 14 and GLUTEN in uitslag.KEURMERKEN
    assert len(train.KLASSEN) == 18 and GLUTEN in train.KLASSEN


def test_bestaande_bevestigingen_zonder_glutenvrij_blijven_geldig(uitslag):
    # Back-compat: een bevestiging van vóór ronde 10 heeft geen glutenvrij-sleutel en moet geldig blijven.
    oud = {"id": "x", "waarde": {"status": "bevestigd", "nutriscore": ["A"],
                                 "keurmerken": {c: "afwezig" for c in uitslag.KEURMERKEN_LOS}}}
    assert uitslag.valideer(oud, {"x"})["status"] == "bevestigd"


def test_glutenvrij_keuze_wordt_geaccepteerd_als_bekende_sleutel(uitslag):
    nieuw = {"id": "x", "waarde": {"status": "bevestigd", "nutriscore": ["A"],
                                   "keurmerken": {c: "afwezig" for c in uitslag.KEURMERKEN_LOS} | {GLUTEN: "aanwezig"}}}
    assert uitslag.valideer(nieuw, {"x"})["keurmerken"][GLUTEN] == "aanwezig"


# --- Generator en scheiding -------------------------------------------------------------------------------------------

def test_off_zoekterm_voor_glutenvrij_bestaat(train):
    off = importlib.import_module("off")
    assert GLUTEN in off.ZOEK and set(off.ZOEK) <= set(train.KLASSEN)


def test_verpakkingscodes_glas_en_pictogram_staan_niet_in_de_meetlijst():
    scheiding = importlib.import_module("scheiding")
    # Testgeval met verzonnen bronregels; de echte namen staan nog niet vast (spec, open vraag 3).
    bron = [GLUTEN, "VERPAKKING_GLAS", "VERPAKKING_PICTOGRAM", "FOREST_STEWARDSHIP_COUNCIL_LABEL"]
    meetlijst = scheiding.klasse_tabel(bron)
    assert GLUTEN in meetlijst and "FOREST_STEWARDSHIP_COUNCIL_LABEL" in meetlijst
    assert "VERPAKKING_GLAS" not in meetlijst and "VERPAKKING_PICTOGRAM" not in meetlijst


# --- Gate B: cap $1, eigen bestand, Haiku -----------------------------------------------------------------------------

def test_gate_b_cap_is_een_dollar_en_eigen_bestand_voor_haiku(toets):
    assert toets.GRENS_R10 == 1.0
    assert toets.bestandsnaam("voorinvulling-r10", HAIKU) == "voorinvulling-r10-claude-haiku-5-5.json"
    assert toets.bestandsnaam("voorinvulling-r10", toets.SONNET) == "voorinvulling-r10.json"


def test_gate_b_weigert_grens_boven_een_dollar_zonder_nieuw_besluit(toets, tmp_path, capsys):
    # Streng: de weigering moet over de grens gaan (niet een argparse-fout omdat de subcommand ontbreekt).
    argv = ["voorinvulling-r10", "--proef-map", str(tmp_path), "--manifest", str(tmp_path / "m.json"),
            "--zdr-logo", str(tmp_path / "logo.png"), "--grens", "2", "--besluit", "verzonnen besluit"]
    with pytest.raises(SystemExit):
        toets.main(argv)
    assert "grens" in capsys.readouterr().err


def test_gate_b_volgorde_zet_de_17_glutenvrij_etiketten_vooraan(toets):
    docs = ["a", "b", "c", "d"]
    assert toets.volgorde_r10(docs, {"c", "a"}) == ["a", "c", "b", "d"]


# --- Gate C: poort in de code, fail-closed ----------------------------------------------------------------------------

def _rij(uitslag, gluten, in_bevestigde_codes=True):
    """Eén opgeslagen bevestiging zoals invul/server.py die schrijft: valideer(...) plus bevestigde_codes = alle gekozen
    keurmerken (sorted), met glutenvrij erin of er bewust uit (test van de semantiek)."""
    keur = {c: "afwezig" for c in uitslag.KEURMERKEN_LOS} | {GLUTEN: gluten}
    rij = uitslag.valideer({"id": "x", "waarde": {"status": "bevestigd", "nutriscore": ["A"], "keurmerken": keur}}, {"x"})
    rij["bevestigde_codes"] = sorted(keur if in_bevestigde_codes else set(keur) - {GLUTEN})
    return rij


def _uitslag(tmp_path, met, zonder, bestaat=True, extra=None):
    pad = tmp_path / "uitslag.json"
    if not bestaat:
        return pad
    uitslag = importlib.import_module("uitslag")
    # Echt formaat van toets/uitslag.json: doc-id -> de opgeslagen waarde (zie _rij).
    rijen = {f"m{i}": _rij(uitslag, "aanwezig") for i in range(met)}
    rijen |= {f"z{i}": _rij(uitslag, "afwezig") for i in range(zonder)}
    rijen |= extra or {}
    pad.write_text(json.dumps(rijen))
    return pad


def test_gate_c_weigert_bij_minder_dan_16_mét(train, tmp_path):
    with pytest.raises(train.PoortGlutenvrij, match="15"):
        train.poort_glutenvrij(_uitslag(tmp_path, met=15, zonder=40))


def test_gate_c_weigert_bij_minder_dan_35_zonder(train, tmp_path):
    with pytest.raises(train.PoortGlutenvrij, match="34"):
        train.poort_glutenvrij(_uitslag(tmp_path, met=16, zonder=34))


def test_gate_c_slaagt_bij_16_mét_en_35_zonder(train, tmp_path):
    train.poort_glutenvrij(_uitslag(tmp_path, met=16, zonder=35))  # geen uitzondering


def test_gate_c_is_fail_closed_bij_ontbrekend_bestand(train, tmp_path):
    with pytest.raises(train.PoortGlutenvrij):
        train.poort_glutenvrij(_uitslag(tmp_path, met=0, zonder=0, bestaat=False))


def test_gate_c_telt_glutenvrij_niet_mee_als_het_niet_in_bevestigde_codes_staat(train, tmp_path):
    # Een record met GLUTEN "aanwezig" maar zonder GLUTEN in bevestigde_codes is niet bevestigd: telt niet als mét.
    uitslag = importlib.import_module("uitslag")
    extra = {"niet_bevestigd": _rij(uitslag, "aanwezig", in_bevestigde_codes=False)}
    with pytest.raises(train.PoortGlutenvrij, match="15"):
        train.poort_glutenvrij(_uitslag(tmp_path, met=15, zonder=35, extra=extra))


# --- Gate B: route voorinvulling-r10 met een stub op het netwerk (geen echte aanroep, geen sleutel) -------------------

GROOT = "voorinvulling glutenvrij (gate B)"
DOCS = ("1-1-1", "1-1-2", "1-1-3", "1-1-4")


def _png(pad):
    Image.new("RGB", (600, 600), "white").save(pad)  # effen wit: geen niet-lege tegels, één aanroep per etiket
    return pad


def _opzet(tmp_path, declared=(), docs=DOCS):
    """Proefmap met een manifest, beelden, zdr-logo en een declaraties-bestand (formaat zoals scheiding.lees_declaraties)."""
    pm = tmp_path / "proef"
    (pm / "invoer").mkdir(parents=True)
    regels = ["doc_id\tt3777\tdieet\tnutriscore"] + [f"{d}\t\tFREE_FROM_GLUTEN\t" for d in declared]
    (pm / "invoer" / "declaraties-prod-basiseenheden-20261008.tsv").write_text("\n".join(regels) + "\n", encoding="utf-8")
    m = tmp_path / "gecombineerd"
    m.mkdir()
    for d in docs:
        _png(m / f"{d}.png")
    (m / "manifest.json").write_text(json.dumps({d: {"sha256": "0" * 64} for d in docs}))
    logo = _png(tmp_path / "logo.png")
    argv = ["voorinvulling-r10", "--proef-map", str(pm), "--manifest", str(m / "manifest.json"), "--zdr-logo", str(logo)]
    return argv, pm


def _envelop(antwoord, kost):
    return {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(antwoord)}}], "usage": {"cost": kost}}


class _Stub:
    """Vaste kosten per aanroep. Het netwerk is de stub (transport); de echte openrouter.Client draait eromheen, zodat de
    cap-controle en het boeken in openrouter.py en kosten.py worden getest en niet nagebootst."""

    def __init__(self):
        self.zdr, self.aanroep = 0.001, 0.01
        self.proeven, self.aanroepen, self.bewakers, self.modellen = 0, [], [], []

    def transport(self, url, body, headers, timeout):
        schema = body["response_format"]["json_schema"]["schema"]
        if "zichtbaar" in schema["properties"]:  # de zdr-proef
            self.proeven += 1
            return 200, _envelop({"zichtbaar": True}, self.zdr)
        self.aanroepen.append(body)
        return 200, _envelop({"keurmerken": [{"code": GLUTEN, "aanwezig": False, "tegels": []}]}, self.aanroep)


@pytest.fixture
def stub(monkeypatch):
    openrouter = importlib.import_module("openrouter")
    s = _Stub()
    echte = openrouter.Client

    def fabriek(model, rol, bewaker=None, **_):
        s.modellen.append(model)
        s.bewakers.append(bewaker)
        return echte(model, rol, sleutel="stub-sleutel", transport=s.transport, bewaker=bewaker, slaap=lambda _: None)

    monkeypatch.setattr(openrouter, "Client", fabriek)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    return s


def _grootboek(pm):
    pad = pm / "uitgaven.json"
    return json.loads(pad.read_text()) if pad.exists() else {}


def test_a_post_heet_voorinvulling_glutenvrij_en_bewaker_grens_is_een_dollar(stub, toets, tmp_path):
    argv, pm = _opzet(tmp_path)
    assert toets.main(argv) == 0
    assert stub.bewakers[0].post == GROOT and stub.bewakers[0].grens == 1.0
    assert set(_grootboek(pm)) == {GROOT}  # alleen de eigen post; "voorinvulling toets" blijft onaangeroerd


def test_b_cap_stopt_de_run_en_geen_aanroep_boven_de_cap(stub, toets, tmp_path):
    stub.aanroep = 0.4  # zdr 0,001; na twee aanroepen staat er 0,801; de derde zou 1,201 worden
    argv, pm = _opzet(tmp_path)
    assert toets.main(argv) == 2  # stoppunt 5
    assert len(stub.aanroepen) == 2
    assert _grootboek(pm)[GROOT] <= 1.0


def test_b_reserve_weigert_de_eerste_aanroep_als_marge_de_grens_passeert(stub, toets, tmp_path):
    # F1: zdr-proef kost 0,96; de eerste aanroep start met verwacht 0,05 (RESERVE_R10): 1,01 > 1, dus geen aanroep.
    stub.zdr = 0.96
    argv, pm = _opzet(tmp_path)
    assert toets.RESERVE_R10 == 0.05
    assert toets.main(argv) == 2
    assert stub.aanroepen == []
    assert _grootboek(pm)[GROOT] == pytest.approx(0.96)


def test_c_de_17_met_glutenvrij_declaratie_komen_vooraan(stub, toets, tmp_path):
    argv, pm = _opzet(tmp_path, declared=("1-1-3", "1-1-4"))
    assert toets.main(argv) == 0
    items = json.loads((pm / "toets" / "items-r10-claude-haiku-5-5.json").read_text())
    assert [i["id"] for i in items] == ["1-1-3", "1-1-4", "1-1-1", "1-1-2"]


def test_d_zdr_proef_wordt_op_het_grootboek_geboekt(stub, toets, tmp_path):
    stub.zdr, stub.aanroep = 0.002, 0.01
    argv, pm = _opzet(tmp_path, docs=("1-1-1", "1-1-2"))
    assert toets.main(argv) == 0
    assert stub.proeven == 1
    assert _grootboek(pm)[GROOT] == pytest.approx(0.002 + 2 * 0.01)
    assert (pm / "toets" / "zdr-proef-r10-claude-haiku-5-5.json").exists()


def test_e_sonnet_op_voorinvulling_r10_wordt_geweigerd_zonder_aanroep(stub, toets, tmp_path, capsys):
    argv, pm = _opzet(tmp_path)
    argv += ["--model", "anthropic/claude-sonnet-5.5"]
    with pytest.raises(SystemExit):
        toets.main(argv)
    assert "haiku" in capsys.readouterr().err
    assert stub.proeven == 0 and stub.aanroepen == []
    assert not (pm / "toets").exists()  # niets geschreven


class _Haler:
    """Antwoord van Robotoff: het zoekantwoord bevat het record alleen voor de glutenvrij-tag; de uitsnede is een PNG."""

    def __init__(self, record, png):
        self.record, self.png = record, png

    def get(self, url):
        if "crossed-grain-trademark" in url:
            return json.dumps({"count": 1, "logos": [self.record]}).encode()
        if "/crop?" in url:
            return self.png
        return json.dumps({"count": 0, "logos": []}).encode()


def test_f_off_record_met_glutenvrij_tag_wordt_diet_free_from_gluten(tmp_path):
    off = importlib.import_module("off")
    buf = io.BytesIO()
    Image.new("RGB", (200, 200), "red").save(buf, "PNG")
    record = {"id": 42, "barcode": "8712345678905", "image": {"width": 1000, "height": 1000},
              "bounding_box": [0.1, 0.1, 0.6, 0.6], "source_image": "/images/products/1.jpg", "username": "tester"}
    uit = tmp_path / "off"
    rapport = off.ophalen(uit, _Haler(record, buf.getvalue()), set(), set(), set(), {}, vrij=lambda: 10**12)
    assert rapport["klassen"]["DIET_FREE_FROM_GLUTEN"]["behouden"] == 1
    index = json.loads((uit / "bronnen.json").read_text(encoding="utf-8"))
    assert [(e["klasse"], e["logo_id"]) for e in index if e["klasse"] == "DIET_FREE_FROM_GLUTEN"] == [("DIET_FREE_FROM_GLUTEN", 42)]


# --- trace-controles (ronde 10, 04-11-2026): G-B9 Sonnet-bestanden onaangeroerd, G-B10 grens precies $1,00 ---------

SONNET_BESTANDEN = ("voorinvulling.json", "items.json", "zdr-proef.json", "voorinvulling-r9.json", "items-r9.json",
                    "zdr-proef-r9.json")


def test_g_b9_r10_route_leest_en_schrijft_geen_sonnet_bestand(stub, toets, tmp_path, monkeypatch):
    # Given: alle Sonnet-bestanden staan in de proefmap met een herkenbare inhoud
    argv, pm = _opzet(tmp_path, docs=("1-1-1", "1-1-2"))
    toetsmap = pm / "toets"
    toetsmap.mkdir(parents=True, exist_ok=True)
    for naam in SONNET_BESTANDEN:
        (toetsmap / naam).write_text(f"SONNET-SENTINEL {naam}")
    aangeraakt = []
    lezen, schrijven = pathlib.Path.read_text, pathlib.Path.write_text

    def lees(self, *a, **k):
        aangeraakt.append(("lezen", self.name))
        return lezen(self, *a, **k)

    def schrijf(self, *a, **k):
        aangeraakt.append(("schrijven", self.name))
        return schrijven(self, *a, **k)

    monkeypatch.setattr(pathlib.Path, "read_text", lees)
    monkeypatch.setattr(pathlib.Path, "write_text", schrijf)
    # When: de r10-route draait met Haiku
    assert toets.main(argv) == 0
    # Then: geen enkel Sonnet-bestand is gelezen of geschreven, en de inhoud is ongewijzigd
    assert any("voorinvulling-r10" in naam for _, naam in aangeraakt), "de opname van bestanden werkt niet"
    geraakt = {naam for _, naam in aangeraakt} & set(SONNET_BESTANDEN)
    assert geraakt == set(), f"Sonnet-bestanden aangeraakt: {sorted(geraakt)}"
    for naam in SONNET_BESTANDEN:
        assert (toetsmap / naam).read_text() == f"SONNET-SENTINEL {naam}"


def test_g_b10_grens_precies_een_dollar_mag_nog_en_daarboven_niet():
    kosten = importlib.import_module("kosten")
    b = kosten.Bewaker("voorinvulling glutenvrij (gate B)", 0.0, grens=1.0)
    b.boek(0.5)
    b.boek(0.5)  # uitgegeven: precies 1,00
    assert b.uitgegeven == 1.0
    # Given: 0,50 is uitgegeven; Then: een aanroep die tot precies 1,00 leidt mag, een cent meer niet
    b2 = kosten.Bewaker("voorinvulling glutenvrij (gate B)", 0.0, grens=1.0)
    b2.boek(0.5)
    assert b2.mag(0.5) is True
    assert b2.mag(0.5000001) is False
