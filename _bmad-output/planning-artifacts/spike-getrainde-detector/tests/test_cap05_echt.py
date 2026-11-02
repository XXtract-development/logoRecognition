"""ATDD CAP-5 echte trainingsvoorbeelden (trainingsset-en-herkenning §4, toetsset §2; contract `echt.py`).
Rode fase: `echt` bestaat nog niet. Verzonnen etiketten (wit beeld, bekende AI-vakjes) en verzonnen dHashes met bekende afstanden.
Vastgelegd modelantwoord (SCHEMA_VOORLABELS): {"vakjes": [{"beeld", "code", "box", "onzeker"}]}, met "beeld" 0 = heel etiket,
1.. = de tegels in volgorde, en "box" in pixels van dat beeld zoals verstuurd."""
import hashlib
import importlib
import io
import itertools
import json

import pytest
from PIL import Image

TRAIN_GLN, TOETS_GLN = "1000000000001", "1000000000002"
GD, EU, WM = "GREEN_DOT", "EU_ORGANIC_FARMING", "WEIDEMELK"


def etiket(vakjes, gln=TRAIN_GLN, doc="1000000000001-10000000000017-528", w=512, h=256):
    return {"doc_id": doc, "gln": gln, "beeld": Image.new("RGB", (w, h), "white"), "vakjes": list(vakjes)}


def vak(code, box, onzeker=False):
    return {"code": code, "box": box, "onzeker": onzeker}


def raakt(a, b):
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def bevat(t, b):
    return t[0] <= b[0] and t[1] <= b[1] and b[2] <= t[2] and b[3] <= t[3]


@pytest.fixture
def ec():
    return importlib.import_module("echt")


def test_cap05_toetsleverancier_in_de_invoer_is_een_fout(ec):
    with pytest.raises(ValueError):
        ec.naar_tegels([etiket([vak(GD, (20, 20, 60, 60))], gln=TOETS_GLN)], {TRAIN_GLN}, tegel=256, overlap=64)


def test_cap05_vakjes_in_tegelcoordinaten_en_tegels_binnen_het_beeld(ec):
    s1, s2 = (20, 20, 60, 60), (300, 20, 340, 60)
    uit = ec.naar_tegels([etiket([vak(GD, s1), vak(EU, s2)])], {TRAIN_GLN}, tegel=256, overlap=64)
    assert uit and all(t["doc_id"] == "1000000000001-10000000000017-528" for t in uit)
    for t in uit:
        x0, y0, x1, y1 = t["tegel"]
        assert 0 <= x0 < x1 <= 512 and 0 <= y0 < y1 <= 256 and x1 - x0 <= 256 and y1 - y0 <= 256
        gezien = {(v["code"], tuple(v["box"])) for v in t["vakjes"]}
        for code, b in ((GD, s1), (EU, s2)):
            verwacht = (code, (b[0] - x0, b[1] - y0, b[2] - x0, b[3] - y0))
            assert (verwacht in gezien) == bevat(t["tegel"], b)
        assert all(0 <= v["box"][0] < v["box"][2] <= x1 - x0 and 0 <= v["box"][1] < v["box"][3] <= y1 - y0 for v in t["vakjes"])
    assert any(tuple(t["tegel"][:2]) == (0, 0) and (GD, s1) in {(v["code"], tuple(v["box"])) for v in t["vakjes"]} for t in uit)


def test_cap05_tegels_die_een_onzeker_vakje_raken_vallen_af(ec):
    onzeker = (440, 100, 480, 140)
    uit = ec.naar_tegels([etiket([vak(GD, (20, 20, 60, 60)), vak(WM, onzeker, onzeker=True)])], {TRAIN_GLN}, tegel=256, overlap=64)
    assert uit  # de tegel linksboven raakt het onzekere vakje niet
    assert not any(raakt(t["tegel"], onzeker) for t in uit)
    assert not any(v["code"] == WM for t in uit for v in t["vakjes"])


