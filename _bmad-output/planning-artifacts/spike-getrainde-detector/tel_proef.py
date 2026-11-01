"""Telling, stopregel en vergelijking (CAP-9; meetregels §1-§7). Stdlib; `wilson`, `trekkingen` en `bootstrap` komen uit
fase-b/tel.py (geïmporteerd, niet gekopieerd).

Per etiket op aanwezigheid: gevonden = meldingen op etiketten mét het keurmerk, vals = meldingen op etiketten zonder.
Een fout telt als geen melding en wordt geteld; boven 2% fouten is de run ongeldig; een zdr-weigering stopt de telling.

  python tel_proef.py --uitslag <toets/uitslag.json> --route D+A=<pad> --meta D+A=<pad> --route K4-aa=<pad> --meta K4-aa=<pad>
                      --uit <map> [--correcties <nakijken.json>]
Een route is een run-bestand {"status": "voltooid", "etiketten": {doc_id: [codes] | {"fout": klasse}}}; een run die niet
voltooid is wordt geweigerd (een afgebroken run met reden geen_zdr is de zdr-stop). Schrijft tabellen.json, tabellen.md,
verschil.json en nakijklijst.json (blind). Met --correcties ({doc_id: {keurmerk: "aanwezig"|"afwezig"|"onzeker",
"NUTRISCORE": [letters A-E] | "onleesbaar"}}, voor elke route dezelfde) ook tabellen-na-nakijken.json/.md; de tabellen
van ervóór blijven. Een onbekend etiket, keurmerk of een ongeldige waarde in de correcties: foutmelding, geen tabellen.
Nutri-Score: gevonden als alle gemelde letters in de ware verzameling zitten (en er minstens één is); een gemelde letter
erbuiten maakt het etiket gemist en telt als verkeerde letter (meetregels §3).
"""
import argparse
import copy
import json
import math
import random
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "spike-architectuurkeuze-logoherkenning" / "fase-b"))
from tel import bootstrap, trekkingen, wilson  # noqa: E402

import beelden  # noqa: E402
import uitslag as us  # noqa: E402

NS = {"NUTRISCORE_A": "A", "NUTRISCORE_B": "B", "NUTRISCORE_C": "C"}
MIN_MET, MIN_ZONDER, MAX_FOUT_PCT = 16, 35, 2.0


def besluit(gevonden, met, vals, zonder):
    if met < MIN_MET or zonder < MIN_ZONDER:
        return "te weinig voorbeelden"
    return "automatisch" if wilson(gevonden, met)[0] >= 0.8 and wilson(vals, zonder)[1] < 0.1 else "mens bevestigt"


def _codes(record):
    """Meldingen van één etiket als verzameling; een fout (of geen record) = geen melding."""
    return set() if record is None or isinstance(record, dict) else set(record)


def _letters(codes):
    return {NS[c] for c in codes if c in NS}


def _ns_goed(record, waar):
    """meetregels §3: gevonden als alle gemelde letters in de ware verzameling zitten en er minstens één is."""
    gemeld = _letters(_codes(record))
    return bool(gemeld) and gemeld <= set(waar)


