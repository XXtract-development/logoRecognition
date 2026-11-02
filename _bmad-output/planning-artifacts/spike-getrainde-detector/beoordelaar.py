"""Taalmodel-beoordelaar voor twijfelgevallen (CAP-8; trainingsset-en-herkenning §7). Stdlib + Pillow.

Twee losse beelden (uitsnede, verplicht referentieplaatje), antwoord via JSON-schema ja/nee/twijfel. Alleen "ja" wordt een
melding (dat beslist `herken.beslis`); een antwoord buiten het schema is een fout, nooit "nee"."""
import openrouter

SCHEMA = {
    "type": "object",
    "properties": {"oordeel": {"type": "string", "enum": ["ja", "nee", "twijfel"]}},
    "required": ["oordeel"],
    "additionalProperties": False,
}
MIN_ZIJDE = 256
MARGE = 0.25  # per kant, dus 50% in totaal


def uitsnede(beeld, box):
    """Vakje + 50% marge, elke zijde minstens 256 px, geschoven zodat hij binnen het beeld blijft."""
    x0, y0, x1, y1 = box
    w, h = beeld.size

    def as_(a, b, grens):
        lengte = min(grens, max(MIN_ZIJDE, round((b - a) * (1 + 2 * MARGE))))
        start = min(max(0, round((a + b) / 2 - lengte / 2)), grens - lengte)
        return start, start + lengte

    (l, r), (t, o) = as_(x0, x1, w), as_(y0, y1, h)
    return beeld.crop((l, t, r, o))


def vraag_voor(code):
    if code.startswith("NUTRISCORE_"):
        return ("Image 1 is a crop from a product label; image 2 is the reference Nutri-Score scale with letter "
                f"{code[-1]} highlighted. Does image 1 show a Nutri-Score scale with the same letter highlighted? "
                "Answer ja (yes), nee (no) or twijfel (unsure).")
    if code == "EUROPEAN_V_LABEL_VEGAN":  # vegan en vegetarisch zijn hetzelfde V-label (meetregels §2)
        return ("Image 1 is a crop from a product label; image 2 is the reference European V-Label. Does image 1 show the "
                "European V-Label (not a similar-looking mark)? The vegan and the vegetarian V-Label count as the same mark, "
                "whatever word is under the V. Answer ja (yes), nee (no) or twijfel (unsure).")
    return ("Image 1 is a crop from a product label; image 2 is the reference logo of a quality mark. Does image 1 "
            "show the same quality mark (not a similar-looking one)? Answer ja (yes), nee (no) or twijfel (unsure).")


def beoordeel(client, uitsnede_png, referentie_png, code):
    antwoord, _ = client.vraag(vraag_voor(code), [uitsnede_png, referentie_png], SCHEMA, verwacht=0.002)
    oordeel = antwoord.get("oordeel") if isinstance(antwoord, dict) else None
    if oordeel not in ("ja", "nee", "twijfel"):
        raise openrouter.EtiketFout("antwoord_ongeldig")
    return oordeel
