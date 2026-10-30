"""Telscript fase B (SPEC CAP-3/CAP-5; meetopzet §0, §3, §5, §6). Alleen stdlib; toets: test_tel.py ernaast.
Telt per deelverzameling x variant x run x keurmerk gevonden/gemist/onterecht tegen de AI-waarheid met Wilson-95% en
GLN-clusterbootstrap, geeft het oordeel en de rangorde vóór (of na) adjudicatie, en maakt de blinde adjudicatielijst.

  tel.py --waarheid voorlopige-selectie.json --ruw <fase-b/ruw> --b0 <nulmeting/ruw> [--lekparen lekparen.json]
         [--adjudicatie adjudicatie.json] [--kosten kosten.json] --uit <map>

Zonder --adjudicatie: schrijft resultaat.json, adjudicatielijst.json en adjudicatie-sleutel.json (weigert een bestaande, afwijkende lijst
te overschrijven). Met --adjudicatie ({id: "ja"|"nee"}): leest adjudicatielijst.json uit --uit, past de uitslag toe en schrijft alleen
resultaat-na-adjudicatie.json (resultaat.json van vóór de adjudicatie blijft staan). --drempel geldt voor K2/K3; B0 houdt de drempels van §2."""
import argparse, copy, hashlib, json, math, random
from collections import Counter, defaultdict
from pathlib import Path

TOP15 = sorted(["RAINFOREST_ALLIANCE_PEOPLE_NATURE", "WEIDEMELK", "EU_ORGANIC_FARMING", "RECYCLABLE_GENERAL_CLAIM",
                "BETER_LEVEN_1_STER", "PREGNANCY_WARNING", "GREEN_DOT", "VEGAN", "NUTRISCORE_A", "EUROPEAN_V_LABEL_VEGAN",
                "FOREST_STEWARDSHIP_COUNCIL_MIX", "MARINE_STEWARDSHIP_COUNCIL_LABEL", "NUTRISCORE_C", "NUTRISCORE_B",
                "VEGAN_SOCIETY_VEGAN_LOGO"])
_NS, _VG = ("NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C"), ("EUROPEAN_V_LABEL_VEGAN", "VEGAN_SOCIETY_VEGAN_LOGO", "VEGAN")
VERWARBAAR = {frozenset((a, b)) for g in (_NS, _VG) for a in g for b in g if a != b} | {frozenset(("RECYCLABLE_GENERAL_CLAIM", "GREEN_DOT"))}
STAP2 = ("k2a", "k2b", "k3b", "k3c")
VINDT = {"vindt het", "vindt het, onzeker", "haalt het", "haalt het, onzeker"}
Z = 1.959963984540054


# --- meetkunde (§3.1, §3.2) ---
def opp(v):
    return max(0, v[2] - v[0]) * max(0, v[3] - v[1])


def iou(a, b):
    i = opp([max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])])
    u = opp(a) + opp(b) - i
    return i / u if u > 0 else 0.0


def begrens(vak, w, h):
    """Vak begrensd tot het etiket (maat onbekend: niet begrenzen); None als er geen oppervlak overblijft."""
    if w and h:
        vak = [min(max(vak[0], 0), w), min(max(vak[1], 0), h), min(max(vak[2], 0), w), min(max(vak[3], 0), h)]
    return vak if vak[2] > vak[0] and vak[3] > vak[1] else None


def _midden_in(v, w):
    cx, cy = (v[0] + v[2]) / 2, (v[1] + v[3]) / 2
    return w[0] <= cx <= w[2] and w[1] <= cy <= w[3]


def raakt(vak, w, grof=False):
    """§3.2: (middelpunt in het per zijde 25% vergrote vak of IoU >= 0,3) en oppervlak <= 4x vergroot vak; grof vak: alleen middelpunt."""
    if grof:
        return _midden_in(vak, w)
    dx, dy = (w[2] - w[0]) / 4, (w[3] - w[1]) / 4
    g = [w[0] - dx, w[1] - dy, w[2] + dx, w[3] + dy]
    return (_midden_in(vak, g) or iou(vak, w) >= 0.3) and opp(vak) <= 4 * opp(g)


