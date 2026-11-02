"""ATDD CAP-2 toetskandidaten en AI-voorinvulling (toetsset §4-§5, meetregels §2; contract `toets.py`).
Rode fase: `toets` bestaat nog niet. Nagebootste client met dezelfde `vraag`-vorm als openrouter.Client; verzonnen GLN's/GTIN's.
Vastgelegd modelantwoord (SCHEMA_VOORINVULLING): {"keurmerken": [{"code", "aanwezig", "tegels"}], "nutriscore": [...], "gelijkend": [...]}."""
import collections
import hashlib
import importlib
import io
import json

import pytest
from PIL import Image

RIJEN = (
    "EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C",
    "PREGNANCY_WARNING", "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO",
)
K7 = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING",
      "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO")
EU, GD, WM = "EU_ORGANIC_FARMING", "GREEN_DOT", "WEIDEMELK"
GLN = {k: f"100000000000{i}" for i, k in enumerate("ABC", 1)}


def gtins(letter, n, prefix="2"):
    return {f"{prefix}{'ABC'.index(letter) + 1}{i:012d}" for i in range(n)}


def toets_rijen(**per_rij):
    """toets_rijen(EU_ORGANIC_FARMING={"A": set, ...}) -> alle 10 rijen, lege rijen leeg."""
    return {r: {GLN[l]: g for l, g in per_rij.get(r, {}).items()} for r in RIJEN}


def png(kleur=(240, 240, 240)):
    buf = io.BytesIO()
    Image.new("RGB", (24, 16), kleur).save(buf, "PNG")
    return buf.getvalue()


class NepClient:
    def __init__(self, antwoord=None, fout=None, model="anthropic/claude-sonnet-5.5", kosten=0.061):
        self.antwoord, self.fout, self.model, self.kosten, self.calls = antwoord, fout, model, kosten, []

    def vraag(self, tekst, beelden, schema, verwacht=0.0):
        self.calls.append({"tekst": tekst, "beelden": beelden, "schema": schema})
        if self.fout:
            raise self.fout
        return self.antwoord, self.kosten


@pytest.fixture
def ts():
    return importlib.import_module("toets")


def test_cap02_tot_40_per_keurmerk_om_de_beurt_per_leverancier(ts):
    rij = {"A": gtins("A", 50), "B": gtins("B", 5), "C": gtins("C", 50)}
    uit = ts.kandidaten(toets_rijen(EU_ORGANIC_FARMING=rij), {})
    per_gln = collections.Counter(i["gln"] for i in uit)
    assert len(uit) == 40 and per_gln[GLN["B"]] == 5
    assert per_gln[GLN["A"]] + per_gln[GLN["C"]] == 35 and abs(per_gln[GLN["A"]] - per_gln[GLN["C"]]) <= 1
    assert all(i["gtin"] in rij["ABC"[int(i["gln"][-1]) - 1]] for i in uit)
    assert all(isinstance(i["reden"], str) and i["reden"] for i in uit)


def test_cap02_minder_dan_40_beschikbaar_geeft_alle_en_max_per_is_instelbaar(ts):
    assert len(ts.kandidaten(toets_rijen(EU_ORGANIC_FARMING={"A": gtins("A", 12)}), {})) == 12
    assert len(ts.kandidaten(toets_rijen(EU_ORGANIC_FARMING={"A": gtins("A", 12)}), {}, max_per=5)) == 5


def test_cap02_binnen_een_leverancier_op_sha256_van_seed_plus_gtin(ts):
    alle = gtins("A", 50)
    for seed in ("20261031", "anders"):
        verwacht = set(sorted(alle, key=lambda g: hashlib.sha256((seed + g).encode()).hexdigest())[:40])
        uit = ts.kandidaten(toets_rijen(GREEN_DOT={"A": alle}), {}, seed=seed)
        assert {i["gtin"] for i in uit} == verwacht


