#!/usr/bin/env python
"""Stap 4: markdown-tabellen voor RAPPORT.md uit resultaten.json (+ model_B.json als aanwezig). Schrijft <scr>/spike/tabellen.md."""
import sys, json, os, math
SCR = sys.argv[1]; r = json.load(open(f"{SCR}/spike/resultaten.json"))
B = json.load(open(f"{SCR}/spike/model_B.json")) if os.path.exists(f"{SCR}/spike/model_B.json") else None
def pct(k, n): return f"{k}/{n} ({k / n:.0%})" if n else "–"
def wil(k, n, z=1.96):
    p = k / n; den = 1 + z * z / n; c = (p + z * z / (2 * n)) / den; hw = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return f"{max(0, c - hw):.0%}–{min(1, c + hw):.0%}"
L = []
for s in ("F", "E"):
    S = r["splits"][s]; info = S["info"]; M = S["methoden"]
    L.append(f"\n### Splitsing {s}: verdeling per soort\n\n| soort | train | test | GTIN's train | GTIN's test |\n|---|---|---|---|---|")
    for lab, v in info["per_soort"].items():
        mark = " *" if lab in info["soorten_klein"] else ""
        L.append(f"| {lab}{mark} | {v['train']} | {v['test']} | {v['gtin_train']} | {v['gtin_test']} |")
    L.append(f"| **totaal** | **{info['n_train']}** | **{info['n_test']}** | **{info['gtin_train']}** | **{info['gtin_test']}** |")
    L.append(f"\n\\* minder dan 3 test-uitsneden (gemarkeerd, telt wel mee in het totaal). Alleen in train: {', '.join(info['soorten_train_only']) or 'geen'}. Alleen in test: {', '.join(info['soorten_test_only']) or 'geen'}.")
    tA = M["model_A"]["drempelkeuze"]["drempel"]
    for naam, titel, t in (("baseline", "Baseline (ACC-methode)", 0.8), ("model_C", "Model C (train-uitsneden als extra referenties)", 0.8), ("model_A", f"Model A (logistische regressie), drempel {tA}", tA)):
        L.append(f"\n### Splitsing {s}: {titel}\n\n| soort | test | top-1 juist | gevonden ≥ {t} | onterecht ≥ {t} | onder drempel |\n|---|---|---|---|---|---|")
        for lab, v in M[naam]["per_soort"].items():
            g, o = v[f"gevonden@{t}"], v[f"onterecht@{t}"]
            L.append(f"| {lab}{' *' if v['klein'] else ''} | {v['n']} | {pct(v['juist'], v['n'])} | {g} | {o} | {v['n'] - g - o} |")
        T = M[naam]["totaal"]
        L.append(f"| **totaal** | **{T['n']}** | **{pct(T['juist'], T['n'])}** | **{T[f'gevonden@{t}']}** | **{T[f'onterecht@{t}']}** | **{T[f'onder@{t}']}** |")
    # totaaltabel
    L.append(f"\n### Splitsing {s}: totaaltabel ({info['n_test']} test-uitsneden, {info['fam_test']} families)\n")
    L.append("| methode | top-1 juist | Wilson 95% | bootstrap 95% (families) | verschil met baseline (bootstrap 95%) | McNemar p (discordant) | macro-recall | gevonden ≥ 0,80 | onterecht ≥ 0,80 | gevonden bij eigen drempel | onterecht bij eigen drempel | gevonden bij evenveel onterecht als baseline |\n|---|---|---|---|---|---|---|---|---|---|---|---|")
    for naam, titel in (("baseline", "baseline"), ("baseline_beperkt", "baseline beperkt tot train-soorten"), ("model_C", "model C"), ("model_A", f"model A (drempel {tA})")):
        T = M[naam]["totaal"]; mc = T.get("mcnemar"); own = tA if naam == "model_A" else 0.8
        bg = T.get("bij_gelijk_onterecht"); bgs = f"{bg['gevonden']} (drempel {bg['drempel']:.2f})" if bg and bg["drempel"] is not None else ("69 (zelf)" if naam == "baseline" else "–")
        if naam == "baseline": bgs = f"{T['gevonden@0.8']} (zelf, 0,80)"
        L.append(f"| {titel} | {pct(T['juist'], T['n'])} | {T['wilson'][0]:.0%}–{T['wilson'][1]:.0%} | {T['boot_ci'][0]:.0%}–{T['boot_ci'][1]:.0%} | "
                 + (f"{T['boot_ci_verschil'][0]:+.0%}–{T['boot_ci_verschil'][1]:+.0%}" if "boot_ci_verschil" in T else "–")
                 + f" | {f'{mc[chr(112)]:.3f} ({mc[chr(100)+chr(105)+chr(115)+chr(99)+chr(111)+chr(114)+chr(100)+chr(97)+chr(110)+chr(116)]})' if mc else '–'} | {T['macro_recall']:.0%} | {T['gevonden@0.8']} | {T['onterecht@0.8']} | {T[f'gevonden@{own}']} | {T[f'onterecht@{own}']} | {bgs} |")
    if s == "F" and B:
        y = B["y"]; c = B["correct"]; k = sum(c); n = len(c); tB = B["drempelkeuze"]["drempel"]
        bc = r["splits"]["F"]["methoden"]["baseline"]["correct"]; n01 = sum(1 for a, b in zip(bc, c) if a and not b); n10 = sum(1 for a, b in zip(bc, c) if b and not a)
        L.append(f"| model B (fine-tune, drempel {tB}) | {pct(k, n)} | {wil(k, n)} | – | – | zie tekst ({n01 + n10}; baseline-alleen {n01}, B-alleen {n10}) | – | {B['gevonden@0.8']} | {B['onterecht@0.8']} | {B[f'gevonden@{tB}']} | {B[f'onterecht@{tB}']} | – |")
        L.append(f"\n### Splitsing F: Model B (fine-tune) per soort, drempel {tB}\n\n| soort | test | top-1 juist | gevonden ≥ {tB} | onterecht ≥ {tB} |\n|---|---|---|---|---|")
        import collections
        per = collections.defaultdict(lambda: [0, 0, 0, 0])
        for yy, cc, ss in zip(y, c, B["score"]):
            p = per[yy]; p[0] += 1; p[1] += cc; p[2] += cc and ss >= tB; p[3] += (not cc) and ss >= tB
        for lab in sorted(per): p = per[lab]; L.append(f"| {lab} | {p[0]} | {pct(p[1], p[0])} | {p[2]} | {p[3]} |")
        L.append(f"| **totaal** | **{n}** | **{pct(k, n)}** | **{B[f'gevonden@{tB}']}** | **{B[f'onterecht@{tB}']}** |")
open(f"{SCR}/spike/tabellen.md", "w").write("\n".join(L)); print("geschreven tabellen.md", len(L), "regels")