def _ketens(items, verbonden):
    """Groepen via ketens (union-find) in vaste volgorde."""
    ouder = list(range(len(items)))

    def wortel(i):
        while ouder[i] != i:
            ouder[i] = ouder[ouder[i]]; i = ouder[i]
        return i
    for i in range(len(items)):
        for j in range(i):
            if verbonden(items[i], items[j]):
                ouder[wortel(i)] = wortel(j)
    groepen = defaultdict(list)
    for i, x in enumerate(items):
        groepen[wortel(i)].append(x)
    return list(groepen.values())


def samenvoegen(meldingen):
    """§3.1: zelfde code en IoU >= 0,5 → één groep (ketens); blijft: lid met hoogste score, bij gelijke stand laagste orde."""
    met = [x for x in meldingen if x["vak"] is not None]
    groepen = _ketens(met, lambda a, b: a["code"] == b["code"] and iou(a["vak"], b["vak"]) >= 0.5)
    return [min(g, key=lambda x: (-x["score"], x["orde"])) for g in groepen] + [x for x in meldingen if x["vak"] is None]


# --- telling per etiket (§3.1-3.5, §3.8) ---
def tel_etiket(meldingen, waarheid):
    ms = sorted(samenvoegen(meldingen), key=lambda x: (-x["score"], x["orde"]))
    per = {c: {"positief": False, "gevonden": False, "onterecht": 0, "geraakt": 0, "meldingen": 0} for c in TOP15}
    vakken = defaultdict(list)
    for v in waarheid:
        if v["code"] in per:
            vakken[v["code"]].append(v); per[v["code"]]["positief"] = True
    geraakt, grof_bezet, verwar, status = set(), set(), Counter(), []
    for x in ms:
        c, doel = x["code"], None
        per[c]["meldingen"] += 1
        if x["vak"] is not None:
            kand = sorted(((iou(x["vak"], v["box"]), -i, i) for i, v in enumerate(vakken[c]) if raakt(x["vak"], v["box"], v.get("grof"))), reverse=True)
            for _, _, i in kand:  # telt voor het vak met de grootste IoU; een bezet grof vak gaat niet nog eens
                if vakken[c][i].get("grof"):
                    if (c, i) in grof_bezet:
                        continue
                    grof_bezet.add((c, i))
                doel = i
                break
        if doel is None:
            per[c]["onterecht"] += 1
            if x["vak"] is not None:
                for y, vs in vakken.items():
                    if frozenset((c, y)) in VERWARBAAR and any(raakt(x["vak"], v["box"], v.get("grof")) for v in vs):
                        verwar[(c, y)] += 1
        else:
            geraakt.add((c, doel))
        status.append(doel is not None)
    for c, _ in geraakt:
        per[c]["geraakt"] += 1
    for p in per.values():
        p["gevonden"] = p["geraakt"] > 0
    return {"per_code": per, "verwar": dict(verwar), "meldingen": ms, "status": status}


# --- adapters ruwe uitvoer ---
def _uit(ok, ms=(), w=None, h=None, **kw):
    return {"ok": ok, "meldingen": list(ms), "w": w, "h": h, **kw}


def _k1m(x):
    return {"code": x["code"], "vak": x["vak"], "score": 0.0, "orde": (x.get("venster", 0), x.get("volgorde", 0))}


def lees_b0(rec, drempel=0.80):
    inv = rec.get("invoer") or {}
    herpakt = inv.get("variant") != "origineel-png"
    body = (rec.get("get") or {}).get("body")
    if (rec.get("post") or {}).get("status") != 202 or not isinstance(body, dict) or body.get("status") != "done":
        return _uit(False, herpakt=herpakt)
    ms = []
    for i, d in enumerate(body["logoResults"]["detections"]):
        grens = {"embedding": drempel, "nutriscore-head": drempel, "nutriscore-a2": 0.50}.get(d.get("method"))
        if d["t3777_code"] in TOP15 and grens is not None and d["confidence"] >= grens:
            b = d["bbox"]
            ms.append({"code": d["t3777_code"], "vak": [b["x"], b["y"], b["x"] + b["width"], b["y"] + b["height"]],
                       "score": d["confidence"], "orde": (i,)})
    return _uit(True, ms, inv.get("w"), inv.get("h"), herpakt=herpakt)