def test_cap05_vakje_buiten_het_beeld_telt_als_onzeker(ec):
    buiten = (480, 200, 560, 300)  # valt deels buiten 512x256
    uit = ec.naar_tegels([etiket([vak(GD, (20, 20, 60, 60)), vak(EU, buiten)])], {TRAIN_GLN}, tegel=256, overlap=64)
    assert uit
    assert not any(raakt(t["tegel"], (480, 200, 512, 256)) for t in uit)
    assert not any(v["code"] == EU for t in uit for v in t["vakjes"])


def ver(i):
    return int(hashlib.sha256(f"etiket-{i}".encode()).hexdigest()[:16], 16)


def afstand(a, b):
    return bin(a ^ b).count("1")


def test_cap05_validatiesplit_per_klasse_ongeveer_30_procent(ec):
    et = [{"doc_id": f"x{i}", "codes": {GD}, "dhash": ver(i)} for i in range(20)]
    et += [{"doc_id": f"y{i}", "codes": {WM}, "dhash": ver(100 + i)} for i in range(10)]
    assert min(afstand(a["dhash"], b["dhash"]) for a, b in itertools.combinations(et, 2)) > 6  # voorwaarde: geen clusters
    train, valid = ec.valsplit(et)
    assert train | valid == {e["doc_id"] for e in et} and not train & valid
    assert abs(sum(d.startswith("x") for d in valid) - 6) <= 1
    assert abs(sum(d.startswith("y") for d in valid) - 3) <= 1
    assert ec.valsplit(et) == (train, valid)  # vaste seed


def test_cap05_bijna_gelijke_etiketten_blijven_aan_een_kant(ec):
    et = []
    for c in range(8):  # 8 ketens van 3: a~b (6 bits), b~c (6 bits), a en c 12 bits uit elkaar
        h = ver(200 + c)
        for j, d in enumerate((h, h ^ 0b111111, h ^ 0b111111111111)):
            et.append({"doc_id": f"c{c}-{j}", "codes": {GD}, "dhash": d})
    train, valid = ec.valsplit(et, fractie=0.3, seed=20261031)
    assert train and valid
    for c in range(8):
        leden = {f"c{c}-{j}" for j in range(3)}
        assert leden <= train or leden <= valid


KLASSEN = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C",
           "PREGNANCY_WARNING", "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO",
           "NUTRISCORE_D", "NUTRISCORE_E", "EUROPEAN_V_LABEL_VEGAN",  # ronde 5: 13 klassen
           "FOREST_STEWARDSHIP_COUNCIL_LABEL", "TRIMAN", "SOCIETY_PLASTICS_INDUSTRY", "ON_THE_WAY_TO_PLANETPROOF")  # ronde 9: 17


def png(maat, kleur=(250, 250, 250)):
    buf = io.BytesIO()
    Image.new("RGB", maat, kleur).save(buf, "PNG")
    return buf.getvalue()


class NepClient:
    def __init__(self, antwoord=None, fout=None, model="google/gemini-3.8-flash"):
        self.antwoord, self.fout, self.model, self.calls = antwoord, fout, model, []

    def vraag(self, tekst, beelden, schema, verwacht=0.0):
        self.calls.append({"tekst": tekst, "beelden": beelden, "schema": schema})
        if self.fout:
            raise self.fout
        return self.antwoord, 0.012


HEEL = png((400, 300))
TEGELS = [(png((200, 150), (240, 240, 240)), (200, 150, 400, 300)), (png((100, 75), (230, 230, 230)), (200, 0, 400, 150))]
ANTWOORD = {"vakjes": [
    {"beeld": 0, "code": GD, "box": [10, 10, 50, 50], "onzeker": False},
    {"beeld": 1, "code": EU, "box": [20, 30, 60, 70], "onzeker": False},
    {"beeld": 2, "code": WM, "box": [10, 10, 20, 20], "onzeker": True},  # tegel op halve schaal
    {"beeld": 0, "code": "PEFC", "box": [100, 100, 140, 140], "onzeker": False},  # gelijkend keurmerk (ronde 9: Triman is een klasse)
    {"beeld": 1, "code": "ander", "box": [0, 0, 10, 10], "onzeker": False},
]}


