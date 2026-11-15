"""Samenvoeging van de nieuwe etiketten van ronde 12 in `toets/uitslag.json` (CAP-22, toetsset §6c; besluit Friso
15-11-2026, "Ja, nu klaarzetten"). Alleen standaardbibliotheek plus `uitslag` en `samenvoeg_glutenvrij`.

  uv run python samenvoeg_r12.py --uitslag $PM/toets/uitslag.json --export <download van de artefactpagina> \
      --items $PM/toets/items-r12-claude-haiku-5-5.json [--droog]

Alleen etiketten uit de itemslijst worden opgenomen, als nieuwe records achteraan; elk ander record blijft byte-gelijk.
Elke weigering is een ValueError vóór enig schrijven. De lokale invulserver staat uit tijdens de samenvoeging."""
import argparse
import json
import sys
import time
from pathlib import Path

import samenvoeg_glutenvrij as sg
import uitslag as uitslag_mod

BRON = "artefact-r12"
CODES13 = sorted(uitslag_mod.KEURMERKEN_LOS + uitslag_mod.NIEUW_R10)
EXPORTVELDEN = {"status", "keurmerken", "veranderd", "opmerking", "bijgewerkt", "nutriscore", "bevestigde_codes"}
SLEUTELS = ("status", "keurmerken", "veranderd", "opmerking", "tijd", "bevestigde_codes", "nutriscore", "herkomst_etiket")
CATEGORIEEN = ("toegevoegd_bevestigd", "toegevoegd_onleesbaar", "vervangen", "al_gelijk", "ouder", "ingetrokken",
               "export_open", "anders_gewijzigd", "ontbreekt", "al_samengevoegd_ontbreekt")
MELDEN = ("vervangen", "ouder", "ingetrokken", "export_open", "anders_gewijzigd", "ontbreekt",
          "al_samengevoegd_ontbreekt")  # categorieën waarvan het rapport de id's noemt


def _items(pad):
    try:
        data = json.loads(Path(pad).read_bytes())
    except (OSError, ValueError) as e:
        raise ValueError(f"itemslijst {pad} is onleesbaar: {e}") from e
    if not isinstance(data, list) or not all(isinstance(x, dict) and isinstance(x.get("id"), str) for x in data):
        raise ValueError(f"itemslijst {pad} is geen lijst van objecten met een id")
    ids = [x["id"] for x in data]
    dubbel = sorted({i for i in ids if ids.count(i) > 1})
    if dubbel:
        raise ValueError(f"itemslijst: dubbele id's {dubbel}")
    return ids


def _gemarkeerd(r):
    h = r.get("herkomst_etiket")
    return isinstance(h, dict) and h.get("bron") == BRON


def _record(r):
    """Het uitslagrecord dat dit script voor exportrecord `r` (bevestigd of onleesbaar) schrijft (vaste volgorde)."""
    n = {"status": r["status"]}
    n.update((k, r[k]) for k in ("keurmerken", "veranderd", "opmerking") if k in r)
    n["tijd"] = r["bijgewerkt"]
    if r["status"] == "bevestigd":
        n["bevestigde_codes"] = list(CODES13)
    if "nutriscore" in r:
        n["nutriscore"] = r["nutriscore"]
    n["herkomst_etiket"] = {"bron": BRON, "bijgewerkt": r["bijgewerkt"]}
    return n


def _frag(i, r, fmt):
    """De tekst van één record zoals hij in de volledige uitslag staat."""
    return json.dumps({i: r}, **fmt)[2:-2]