def lees_k1(rec):
    """K1-vakken staan al in etiketpixels (fb_k1.parse rekent venster → etiket om)."""
    if not rec or rec.get("status") != "ok":
        return _uit(False)
    return _uit(True, [_k1m(x) for x in rec["meldingen"] if x.get("code") in TOP15], rec.get("w"), rec.get("h"))


def lees_stap2(rec, drempel=0.80):
    if not rec or rec.get("status") != "ok":
        return _uit(False)
    ms = [{"code": v["top"][0][0], "vak": v["vak"], "score": v["top"][0][1], "orde": (i,)} for i, v in enumerate(rec.get("vakken") or [])
          if v.get("top") and v["top"][0][0] in TOP15 and v["top"][0][1] >= drempel and v.get("vak") is not None]
    return _uit(True, ms, rec.get("w"), rec.get("h"))


def lees_k4(k1rec, k2rec):
    """K1-code blijft als hij bij de eerste drie verschillende soorten van K2 op dat vak zit (geen drempel).
    Melding zonder vak blijft (de poort kan hem niet toetsen; telt als onterecht). Ontbrekende of niet passende K2-uitvoer = mislukt."""
    if not k1rec or k1rec.get("status") != "ok" or not k2rec or k2rec.get("status") != "ok":
        return _uit(False)
    poort = k2rec.get("vakken") or []
    if len(poort) != len(k1rec["meldingen"]) or any((p or {}).get("vak") != x["vak"] for x, p in zip(k1rec["meldingen"], poort)):
        return _uit(False)
    ms = []
    for x, p in zip(k1rec["meldingen"], poort):
        if x.get("code") in TOP15 and (x["vak"] is None or x["code"] in list(dict.fromkeys(c for c, _ in (p or {}).get("top") or []))[:3]):
            ms.append(_k1m(x))
    return _uit(True, ms, k1rec.get("w"), k1rec.get("h"))


def lees_waarheid(pad):
    return {e["kaart"]: {"gln": e["doc_id"].split("-")[0], "herkomst": e["herkomst"],
                         "vakken": [{"code": v["code"], "box": v["box"], "grof": bool(v.get("grof"))} for v in e["positieve_vakken"]]}
            for e in json.loads(Path(pad).read_text())["etiketten"]}


def _json(p):
    return json.loads(p.read_text()) if p.exists() else None


def lees_ruw(ruw, kaarten, drempel=0.80):
    """Varianten uit de submappen: k1*, k2a/k2b/k3b/k3c, k2y-op-k1x → k4-xy; andere mappen (vtf) worden overgeslagen."""
    uit = {}
    for d in sorted(p for p in Path(ruw).iterdir() if p.is_dir()):
        if d.name.startswith("k1"):
            naam, lees = d.name, lambda r, k: lees_k1(_json(r / f"{k}.json"))
        elif d.name in STAP2:
            naam, lees = d.name, lambda r, k: lees_stap2(_json(r / f"{k}.json"), drempel)
        elif "-op-" in d.name and d.name.split("-op-")[0] in ("k2a", "k2b") and d.name.split("-op-")[1] in ("k1a", "k1b"):
            y, x = d.name.split("-op-")
            naam, lees = f"k4-{x[-1]}{y[-1]}", lambda r, k, x=x: lees_k4(_json(Path(ruw) / x / r.name / f"{k}.json"), _json(r / f"{k}.json"))
        else:
            continue
        runs = {r.name[3:]: {k: lees(r, k) for k in kaarten if (r / f"{k}.json").exists()} for r in sorted(d.glob("run*")) if r.is_dir()}
        if runs:  # map zonder runs (nog niet gedraaid) telt niet mee
            uit[naam] = runs
    return uit


# --- statistiek ---
def wilson(k, n):
    if not n:
        return None
    p, z2 = k / n, Z * Z
    d = 1 + z2 / n
    c, h = (p + z2 / (2 * n)) / d, Z * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def trekkingen(glns, seed, n):
    """n trekkingen (met teruglegging) van GLN-clusters; per trekking de multipliciteit per GLN. Vaste seed → reproduceerbaar."""
    rnd, glns = random.Random(seed), sorted(set(glns))
    return [Counter(rnd.choices(glns, k=len(glns))) for _ in range(n)]


