"""Telling, stopregel en vergelijking (CAP-9; meetregels §1-§7). Stdlib; `wilson`, `trekkingen` en `bootstrap` komen uit
fase-b/tel.py (geïmporteerd, niet gekopieerd).

Per etiket op aanwezigheid: gevonden = meldingen op etiketten mét het keurmerk, vals = meldingen op etiketten zonder.
Een fout telt als geen melding en wordt geteld; boven 2% fouten is de run ongeldig; een zdr-weigering stopt de telling.

  python tel_proef.py --uitslag <toets/uitslag.json> --route D+A=<pad> --meta D+A=<pad> --route D=<pad> --meta D=<pad>
                      --route K4-aa=<pad> --meta K4-aa=<pad> --uit <map>
                      [--referenties K4-aa=<route>-referentieset.json]
                      [--nakijken <nakijken.json> [--nakijken-ronde2 K=<pad>]... [--ronde2-overgeslagen K]...]
--referenties: per klasse het aantal gebruikte referenties (`per_klasse` van k4aa_lokaal); een keurmerk zonder
referenties krijgt bij die route het besluit "n.v.t. (geen referenties)" (trainingsset §9), vóór elk ander besluit.
Een route is een run-bestand {"status": "voltooid", "etiketten": {doc_id: [codes] | {"fout": klasse}}}; een run die niet
voltooid is wordt geweigerd (een afgebroken run met reden geen_zdr is de zdr-stop). Alleen de --route-routes tellen voor
de nakijklijst; de informatieve K4-aa-run met alle referenties hoort er niet bij.
Schrijft tabellen.json, tabellen.md, nakijklijst.json (blind: nr, doc_id, keurmerk, waarheid; geschud), en apart in
niet-voor-nakijker/ de sleutel (nakijk-sleutel.json: per nr "verschil" of "steekproef") en verschil.json;
nakijk-sha256.json legt de sha256 van lijst en sleutel vast. Nakijklijst = elk paar (etiket, keurmerk) waar minstens één
route van de waarheid afwijkt, plus per keurmerk en kant een steekproef van ceil(10%) van de paren waar alle routes
overeenkomen, getrokken met STEEKPROEF_SEED (vast in de code; --seed geldt alleen voor de leveranciersbootstrap).
--nakijken = {nr: oordeel} voor elke regel ("aanwezig"/"afwezig"/"onzeker"; Nutri-Score: letters A-E of "onleesbaar"),
voor alle routes gelijk toegepast, alleen als lijst en sleutel nog byte-gelijk zijn aan nakijk-sha256.json van stap 14
(die drie bestanden worden dan niet opnieuw geschreven; oude tabellen ná nakijken gaan eerst weg); geeft tabellen-na-nakijken.json/.md met per keurmerk het steekproefrapport en de
gevoeligheid. Een fout in de steekproef van K (elk afwijkend oordeel) maakt het besluit voor K "mens bevestigt
(voorlopig)" en schrijft nakijklijst-ronde2-<K>.json; --nakijken-ronde2 K=<pad> (antwoord op elke regel) geeft daarna het
gewone besluit, --ronde2-overgeslagen K "mens bevestigt". "te weinig voorbeelden" gaat altijd voor. Een onvolledig of
ongeldig antwoord of een ongeldige ronde-2-keuze: foutmelding, exitcode 1, geen tabellen ná nakijken.
Nutri-Score: gevonden als alle gemelde letters in de ware verzameling zitten (en er minstens één is); een gemelde letter
erbuiten maakt het etiket gemist en telt als verkeerde letter (meetregels §3).
"""
import argparse
import copy
import hashlib
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

NS = {f"NUTRISCORE_{x}": x for x in us.LETTERS}  # A–E (meetregels §3, besluit Friso 01-11-2026)
MIN_MET, MIN_ZONDER, MAX_FOUT_PCT = 16, 35, 2.0
NVT = "n.v.t. (geen referenties)"
STEEKPROEF_SEED = 20261101  # meetregels §6: vast in de telcode (bevroren via de hash), geen opdrachtregeloptie
KANTEN = ("met", "zonder")


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


