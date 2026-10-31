"""ATDD CAP-11 bevriezing en eenmalige toetsrun (meetregels §6; contract `bevries.py`).
Rode fase: `bevries` bestaat nog niet. Verzonnen onderdelen als kleine bestanden in tmp_path.
Vastgelegd: `bevries(onderdelen, uit)` schrijft naar het bestand `uit` (bevroren.json)."""
import hashlib
import importlib
import json
import subprocess

import pytest

VERPLICHT = {"scheiding", "uitslag", "model", "drempels", "beoordelaar", "k4aa", "telcode", "gewichten"}


@pytest.fixture
def bv():
    return importlib.import_module("bevries")


@pytest.fixture
def onderdelen(tmp_path):
    d = tmp_path / "onderdelen"
    d.mkdir()
    paden = {}
    for naam in sorted(VERPLICHT):
        paden[naam] = d / f"{naam}.json"
        paden[naam].write_text(json.dumps({"onderdeel": naam, "inhoud": f"verzonnen-{naam}"}))
    return paden


def test_cap11_verplichte_onderdelen(bv):
    assert set(bv.VERPLICHT) == VERPLICHT and len(bv.VERPLICHT) == 8


def test_cap11_bevroren_json_bevat_de_sha256_van_alle_onderdelen(bv, onderdelen, tmp_path):
    uit = tmp_path / "bevroren.json"
    terug = bv.bevries(onderdelen, uit)
    bestand = json.loads(uit.read_text())
    tekst = json.dumps(bestand)
    for naam, pad in onderdelen.items():
        assert naam in tekst and hashlib.sha256(pad.read_bytes()).hexdigest() in tekst
    assert isinstance(terug, dict) and json.loads(json.dumps(terug, default=str)) == bestand


def test_cap11_ontbrekend_verplicht_onderdeel_is_een_fout(bv, onderdelen, tmp_path):
    del onderdelen["drempels"]
    with pytest.raises(ValueError):
        bv.bevries(onderdelen, tmp_path / "bevroren.json")
    assert not (tmp_path / "bevroren.json").exists()


def test_cap11_toetsrun_met_een_gewijzigd_onderdeel_wordt_geweigerd(bv, onderdelen, tmp_path):
    uit = tmp_path / "bevroren.json"
    bv.bevries(onderdelen, uit)
    bv.controleer(uit, onderdelen)  # ongewijzigd: geen fout
    onderdelen["drempels"].write_text(json.dumps({"onderdeel": "drempels", "inhoud": "bijgesteld op de toetsset"}))
    with pytest.raises(bv.Gewijzigd):
        bv.controleer(uit, onderdelen)


def test_cap11_eerste_toetsrun_telt_tweede_zonder_herhaling_en_reden_geweigerd(bv, tmp_path):
    runs = tmp_path / "uitvoer"
    runs.mkdir()
    eerste = bv.registreer_run(runs, "da")
    assert eerste.name == "da-run1.json"
    eerste.write_text(json.dumps({"uitslag": "eerste"}))
    for kw in ({}, {"herhaling": True}, {"reden": "netwerkfout halverwege"}):
        with pytest.raises(bv.AlGedraaid):
            bv.registreer_run(runs, "da", **kw)
    assert json.loads(eerste.read_text()) == {"uitslag": "eerste"}


def test_cap11_herhaling_met_technische_reden_mag_en_eerste_blijft_bewaard(bv, tmp_path):
    runs = tmp_path / "uitvoer"
    runs.mkdir()
    eerste = bv.registreer_run(runs, "k4aa")
    eerste.write_text(json.dumps({"uitslag": "eerste"}))
    reden = "aanbieder 40 minuten onbereikbaar (technische fout)"
    tweede = bv.registreer_run(runs, "k4aa", herhaling=True, reden=reden)
    assert tweede != eerste and tweede.parent == runs
    assert any(reden in p.read_text(encoding="utf-8") for p in runs.iterdir() if p.is_file())
    assert json.loads(eerste.read_text()) == {"uitslag": "eerste"}
    assert bv.registreer_run(runs, "da").name == "da-run1.json"  # elke route heeft een eigen eerste run


def test_cap11_bevroren_json_binnen_een_git_werkboom_wordt_geweigerd(bv, onderdelen, tmp_path):
    beelden = importlib.import_module("beelden")
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    with pytest.raises(beelden.BinnenRepo):
        bv.bevries(onderdelen, repo / "bevroren.json")
    assert not (repo / "bevroren.json").exists()