def bootstrap(t, n, draws):
    """95%-percentielinterval van sum(t)/sum(n) over de GLN-trekkingen; trekkingen met noemer 0 vervallen."""
    nz = [(g, t.get(g, 0), v) for g, v in n.items() if v]
    rs = []
    for d in draws:
        s = sum(d.get(g, 0) * v for g, _, v in nz)
        if s:
            rs.append(sum(d.get(g, 0) * k for g, k, _ in nz) / s)
    if not rs:
        return None
    rs.sort()
    return (rs[math.floor(0.025 * (len(rs) - 1))], rs[math.ceil(0.975 * (len(rs) - 1))])


# --- oordeel en rangorde (§0, §5) ---
def oordeel(runs, n_gln, te_weinig, na_adjudicatie):
    """Vóór adjudicatie (§0): 'vindt het' bij gevonden% >= 80% in elke run; vals% telt nog niet.
    Na adjudicatie (§5): 'haalt het' vraagt ook vals% < 10%. 'onzeker' bij Wilson-grens over de grens (elke run) of < 5 GLN's."""
    if te_weinig:
        return "te weinig voorbeelden"
    woord = "haalt het" if na_adjudicatie else "vindt het"
    vals = [(r["onterecht"], r["onterecht"] + r["geraakt"]) for r in runs]
    if any(not r["positief"] or r["gevonden"] / r["positief"] < 0.8 for r in runs) or \
            (na_adjudicatie and any(n and k / n >= 0.1 for k, n in vals)):
        return woord + " niet"
    onzeker = n_gln < 5 or any(wilson(r["gevonden"], r["positief"])[0] < 0.8 for r in runs)
    if na_adjudicatie:
        onzeker = onzeker or any(n and wilson(k, n)[1] > 0.1 for k, n in vals)
    return woord + (", onzeker" if onzeker else "")


def _score(r, na_adjudicatie):
    if not r["positief"]:
        return None
    if na_adjudicatie and r["onterecht"] and r["onterecht"] / (r["onterecht"] + r["geraakt"]) >= 0.1:
        return 0.0
    return r["gevonden"] / r["positief"]


def _maten(uitvoer):
    maten = {}
    for runs in uitvoer.values():
        for recs in runs.values():
            for k, rec in recs.items():
                if rec and rec.get("w") and rec.get("h"):
                    maten.setdefault(k, (rec["w"], rec["h"]))
    return maten


def _klaar(rec, maat):
    """Mislukt → None; anders meldingen begrensd tot het etiket (eigen maat, anders maat uit een andere variant)."""
    if not rec or not rec["ok"]:
        return None
    w, h = (rec["w"], rec["h"]) if rec.get("w") and rec.get("h") else (maat or (None, None))
    ms = []
    for x in rec["meldingen"]:
        if x["vak"] is None:
            ms.append(x)
        elif (v := begrens(x["vak"], w, h)) is not None:
            ms.append(dict(x, vak=v))
    return ms


def _maat(k, n, t, nn, draws):
    return {"waarde": k / n if n else None, "wilson": wilson(k, n), "bootstrap": bootstrap(t, nn, draws) if n else None}


