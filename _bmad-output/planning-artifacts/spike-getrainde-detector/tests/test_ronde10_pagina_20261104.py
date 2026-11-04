"""Ronde 10 invulpagina (besluit Friso 04-11-2026): glutenvrij als optionele keuzerij naast de verplichte set.

De nieuwe pagina staat in `invul/index-ronde10.html`. `invul/index.html` blijft ongewijzigd tot Friso de wissel geeft,
want de live server (127.0.0.1:8767) leest `index.html` bij elk verzoek. Server en uitslag blijven ongewijzigd: de sleutel
`DIET_FREE_FROM_GLUTEN` staat al in `uitslag.NIEUW_R10`. Tijdelijke map, geen live data, geen netwerk.
"""
import importlib
import json
import shutil
import subprocess
import threading
import urllib.error
import urllib.request
from pathlib import Path
from types import SimpleNamespace

import pytest

SPIKE = Path(__file__).resolve().parents[1]
PAGINA_R10 = SPIKE / "invul" / "index-ronde10.html"
GLUTEN = "DIET_FREE_FROM_GLUTEN"
DOCS = ["1000000000001-20000000000001-528", "1000000000001-20000000000002-528", "1000000000001-20000000000003-528"]
ITEMS = [{"id": d, "beeld": f"beelden/{d}.png", "hint": [], "voorinvulling": {"keurmerken": {}, "nutriscore": []}}
         for d in DOCS]


@pytest.fixture
def us():
    return importlib.import_module("uitslag")


@pytest.fixture
def server(tmp_path):
    mod = importlib.import_module("invul.server")
    (tmp_path / "items.json").write_text(json.dumps(ITEMS))
    srv = mod.maak_server(tmp_path, 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield SimpleNamespace(url=f"http://127.0.0.1:{srv.server_address[1]}", map=tmp_path, srv=srv,
                          bestand=tmp_path / "uitslag.json")
    srv.shutdown()
    srv.server_close()


def post(url, body):
    req = urllib.request.Request(url + "/opslaan", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def stand(url):
    with urllib.request.urlopen(url + "/stand", timeout=10) as r:
        return json.loads(r.read())


def bevestiging(us, gluten=None):
    keur = {c: "afwezig" for c in us.KEURMERKEN_LOS}
    if gluten is not None:
        keur[GLUTEN] = gluten
    return {"status": "bevestigd", "keurmerken": keur, "nutriscore": ["A"], "veranderd": [], "opmerking": "",
            "tijd": "2026-11-04T10:00:00+01:00"}


def regel(tekst, begin):
    return next(r for r in tekst.splitlines() if r.startswith(begin))


# --- 1. de pagina heeft de glutenvrij-rij als keuzerij ----------------------------------------------------------------

def test_pagina_r10_heeft_glutenvrij_als_keuzerij_in_keurmerken():
    tekst = PAGINA_R10.read_text(encoding="utf-8")
    assert 'const OPTIONEEL = ["DIET_FREE_FROM_GLUTEN"];' in tekst
    assert 'const KEUZE = LOS.concat(OPTIONEEL);' in tekst
    assert 'const KEURMERKEN = KEUZE.concat(["NUTRISCORE"]);' in tekst
    assert 'DIET_FREE_FROM_GLUTEN: "Glutenvrij"' in tekst
    # de rijen en de keuzes worden gebouwd uit KEUZE, dus de glutenvrij-rij krijgt ook aanwezig/afwezig/onzeker
    assert "for (const code of KEUZE) {\n    const rij = el(\"div\"" in tekst


# --- 2. glutenvrij is niet verplicht ---------------------------------------------------------------------------------

def test_pagina_r10_glutenvrij_zit_niet_in_los_en_de_verplichte_set_blijft_12(us):
    tekst = PAGINA_R10.read_text(encoding="utf-8")
    los = regel(tekst, "const LOS =")
    assert los.startswith("const LOS = R5.concat(NIEUW);") and GLUTEN not in los and "OPTIONEEL" not in los
    assert GLUTEN not in us.KEURMERKEN_LOS and len(us.KEURMERKEN_LOS) == 12
    assert "alle 12 keurmerken en bij Nutri-Score" in tekst  # foutmelding: de verplichte set, niet de 14


# --- 3. server accepteert glutenvrij als aanwezig, afwezig of onzeker -------------------------------------------------

@pytest.mark.parametrize("keuze", ["aanwezig", "afwezig", "onzeker"])
def test_server_accepteert_glutenvrij_keuze_en_zet_bevestigde_codes(us, server, keuze):
    doc = DOCS[["aanwezig", "afwezig", "onzeker"].index(keuze)]
    waarde = bevestiging(us, gluten=keuze)
    assert us.valideer({"id": doc, "waarde": waarde}, {doc})["keurmerken"][GLUTEN] == keuze
    assert post(server.url, {"id": doc, "waarde": waarde}) == 200
    r = json.loads(server.bestand.read_text(encoding="utf-8"))[doc]
    assert r["keurmerken"][GLUTEN] == keuze
    assert GLUTEN in r["bevestigde_codes"]  # komt terug in bevestigde_codes, ook als afwezig of onzeker
    if keuze == "aanwezig":
        assert stand(server.url)["stand"][GLUTEN]["met"] == 1


# --- 4. back-compat: bevestiging zonder de glutenvrij-sleutel blijft geldig ------------------------------------------

def test_bevestiging_zonder_glutenvrij_blijft_geldig(us, server):
    doc = DOCS[0]
    waarde = bevestiging(us)  # geen GLUTEN-sleutel, zoals een bevestiging van vóór ronde 10
    assert us.valideer({"id": doc, "waarde": waarde}, {doc})["status"] == "bevestigd"
    assert post(server.url, {"id": doc, "waarde": waarde}) == 200
    r = json.loads(server.bestand.read_text(encoding="utf-8"))[doc]
    assert r["bevestigde_codes"] == sorted(us.KEURMERKEN_LOS)
    assert GLUTEN not in r["bevestigde_codes"]
    assert stand(server.url)["stand"][GLUTEN] == {"met": 0, "zonder": 0}


# --- syntaxiscontrole van de pagina (alleen als node beschikbaar is) -------------------------------------------------

@pytest.mark.skipif(shutil.which("node") is None, reason="node niet beschikbaar")
def test_pagina_r10_javascript_is_geldig(tmp_path):
    tekst = PAGINA_R10.read_text(encoding="utf-8")
    script = tekst.split("<script>", 1)[1].split("</script>", 1)[0]
    pad = tmp_path / "pagina.js"  # in een eigen tijdelijke map, niet in de invulmap
    pad.write_text(script, encoding="utf-8")
    assert subprocess.run(["node", "--check", str(pad)], capture_output=True).returncode == 0