def _zonder_referenties(k, referenties):
    """Keurmerk zonder referenties: Nutri-Score-groep = som van de letters, een letter of klasse = zijn eigen aantal."""
    n = sum(referenties.get(x, 0) for x in NS) if k == "NUTRISCORE" else referenties.get(k, 0)
    return n == 0


def tel(uitslag, meldingen, referenties=None):
    if any(isinstance(r, dict) and r.get("fout") == "geen_zdr" for r in meldingen.values()):
        raise ValueError("zdr-weigering: de run stopt en telt niet")
    pk = us.per_keurmerk(uitslag)
    r = {}
    for k in us.KEURMERKEN_LOS + us.NIEUW_R10 + tuple(NS):  # glutenvrij (ronde 10) telt mee als keurmerk
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
        if referenties is not None and _zonder_referenties(k, referenties):
            v["besluit"] = NVT
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


def tabel(uitslag, meldingen, meta, seed=20261030, n_trekkingen=2000, referenties=None):
    t = tel(uitslag, meldingen, referenties)
    pk = us.per_keurmerk(uitslag)
    toets = [d for d, x in uitslag.items() if x.get("status") == "bevestigd"]
    draws = trekkingen([_gln(d, meta) for d in toets], seed, n_trekkingen)
    for k in us.KEURMERKEN + tuple(NS):
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
        totaal = sum(len(_codes(meldingen.get(d)) & set(us.KEURMERKEN_LOS + tuple(NS))) for d in meta)
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
    for k in us.KEURMERKEN:
        x, y = a[k], b[k]
        uit[k] = {"gevonden_pp": 100 * (x["gevonden"] / x["met"] - y["gevonden"] / y["met"]) if x["met"] and y["met"] else None,
                  "vals_pp": 100 * (x["vals"] / x["zonder"] - y["vals"] / y["zonder"]) if x["zonder"] and y["zonder"] else None}
    return uit


def _per_keurmerk(record):
    c = _codes(record)
    return {**{k: k in c for k in us.KEURMERKEN_LOS + us.NIEUW_R10}, "NUTRISCORE": frozenset(_letters(c))}


def verschil_etiketten(a, b):
    uit = []
    for d in sorted(set(a) | set(b)):
        x, y = _per_keurmerk(a.get(d)), _per_keurmerk(b.get(d))
        uit += [{"doc_id": d, "keurmerk": k} for k in us.KEURMERKEN if x[k] != y[k]]
    return uit