def bereken(waarheid, uitvoer, lekparen=(), kosten=None, seed=20261030, n_trekkingen=2000, bevroren=None, na_adjudicatie=False):
    """uitvoer: {variant: {run: {kaart: adapterresultaat}}}; ontbrekende kaart = mislukte verwerking. 'b0' is de referentielijn."""
    lek, maten = {tuple(p) for p in lekparen}, _maten(uitvoer)
    klaar = {v: {r: {k: _klaar(rec, maten.get(k)) for k, rec in recs.items()} for r, recs in runs.items()} for v, runs in uitvoer.items()}
    pos = Counter(v["code"] for e in (bevroren or waarheid).values() for v in {x["code"]: x for x in e["vakken"]}.values())
    te_weinig = sorted(c for c in TOP15 if pos[c] < 10)
    alle = sorted(waarheid)
    deel = {"alle": alle, "zonder_lekparen": alle, "aanvulling": [k for k in alle if waarheid[k]["herkomst"].startswith("aanvulling")],
            "kern": [k for k in alle if waarheid[k]["herkomst"].startswith("kern")]}
    if "b0" in uitvoer:
        herpakt = {k for recs in uitvoer["b0"].values() for k, rec in recs.items() if rec and rec.get("herpakt")}
        deel["zonder_herpakt"] = [k for k in alle if k not in herpakt]
    res = {"parameters": {"seed": seed, "trekkingen": n_trekkingen, "na_adjudicatie": na_adjudicatie, "lekparen": len(lek)},
           "te_weinig": te_weinig, "runs": {}, "tabellen": {}, "verwarbaar": {}, "stabiliteit": {}, "oordeel": {}, "rangorde": {},
           "beste_per_keurmerk": {}, "meldingstatus": {}}
    for v, runs in sorted(klaar.items()):
        res["runs"][v] = {r: {"etiketten": len(alle), "mislukt": (f := sum(recs.get(k) is None for k in alle)), "ongeldig": f / len(alle) > 0.02}
                          for r, recs in sorted(runs.items())}
    for naam, kaarten in deel.items():
        draws = trekkingen([waarheid[k]["gln"] for k in kaarten], seed, n_trekkingen)
        tab, verw, stab, oord = {}, {}, {}, {}
        for v, runs in sorted(klaar.items()):
            if naam == "zonder_herpakt" and v != "b0":
                continue
            tab[v], verw[v], gevonden_paar = {}, {}, {}
            for r, recs in sorted(runs.items()):
                tel, gl, vw, gp = defaultdict(Counter), defaultdict(lambda: defaultdict(Counter)), Counter(), {}
                for k in kaarten:
                    ms, gln = recs.get(k), waarheid[k]["gln"]
                    vakken = waarheid[k]["vakken"]
                    if naam == "zonder_lekparen":
                        vakken = [x for x in vakken if (k, x["code"]) not in lek]
                        ms = None if ms is None else [x for x in ms if (k, x["code"]) not in lek]
                    t = tel_etiket(ms or [], vakken)
                    if naam == "alle" and ms is not None:
                        res["meldingstatus"].setdefault(v, {}).setdefault(r, {})[k] = t["status"]
                    vw.update({f"{a}>{b}": n for (a, b), n in t["verwar"].items()})
                    for c, p in t["per_code"].items():
                        if naam == "zonder_lekparen" and (k, c) in lek:
                            continue
                        g = gl[c]
                        if p["positief"]:
                            gp[(k, c)] = p["gevonden"]
                            tel[c].update(positief=1, gevonden=p["gevonden"])
                            g["gev_t"][gln] += p["gevonden"]; g["gev_n"][gln] += 1
                        elif ms is not None:
                            tel[c].update(negatief=1, vals_alarm=p["onterecht"] > 0)
                            g["va_t"][gln] += p["onterecht"] > 0; g["va_n"][gln] += 1
                        tel[c].update(onterecht=p["onterecht"], geraakt=p["geraakt"], meldingen=p["meldingen"])
                        g["vals_t"][gln] += p["onterecht"]; g["vals_n"][gln] += p["onterecht"] + p["geraakt"]
                tab[v][r] = {}
                for c in TOP15:
                    x, g = tel[c], gl[c]
                    tab[v][r][c] = {**{f: x[f] for f in ("positief", "gevonden", "onterecht", "geraakt", "meldingen", "negatief", "vals_alarm")},
                                    "gemist": x["positief"] - x["gevonden"], "gln": sum(1 for n in g["gev_n"].values() if n),
                                    "gevonden_pct": _maat(x["gevonden"], x["positief"], g["gev_t"], g["gev_n"], draws),
                                    "vals_pct": _maat(x["onterecht"], x["onterecht"] + x["geraakt"], g["vals_t"], g["vals_n"], draws),
                                    "vals_alarm_pct": _maat(x["vals_alarm"], x["negatief"], g["va_t"], g["va_n"], draws)}
                verw[v][r], gevonden_paar[r] = dict(vw), gp
            rs = sorted(gevonden_paar)
            stab[v] = {"wisselt": sum(gevonden_paar[rs[0]][p] != gevonden_paar[rs[1]][p] for p in gevonden_paar[rs[0]]),
                       "paren": len(gevonden_paar[rs[0]])} if len(rs) >= 2 else None
            oord[v] = {c: oordeel([tab[v][r][c] for r in rs], tab[v][rs[0]][c]["gln"], c in te_weinig, na_adjudicatie) for c in TOP15}
        rang, telt = [], [c for c in TOP15 if c not in te_weinig]
        for v in tab:
            if v == "b0":
                continue
            scores = [s for c in telt
                      if (s := min((_score(tab[v][r][c], na_adjudicatie) for r in tab[v]), key=lambda s: -1 if s is None else s)) is not None]
            k, n = min(((sum(tab[v][r][c]["gevonden"] for c in telt), sum(tab[v][r][c]["positief"] for c in telt)) for r in tab[v]),
                       key=lambda kn: kn[0] / kn[1] if kn[1] else math.inf)
            rang.append({"variant": v, "vindt": sum(oord[v][c] in VINDT for c in telt), "beoordeeld": len(telt),
                         "gemiddeld": sum(scores) / len(scores) if scores else None, "kosten": (kosten or {}).get(v),
                         "gepoold": {"gevonden": k, "positief": n, "wilson": wilson(k, n)}, "runs": len(tab[v]),
                         "ongeldige_run": any(x["ongeldig"] for x in res["runs"][v].values())})
        rang.sort(key=lambda x: (-x["vindt"], -(x["gemiddeld"] or 0), math.inf if x["kosten"] is None else x["kosten"], x["variant"]))
        res["tabellen"][naam], res["verwarbaar"][naam], res["stabiliteit"][naam], res["oordeel"][naam], res["rangorde"][naam] = tab, verw, stab, oord, rang
        res["beste_per_keurmerk"][naam] = {c: _beste(tab, c) for c in TOP15}
    res["niet_gelabeld"] = {v: {r: {"onterecht": (o := sum(x["onterecht"] for x in t.values())), "meldingen": (n := sum(x["meldingen"] for x in t.values())),
                                    "waarde": o / n if n else None} for r, t in runs.items()} for v, runs in res["tabellen"]["alle"].items()}
    eerste = [_winnaar_deel(res["rangorde"].get(d)) for d in ("alle", "aanvulling")]
    res["winnaar"] = eerste[0] if eerste[0] == eerste[1] else None  # wisselt de beste tussen alle paren en alleen aanvulling: geen winnaar
    return res


