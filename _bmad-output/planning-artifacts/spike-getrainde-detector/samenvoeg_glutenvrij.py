"""Samenvoeging glutenvrij in `toets/uitslag.json` (CAP-20, toetsset §6b; besluiten Friso 12-11-2026, "35, rest volgt
de AI" en "Ja, AI telt mee"). Alleen standaardbibliotheek plus `uitslag` en `train`.

  uv run python samenvoeg_glutenvrij.py --uitslag $PM/toets/uitslag.json --export <download van de artefactpagina> \
      --voorinvulling $PM/toets/voorinvulling-r10-claude-haiku-5-5.json [--droog]

Per uitslagrecord verandert alleen `keurmerken[DIET_FREE_FROM_GLUTEN]`, `bevestigde_codes` en `herkomst_codes`.
Elke weigering is een ValueError vóór enig schrijven. De lokale invulserver staat uit tijdens de samenvoeging."""
import argparse
import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

import uitslag as uitslag_mod
from train import MIN_GLUTEN_MET, MIN_ZONDER

GV = "DIET_FREE_FROM_GLUTEN"
AI = {"bron": "ai-r10"}
STATUSSEN = uitslag_mod.STATUSSEN + ("open",)
CATEGORIEEN = ("mens_toegepast", "mens_ouder", "ai_toegepast", "ai_aanwezig_zonder_mens", "al_gelijk",
               "niet_bevestigd", "export_ingetrokken")
FORMATEN = ({"indent": 1, "ensure_ascii": False}, {"indent": 1, "ensure_ascii": True})  # de echte uitslag: indent 1, geen slotregel


def _lees_object(pad, naam, inhoud=None):
    try:
        data = json.loads(Path(pad).read_bytes() if inhoud is None else inhoud)
    except (OSError, ValueError) as e:
        raise ValueError(f"{naam} {pad} is onleesbaar: {e}") from e
    if not isinstance(data, dict):
        raise ValueError(f"{naam} {pad} is geen object")
    return data


def _herlees(pad):
    """De bytes van de uitslag vlak vóór het vervangen (los, zodat de test een tussentijdse wijziging kan nabootsen)."""
    return Path(pad).read_bytes()


def _tijd(s, wat):
    """ISO-8601 met tijdzone (`Z` of offset); anders ValueError."""
    try:
        t = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (AttributeError, ValueError) as e:
        raise ValueError(f"{wat}: onleesbare tijd {s!r}") from e
    if t.tzinfo is None:
        raise ValueError(f"{wat}: tijd {s!r} zonder tijdzone")
    return t


def _status(r, wat, zonder_mag=False):
    """Export: status verplicht. Uitslag: geen status (eerste tussenstand van de lokale server) mag; telt als niet bevestigd."""
    if not isinstance(r, dict) or (r.get("status") not in STATUSSEN and not (zonder_mag and "status" not in r)):
        raise ValueError(f"{wat}: onbekende status of geen object")


def _gate(u):
    """Gate C met de telling van `uitslag.per_keurmerk` (= `train.poort_glutenvrij`); zonder gesplitst in mens en AI."""
    pk = uitslag_mod.per_keurmerk(u)[GV]
    ai = sum(1 for d in pk["zonder"] if u[d].get("herkomst_codes", {}).get(GV) == AI)
    met, zonder = len(pk["met"]), len(pk["zonder"])
    return {"met": met, "zonder_mens": zonder - ai, "zonder_ai": ai, "open": met >= MIN_GLUTEN_MET and zonder >= MIN_ZONDER}


def _zet(r, keuze, markering):
    """Nieuw record: alleen glutenvrij in keurmerken, bevestigde_codes en herkomst_codes; nieuwe sleutels achteraan."""
    n = dict(r)
    n["keurmerken"] = {**r.get("keurmerken", {}), GV: keuze}
    n["bevestigde_codes"] = sorted(uitslag_mod.bevestigde_codes(r) | {GV})
    n["herkomst_codes"] = {**r.get("herkomst_codes", {}), GV: markering}
    return n


def _gemarkeerd(u):
    return sum(1 for r in u.values() if r.get("herkomst_codes", {}).get(GV) == AI)


