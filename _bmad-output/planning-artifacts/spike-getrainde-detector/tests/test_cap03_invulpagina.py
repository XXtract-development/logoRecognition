"""ATDD CAP-3 invulpagina, serverkant en gedeelde uitslagfunctie (toetsset §6, meetregels §3/§5; contract `uitslag.py`, `invul/server.py`).
Rode fase: `uitslag` en `invul.server` bestaan nog niet. Integratie: echte server via `maak_server(map, 0)` in een thread,
aangesproken met urllib. De browsertest staat in een eigen bestand. Verzonnen etiketten, geen klantdata."""
import importlib
import json
import os
import threading
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

K7 = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING",
      "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO")
K8 = K7 + ("NUTRISCORE",)
KL = K7 + ("EUROPEAN_V_LABEL_VEGAN",)  # ronde 5: V-label als 8e losse keuze
NIEUW_R9 = ("FOREST_STEWARDSHIP_COUNCIL_LABEL", "TRIMAN", "SOCIETY_PLASTICS_INDUSTRY", "ON_THE_WAY_TO_PLANETPROOF")
KL12 = KL + NIEUW_R9  # ronde 9: bevestigd vraagt alle 12 losse keurmerken
EU, GD, WM = "EU_ORGANIC_FARMING", "GREEN_DOT", "WEIDEMELK"
DOCS = [f"1000000000001-{20000000000000 + i}-528" for i in range(8)]
ITEMS = [{"id": d, "beeld": f"beelden/{d}.png", "hint": [], "voorinvulling": {"keurmerken": {GD: True}, "nutriscore": []}} for d in DOCS]


def volledig(**over):
    w = {"status": "bevestigd", "keurmerken": {c: "afwezig" for c in KL12}, "nutriscore": [], "veranderd": [],
         "opmerking": "", "tijd": "2026-10-31T21:00:00+01:00"}
    w.update(over)
    return w


@pytest.fixture
def us():
    return importlib.import_module("uitslag")