def tel(uitslag, meldingen):
    if any(isinstance(r, dict) and r.get("fout") == "geen_zdr" for r in meldingen.values()):
        raise ValueError("zdr-weigering: de run stopt en telt niet")
    pk = us.per_keurmerk(uitslag)
    r = {}
    for k in us.KEURMERKEN7 + tuple(NS):
        met, zonder = pk[k]["met"], pk[k]["zonder"]
        r[k] = {"met": len(met), "gevonden": sum(k in _codes(meldingen.get(d)) for d in met),
                "zonder": len(zonder), "vals": sum(k in _codes(meldingen.get(d)) for d in zonder)}
    met, zonder = pk["NUTRISCORE"]["met"], pk["NUTRISCORE"]["zonder"]
    gevonden = verkeerd = 0
    for d in met:
        gemeld, waar = _letters(_codes(meldingen.get(d))), set(uitslag[d]["nutriscore"])
        gevonden += _ns_goed(meldingen.get(d), waar)
        verkeerd += bool(gemeld - waar)
    r["NUTRISCORE"] = {"met": len(met), "gevonden": gevonden, "zonder": len(zonder),
                       "vals": sum(bool(_letters(_codes(meldingen.get(d)))) for d in zonder), "verkeerde_letter": verkeerd}
    for k, v in r.items():
        v.setdefault("verkeerde_letter", None)
        v["ondergrens"] = wilson(v["gevonden"], v["met"])[0] if v["met"] else None
        v["bovengrens"] = wilson(v["vals"], v["zonder"])[1] if v["zonder"] else None
        v["besluit"] = besluit(v["gevonden"], v["met"], v["vals"], v["zonder"])
    bevestigd = [d for d, x in uitslag.items() if x.get("status") == "bevestigd"]
    fouten = Counter((meldingen[d].get("fout", "onbekend") if isinstance(meldingen.get(d), dict) else "ontbreekt")
                     for d in bevestigd if d not in meldingen or isinstance(meldingen[d], dict))
    r["fouten"] = dict(sorted(fouten.items()))
    r["foutpercentage"] = 100 * sum(fouten.values()) / len(bevestigd) if bevestigd else 0.0
    r["geldig"] = r["foutpercentage"] <= MAX_FOUT_PCT
    return r


def _gln(doc, meta):
    return (meta.get(doc) or {}).get("gln") or doc.split("-")[0]


def _p90(xs):
    return sorted(xs)[math.ceil(0.9 * len(xs)) - 1]


def tabel(uitslag, meldingen, meta, seed=20261030, n_trekkingen=2000):
    t = tel(uitslag, meldingen)
    pk = us.per_keurmerk(uitslag)
    toets = [d for d, x in uitslag.items() if x.get("status") == "bevestigd"]
    draws = trekkingen([_gln(d, meta) for d in toets], seed, n_trekkingen)
    for k in us.KEURMERKEN8 + tuple(NS):
        met, zonder = pk[k]["met"], pk[k]["zonder"]
        if k == "NUTRISCORE":
            raak = lambda d: _ns_goed(meldingen.get(d), uitslag[d]["nutriscore"])  # noqa: E731
            vals = lambda d: bool(_letters(_codes(meldingen.get(d))))  # noqa: E731
        else:
            raak = vals = lambda d, k=k: k in _codes(meldingen.get(d))  # noqa: E731
        tm, nm, tz, nz = Counter(), Counter(), Counter(), Counter()
        for d in met:
            nm[_gln(d, meta)] += 1
            tm[_gln(d, meta)] += raak(d)
        for d in zonder:
            nz[_gln(d, meta)] += 1
            tz[_gln(d, meta)] += vals(d)
        t[k]["spreiding"] = {"gevonden": bootstrap(tm, nm, draws), "vals": bootstrap(tz, nz, draws)}
        t[k]["leveranciers"] = len(nm)
    m = list(meta.values())
    tijden = [x["tijd"] for x in m if x.get("tijd") is not None]
    route = {
        "tijd": {"mediaan": _mediaan(tijden), "p90": _p90(tijden), "max": max(tijden)} if tijden else None,
        "kosten": {"gemiddeld": sum(x.get("kosten") or 0 for x in m) / len(m), "totaal": sum(x.get("kosten") or 0 for x in m)} if m else None,
        "beoordelaar_aanroepen": sum(x.get("beoordeeld") or 0 for x in m),
        "fouten": t["fouten"], "foutpercentage": t["foutpercentage"], "geldig": t["geldig"],
        "door_certificaat": dict(Counter(c for x in m for c in x.get("door_certificaat", []))),
    }
    if any("requires_review" in x for x in m):
        totaal = sum(len(_codes(meldingen.get(d)) & set(us.KEURMERKEN7 + tuple(NS))) for d in meta)
        rr = sum(len(set(x.get("requires_review", []))) for x in m)
        route["aandeel_requires_review"] = rr / totaal if totaal else None
    t["route"] = route
    return t