def _analyse(uitslag, origineel, export, items):
    u = sg._lees_object(uitslag, "uitslag", origineel)
    tekst = origineel.decode("utf-8")
    fmt = next((f for f in sg.FORMATEN if json.dumps(u, **f) == tekst), None)
    if fmt is None:
        raise ValueError("uitslag: terugschrijven zonder wijziging is niet byte-gelijk (ander formaat); geweigerd")
    e = sg._lees_object(export, "export")
    besl = e.get("beoordelingen")
    if not isinstance(besl, dict):
        raise ValueError("export zonder beoordelingen-object")
    if e.get("aantal") != len(besl):
        raise ValueError(f"export: aantal {e.get('aantal')!r} ongelijk aan {len(besl)} beoordelingen")
    ids = _items(items)
    r12 = set(ids)

    fouten = []
    for i, r in u.items():
        try:
            sg._status(r, f"uitslag {i}", zonder_mag=True)
        except ValueError as x:
            fouten.append(str(x))
    zonder = [i for i in ids if i in u and not _gemarkeerd(u[i])]
    if zonder:
        fouten.append(f"items-id's in de uitslag zonder markering herkomst_etiket {BRON} (record van de lokale pagina "
                      f"of verkeerde itemslijst): {zonder}")
    if not r12 & set(besl):
        fouten.append("export zonder enig items-id (download van vóór versie 14 of verkeerde itemslijst)")
    vreemd = sorted(set(besl) - set(u) - r12)
    if vreemd:
        fouten.append(f"export-id's die niet in de uitslag of de itemslijst staan: {vreemd}")
    tijden = {}
    for i, r in besl.items():
        wat = f"export {i}"
        if i not in r12:
            try:
                sg._status(r, wat)
            except ValueError as x:
                fouten.append(str(x))
            continue
        if not isinstance(r, dict):
            fouten.append(f"{wat}: geen object")
            continue
        if set(r) - EXPORTVELDEN:
            fouten.append(f"{wat}: onbekende velden {sorted(set(r) - EXPORTVELDEN)}")
            continue
        if r.get("status") not in sg.STATUSSEN:
            fouten.append(f"{wat}: onbekende status {r.get('status')!r}")
            continue
        try:
            tijden[i] = sg._tijd(r.get("bijgewerkt"), wat)
            if r["status"] != "open":
                kopie = {k: v for k, v in r.items() if k not in ("bijgewerkt", "bevestigde_codes")}
                uitslag_mod.valideer({"id": i, "waarde": kopie}, r12, CODES13)
            if r["status"] == "bevestigd" and r.get("bevestigde_codes") != CODES13:
                raise ValueError("bevestigde_codes niet gelijk aan de 13 codes")
        except ValueError as x:
            fouten.append(f"{wat}: {x}" if not str(x).startswith(wat) else str(x))
    for i in ids:  # opgeslagen tijd van een eerder samengevoegd etiket
        if i in u and _gemarkeerd(u[i]) and i in besl:
            try:
                sg._tijd(u[i]["herkomst_etiket"].get("bijgewerkt"), f"uitslag {i} herkomst_etiket")
            except ValueError as x:
                fouten.append(str(x))
    if fouten:
        raise ValueError(f"{len(fouten)} fout(en), niets geschreven:\n  " + "\n  ".join(fouten))

    per_id, nieuw = {}, {}
    for i in ids:
        r, oud = besl.get(i), u.get(i)
        if r is None:
            cat = "ontbreekt" if oud is None else "al_samengevoegd_ontbreekt"
        elif oud is None:
            cat = "export_open" if r["status"] == "open" else f"toegevoegd_{r['status']}"
        elif set(oud) - set(SLEUTELS):
            cat = "anders_gewijzigd"
        elif r["status"] != "open" and _record(r) == oud:
            cat = "al_gelijk"
        elif r["status"] == "open" and oud.get("status") != "bevestigd":
            cat = "export_open"
        elif tijden[i] <= sg._tijd(oud["herkomst_etiket"]["bijgewerkt"], i):
            cat = "ouder"
        elif r["status"] in ("open", "onleesbaar") and oud.get("status") == "bevestigd":
            cat = "ingetrokken"  # een ingetrokken oordeel haalt niets weg (besluit Friso 12-11-2026; AANNAME §6c)
        else:
            cat = "vervangen"
        if cat.startswith("toegevoegd_") or cat == "vervangen":
            nieuw[i] = _record(r)
        per_id[i] = cat

    na = u
    if nieuw:
        na = {i: nieuw.get(i, r) for i, r in u.items()}
        na.update((i, nieuw[i]) for i in ids if i in nieuw and i not in u)
    tel = {c: sum(1 for x in per_id.values() if x == c) for c in CATEGORIEEN}
    rapport = {"categorieen": tel, "ids": {c: [i for i in ids if per_id[i] == c] for c in CATEGORIEEN},
               "per_keurmerk": {"voor": uitslag_mod.stand(u), "na": uitslag_mod.stand(na)},
               "gate_c": {"voor": sg._gate(u), "na": sg._gate(na)}, "geschreven": False, "reservekopie": None}
    return u, fmt, rapport, na


