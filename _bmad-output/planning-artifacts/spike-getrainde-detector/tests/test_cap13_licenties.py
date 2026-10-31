"""ATDD CAP-13 licentiecontrole (randvoorwaarden §4; contract `licenties.py`).
Rode fase: `licenties` bestaat nog niet. Verzonnen pakketlijsten; de `lokaal`-test controleert de echte uv-omgeving.
Vastgelegd: elk element van "overtredingen" en "ruim" is een dict met minstens "naam"."""
import importlib

import pytest

APACHE = "                                 Apache License\n                           Version 2.0, January 2004\n                        http://www.apache.org/licenses/\n"
MIT = "MIT License\n\nCopyright (c) 2026 Verzonnen\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\n"
GPL = "                    GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007\n"


@pytest.fixture
def li():
    return importlib.import_module("licenties")


def pakket(naam, licentie="MIT", versie="1.0.0", tekst=""):
    return {"naam": naam, "versie": versie, "licentie": licentie, "tekst": tekst}


def namen(lijst):
    return {x["naam"].lower() for x in lijst}


def test_cap13_constanten(li):
    assert {v.lower() for v in li.VERBODEN} >= {"ultralytics", "pymupdf", "fitz", "albumentationsx", "rfdetr_plus",
                                               "rfdetr-plus", "deimv2", "yoloe", "dinov3"}
    assert set(li.EXTERN) == {"pdftoppm", "pdftotext", "rsync", "ssh"}


@pytest.mark.parametrize("uitdrukking,verwacht", [
    ("Apache-2.0", "toegestaan"), ("MIT", "toegestaan"), ("BSD-3-Clause", "toegestaan"), ("BSD-2-Clause", "toegestaan"),
    ("0BSD", "toegestaan"), ("MPL-2.0", "toegestaan"), ("Apache-2.0 OR BSD-2-Clause", "toegestaan"),
    ("GPL-3.0-only OR MIT", "toegestaan"), ("(GPL-2.0-only OR MIT) AND BSD-3-Clause", "toegestaan"),
    ("ISC", "ruim"), ("PSF-2.0", "ruim"), ("MIT AND PSF-2.0", "ruim"), ("Zlib", "ruim"), ("CC0-1.0", "ruim"),
    ("Unlicense", "ruim"), ("HPND", "ruim"), ("BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0", "ruim"),
    ("", "onbekend"),
])
def test_cap13_uitdrukkingen_en_en_of(li, uitdrukking, verwacht):
    assert li.beoordeel(uitdrukking) == verwacht


def test_cap13_pillow_licentie_mit_cmu_is_een_mit_variant(li):
    assert li.beoordeel("MIT-CMU") in ("toegestaan", "ruim")  # Pillow 13 meldt "MIT-CMU"


@pytest.mark.parametrize("uitdrukking", ["GPL-3.0-only", "AGPL-3.0", "MIT AND GPL-3.0-or-later", "LicenseRef-Proprietary", "CC-BY-NC-4.0", "SSPL-1.0"])
def test_cap13_andere_licentie_is_niet_toegestaan(li, uitdrukking):
    assert li.beoordeel(uitdrukking) not in ("toegestaan", "ruim")


@pytest.mark.parametrize("naam,licentie,versie", [
    ("ultralytics", "MIT", "8.3.0"), ("Ultralytics", "AGPL-3.0", "8.3.0"), ("PyMuPDF", "MIT", "1.24.0"), ("fitz", "MIT", "0.0.1"),
    ("albumentationsx", "MIT", "2.0.0"), ("albumentations", "MIT", "2.0.9"), ("albumentations", "MIT", "2.0.10"),
    ("rfdetr_plus", "Apache-2.0", "1.0.0"), ("rfdetr-plus", "Apache-2.0", "1.0.0"), ("DEIMv2", "Apache-2.0", "1.0"),
    ("yoloe", "MIT", "0.1"), ("dinov3", "Apache-2.0", "0.1"),
])
def test_cap13_verboden_pakket_stopt_de_controle_ongeacht_metadata(li, naam, licentie, versie):
    r = li.controleer([pakket("pytest"), pakket(naam, licentie, versie)])
    assert namen(r["overtredingen"]) == {naam.lower()}


def test_cap13_oude_albumentations_en_rfdetr_zelf_mogen(li):
    r = li.controleer([pakket("albumentations", "MIT", "2.0.8"), pakket("albumentations", "MIT", "1.4.24"), pakket("rfdetr", "Apache-2.0", "1.11.2")])
    assert r["overtredingen"] == []


def test_cap13_verboden_licentie_stopt_en_ruim_wordt_vermeld(li):
    r = li.controleer([pakket("iets-gpl", "GPL-3.0-only"), pakket("typing_extensions", "PSF-2.0"), pakket("pytest", "MIT")])
    assert namen(r["overtredingen"]) == {"iets-gpl"} and namen(r["ruim"]) == {"typing_extensions"}


@pytest.mark.parametrize("tekst,overtreding", [(APACHE, False), (MIT, False), (GPL, True), ("", True), ("Alle rechten voorbehouden.\n", True)])
def test_cap13_leeg_licentieveld_leidt_naar_het_licentiebestand(li, tekst, overtreding):
    r = li.controleer([pakket("faster-coco-eval", licentie="", versie="1.6.5", tekst=tekst)])
    assert ("faster-coco-eval" in namen(r["overtredingen"])) is overtreding


def test_cap13_pakketten_uit_de_omgeving(li):
    p = li.pakketten_uit_omgeving()
    per_naam = {x["naam"].lower(): x for x in p}
    assert {"pytest", "pillow", "numpy"} <= set(per_naam)
    assert all({"naam", "versie", "licentie", "tekst"} <= set(x) for x in p)
    assert "MIT" in per_naam["pluggy"]["licentie"]  # geen License-Expression: valt terug op License


@pytest.mark.lokaal
def test_cap13_lokaal_echte_omgeving_zonder_overtredingen(li):
    r = li.controleer(li.pakketten_uit_omgeving())
    assert r["overtredingen"] == []
