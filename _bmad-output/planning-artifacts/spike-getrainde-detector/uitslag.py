"""Gedeelde lezer van `toets/uitslag.json` (toetsset §6, meetregels §3 en §5). Invulpagina, voortgangsteller en
telcode gebruiken alleen deze functies, zodat ze nooit verschillend tellen. Alleen standaardbibliotheek."""

KEURMERKEN_LOS = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING",
                  "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO", "EUROPEAN_V_LABEL_VEGAN")
KEURMERKEN = KEURMERKEN_LOS + ("NUTRISCORE",)  # de 9 (meetregels §2; V-label en NS A–E: besluit Friso 01-11-2026)
LETTERS = ("A", "B", "C", "D", "E")
KEUZES = ("aanwezig", "afwezig", "onzeker")
STATUSSEN = ("bevestigd", "onleesbaar")


def valideer(invoer, bekend):
    """Controleert één opslag {"id", "waarde"} tegen het schema; geeft de waarde terug of gooit ValueError."""
    if not isinstance(invoer, dict) or invoer.get("id") not in bekend:
        raise ValueError("onbekend etiket")
    w = invoer.get("waarde")
    if not isinstance(w, dict):
        raise ValueError("waarde ontbreekt")
    onbekend = set(w) - {"status", "keurmerken", "nutriscore", "veranderd", "opmerking", "tijd"}
    if onbekend:
        raise ValueError(f"onbekende velden {sorted(onbekend)}")
    if "status" in w and w["status"] not in STATUSSEN:
        raise ValueError("onbekende status")
    k = w.get("keurmerken", {})
    if not isinstance(k, dict) or set(k) - set(KEURMERKEN_LOS) or any(v not in KEUZES for v in k.values()):
        raise ValueError("ongeldige keurmerken")
    if "nutriscore" in w:
        ns = w["nutriscore"]
        if ns != "onleesbaar" and (not isinstance(ns, list) or any(x not in LETTERS for x in ns)):
            raise ValueError("ongeldige nutriscore")
    if not isinstance(w.get("veranderd", []), list) or set(w.get("veranderd", [])) - set(KEURMERKEN):
        raise ValueError("ongeldig veld veranderd")
    for veld in ("opmerking", "tijd"):
        if not isinstance(w.get(veld, ""), str):
            raise ValueError(f"ongeldig veld {veld}")
    if w.get("status") == "bevestigd" and (set(k) != set(KEURMERKEN_LOS) or "nutriscore" not in w):
        raise ValueError("bevestigd vraagt een keuze voor alle 9 keurmerken")
    return w


def per_keurmerk(uitslag):
    """{keurmerk: {"met": set(doc), "zonder": set(doc)}} over bevestigde etiketten; ook NUTRISCORE_A t/m _E per letter.
    Onzeker telt voor dat keurmerk niet; "onleesbaar" (etiket of letter) telt nergens. Nutri-Score: mét = minstens één
    letter A–E, zonder = lege lijst; per letter: mét = letter in de lijst, zonder = een lijst zonder die letter."""
    uit = {k: {"met": set(), "zonder": set()} for k in KEURMERKEN + tuple(f"NUTRISCORE_{x}" for x in LETTERS)}
    for doc, r in uitslag.items():
        if r.get("status") != "bevestigd":
            continue
        for code, keuze in r.get("keurmerken", {}).items():
            if keuze in ("aanwezig", "afwezig") and code in KEURMERKEN_LOS:
                uit[code]["met" if keuze == "aanwezig" else "zonder"].add(doc)
        ns = r.get("nutriscore")
        if not isinstance(ns, list):
            continue
        uit["NUTRISCORE"]["met" if ns else "zonder"].add(doc)
        for x in LETTERS:
            uit[f"NUTRISCORE_{x}"]["met" if x in ns else "zonder"].add(doc)
    return uit


def stand(uitslag):
    """Aantallen per keurmerk (9) tegen het doel; dezelfde telling als `per_keurmerk`."""
    pk = per_keurmerk(uitslag)
    return {k: {"met": len(pk[k]["met"]), "zonder": len(pk[k]["zonder"])} for k in KEURMERKEN}