def _mediaan(xs):
    s = sorted(xs)
    return (s[(len(s) - 1) // 2] + s[len(s) // 2]) / 2


def verschil(a, b):
    """Route a min route b in procentpunten, per keurmerk."""
    uit = {}
    for k in us.KEURMERKEN8:
        x, y = a[k], b[k]
        uit[k] = {"gevonden_pp": 100 * (x["gevonden"] / x["met"] - y["gevonden"] / y["met"]) if x["met"] and y["met"] else None,
                  "vals_pp": 100 * (x["vals"] / x["zonder"] - y["vals"] / y["zonder"]) if x["zonder"] and y["zonder"] else None}
    return uit


def _per_keurmerk(record):
    c = _codes(record)
    return {**{k: k in c for k in us.KEURMERKEN7}, "NUTRISCORE": frozenset(_letters(c))}


def verschil_etiketten(a, b):
    uit = []
    for d in sorted(set(a) | set(b)):
        x, y = _per_keurmerk(a.get(d)), _per_keurmerk(b.get(d))
        uit += [{"doc_id": d, "keurmerk": k} for k in us.KEURMERKEN8 if x[k] != y[k]]
    return uit


def nakijklijst(uitslag, routes, seed=20261031):
    """Elk (etiket, keurmerk) waar minstens één route van de waarheid afwijkt, zonder routenaam, in geschudde volgorde."""
    pk = us.per_keurmerk(uitslag)
    paren = set()
    for meld in routes.values():
        for k in us.KEURMERKEN7:
            paren |= {(d, k) for d in pk[k]["met"] if k not in _codes(meld.get(d))}
            paren |= {(d, k) for d in pk[k]["zonder"] if k in _codes(meld.get(d))}
        paren |= {(d, "NUTRISCORE") for d in pk["NUTRISCORE"]["met"] if not _ns_goed(meld.get(d), uitslag[d]["nutriscore"])}
        paren |= {(d, "NUTRISCORE") for d in pk["NUTRISCORE"]["zonder"] if _letters(_codes(meld.get(d)))}
    lijst = sorted(paren)
    random.Random(seed).shuffle(lijst)
    uit = []
    for n, (d, k) in enumerate(lijst, 1):
        waar = uitslag[d]["nutriscore"] if k == "NUTRISCORE" else uitslag[d]["keurmerken"][k]
        uit.append({"nr": n, "doc_id": d, "keurmerk": k, "waarheid": waar})
    return uit


def _pct(x):
    return "–" if x is None else f"{100 * x:.1f}%"


def _md(tabellen):
    regels = []
    for naam, t in tabellen.items():
        regels += [f"## {naam}", "", "| keurmerk | mét (gevonden/aanwezig) | ondergrens | zonder (vals/afwezig) | bovengrens | "
                   "verkeerde letter | spreiding gevonden | leveranciers | besluit |", "|---|---|---|---|---|---|---|---|---|"]
        for k in us.KEURMERKEN8:
            v = t[k]
            sp = v["spreiding"]["gevonden"]
            regels.append(f"| {k} | {v['gevonden']}/{v['met']} | {_pct(v['ondergrens'])} | {v['vals']}/{v['zonder']} | "
                          f"{_pct(v['bovengrens'])} | {'' if v['verkeerde_letter'] is None else v['verkeerde_letter']} | "
                          f"{'–' if sp is None else f'{_pct(sp[0])}–{_pct(sp[1])}'} | {v['leveranciers']} | {v['besluit']} |")
        r = t["route"]
        tijd = r["tijd"] or {}
        kosten = r["kosten"] or {}
        regels += ["", f"Tijd per etiket: mediaan {tijd.get('mediaan')} s, p90 {tijd.get('p90')} s, max {tijd.get('max')} s. "
                   f"Kosten: gemiddeld ${kosten.get('gemiddeld', 0):.4f}, totaal ${kosten.get('totaal', 0):.2f}. "
                   f"Beoordelaaraanroepen: {r['beoordelaar_aanroepen']}. Fouten: {r['fouten']} ({r['foutpercentage']:.1f}%, "
                   f"{'geldig' if r['geldig'] else 'ONGELDIG'}).", ""]
    return "\n".join(regels) + "\n"


def _paren(lijst):
    return dict(x.split("=", 1) for x in lijst or [])


def _lees_route(pad):
    """Etiketten uit een voltooid run-bestand; anders ValueError met de reden (geen tabellen)."""
    data = json.loads(Path(pad).read_text())
    status = data.get("status") if isinstance(data, dict) else None
    if status == "afgebroken" and data.get("reden") == "geen_zdr":
        raise ValueError(f"zdr-weigering in {pad}: de run stopt en telt niet")
    if status != "voltooid" or not isinstance(data.get("etiketten"), dict):
        reden = f", reden {data['reden']}" if isinstance(data, dict) and data.get("reden") else ""
        raise ValueError(f"{pad} is geen voltooide run (status {status!r}{reden})")
    return {d: (v if isinstance(v, dict) else set(v)) for d, v in data["etiketten"].items()}


def corrigeer(uitslag, correcties):
    """Uitslag ná blind nakijken; ValueError bij een onbekend etiket, keurmerk of een ongeldige waarde."""
    uit = copy.deepcopy(uitslag)
    for d, per in correcties.items():
        if d not in uit or not isinstance(per, dict):
            raise ValueError(f"correctie voor onbekend etiket {d!r}")
        for k, w in per.items():
            if k == "NUTRISCORE":
                if not (w == "onleesbaar" or (isinstance(w, list) and all(x in us.LETTERS for x in w))):
                    raise ValueError(f"{d}: Nutri-Score-correctie moet een lijst letters A-E of 'onleesbaar' zijn, niet {w!r}")
                uit[d]["nutriscore"] = w if w == "onleesbaar" else sorted(set(w))
            elif k in us.KEURMERKEN7 and w in us.KEUZES:
                uit[d].setdefault("keurmerken", {})[k] = w
            else:
                raise ValueError(f"{d}: ongeldige correctie {k!r}={w!r}")
    return uit


def _json(x):
    return json.dumps(x, indent=1, ensure_ascii=False, sort_keys=True, default=lambda s: sorted(s))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--uitslag", required=True, type=Path)
    ap.add_argument("--route", action="append", required=True,
                    help='NAAM=pad naar een run-bestand {"status": "voltooid", "etiketten": {doc_id: [codes] | {fout}}}')
    ap.add_argument("--meta", action="append", help="NAAM=pad naar {doc_id: {gln, tijd, kosten, beoordeeld}}")
    ap.add_argument("--uit", required=True, type=Path)
    ap.add_argument("--correcties", type=Path)
    ap.add_argument("--seed", type=int, default=20261030)
    a = ap.parse_args(argv)
    uitslag = json.loads(a.uitslag.read_text(encoding="utf-8"))
    metas = {n: json.loads(Path(p).read_text()) for n, p in _paren(a.meta).items()}
    try:
        routes = {n: _lees_route(p) for n, p in _paren(a.route).items()}
        gecorrigeerd = corrigeer(uitslag, json.loads(a.correcties.read_text())) if a.correcties else None
        tabellen = {n: tabel(uitslag, m, metas.get(n, {}), seed=a.seed) for n, m in routes.items()}
        na = {n: tabel(gecorrigeerd, m, metas.get(n, {}), seed=a.seed) for n, m in routes.items()} if gecorrigeerd else None
    except ValueError as e:
        print(f"telling gestopt: {e}", file=sys.stderr)
        return 1
    namen = list(routes)
    uit = beelden.veilig_doel(a.uit)
    uit.mkdir(parents=True, exist_ok=True)
    (uit / "tabellen.json").write_text(_json(tabellen), encoding="utf-8")
    (uit / "tabellen.md").write_text(_md(tabellen), encoding="utf-8")
    (uit / "verschil.json").write_text(_json({f"{namen[0]} min {b}": {
        "procentpunten": verschil(tabellen[namen[0]], tabellen[b]),
        "etiketten": verschil_etiketten(routes[namen[0]], routes[b])} for b in namen[1:]}), encoding="utf-8")
    (uit / "nakijklijst.json").write_text(_json(nakijklijst(uitslag, routes)), encoding="utf-8")
    if na:
        (uit / "tabellen-na-nakijken.json").write_text(_json(na), encoding="utf-8")
        (uit / "tabellen-na-nakijken.md").write_text(_md(na), encoding="utf-8")
    print(_md(tabellen))
    return 0


if __name__ == "__main__":
    sys.exit(main())
