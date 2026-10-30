"""Zet resultaat.json (tel.py) + kostentijd.json om in markdowntabellen (fase-b/tabellen.md). Alleen tellingen, geen beelden.
Gebruik: fb_rapport.py <resultaat.json> <kostentijd.json> <uit.md>"""
import json, sys
TOP = ["BETER_LEVEN_1_STER", "EUROPEAN_V_LABEL_VEGAN", "EU_ORGANIC_FARMING", "FOREST_STEWARDSHIP_COUNCIL_MIX", "GREEN_DOT",
       "MARINE_STEWARDSHIP_COUNCIL_LABEL", "NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C", "PREGNANCY_WARNING",
       "RAINFOREST_ALLIANCE_PEOPLE_NATURE", "RECYCLABLE_GENERAL_CLAIM", "VEGAN", "VEGAN_SOCIETY_VEGAN_LOGO", "WEIDEMELK"]
KORT = {"BETER_LEVEN_1_STER": "Beter Leven 1*", "EUROPEAN_V_LABEL_VEGAN": "V-label vegan", "EU_ORGANIC_FARMING": "EU-bio",
        "FOREST_STEWARDSHIP_COUNCIL_MIX": "FSC Mix", "GREEN_DOT": "Groene Punt", "MARINE_STEWARDSHIP_COUNCIL_LABEL": "MSC",
        "NUTRISCORE_A": "Nutri-Score A", "NUTRISCORE_B": "Nutri-Score B", "NUTRISCORE_C": "Nutri-Score C", "PREGNANCY_WARNING": "Zwangerschap",
        "RAINFOREST_ALLIANCE_PEOPLE_NATURE": "Rainforest All.", "RECYCLABLE_GENERAL_CLAIM": "Recyclebaar", "VEGAN": "Vegan algemeen",
        "VEGAN_SOCIETY_VEGAN_LOGO": "Vegan Society", "WEIDEMELK": "Weidemelk"}
VAR = ["b0", "k1a", "k1b", "k2a", "k2b", "k3b", "k3c", "k4-aa", "k4-ab", "k4-ba", "k4-bb"]
fmt = lambda x: "–" if x is None else f"{x:.1f}"
pct = lambda x: "–" if x is None else f"{100 * x:.0f}"

def slechtste(tab, v, c, maat):
    """Slechtste run voor keurmerk c: laagste gevonden% of hoogste vals%."""
    rs = [x[c] for x in tab[v].values()]
    return min(rs, key=lambda r: r[maat]["waarde"] if r[maat]["waarde"] is not None else 9) if maat == "gevonden_pct" else \
        max(rs, key=lambda r: r[maat]["waarde"] or 0)

def cel(r, maat, k, n):
    m = r[maat]; lo, hi = m["wilson"] if m["wilson"] else (None, None)
    return f"{r[k]}/{n} ({pct(m['waarde'])}%; {pct(lo)}–{pct(hi)})" if n else "–"

