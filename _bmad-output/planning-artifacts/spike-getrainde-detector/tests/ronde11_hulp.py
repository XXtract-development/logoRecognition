"""Gedeelde hulp voor de tests van ronde 11 (CAP-19): verzonnen etiketcodes, voorinvulling en sjabloonvulling."""
import json

from conftest import HIER

SJABLOON = HIER / "invul" / "artefact" / "sjabloon.html"
R5 = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING",
      "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO", "EUROPEAN_V_LABEL_VEGAN")
R9 = ("FOREST_STEWARDSHIP_COUNCIL_LABEL", "TRIMAN", "SOCIETY_PLASTICS_INDUSTRY", "ON_THE_WAY_TO_PLANETPROOF")
LOS12 = R5 + R9
GV = "DIET_FREE_FROM_GLUTEN"
PNG = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def eid(n):
    """Verzonnen etiketcode in de vorm GLN-GTIN-528."""
    return f"9999999000000-{9999990000000 + n:014d}-528"


def vi(aanwezig=(), nutriscore=("C",), glutenvrij=None):
    k = {c: c in aanwezig for c in LOS12}
    if glutenvrij is not None:
        k[GV] = glutenvrij
    return {"keurmerken": k, "nutriscore": list(nutriscore)}


def item(i, voor):
    return {"id": i, "beeld": PNG, "hint": [], "voorinvulling": voor, "ww": 800, "wh": 600}


def keuzes12(**anders):
    k = {c: "afwezig" for c in LOS12}
    k.update(anders)
    return k


def bevestigd(keurmerken, nutriscore=("C",), veranderd=(), opmerking=""):
    return {"status": "bevestigd", "keurmerken": dict(keurmerken), "veranderd": list(veranderd),
            "opmerking": opmerking, "bijgewerkt": "2026-11-11T10:00:00.000Z", "nutriscore": list(nutriscore),
            "bevestigde_codes": sorted(keurmerken)}


def vul(items):
    """Het sjabloon met deze ITEMS (zelfde vervanging als het bouwscript)."""
    tekst = SJABLOON.read_text(encoding="utf-8")
    assert tekst.count("const ITEMS = [];\n") == 1
    return tekst.replace("const ITEMS = [];\n", "const ITEMS = " + json.dumps(items).replace("</", "<\\/") + ";\n")