def test_cap02_nutriscore_samen_40_gelijk_verdeeld_13_13_14(ts):
    rijen = toets_rijen(NUTRISCORE_A={"A": gtins("A", 30)}, NUTRISCORE_B={"B": gtins("B", 30)}, NUTRISCORE_C={"C": gtins("C", 30)})
    uit = ts.kandidaten(rijen, {})
    per_gln = collections.Counter(i["gln"] for i in uit)
    assert len(uit) == 40 and sorted(per_gln.values()) == [13, 13, 14]


def test_cap02_gelijkende_keurmerken_tot_10_per_keurmerk(ts):
    gelijkend = {GD: {GLN["A"]: gtins("A", 20, prefix="8")}}
    uit = ts.kandidaten(toets_rijen(GREEN_DOT={"B": gtins("B", 5)}), gelijkend)
    assert sum(i["gtin"].startswith("8") for i in uit) == 10
    assert sum(i["gtin"].startswith("2") for i in uit) == 5
    assert sum(i["gtin"].startswith("8") for i in ts.kandidaten(toets_rijen(), gelijkend, max_gelijkend=3)) == 3


def test_cap02_elke_gtin_komt_een_keer_voor_en_vaste_volgorde(ts):
    gedeeld = gtins("A", 6)
    rijen = toets_rijen(EU_ORGANIC_FARMING={"A": gedeeld}, GREEN_DOT={"A": gedeeld}, WEIDEMELK={"B": gtins("B", 3)})
    uit = ts.kandidaten(rijen, {EU: {GLN["A"]: set(list(gedeeld)[:2])}})
    assert max(collections.Counter(i["gtin"] for i in uit).values()) == 1
    assert {i["gtin"] for i in uit} == gedeeld | gtins("B", 3)
    assert ts.kandidaten(rijen, {EU: {GLN["A"]: set(list(gedeeld)[:2])}}) == uit


def test_cap02_ontdubbelen_op_gtin_en_beeld(ts):
    items = [
        {"gtin": "g1", "sha256": "aa", "dhash": 0},
        {"gtin": "g2", "sha256": "aa", "dhash": 2**64 - 1},       # zelfde bytes als g1
        {"gtin": "g3", "sha256": "bb", "dhash": 0b111111},        # dHash-afstand 6 tot g1
        {"gtin": "g4", "sha256": "cc", "dhash": 0x00000000FFFFFFFF},
        {"gtin": "g4", "sha256": "dd", "dhash": 0x00000000FFFFFFFF},  # zelfde GTIN
        {"gtin": "g5", "sha256": "ee", "dhash": 0b1111111 << 40},  # afstand 7 tot g1: blijft
    ]
    uit = ts.ontdubbel(items)
    assert len(uit) == 3 and len(set(uit) & {"g1", "g2", "g3"}) == 1
    assert {"g4", "g5"} <= set(uit) and uit.count("g4") == 1


ANTWOORD = {
    "keurmerken": [{"code": GD, "aanwezig": True, "tegels": [0, 2]}, {"code": WM, "aanwezig": False, "tegels": []}],
    "nutriscore": ["C", "A", "C"],
    "gelijkend": ["TRIMAN"],
}


def test_cap02_schema_vraagt_de_zeven_codes_nutriscore_en_gelijkend(ts):
    s = ts.SCHEMA_VOORINVULLING
    assert s["type"] == "object" and {"keurmerken", "nutriscore", "gelijkend"} <= set(s["required"])
    tekst = json.dumps(s)
    assert all(code in tekst for code in K7)


def test_cap02_voorinvulling_heel_etiket_dan_tegels_als_losse_beelden(ts):
    client, beeld, tegels = NepClient(ANTWOORD), png(), [png((200, 0, 0)), png((0, 200, 0)), png((0, 0, 200))]
    ts.voorinvulling(client, beeld, tegels)
    assert len(client.calls) == 1
    assert client.calls[0]["beelden"] == [beeld, *tegels]
    assert client.calls[0]["schema"] is ts.SCHEMA_VOORINVULLING