def _beste(tab, c):
    """Beste variant voor keurmerk c (B0 uitgezonderd): hoogste gevonden% in de slechtste run; met het gat tot 80% in procentpunten."""
    kand = [(min(s), v) for v in sorted(tab) if v != "b0" if None not in (s := [tab[v][r][c]["gevonden_pct"]["waarde"] for r in tab[v]])]
    if not kand:
        return None
    p, v = min(kand, key=lambda x: (-x[0], x[1]))
    r = min(tab[v], key=lambda r: tab[v][r][c]["gevonden_pct"]["waarde"])
    return {"variant": v, "run": r, "gevonden": tab[v][r][c]["gevonden"], "positief": tab[v][r][c]["positief"], "waarde": p,
            "gat_pp": round(max(0.0, 80 - 100 * p), 2)}


def _winnaar_deel(rang):
    """§0/§3.7: geen winnaar als de beste een ongeldige run heeft, geen twee runs heeft, of als de gepoolde Wilson-intervallen
    (gevonden over de keurmerken in de rangorde, slechtste run) van de beste twee overlappen."""
    if not rang or rang[0]["ongeldige_run"] or rang[0]["runs"] < 2:
        return None
    if len(rang) > 1:
        a, b = rang[0]["gepoold"]["wilson"], rang[1]["gepoold"]["wilson"]
        if a is None or (b is not None and a[0] <= b[1]):
            return None
    return rang[0]["variant"]