def samenvoeg(uitslag, export, voorinvulling, droog=False):
    """Voegt de glutenvrij-oordelen samen volgens toetsset §6b; geeft het rapport terug."""
    uitslag = Path(uitslag).resolve()  # een symbolische koppeling blijft staan; het doel wordt bijgewerkt
    try:
        origineel = uitslag.read_bytes()
    except OSError as e:
        raise ValueError(f"uitslag {uitslag} is onleesbaar: {e}") from e
    try:
        u, fmt, rapport, na = _analyse(uitslag, origineel, export, voorinvulling)
    except (TypeError, AttributeError, KeyError) as e:  # vreemde geneste typen: weigeren, niet crashen
        raise ValueError(f"onverwachte vorm in de invoer ({type(e).__name__}: {e})") from e
    if droog or na is u:
        return rapport

    if _herlees(uitslag) != origineel:
        raise ValueError(f"uitslag {uitslag} is veranderd sinds het lezen; geweigerd")
    kopie = uitslag.with_name(f"{uitslag.name}.voor-glutenvrij-{datetime.now():%Y%m%dT%H%M%S}.json")
    try:
        with open(kopie, "xb") as f:
            f.write(origineel)
    except FileExistsError as fout:
        raise ValueError(f"reservekopie {kopie} bestaat al; geweigerd") from fout
    fd, tmp = tempfile.mkstemp(dir=uitslag.parent, prefix=".uitslag-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(json.dumps(na, **fmt))
        os.chmod(tmp, uitslag.stat().st_mode & 0o777)
        if _herlees(uitslag) != origineel:  # vlak vóór het vervangen (toetsset §6b)
            raise ValueError(f"uitslag {uitslag} is veranderd vlak vóór het vervangen; geweigerd")
        os.replace(tmp, uitslag)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    geschreven = json.loads(uitslag.read_bytes())  # tellingen uit het bestand zelf, niet uit het geheugen
    rapport["gate_c"]["na"] = _gate(geschreven)
    rapport.update(geschreven=True, reservekopie=str(kopie), ai_gemarkeerd=_gemarkeerd(geschreven))
    return rapport


def _analyse(uitslag, origineel, export, voorinvulling):
    """Leest en beoordeelt alles; geeft (uitslag, schrijfinstellingen, rapport, nieuwe uitslag) en schrijft niets.
    Zonder wijziging is de nieuwe uitslag hetzelfde object als de oude."""
    u = _lees_object(uitslag, "uitslag", origineel)
    tekst = origineel.decode("utf-8")
    fmt = next((f for f in FORMATEN if json.dumps(u, **f) == tekst), None)
    if fmt is None:
        raise ValueError("uitslag: terugschrijven zonder wijziging is niet byte-gelijk (ander formaat); geweigerd")
    e = _lees_object(export, "export")
    besl = e.get("beoordelingen")
    if not isinstance(besl, dict):
        raise ValueError("export zonder beoordelingen-object")
    if e.get("aantal") != len(besl):
        raise ValueError(f"export: aantal {e.get('aantal')!r} ongelijk aan {len(besl)} beoordelingen")
    voor = _lees_object(voorinvulling, "voorinvulling")
    for naam, ids in (("export", besl), ("voorinvulling", voor)):
        vreemd = set(ids) - set(u)
        if vreemd:
            raise ValueError(f"{naam}: {len(vreemd)} etiket(ten) die niet in de uitslag staan")
    ai = {}
    for i, r in u.items():
        _status(r, f"uitslag {i}", zonder_mag=True)
        v = ((voor.get(i) or {}).get("keurmerken") or {}).get(GV) if isinstance(voor.get(i), dict) else None
        if not isinstance(v, bool):
            raise ValueError(f"voorinvulling {i}: geen booleaans glutenvrij-oordeel")
        ai[i] = v
    mens = {}
    for i, r in besl.items():
        _status(r, f"export {i}")
        if GV in uitslag_mod.bevestigde_codes(r):
            keuze = (r.get("keurmerken") or {}).get(GV)
            if keuze not in uitslag_mod.KEUZES:
                raise ValueError(f"export {i}: glutenvrij bevestigd zonder geldige keuze")
            mens[i] = (keuze, {"bron": "artefact", "bijgewerkt": r.get("bijgewerkt")}, _tijd(r.get("bijgewerkt"), f"export {i}"))

    per_id = {}
    nieuw = {}
    for i, r in u.items():
        heeft = GV in uitslag_mod.bevestigde_codes(r)
        if r.get("status") != "bevestigd":
            cat = "niet_bevestigd"
        elif i in mens:
            keuze, markering, t = mens[i]
            oud = r.get("herkomst_codes", {}).get(GV)
            if not heeft:
                cat = "mens_toegepast"
            elif r["keurmerken"].get(GV) == keuze and oud == markering:
                cat = "al_gelijk"
            elif oud == AI:
                cat = "mens_toegepast"  # mens gaat voor
            elif oud is None:  # oordeel van de lokale pagina
                cat = "mens_toegepast" if t > _tijd(r.get("tijd"), f"uitslag {i}") else "mens_ouder"
            elif isinstance(oud, dict) and oud.get("bron") == "artefact":
                cat = "mens_toegepast" if t > _tijd(oud.get("bijgewerkt"), f"uitslag {i} herkomst") else "mens_ouder"
            else:
                cat = "mens_ouder"  # onbekende markering: laten staan en melden
            if cat == "mens_toegepast":
                nieuw[i] = _zet(r, keuze, markering)
        elif heeft and besl.get(i, {}).get("status") in ("open", "onleesbaar"):
            cat = "export_ingetrokken"
        elif heeft:
            cat = "al_gelijk"
        elif ai[i] is False:
            cat = "ai_toegepast"
            nieuw[i] = _zet(r, "afwezig", dict(AI))
        else:
            cat = "ai_aanwezig_zonder_mens"
        per_id[i] = cat

    tel = {c: sum(1 for x in per_id.values() if x == c) for c in CATEGORIEEN}
    onwaar = [i for i in u if ai[i] is False]  # onafhankelijk van de regels: alleen de voorinvulling
    per_cat_onwaar = {c: n for c in CATEGORIEEN if (n := sum(1 for i in onwaar if per_id[i] == c))}
    verwacht_ai = sum(1 for i, r in u.items() if ai[i] is False and r.get("status") == "bevestigd" and i not in mens
                      and GV not in uitslag_mod.bevestigde_codes(r))
    na = {i: nieuw.get(i, r) for i, r in u.items()} if nieuw else u
    rapport = {"categorieen": tel, "verwacht_ai": verwacht_ai, "ai_onwaar": len(onwaar),
               "ai_onwaar_per_categorie": per_cat_onwaar, "ai_gemarkeerd": _gemarkeerd(na),
               "gate_c": {"voor": _gate(u), "na": _gate(na)}, "geschreven": False, "reservekopie": None}
    return u, fmt, rapport, na


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--uitslag", required=True, type=Path)
    p.add_argument("--export", required=True, type=Path)
    p.add_argument("--voorinvulling", required=True, type=Path)
    p.add_argument("--droog", action="store_true", help="tellen en melden, niets schrijven")
    a = p.parse_args(argv)
    try:
        r = samenvoeg(a.uitslag.expanduser(), a.export.expanduser(), a.voorinvulling.expanduser(), a.droog)
    except ValueError as e:
        print(f"geweigerd: {e}", file=sys.stderr)
        return 1
    if a.droog:
        print("droogloop: er is niets geschreven")
    for naam, n in r["categorieen"].items():
        print(f"{naam} {n}")
    print(f"totaal {sum(r['categorieen'].values())}")
    print(f"verwacht_ai {r['verwacht_ai']} (toegepast {r['categorieen']['ai_toegepast']})")
    split = ", ".join(f"{c} {n}" for c, n in r["ai_onwaar_per_categorie"].items())
    print(f"ai_onwaar {r['ai_onwaar']} ({split})")
    print(f"ai_gemarkeerd {r['ai_gemarkeerd']}")
    for wanneer, label in (("voor", "vóór"), ("na", "na")):
        g = r["gate_c"][wanneer]
        print(f"gate C {label}: met {g['met']}/{MIN_GLUTEN_MET}, zonder {g['zonder_mens'] + g['zonder_ai']}/{MIN_ZONDER} "
              f"(mens {g['zonder_mens']}, AI {g['zonder_ai']}), {'open' if g['open'] else 'dicht'}")
    if not a.droog:
        print(f"geschreven: {'ja' if r['geschreven'] else 'nee'}; reservekopie: {r['reservekopie'] or '-'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
