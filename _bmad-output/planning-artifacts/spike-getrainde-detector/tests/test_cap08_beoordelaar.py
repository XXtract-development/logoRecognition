"""ATDD CAP-8 taalmodel-beoordelaar (trainingsset-en-herkenning §7; contract `beoordelaar.py`, samen met `herken.beslis`).
Rode fase: `beoordelaar` bestaat nog niet. Nagebootste client met dezelfde `vraag`-vorm als openrouter.Client; verzonnen beelden.
Vastgelegd: een fout van de beoordelaar komt uit `beslis` naar boven (routefout), nooit als stille `nee`."""
import importlib
import io

import numpy as np
import pytest
from PIL import Image

GD, EU, MSC, WM, NSB = "GREEN_DOT", "EU_ORGANIC_FARMING", "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "NUTRISCORE_B"


@pytest.fixture
def bo():
    return importlib.import_module("beoordelaar")


@pytest.fixture
def orq():
    return importlib.import_module("openrouter")


def veld(schema):
    return [n for n, p in schema["properties"].items() if set(p.get("enum", [])) == {"ja", "nee", "twijfel"}]


def png(kleur=(255, 255, 255), maat=(300, 300)):
    buf = io.BytesIO()
    Image.new("RGB", maat, kleur).save(buf, "PNG")
    return buf.getvalue()


class NepClient:
    def __init__(self, *antwoorden, model="google/gemini-3.8-flash"):
        self.antwoorden, self.model, self.calls = list(antwoorden), model, []

    def vraag(self, tekst, beelden, schema, verwacht=0.0):
        self.calls.append({"tekst": tekst, "beelden": beelden, "schema": schema})
        a = self.antwoorden.pop(0)
        if isinstance(a, Exception):
            raise a
        return a, 0.002


def rood_vak(maat, box):
    im = Image.new("RGB", maat, (255, 255, 255))
    im.paste((255, 0, 0), box)
    return im


def rood(im):
    a = np.asarray(im.convert("RGB")).astype(int)
    return int(((a[:, :, 0] > 200) & (a[:, :, 1] < 60) & (a[:, :, 2] < 60)).sum())


def test_cap08_schema_ja_nee_twijfel(bo):
    assert bo.SCHEMA["type"] == "object"
    velden = veld(bo.SCHEMA)
    assert len(velden) == 1 and velden[0] in bo.SCHEMA["required"]


def test_cap08_uitsnede_minstens_256_px_rond_het_vakje(bo):
    uit = bo.uitsnede(rood_vak((1000, 1000), (400, 400, 500, 500)), (400, 400, 500, 500))
    assert uit.size == (256, 256) and rood(uit) == 100 * 100


def test_cap08_uitsnede_met_vijftig_procent_marge(bo):
    uit = bo.uitsnede(rood_vak((3000, 3000), (1000, 1000, 1600, 1400)), (1000, 1000, 1600, 1400))
    assert 900 <= uit.size[0] <= 1202 and 600 <= uit.size[1] <= 802  # 50% marge: in totaal of per kant
    assert rood(uit) == 600 * 400


def test_cap08_uitsnede_aan_de_rand_blijft_binnen_het_beeld(bo):
    uit = bo.uitsnede(rood_vak((1000, 1000), (0, 0, 100, 100)), (0, 0, 100, 100))
    assert uit.size[0] <= 1000 and uit.size[1] <= 1000 and rood(uit) == 100 * 100


@pytest.mark.parametrize("oordeel", ["ja", "nee", "twijfel"])
def test_cap08_twee_losse_beelden_en_het_schema(bo, oordeel):
    client, crop, ref = NepClient({veld(bo.SCHEMA)[0]: oordeel}), png((255, 0, 0)), png((0, 128, 0), (200, 200))
    assert bo.beoordeel(client, crop, ref, GD) == oordeel
    assert len(client.calls) == 1
    assert client.calls[0]["beelden"] == [crop, ref] and client.calls[0]["schema"] is bo.SCHEMA


def test_cap08_nutriscore_vraagt_naar_dezelfde_letter(bo):
    client = NepClient({veld(bo.SCHEMA)[0]: "ja"}, {veld(bo.SCHEMA)[0]: "ja"})
    bo.beoordeel(client, png(), png(), NSB)
    bo.beoordeel(client, png(), png(), GD)
    assert "letter" in client.calls[0]["tekst"].lower() and client.calls[0]["tekst"] != client.calls[1]["tekst"]


@pytest.mark.parametrize("antwoord", [{"x": "ja"}, "misschien", {}])
def test_cap08_ongeldig_antwoord_is_een_fout_nooit_nee(bo, orq, antwoord):
    inhoud = {veld(bo.SCHEMA)[0]: antwoord} if isinstance(antwoord, str) else antwoord
    with pytest.raises(orq.EtiketFout) as e:
        bo.beoordeel(NepClient(inhoud), png(), png(), EU)
    assert e.value.klasse == "antwoord_ongeldig"


def test_cap08_fout_van_de_client_wordt_doorgegeven(bo, orq):
    with pytest.raises(orq.EtiketFout) as e:
        bo.beoordeel(NepClient(orq.EtiketFout("aanbieder")), png(), png(), EU)
    assert e.value.klasse == "aanbieder"


DREMPELS = {GD: (0.3, 0.8), EU: (0.3, 0.8), MSC: (0.3, 0.8), WM: (0.3, 0.8)}


def kand(code, score, i=0):
    return {"code": code, "box": (i * 20, 0, i * 20 + 9, 9), "score": score}


def via_beoordelaar(bo, client):
    return lambda kandidaat: bo.beoordeel(client, png(), png(), kandidaat["code"])


def test_cap08_alleen_ja_wordt_melding_van_hoog_naar_laag_tot_ja(bo):
    hk = importlib.import_module("herken")
    v = veld(bo.SCHEMA)[0]
    clients, volgorde = {EU: NepClient({v: "nee"}, {v: "ja"}), WM: NepClient({v: "twijfel"})}, []

    def beoordeel(kandidaat):
        volgorde.append((kandidaat["code"], kandidaat["score"]))
        return bo.beoordeel(clients[kandidaat["code"]], png(), png(), kandidaat["code"])

    uit = hk.beslis([kand(EU, 0.4, 0), kand(EU, 0.7, 1), kand(EU, 0.6, 2), kand(WM, 0.5, 3)], DREMPELS, None, beoordeel)
    assert uit["meldingen"] == {EU} and uit["beoordeeld"] == 3
    assert [s for c, s in volgorde if c == EU] == [0.7, 0.6]  # 0,4 niet meer beoordeeld na "ja"
    assert clients[EU].antwoorden == [] and clients[WM].antwoorden == []


def test_cap08_hoogstens_tien_beoordelingen_per_etiket(bo):
    hk = importlib.import_module("herken")
    v = veld(bo.SCHEMA)[0]
    client = NepClient(*[{v: "nee"} for _ in range(12)])
    kandidaten = [kand([GD, EU, MSC, WM][i % 4], 0.4 + i / 100, i) for i in range(12)]
    uit = hk.beslis(kandidaten, DREMPELS, None, via_beoordelaar(bo, client))
    assert len(client.calls) == 10 and uit["beoordeeld"] == 10 and uit["meldingen"] == set()


def test_cap08_ongeldig_antwoord_in_beslis_is_een_routefout(bo, orq):
    hk = importlib.import_module("herken")
    client = NepClient({veld(bo.SCHEMA)[0]: "misschien"})
    with pytest.raises(orq.EtiketFout):
        hk.beslis([kand(EU, 0.5)], DREMPELS, None, via_beoordelaar(bo, client))