# --- adjudicatie (§0, §6) ---
def adjudicatielijst(waarheid, uitvoer, res, seed=20261030):
    """Blind: (1) niet-gelabelde meldingen (met vak) van alle varianten/runs, per etiket+code ontdubbeld via raakt-ketens;
    (2) gemiste paren van de beste variant per keurmerk (hoogste gevonden%, slechtste run, B0 uitgezonderd). Willekeurige volgorde."""
    maten, leden = _maten(uitvoer), defaultdict(list)
    for v in sorted(uitvoer):
        for r in sorted(uitvoer[v]):
            for k in sorted(uitvoer[v][r]):
                ms = _klaar(uitvoer[v][r][k], maten.get(k))
                if ms is None or k not in waarheid:
                    continue
                t = tel_etiket(ms, waarheid[k]["vakken"])
                for x, goed in zip(t["meldingen"], t["status"]):
                    if not goed and x["vak"] is not None:
                        leden[(k, x["code"])].append({"variant": v, "run": r, "vak": x["vak"]})
    items = []
    for (k, c), ls in sorted(leden.items()):
        for g in _ketens(ls, lambda a, b: raakt(a["vak"], b["vak"]) or raakt(b["vak"], a["vak"])):
            items.append(({"soort": "melding", "kaart": k, "code": c, "vak": g[0]["vak"]}, g))  # leden alleen in de sleutel
    for c in TOP15:
        if not (b := _beste(res["tabellen"]["alle"], c)):
            continue
        beste = b["variant"]
        for k in sorted(waarheid):
            vakken = [x["box"] for x in waarheid[k]["vakken"] if x["code"] == c]
            if not vakken:
                continue
            gemist = [r for r in sorted(uitvoer[beste]) if not tel_etiket(_klaar(uitvoer[beste][r].get(k), maten.get(k)) or [],
                                                                         waarheid[k]["vakken"])["per_code"][c]["gevonden"]]
            if gemist:
                items.append(({"soort": "gemist", "kaart": k, "code": c, "vakken": vakken}, [{"variant": beste, "runs": gemist}]))
    random.Random(seed).shuffle(items)
    lijst, sleutel = [], {}
    for i, (item, s) in enumerate(items, 1):
        lijst.append({"id": f"v{i:03d}", **item}); sleutel[f"v{i:03d}"] = s
    return lijst, sleutel


def _klem(vak, w):
    """Vak begrensd op 8% van de etiketbreedte per zijde, gecentreerd (§1, §6)."""
    out = list(vak)
    if w:
        m = 0.08 * w
        for a, b in ((0, 2), (1, 3)):
            if out[b] - out[a] > m:
                c = (out[a] + out[b]) / 2; out[a], out[b] = c - m / 2, c + m / 2
    return out


def pas_adjudicatie_toe(waarheid, lijst, uitslag, maten, sleutel=None):
    """'ja' op een melding → waarheidsvak (8%-grens) voor alle varianten; 'nee' op een gemist paar → die waarheidsvakken vervallen.
    Het antwoord geldt voor alle leden van de groep (§0): een lid dat geen eerder toegevoegd vak raakt, krijgt een eigen vak."""
    ids = {it["id"] for it in lijst}
    fout = {i: a for i, a in uitslag.items() if i not in ids or a not in ("ja", "nee")}
    if fout:
        raise ValueError(f"adjudicatie: onbekend id of antwoord (alleen 'ja'/'nee'): {fout}")
    w, toegevoegd = copy.deepcopy(waarheid), Counter()
    for it in lijst:
        e, a = w[it["kaart"]], uitslag.get(it["id"])
        if it["soort"] == "gemist" and a == "nee":
            e["vakken"] = [v for v in e["vakken"] if not (v["code"] == it["code"] and v["box"] in it["vakken"])]
        elif it["soort"] == "melding" and a == "ja":
            breed, nieuw = (maten.get(it["kaart"]) or (None,))[0], []
            for vak in [it["vak"]] + [x["vak"] for x in (sleutel or {}).get(it["id"], [])]:
                b = _klem(vak, breed)
                if not any(raakt(vak, n) or iou(b, n) >= 0.5 for n in nieuw):
                    nieuw.append(b)
            e["vakken"] += [{"code": it["code"], "box": b, "grof": False} for b in nieuw]
            toegevoegd[it["code"]] += 1
    return w, dict(toegevoegd)