def _trekking(uitslag, routes):
    """(verschil, eens, steekproef): de paren waar minstens één route van de waarheid afwijkt; per (keurmerk, kant) de
    gesorteerde etiketten waar alle routes overeenkomen; en per (keurmerk, kant) ceil(10%) daarvan, getrokken met
    STEEKPROEF_SEED. Onafhankelijk van de volgorde van de invoer en van PYTHONHASHSEED (alles gesorteerd, int-seed)."""
    pk = us.per_keurmerk(uitslag)
    verschil = set()
    for meld in routes.values():
        for k in us.KEURMERKEN_LOS + us.NIEUW_R10:
            verschil |= {(d, k) for d in pk[k]["met"] if k not in _codes(meld.get(d))}
            verschil |= {(d, k) for d in pk[k]["zonder"] if k in _codes(meld.get(d))}
        verschil |= {(d, "NUTRISCORE") for d in pk["NUTRISCORE"]["met"] if not _ns_goed(meld.get(d), uitslag[d]["nutriscore"])}
        verschil |= {(d, "NUTRISCORE") for d in pk["NUTRISCORE"]["zonder"] if _letters(_codes(meld.get(d)))}
    rng, eens, steek = random.Random(STEEKPROEF_SEED), {}, set()
    for k in us.KEURMERKEN:
        for kant in KANTEN:
            eens[k, kant] = sorted(d for d in pk[k][kant] if (d, k) not in verschil)
            steek |= {(d, k) for d in rng.sample(eens[k, kant], (len(eens[k, kant]) + 9) // 10)}  # ceil zonder float
    return verschil, eens, steek


def _regels(uitslag, paren):
    """Paren gesorteerd en geschud met STEEKPROEF_SEED, genummerd 1…n, met Friso's eerdere oordeel; geen herkomst."""
    lijst = sorted(paren)
    random.Random(STEEKPROEF_SEED).shuffle(lijst)
    return [{"nr": n, "doc_id": d, "keurmerk": k,
             "waarheid": uitslag[d]["nutriscore"] if k == "NUTRISCORE" else uitslag[d]["keurmerken"][k]}
            for n, (d, k) in enumerate(lijst, 1)]


def nakijklijst(uitslag, routes):
    """(lijst, sleutel): verschillen en steekproef door elkaar, zonder routenaam of herkomst (meetregels §6); de sleutel
    {str(nr): "verschil" | "steekproef"} hoort niet bij de nakijker."""
    verschil, _, steek = _trekking(uitslag, routes)
    lijst = _regels(uitslag, verschil | steek)
    return lijst, {str(r["nr"]): "verschil" if (r["doc_id"], r["keurmerk"]) in verschil else "steekproef" for r in lijst}


def _antwoorden(pad, lijst):
    """({nr: oordeel}, correcties {doc_id: {keurmerk: oordeel}}) uit een nakijkbestand met een oordeel voor precies elke
    regel van `lijst`; de waarden controleert `corrigeer`."""
    a = json.loads(Path(pad).read_text(encoding="utf-8"))
    nrs = {str(r["nr"]) for r in lijst}
    if not isinstance(a, dict):
        raise ValueError(f"{pad}: verwacht {{nr: oordeel}}")
    if set(a) != nrs:
        raise ValueError(f"{pad}: een oordeel voor precies elke regel nodig (ontbreekt: {sorted(nrs - set(a))[:10]}, "
                         f"buiten de lijst: {sorted(set(a) - nrs)[:10]})")
    correcties = {}
    for r in lijst:
        correcties.setdefault(r["doc_id"], {})[r["keurmerk"]] = a[str(r["nr"])]
    return a, correcties


def _fout(oud, nieuw):
    """Elk afwijkend oordeel, ook naar onzeker/onleesbaar; Nutri-Score als verzameling (volgorde telt niet)."""
    return set(oud) != set(nieuw) if isinstance(oud, list) and isinstance(nieuw, list) else oud != nieuw


def na_nakijken(uitslag, routes, metas, nakijken, ronde2=None, overgeslagen=(), seed=20261030, referenties=None):
    """(tabellen ná nakijken, {keurmerk: lijst voor de tweede ronde}) volgens meetregels §6-§7. ValueError bij een
    onvolledig of ongeldig antwoord, of een ronde-2-keuze voor een onbekend keurmerk, een keurmerk zonder tweede ronde
    of met beide opties."""
    ronde2, overgeslagen = dict(ronde2 or {}), set(overgeslagen)
    _, eens, steek = _trekking(uitslag, routes)
    lijst, sleutel = nakijklijst(uitslag, routes)
    antwoord, correcties = _antwoorden(nakijken, lijst)
    waar = corrigeer(uitslag, correcties)
    kant = {(d, k): z for (k, z), ds in eens.items() for d in ds}
    rapport = {k: {z: {"nagekeken": 0, "fouten": 0} for z in KANTEN} for k in us.KEURMERKEN}
    for r in lijst:
        if sleutel[str(r["nr"])] == "steekproef":
            s = rapport[r["keurmerk"]][kant[r["doc_id"], r["keurmerk"]]]
            s["nagekeken"] += 1
            s["fouten"] += _fout(r["waarheid"], antwoord[str(r["nr"])])
    for s in (s for per in rapport.values() for s in per.values()):
        s["bovengrens"] = wilson(s["fouten"], s["nagekeken"])[1] if s["nagekeken"] else None
    fout = {k for k, per in rapport.items() if any(s["fouten"] for s in per.values())}
    tweede = {k: _regels(uitslag, {(d, k) for z in KANTEN for d in eens[k, z]} - steek) for k in sorted(fout)}
    for k in sorted(set(ronde2) | overgeslagen):
        if k not in fout:
            raise ValueError(f"{k}: geen tweede ronde (onbekend keurmerk of geen fout in de steekproef)")
        if k in ronde2 and k in overgeslagen:
            raise ValueError(f"{k}: tweede ronde nagekeken én overgeslagen")
    for k, pad in ronde2.items():
        waar = corrigeer(waar, _antwoorden(pad, tweede[k])[1])
    uit = {}
    for naam, meld in routes.items():
        t = uit[naam] = tabel(waar, meld, metas.get(naam, {}), seed=seed, referenties=(referenties or {}).get(naam))
        for k in us.KEURMERKEN:
            v, sp = t[k], rapport[k]
            # gevoeligheid (informatief): bovengrens per kant in het nadeel van de route op de overeenkomende paren die
            # niet zijn nagekeken (niet in de steekproef, niet in een nagekeken tweede ronde)
            e = {z: 0 if k in ronde2 or sp[z]["bovengrens"] is None else
                 math.ceil(sp[z]["bovengrens"] * (len(eens[k, z]) - sp[z]["nagekeken"])) for z in KANTEN}
            v["steekproef"] = sp
            v["gevoeligheid"] = besluit(v["gevonden"] - e["met"], v["met"] - e["met"] + e["zonder"], v["vals"] + e["met"],
                                        v["zonder"] + e["met"] - e["zonder"])
            if v["besluit"] not in ("te weinig voorbeelden", NVT) and k in fout and k not in ronde2:
                v["besluit"] = "mens bevestigt" if k in overgeslagen else "mens bevestigt (voorlopig)"
    return uit, tweede


def _pct(x):
    return "–" if x is None else f"{100 * x:.1f}%"


def _steek_md(s):
    return f"{s['nagekeken']} / {s['fouten']} / {_pct(s['bovengrens'])}"


def _md(tabellen):
    regels = []
    for naam, t in tabellen.items():
        na = "steekproef" in t[us.KEURMERKEN[0]]
        regels += [f"## {naam}", "", "| keurmerk | mét (gevonden/aanwezig) | ondergrens | zonder (vals/afwezig) | bovengrens | "
                   "verkeerde letter | spreiding gevonden | leveranciers | besluit |"
                   + (" steekproef mét (nagekeken / fouten / bovengrens) | steekproef zonder | gevoeligheid |" if na else ""),
                   "|---|---|---|---|---|---|---|---|---|" + ("---|---|---|" if na else "")]
        for k in us.KEURMERKEN:
            v = t[k]
            sp = v["spreiding"]["gevonden"]
            regels.append(f"| {k} | {v['gevonden']}/{v['met']} | {_pct(v['ondergrens'])} | {v['vals']}/{v['zonder']} | "
                          f"{_pct(v['bovengrens'])} | {'' if v['verkeerde_letter'] is None else v['verkeerde_letter']} | "
                          f"{'–' if sp is None else f'{_pct(sp[0])}–{_pct(sp[1])}'} | {v['leveranciers']} | {v['besluit']} |"
                          + (f" {_steek_md(v['steekproef']['met'])} | {_steek_md(v['steekproef']['zonder'])} | "
                             f"{v['gevoeligheid']} |" if na else ""))
        if na:
            regels += ["", "Steekproef: per kant de nagekeken overeenkomende paren, de fouten in Friso's eerdere oordeel en de "
                       "Wilson-bovengrens van die foutkans (voor alle routes gelijk). Gevoeligheid (informatief): het besluit "
                       "als die bovengrens in het nadeel van de route op de niet-nagekeken overeenkomende paren wordt "
                       "toegepast."]
        r = t["route"]
        tijd = r["tijd"] or {}
        kosten = r["kosten"] or {}
        regels += ["", f"Tijd per etiket: mediaan {tijd.get('mediaan')} s, p90 {tijd.get('p90')} s, max {tijd.get('max')} s. "
                   f"Kosten: gemiddeld ${kosten.get('gemiddeld', 0):.4f}, totaal ${kosten.get('totaal', 0):.2f}. "
                   f"Beoordelaaraanroepen: {r['beoordelaar_aanroepen']}. Fouten: {r['fouten']} ({r['foutpercentage']:.1f}%, "
                   f"{'geldig' if r['geldig'] else 'ONGELDIG'}).", ""]
    return "\n".join(regels) + "\n"


def _paren(lijst):
    zonder = [x for x in lijst or [] if "=" not in x]
    if zonder:
        raise ValueError(f"verwacht NAAM=PAD, kreeg {zonder}")
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
            elif k in us.KEURMERKEN_LOS + us.NIEUW_R10 and w in us.KEUZES:
                uit[d].setdefault("keurmerken", {})[k] = w
            else:
                raise ValueError(f"{d}: ongeldige correctie {k!r}={w!r}")
    return uit


def _json(x):
    return json.dumps(x, indent=1, ensure_ascii=False, sort_keys=True, default=lambda s: sorted(s))


def _sha(tekst):
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


def _controleer_sha(uit, lijst, sleutel):
    """Stap 15: lijst en sleutel van nu moeten byte-gelijk zijn aan die van stap 14 (nakijk-sha256.json); anders horen
    de antwoorden per nummer bij andere paren."""
    pad = Path(uit) / "nakijk-sha256.json"
    nu = {"nakijklijst.json": _sha(_json(lijst)), "nakijk-sleutel.json": _sha(_json(sleutel))}
    if not pad.exists() or json.loads(pad.read_text(encoding="utf-8")) != nu:
        raise ValueError(f"lijst veranderd sinds stap 14 (of {pad} ontbreekt): de antwoorden horen bij een andere "
                         "nakijklijst; tel met dezelfde routes als in stap 14")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter, allow_abbrev=False)
    ap.add_argument("--uitslag", required=True, type=Path)
    ap.add_argument("--route", action="append", required=True,
                    help='NAAM=pad naar een run-bestand {"status": "voltooid", "etiketten": {doc_id: [codes] | {fout}}}')
    ap.add_argument("--meta", action="append", help="NAAM=pad naar {doc_id: {gln, tijd, kosten, beoordeeld}}")
    ap.add_argument("--uit", required=True, type=Path)
    ap.add_argument("--referenties", action="append", metavar="ROUTE=PAD",
                    help="referentieset.json van k4aa_lokaal (per_klasse): keurmerk zonder referenties = n.v.t.")
    ap.add_argument("--nakijken", type=Path, help="{nr: oordeel} voor elke regel van nakijklijst.json (stap 15)")
    ap.add_argument("--nakijken-ronde2", action="append", default=[], metavar="K=PAD",
                    help="antwoorden op nakijklijst-ronde2-<K>.json (een oordeel voor elke regel)")
    ap.add_argument("--ronde2-overgeslagen", action="append", default=[], metavar="K",
                    help="tweede ronde van K bewust niet nagekeken: besluit 'mens bevestigt'")
    ap.add_argument("--seed", type=int, default=20261030, help="alleen de leveranciersbootstrap; de steekproef ligt vast")
    a = ap.parse_args(argv)
    uit = beelden.veilig_doel(a.uit)
    if a.nakijken:  # een mislukte run laat geen tabellen ná nakijken van een eerdere run achter
        for f in ("tabellen-na-nakijken.json", "tabellen-na-nakijken.md"):
            (uit / f).unlink(missing_ok=True)
    try:
        uitslag = json.loads(a.uitslag.read_text(encoding="utf-8"))
        metas = {n: json.loads(Path(p).read_text(encoding="utf-8")) for n, p in _paren(a.meta).items()}
        routes = {n: _lees_route(p) for n, p in _paren(a.route).items()}
        refs = {n: json.loads(Path(p).read_text(encoding="utf-8")).get("per_klasse") for n, p in _paren(a.referenties).items()}
        if any(not isinstance(v, dict) for v in refs.values()):
            raise ValueError("--referenties: referentieset zonder per_klasse (draai k4aa_lokaal.py opnieuw)")
        if set(refs) - set(routes):
            raise ValueError(f"--referenties voor onbekende route {sorted(set(refs) - set(routes))}")
        tabellen = {n: tabel(uitslag, m, metas.get(n, {}), seed=a.seed, referenties=refs.get(n)) for n, m in routes.items()}
        lijst, sleutel = nakijklijst(uitslag, routes)
        if a.nakijken:
            _controleer_sha(uit, lijst, sleutel)
            na, tweede = na_nakijken(uitslag, routes, metas, a.nakijken, _paren(a.nakijken_ronde2), a.ronde2_overgeslagen,
                                     seed=a.seed, referenties=refs)
        elif a.nakijken_ronde2 or a.ronde2_overgeslagen:
            raise ValueError("--nakijken-ronde2 en --ronde2-overgeslagen alleen samen met --nakijken")
        else:
            na, tweede = None, {}
    except (ValueError, OSError) as e:
        print(f"telling gestopt: {e}", file=sys.stderr)
        return 1
    namen = list(routes)
    apart = uit / "niet-voor-nakijker"  # sleutel en verschil verraden de herkomst van een regel
    apart.mkdir(parents=True, exist_ok=True)
    (uit / "tabellen.json").write_text(_json(tabellen), encoding="utf-8")
    (uit / "tabellen.md").write_text(_md(tabellen), encoding="utf-8")
    (apart / "verschil.json").write_text(_json({f"{namen[0]} min {b}": {
        "procentpunten": verschil(tabellen[namen[0]], tabellen[b]),
        "etiketten": verschil_etiketten(routes[namen[0]], routes[b])} for b in namen[1:]}), encoding="utf-8")
    if not a.nakijken:  # stap 15 controleert lijst en sleutel tegen stap 14 en schrijft ze niet opnieuw
        (uit / "nakijklijst.json").write_text(_json(lijst), encoding="utf-8")
        (apart / "nakijk-sleutel.json").write_text(_json(sleutel), encoding="utf-8")
        (uit / "nakijk-sha256.json").write_text(_json({"nakijklijst.json": _sha(_json(lijst)),
                                                       "nakijk-sleutel.json": _sha(_json(sleutel))}), encoding="utf-8")
    if na:
        for oud in uit.glob("nakijklijst-ronde2-*.json"):  # keurmerken die geen tweede ronde meer hebben
            if oud.name.removeprefix("nakijklijst-ronde2-").removesuffix(".json") not in tweede:
                oud.unlink()
        for k, regels in tweede.items():
            (uit / f"nakijklijst-ronde2-{k}.json").write_text(_json(regels), encoding="utf-8")
        (uit / "tabellen-na-nakijken.json").write_text(_json(na), encoding="utf-8")
        (uit / "tabellen-na-nakijken.md").write_text(_md(na), encoding="utf-8")
    print(_md(na or tabellen))
    return 0


if __name__ == "__main__":
    sys.exit(main())