@pytest.fixture
def server(tmp_path):
    mod = importlib.import_module("invul.server")
    (tmp_path / "items.json").write_text(json.dumps(ITEMS))
    srv = mod.maak_server(tmp_path, 0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield SimpleNamespace(url=f"http://127.0.0.1:{srv.server_address[1]}", map=tmp_path, srv=srv, bestand=tmp_path / "uitslag.json")
    srv.shutdown()
    srv.server_close()


def post(url, body):
    data = body if isinstance(body, bytes) else json.dumps(body).encode()
    req = urllib.request.Request(url + "/opslaan", data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, None


def get(url, pad):
    with urllib.request.urlopen(url + pad, timeout=10) as r:
        return r.status, r.headers.get("Content-Type", ""), r.read()


# --- gedeelde uitslagfunctie ---------------------------------------------------------------------------------------

def test_cap03_keurmerklijsten(us):
    assert tuple(us.KEURMERKEN_LOS) == KL12 and tuple(us.KEURMERKEN) == KL12 + ("NUTRISCORE",)  # ronde 9: 12 + Nutri-Score


def test_cap03_valideer_accepteert_volledig_bevestigd_en_onleesbaar(us):
    assert isinstance(us.valideer({"id": DOCS[0], "waarde": volledig(nutriscore=["B"])}, set(DOCS)), dict)
    assert isinstance(us.valideer({"id": DOCS[0], "waarde": {"status": "onleesbaar", "opmerking": "wazig"}}, set(DOCS)), dict)


ONGELDIG = {
    "onbekende_waarde": volledig(keurmerken={**volledig()["keurmerken"], GD: "ja"}),
    "onbekend_keurmerk": volledig(keurmerken={**volledig()["keurmerken"], "FOREST_STEWARDSHIP_COUNCIL_MIX": "afwezig"}),
    "nutriscore_als_keurmerk": volledig(keurmerken={**volledig()["keurmerken"], "NUTRISCORE_A": "aanwezig"}),
    "letter_f": volledig(nutriscore=["F"]),
    "nutriscore_tekst": volledig(nutriscore="misschien"),
    "status_onbekend": volledig(status="klaar"),
    "keurmerken_geen_object": volledig(keurmerken="aanwezig"),
    "bevestigd_zes_van_zeven": volledig(keurmerken={c: "afwezig" for c in K7[:-1]}),
    "bevestigd_zonder_nutriscore": {k: v for k, v in volledig().items() if k != "nutriscore"},
}


@pytest.mark.parametrize("geval", list(ONGELDIG))
def test_cap03_valideer_weigert(us, geval):
    with pytest.raises(ValueError):
        us.valideer({"id": DOCS[0], "waarde": ONGELDIG[geval]}, set(DOCS))


def test_cap03_valideer_weigert_onbekend_etiket(us):
    with pytest.raises(ValueError):
        us.valideer({"id": "9999999999999-99999999999999-528", "waarde": volledig()}, set(DOCS))


def uitslag_mini():
    nee = {c: "afwezig" for c in K7}
    return {
        "d1": volledig(keurmerken={**nee, GD: "aanwezig", WM: "onzeker"}, nutriscore=["B"]),
        "d2": volledig(keurmerken=nee, nutriscore=["D"]),
        "d3": volledig(keurmerken=nee, nutriscore="onleesbaar"),
        "d4": {"status": "onleesbaar", "keurmerken": {GD: "aanwezig"}, "nutriscore": ["A"], "opmerking": "", "tijd": "2026-10-31T21:00:00"},
        "d5": volledig(keurmerken={**nee, EU: "aanwezig"}, nutriscore=["A", "C"]),
        "d6": volledig(keurmerken=nee, nutriscore=[]),
    }


def test_cap03_per_keurmerk_gedeelde_negatieven_onzeker_en_onleesbaar_tellen_niet(us):
    pk = us.per_keurmerk(uitslag_mini())
    assert (pk[GD]["met"], pk[GD]["zonder"]) == ({"d1"}, {"d2", "d3", "d5", "d6"})
    assert (pk[EU]["met"], pk[EU]["zonder"]) == ({"d5"}, {"d1", "d2", "d3", "d6"})
    assert (pk[WM]["met"], pk[WM]["zonder"]) == (set(), {"d2", "d3", "d5", "d6"})  # d1 onzeker, d4 onleesbaar


def test_cap03_per_keurmerk_nutriscore_als_groep_en_per_letter(us):
    pk = us.per_keurmerk(uitslag_mini())
    assert (pk["NUTRISCORE"]["met"], pk["NUTRISCORE"]["zonder"]) == ({"d1", "d2", "d5"}, {"d6"})  # ronde 5: D telt als mét
    assert (pk["NUTRISCORE_A"]["met"], pk["NUTRISCORE_B"]["met"], pk["NUTRISCORE_C"]["met"]) == ({"d5"}, {"d1"}, {"d5"})
    assert "d2" in pk["NUTRISCORE_A"]["zonder"] and "d3" not in pk["NUTRISCORE_A"]["zonder"]


def test_cap03_stand_telt_per_keurmerk(us):
    st = us.stand(uitslag_mini())
    assert st[GD] == {"met": 1, "zonder": 4} and st["NUTRISCORE"] == {"met": 3, "zonder": 1}
    assert all(set(st[k]) == {"met", "zonder"} for k in K8)


# --- server --------------------------------------------------------------------------------------------------------

def test_cap03_server_luistert_alleen_lokaal(server):
    assert server.srv.server_address[0] == "127.0.0.1"


def test_cap03_pagina_en_items(server):
    status, soort, body = get(server.url, "/")
    assert status == 200 and "text/html" in soort
    tekst = body.decode()
    assert 'id="opmerking"' in tekst and 'id="voortgang"' in tekst and 'id="opslaan"' in tekst
    status, _, body = get(server.url, "/items.json")
    assert status == 200 and json.loads(body) == ITEMS


def test_cap03_keuze_landt_volgens_het_schema(server):
    waarde = volledig(keurmerken={**volledig()["keurmerken"], GD: "aanwezig", EU: "onzeker"}, nutriscore=["B", "D"],
                      veranderd=[GD], opmerking="étiket – één logo half zichtbaar")
    assert post(server.url, {"id": DOCS[0], "waarde": waarde}) == (200, {"ok": True})
    opgeslagen = json.loads(server.bestand.read_text(encoding="utf-8"))
    r = opgeslagen[DOCS[0]]
    assert (r["status"], r["keurmerken"], r["nutriscore"], r["veranderd"]) == ("bevestigd", waarde["keurmerken"], ["B", "D"], [GD])
    assert r["opmerking"] == "étiket – één logo half zichtbaar"
    assert datetime.fromisoformat(r["tijd"])


def test_cap03_tussenstand_en_onleesbaar_worden_opgeslagen(server):
    assert post(server.url, {"id": DOCS[1], "waarde": {"keurmerken": {GD: "aanwezig"}}})[0] == 200
    assert json.loads(server.bestand.read_text())[DOCS[1]]["keurmerken"][GD] == "aanwezig"
    assert post(server.url, {"id": DOCS[1], "waarde": volledig(nutriscore=["A"])})[0] == 200
    assert json.loads(server.bestand.read_text())[DOCS[1]]["nutriscore"] == ["A"]
    assert post(server.url, {"id": DOCS[2], "waarde": {"status": "onleesbaar", "opmerking": "wazig"}})[0] == 200
    assert json.loads(server.bestand.read_text())[DOCS[2]]["status"] == "onleesbaar"


def test_cap03_schrijft_atomisch_via_tijdelijk_bestand(server, monkeypatch):
    gezien = []
    for naam in ("replace", "rename"):
        echt = getattr(os, naam)
        monkeypatch.setattr(os, naam, lambda src, dst, _e=echt, **kw: (gezien.append((Path(src), Path(dst))), _e(src, dst, **kw))[1])
    assert post(server.url, {"id": DOCS[0], "waarde": volledig()})[0] == 200
    assert any(d.name == "uitslag.json" and s != d and s.parent == server.map for s, d in gezien)
    assert sorted(p.name for p in server.map.iterdir()) == ["items.json", "uitslag.json"]


def test_cap03_acht_gelijktijdige_opslagen_komen_alle_aan(server):
    start, uitkomst = threading.Barrier(8), [None] * 8

    def sla_op(i):
        start.wait()
        uitkomst[i] = post(server.url, {"id": DOCS[i], "waarde": volledig(opmerking=f"etiket {i}")})[0]

    draden = [threading.Thread(target=sla_op, args=(i,)) for i in range(8)]
    for d in draden:
        d.start()
    for d in draden:
        d.join(timeout=30)
    assert uitkomst == [200] * 8
    opgeslagen = json.loads(server.bestand.read_text())
    assert {d: opgeslagen[d]["opmerking"] for d in DOCS} == {d: f"etiket {i}" for i, d in enumerate(DOCS)}


@pytest.mark.parametrize("geval", list(ONGELDIG))
def test_cap03_server_weigert_ongeldige_waarde_en_laat_het_bestand_staan(server, geval):
    assert post(server.url, {"id": DOCS[0], "waarde": volledig()})[0] == 200
    voor = server.bestand.read_bytes()
    assert post(server.url, {"id": DOCS[0], "waarde": ONGELDIG[geval]})[0] == 400
    assert server.bestand.read_bytes() == voor


@pytest.mark.parametrize("body", [
    {"id": "9999999999999-99999999999999-528", "waarde": volledig()},
    {"waarde": volledig()},
    b"{geen json",
])
def test_cap03_server_weigert_onbekend_etiket_en_kapotte_aanvraag(server, body):
    assert post(server.url, body)[0] == 400
    assert not server.bestand.exists()


def test_cap03_stand_endpoint_gebruikt_de_gedeelde_functie(server, us):
    post(server.url, {"id": DOCS[0], "waarde": volledig(keurmerken={**volledig()["keurmerken"], GD: "aanwezig"}, nutriscore=["C"])})
    post(server.url, {"id": DOCS[1], "waarde": volledig()})
    status, _, body = get(server.url, "/stand")
    antwoord, opgeslagen = json.loads(body), json.loads(server.bestand.read_text())
    assert status == 200 and antwoord["uitslag"] == opgeslagen
    assert antwoord["stand"] == json.loads(json.dumps(us.stand(opgeslagen)))
    assert antwoord["stand"][GD] == {"met": 1, "zonder": 1}