def test_cap02_voorinvulling_uitvoer_per_etiket(ts):
    uit = ts.voorinvulling(NepClient(ANTWOORD, kosten=0.061), png(), [png(), png(), png()])
    assert uit["keurmerken"] == {GD: True, WM: False}  # alleen teruggegeven codes (review 01-11): de rest zonder voorinvulling
    assert uit["nutriscore"] == ["A", "C"]
    assert uit["hinttegels"][GD] == [0, 2] and uit["hinttegels"].get(WM, []) == []
    assert uit["gelijkend"] == ["TRIMAN"]
    assert uit["model"] == "anthropic/claude-sonnet-5.5" and uit["kosten"] == pytest.approx(0.061)


def test_cap02_mislukte_voorinvulling_laat_de_velden_leeg(ts):
    orq = importlib.import_module("openrouter")
    uit = ts.voorinvulling(NepClient(fout=orq.EtiketFout("antwoord_ongeldig")), png(), [png()])
    assert (uit["keurmerken"], uit["nutriscore"], uit["hinttegels"]) == ({}, [], {})


def test_cap02_zdr_weigering_wordt_niet_ingeslikt(ts):
    orq = importlib.import_module("openrouter")
    with pytest.raises(orq.RunStop):
        ts.voorinvulling(NepClient(fout=orq.RunStop("geen_zdr")), png(), [png()])


def test_cap02_voorinvulling_via_de_gedeelde_client_met_zdr(ts):
    orq = importlib.import_module("openrouter")
    calls = []

    def voorbeeld(s):  # geldig minimaal antwoord op het schema dat de client voor de zdr-proef kiest
        if "enum" in s:
            return s["enum"][0]
        return {k: voorbeeld(v) for k, v in s.get("properties", {}).items()} if s.get("type", "object") == "object" else \
            {"array": [], "string": "x", "boolean": True, "integer": 0, "number": 0}.get(s["type"])

    def transport(url, body, headers, timeout):
        calls.append(body)
        proef = voorbeeld(body.get("response_format", {}).get("json_schema", {}).get("schema", {"type": "object"}))
        inhoud = ANTWOORD if len(calls) > 1 else proef
        return 200, {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(inhoud)}}], "usage": {"cost": 0.05}}

    client = orq.Client("anthropic/claude-sonnet-5.5", "voorinvulling", sleutel="NEP", transport=transport, slaap=lambda s: None)
    client.zdr_proef(png((0, 128, 0)))
    uit = ts.voorinvulling(client, png(), [png(), png()])
    assert uit["keurmerken"][GD] is True and uit["kosten"] == pytest.approx(0.05)
    assert calls[-1]["provider"] == {"zdr": True, "data_collection": "deny"}
    assert sum(d["type"] == "image_url" for d in calls[-1]["messages"][0]["content"]) == 3
    assert calls[-1]["model"] != orq.K4AA_MODEL


def vi(keurmerken, nutriscore):
    return {"keurmerken": keurmerken, "nutriscore": nutriscore, "hinttegels": {}, "gelijkend": [], "model": "m", "kosten": 0.0}


def test_cap02_rapport_telt_per_keurmerk_nutriscore_als_groep(ts):
    alle_nee = {c: False for c in K7}
    r = ts.rapport({
        "d1": vi({**alle_nee, GD: True}, ["A"]),
        "d2": vi({**alle_nee, GD: True}, ["D"]),  # ronde 5: D telt mee voor de groep A–E
        "d3": vi({}, []),                         # mislukte voorinvulling
        "d4": vi({**alle_nee, EU: True}, ["B", "C"]),
    })
    assert set(r) == set(K7) | {"EUROPEAN_V_LABEL_VEGAN", "NUTRISCORE"}  # ronde 5: 9 keurmerken
    assert (r[GD], r[EU], r["NUTRISCORE"], r[WM]) == (2, 1, 3, 0)


def test_cap02_stoppunt2_meldt_keurmerken_onder_16(ts):
    rapport = {**{c: 20 for c in K7}, "NUTRISCORE": 16, GD: 16, EU: 15}
    assert sorted(ts.stoppunt2(rapport)) == [EU]
    assert sorted(ts.stoppunt2(rapport, minimum=21)) == sorted(set(K7) | {"NUTRISCORE"})