def test_cap05_schema_voorlabels_noemt_de_tien_klassen(ec):
    s = ec.SCHEMA_VOORLABELS
    assert s["type"] == "object" and "vakjes" in s["required"]
    assert all(code in json.dumps(s) for code in KLASSEN)


def test_cap05_voorlabels_een_vraag_heel_etiket_eerst_dan_de_tegels(ec):
    client = NepClient(ANTWOORD)
    ec.voorlabels(client, HEEL, TEGELS)
    assert len(client.calls) == 1
    assert client.calls[0]["beelden"] == [HEEL, TEGELS[0][0], TEGELS[1][0]]
    assert client.calls[0]["schema"] is ec.SCHEMA_VOORLABELS


def test_cap05_voorlabels_in_etiketcoordinaten_alleen_de_tien_klassen(ec):
    uit = ec.voorlabels(NepClient(ANTWOORD), HEEL, TEGELS)
    assert sorted((v["code"], tuple(v["box"]), v["onzeker"]) for v in uit) == sorted([
        (GD, (10, 10, 50, 50), False),
        (EU, (220, 180, 260, 220), False),
        (WM, (220, 20, 240, 40), True),  # (10..20) x 2 + (200, 0)
    ])


def test_cap05_mislukte_voorlabels_geven_de_fout_van_de_client(ec):
    orq = importlib.import_module("openrouter")
    with pytest.raises(orq.EtiketFout) as e:
        ec.voorlabels(NepClient(fout=orq.EtiketFout("antwoord_ongeldig")), HEEL, TEGELS)
    assert e.value.klasse == "antwoord_ongeldig"


def test_cap05_voorlabels_via_de_gedeelde_client_met_rol_voorlabels(ec):
    orq = importlib.import_module("openrouter")
    calls = []

    def voorbeeld(s):
        if "enum" in s:
            return s["enum"][0]
        return {k: voorbeeld(v) for k, v in s.get("properties", {}).items()} if s.get("type", "object") == "object" else \
            {"array": [], "string": "x", "boolean": True, "integer": 0, "number": 0}.get(s["type"])

    def transport(url, body, headers, timeout):
        calls.append(body)
        proef = voorbeeld(body.get("response_format", {}).get("json_schema", {}).get("schema", {"type": "object"}))
        inhoud = ANTWOORD if len(calls) > 1 else proef
        return 200, {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(inhoud)}}], "usage": {"cost": 0.01}}

    client = orq.Client("google/gemini-3.8-flash", "voorlabels", sleutel="NEP", transport=transport, slaap=lambda s: None)
    client.zdr_proef(png((32, 32), (0, 128, 0)))
    uit = ec.voorlabels(client, HEEL, TEGELS)
    assert {v["code"] for v in uit} == {GD, EU, WM}
    assert calls[-1]["provider"] == {"zdr": True, "data_collection": "deny"} and calls[-1]["model"] == "google/gemini-3.8-flash"
    assert sum(d["type"] == "image_url" for d in calls[-1]["messages"][0]["content"]) == 3


def test_cap05_rapport_per_keurmerk_overgebleven_etiketten_en_vakjes(ec):
    train = [etiket([vak(GD, (0, 0, 9, 9)), vak(GD, (20, 0, 29, 9)), vak(EU, (40, 0, 49, 9))], doc="t1"),
             etiket([vak(GD, (0, 0, 9, 9)), vak(WM, (20, 0, 29, 9), onzeker=True)], doc="t2")]
    valid = [etiket([vak(EU, (0, 0, 9, 9))], doc="v1")]
    r = ec.rapport(train, valid)
    assert set(r) == set(KLASSEN)
    assert r[GD] == {"train_etiketten": 2, "train_vakjes": 3, "valid_etiketten": 0, "valid_vakjes": 0}
    assert r[EU] == {"train_etiketten": 1, "train_vakjes": 1, "valid_etiketten": 1, "valid_vakjes": 1}
    assert r[WM] == {"train_etiketten": 0, "train_vakjes": 0, "valid_etiketten": 0, "valid_vakjes": 0}  # onzeker telt niet