def omgezet(voor, na):
    """Per variant: meldingen die door de adjudicatie van onterecht naar terecht gingen (alle paren, alle runs)."""
    return {v: sum(not a and b for r, ks in runs.items() for k, st in ks.items() for a, b in zip(st, na["meldingstatus"][v][r][k]))
            for v, runs in voor["meldingstatus"].items()}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--waarheid", required=True); p.add_argument("--ruw", required=True); p.add_argument("--b0")
    p.add_argument("--lekparen"); p.add_argument("--adjudicatie"); p.add_argument("--kosten"); p.add_argument("--uit", required=True)
    p.add_argument("--drempel", type=float, default=0.80); p.add_argument("--seed", type=int, default=20261030)
    p.add_argument("--trekkingen", type=int, default=2000)
    a = p.parse_args(argv)
    waarheid = lees_waarheid(a.waarheid)
    uitvoer = lees_ruw(a.ruw, waarheid, a.drempel)
    if a.b0:  # B0-drempels liggen vast in §2 (0,80 / a2 0,50); --drempel geldt alleen voor K2/K3
        uitvoer["b0"] = {"1": {k: lees_b0(_json(f)) for k in waarheid if (f := Path(a.b0) / f"{k}.json").exists()}}
    lek = json.loads(Path(a.lekparen).read_text()) if a.lekparen else []
    kosten = json.loads(Path(a.kosten).read_text()) if a.kosten else None
    uit = Path(a.uit); uit.mkdir(parents=True, exist_ok=True)
    invoer = {"drempel": a.drempel, "waarheid": a.waarheid, "waarheid_sha256": hashlib.sha256(Path(a.waarheid).read_bytes()).hexdigest(),
              "ruw": a.ruw, "b0": a.b0, "lekparen": a.lekparen, "kosten": a.kosten, "adjudicatie": a.adjudicatie,
              "tel_py_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    res = bereken(waarheid, uitvoer, lek, kosten, a.seed, a.trekkingen)
    lijst, sleutel = adjudicatielijst(waarheid, uitvoer, res, a.seed)
    if a.adjudicatie:
        if json.loads((uit / "adjudicatielijst.json").read_text()) != lijst:
            raise SystemExit("adjudicatielijst.json past niet bij deze invoer (waarheid, ruwe uitvoer, drempel of seed gewijzigd)")
        uitslag = json.loads(Path(a.adjudicatie).read_text())
        w2, toegevoegd = pas_adjudicatie_toe(waarheid, lijst, uitslag, _maten(uitvoer), sleutel)
        na = bereken(w2, uitvoer, lek, kosten, a.seed, a.trekkingen, bevroren=waarheid, na_adjudicatie=True)
        oud = {(k, v["code"]) for k, e in waarheid.items() for v in e["vakken"]}
        na["adjudicatie"] = {"toegevoegd": toegevoegd, "omgezet": omgezet(res, na), "onbeantwoord": sorted({x["id"] for x in lijst} - set(uitslag)),
                             "niet_lekgetoetst": sorted({(k, v["code"]) for k, e in w2.items() for v in e["vakken"]} - oud - {tuple(p) for p in lek}),
                             "voor": {"rangorde": res["rangorde"], "oordeel": res["oordeel"], "winnaar": res["winnaar"]}}
        res, naam = na, "resultaat-na-adjudicatie.json"
    else:
        f = uit / "adjudicatielijst.json"
        if f.exists() and json.loads(f.read_text()) != lijst:
            raise SystemExit(f"{f} bestaat al en wijkt af van de nieuwe lijst; antwoorden horen bij de oude ids. Verplaats hem bewust.")
        f.write_text(json.dumps(lijst, ensure_ascii=False, indent=1))
        (uit / "adjudicatie-sleutel.json").write_text(json.dumps(sleutel, ensure_ascii=False, indent=1))
        naam = "resultaat.json"
    res["parameters"].update(invoer)
    (uit / naam).write_text(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