def _controleer_bytes(u, na, tekst, origineel, fmt):
    """Byte-garantie (toetsset §6c): elk record buiten de toegevoegde of vervangen staat letterlijk en op zijn plek."""
    if list(na)[:len(u)] != list(u):
        raise ValueError("byte-garantie: de id-volgorde van de bestaande records verandert; geweigerd")
    for i, r in u.items():
        if na[i] is r and _frag(i, r, fmt) not in tekst:
            raise ValueError(f"byte-garantie: record {i} is niet byte-gelijk; geweigerd")
    if all(na[i] is u[i] for i in u) and u and not tekst.startswith(origineel[:-2] + ",\n"):
        raise ValueError("byte-garantie: het origineel is niet het begin van de nieuwe tekst; geweigerd")


def samenvoeg(uitslag, export, items, droog=False):
    """Voegt de ronde-12-etiketten samen volgens toetsset §6c; geeft het rapport terug."""
    uitslag = Path(uitslag).resolve()  # een symbolische koppeling blijft staan; het doel wordt bijgewerkt
    try:
        origineel = uitslag.read_bytes()
    except OSError as e:
        raise ValueError(f"uitslag {uitslag} is onleesbaar: {e}") from e
    try:
        u, fmt, rapport, na = _analyse(uitslag, origineel, export, items)
    except (TypeError, AttributeError, KeyError) as e:  # vreemde geneste typen: weigeren, niet crashen
        raise ValueError(f"onverwachte vorm in de invoer ({type(e).__name__}: {e})") from e
    if droog or na is u:
        return rapport

    tekst = json.dumps(na, **fmt)
    _controleer_bytes(u, na, tekst, origineel.decode("utf-8"), fmt)
    try:
        try:  # reservekopie <uitslag>.voor-r12-<JJJJMMDDTHHMMSS>.json
            kopie = sg.schrijf(uitslag, origineel, tekst, "voor-r12")
        except ValueError as e:
            if not isinstance(e.__cause__, FileExistsError):
                raise
            # ponytail: twee runs in dezelfde seconde; één seconde wachten geeft een nieuwe naam, nooit overschrijven
            time.sleep(1)
            kopie = sg.schrijf(uitslag, origineel, tekst, "voor-r12")
    except OSError as e:  # rechten, schijf vol: weigering in plaats van een traceback
        raise ValueError(f"schrijven mislukt: {e}") from e
    geschreven = json.loads(uitslag.read_bytes())  # tellingen uit het bestand zelf, niet uit het geheugen
    rapport["per_keurmerk"]["na"] = uitslag_mod.stand(geschreven)
    rapport["gate_c"]["na"] = sg._gate(geschreven)
    rapport.update(geschreven=True, reservekopie=str(kopie))
    return rapport


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--uitslag", required=True, type=Path)
    p.add_argument("--export", required=True, type=Path)
    p.add_argument("--items", required=True, type=Path)
    p.add_argument("--droog", action="store_true", help="tellen en melden, niets schrijven")
    a = p.parse_args(argv)
    try:
        r = samenvoeg(a.uitslag.expanduser(), a.export.expanduser(), a.items.expanduser(), a.droog)
    except ValueError as e:
        print(f"geweigerd: {e}", file=sys.stderr)
        return 1
    if a.droog:
        print("droogloop: er is niets geschreven")
    for naam, n in r["categorieen"].items():
        print(f"{naam} {n}" + (f": {', '.join(r['ids'][naam])}" if naam in MELDEN and n else ""))
    print(f"totaal {sum(r['categorieen'].values())}")
    voor, na = r["per_keurmerk"]["voor"], r["per_keurmerk"]["na"]
    for k in voor:
        print(f"{k}: mét {voor[k]['met']} -> {na[k]['met']}, zonder {voor[k]['zonder']} -> {na[k]['zonder']}")
    for wanneer, label in (("voor", "vóór"), ("na", "na")):
        g = r["gate_c"][wanneer]
        print(f"gate C {label}: met {g['met']}/{sg.MIN_GLUTEN_MET}, zonder {g['zonder_mens'] + g['zonder_ai']}/"
              f"{sg.MIN_ZONDER} (mens {g['zonder_mens']}, AI {g['zonder_ai']}), {'open' if g['open'] else 'dicht'}")
    if not a.droog:
        print(f"geschreven: {'ja' if r['geschreven'] else 'nee'}; reservekopie: {r['reservekopie'] or '-'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