def main():
    res = json.load(open(sys.argv[1])); kt = json.load(open(sys.argv[2])); L = []
    tab = res["tabellen"]["alle"]; vs = [v for v in VAR if v in tab]
    L += ["## Hoofdtabel (alle paren; per cel één run: de run met het laagste gevonden%)\n",
          "Celvorm `g/n · o/m`: g van n aanwezige keurmerken op de juiste plek gevonden; o van m meldingen (onterecht + geraakte waarheidsvakken) niet-gelabeld (vals%, bovengrens vóór adjudicatie). Beide getallen uit dezelfde run; het hoogste vals% over de runs staat in de vals-tabel per deelverzameling.\n",
          "| keurmerk | n | GLN | " + " | ".join(vs) + " |", "|---|---:|---:|" + "---|" * len(vs)]
    for c in TOP:
        r0 = next(iter(tab[vs[0]].values()))[c]; cells = []
        for v in vs:
            g = o = slechtste(tab, v, c, "gevonden_pct")
            cells.append(f"{g['gevonden']}/{g['positief']} · {o['onterecht']}/{o['onterecht'] + o['geraakt']}")
        L.append(f"| {KORT[c]} | {r0['positief']} | {r0['gln']} | " + " | ".join(cells) + " |")
    for sub in res["tabellen"]:
        tab = res["tabellen"][sub]; vs = [v for v in VAR if v in tab]
        L += [f"\n## Deelverzameling: {sub}\n", "### Gevonden op de juiste plek (slechtste run; teller/noemer, %, Wilson-95%)\n",
              "| keurmerk | n | GLN | " + " | ".join(vs) + " |", "|---|---:|---:|" + "---|" * len(vs)]
        for c in TOP:
            r0 = next(iter(tab[vs[0]].values()))[c]
            ws = [slechtste(tab, v, c, "gevonden_pct") for v in vs]
            L.append(f"| {KORT[c]} | {r0['positief']} | {r0['gln']} | " + " | ".join(cel(r, "gevonden_pct", "gevonden", r["positief"]) for r in ws) + " |")
        L += ["\n### Niet-gelabelde meldingen als aandeel van de meldingen (vals%, bovengrens vóór adjudicatie; slechtste run)\n",
              "| keurmerk | " + " | ".join(vs) + " |", "|---|" + "---|" * len(vs)]
        for c in TOP:
            cells = []
            for v in vs:
                r = slechtste(tab, v, c, "vals_pct"); n = r["onterecht"] + r["geraakt"]
                cells.append(f"{r['onterecht']}/{n} ({pct(r['vals_pct']['waarde'])}%)" if n else "0/0")
            L.append(f"| {KORT[c]} | " + " | ".join(cells) + " |")
        L += ["\n### Oordeel per keurmerk (vóór adjudicatie)\n", "| keurmerk | " + " | ".join(vs) + " |", "|---|" + "---|" * len(vs)]
        for c in TOP:
            L.append(f"| {KORT[c]} | " + " | ".join(res["oordeel"][sub][v][c] for v in vs) + " |")
        L += ["\n### Rangorde (B0 erbuiten)\n", "| # | variant | keurmerken 'vindt het' (van 12) | gemiddeld gevonden% | gepoold gevonden (Wilson) | kosten/etiket | runs |", "|---:|---|---:|---:|---|---:|---:|"]
        for i, x in enumerate(res["rangorde"][sub], 1):
            g = x["gepoold"]
            L.append(f"| {i} | {x['variant']} | {x['vindt']} | {pct(x['gemiddeld'])}% | {g['gevonden']}/{g['positief']} ({pct(g['wilson'][0])}–{pct(g['wilson'][1])}%) | "
                     f"{'–' if x['kosten'] is None else '$%.3f' % x['kosten']} | {x['runs']}{' ONGELDIG' if x['ongeldige_run'] else ''} |")
        L.append(f"\nWinnaar volgens regel: **{res.get('winnaar', {}).get(sub) if isinstance(res.get('winnaar'), dict) else res.get('winnaar')}**")
        if res["stabiliteit"].get(sub):
            L.append("\nStabiliteit (paren met wisselend gevonden ja/nee tussen run 1 en 2): " + ", ".join(
                f"{v} {s['wisselt']}/{s['paren']}" for v, s in res["stabiliteit"][sub].items() if s))
    L += ["\n## Niet-gelabelde meldingen per variant (alle paren, per run)\n", "| variant | run | niet-gelabeld / meldingen |", "|---|---:|---|"]
    for v, runs in res.get("niet_gelabeld", {}).items():
        for r, x in runs.items():
            L.append(f"| {v} | {r} | {x['onterecht']}/{x['meldingen']} ({pct(x['onterecht'] / x['meldingen'] if x['meldingen'] else None)}%) |")
    L += ["\n## Verwarbare paren (melding van X op waarheidsvak van Y; alle paren)\n"]
    for v, runs in res["verwarbaar"]["alle"].items():
        for r, x in runs.items():
            if x: L.append(f"- {v} run {r}: " + ", ".join(f"{k} {n}" for k, n in sorted(x.items())))
    L += ["\n## Kosten en tijd per etiket (CAP-4; tijd = stap 1 + stap 2, seconden)\n",
          "| variant/run | etiketten | mislukt | kosten totaal | kosten/etiket | tijd mediaan | p90 | max | >165 s | piekgeheugen MB |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for k, s in sorted(kt.items()):
        L.append(f"| {k} | {s['etiketten']} | {s['mislukt']} | ${s['kosten_totaal']:.2f} | {'–' if s['kosten_per_etiket'] is None else '$%.4f' % s['kosten_per_etiket']} | {fmt(s['tijd_mediaan'])} | {fmt(s['tijd_p90'])} | {fmt(s['tijd_max'])} | {s['boven_165s']} | {s.get('piek_rss_mb') or '–'} |")
    open(sys.argv[3], "w").write("\n".join(L) + "\n"); print("geschreven", sys.argv[3])

if __name__ == "__main__":
    main()
