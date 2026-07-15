"""A1-prototype (research rang 1): Nutri-Score balk-detector + uitvergroot-vakje-lezer.

Deterministische geometrie, geen ML. Strategie (v3, na crop- en full-page-diagnose):
  1. ANKERS: zoek per B-kandidaat (lichtgroen — zeldzaam op verpakkingen) een
     naburige A links en C rechts (kleurvensters gekalibreerd op beide
     drukvarianten). Lokale zoektocht, geen grootste-eerst-caps: grote
     designvlakken duwen het logo anders uit de top.
  2. WARM: D (oranje) en E (rood) overlappen qua hue tussen drukvarianten
     (gemeten D 6-19, E 0-7) -> één warm venster; daarna twee vormen:
     (a) twee losse blokken (uitvergroot vakje heeft een witte ring), of
     (b) één samengesmolten D+E-blok -> splitsen op het kolomprofiel.
  3. LETTER = het vakje met de grootste hoogte; fail-safe drempels
     (ratio-venster + uniformiteit van de rest) tegen gok-gedrag.
  4. Oriëntatie-robuust: 0/90/180/270. Op volledige pagina's GEEN
     morphology-close (overbrugt de witte ring naar gekleurde achtergronden).

Evaluatie: python ns_band_detector.py <dir>  (bestandsnaam = <LETTER>_*.png)
"""
import sys, os, json
import cv2
import numpy as np

# Ankerkleuren, gekalibreerd op de echte ACC-crops (twee drukvarianten):
#   A~55-60 of 72-78 · B~40-46 · C~24
ANCHORS = [
    ("A", [(50, 83)], 50, 35),
    ("B", [(37, 49)], 50, 50),
    ("C", [(20, 31)], 70, 90),
]
# D+E samen: oranje t/m rood, incl. hue-wraparound.
WARM = ([(0, 19), (172, 180)], 70, 60)


def _components(mask, min_area):
    n, lab, stats, cent = cv2.connectedComponentsWithStats(mask, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if a >= min_area:
            out.append({"x": int(x), "y": int(y), "w": int(w), "h": int(h), "a": int(a),
                        "cx": float(cent[i][0]), "cy": float(cent[i][1])})
    return out


def _mask(hsv, ranges, sMin, vMin, close=True):
    m = np.zeros(hsv.shape[:2], np.uint8)
    for hLo, hHi in ranges:
        m |= cv2.inRange(hsv, np.array([hLo, sMin, vMin], np.uint8),
                         np.array([hHi, 255, 255], np.uint8))
    if close:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return m


def _y_overlap(comps):
    return max(q["y"] for q in comps) < min(q["y"] + q["h"] for q in comps)


def _split_warm(warm_mask, comp):
    """Splits een samengesmolten D+E-blok via het kolomprofiel -> (h_D, h_E)."""
    x0, y0, w, h = comp["x"], comp["y"], comp["w"], comp["h"]
    sub = warm_mask[y0:y0 + h, x0:x0 + w]
    col = (sub > 0).sum(axis=0).astype(np.float32)
    if w >= 9:
        k = max(3, w // 15) | 1
        col_s = np.convolve(col, np.ones(k) / k, mode="same")
    else:
        col_s = col
    lo, hi = int(w * 0.25), int(w * 0.75)
    if hi <= lo:
        split = w // 2
    else:
        mid = col_s[lo:hi]
        split = lo + int(np.argmin(mid))
        if col_s[split] > 0.82 * float(col_s.max()):
            split = w // 2
    hD = float(col[:split].max()) if split > 0 else 0.0
    hE = float(col[split:].max()) if split < w else 0.0
    return hD, hE


def _read_oriented(img_bgr, full_page=False):
    """Eén oriëntatie: horizontale balk links->rechts A..E."""
    if full_page:
        mx = max(img_bgr.shape[:2])
        if mx > 3000:
            s = 3000.0 / mx
            img = cv2.resize(img_bgr, (max(1, int(img_bgr.shape[1] * s)),
                                       max(1, int(img_bgr.shape[0] * s))))
        else:
            img = img_bgr
        area_min = 100
    else:
        H0 = 220
        scale = H0 / max(1, img_bgr.shape[0])
        img = cv2.resize(img_bgr, (max(1, int(img_bgr.shape[1] * scale)), H0))
        area_min = img.shape[0] * img.shape[1] * 0.002
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    per = {}
    for letter, ranges, sMin, vMin in ANCHORS:
        per[letter] = _components(_mask(hsv, ranges, sMin, vMin, close=not full_page), area_min)
    warm_mask = _mask(hsv, *WARM, close=not full_page)
    per["W"] = _components(warm_mask, area_min)

    missing = [l for l in ("A", "B", "C", "W") if not per[l]]
    if missing:
        return None, {"reason": f"segment(en) niet gevonden: {missing}"}

    bcands = sorted(per["B"], key=lambda d: -d["a"])[:20]
    best = None  # (score, heights-dict)
    for b in bcands:
        for a in per["A"]:
            if not a["cx"] < b["cx"]:
                continue
            if max(a["w"], b["w"]) > 1.9 * max(1, min(a["w"], b["w"])):
                continue
            if not _y_overlap([a, b]):
                continue
            m0 = (a["w"] + b["w"]) / 2.0
            if not (-0.6 * m0 <= b["x"] - (a["x"] + a["w"]) <= 1.0 * m0):
                continue
            for c in per["C"]:
                if not b["cx"] < c["cx"]:
                    continue
                if not _y_overlap([a, b, c]):
                    continue
                ws = [a["w"], b["w"], c["w"]]
                med_w = float(np.median(ws))
                if max(ws) > 1.9 * max(1, min(ws)):
                    continue
                if not (-0.6 * med_w <= c["x"] - (b["x"] + b["w"]) <= 1.0 * med_w):
                    continue
                abc_score = a["a"] + b["a"] + c["a"]
                abc_h = {"A": float(a["h"]), "B": float(b["h"]), "C": float(c["h"])}
                right = sorted((w for w in per["W"]
                                if w["cx"] > c["cx"] and _y_overlap([a, b, c, w])
                                and w["x"] - (c["x"] + c["w"]) < 2.0 * med_w),
                               key=lambda w: w["cx"])[:6]
                # (a) twee losse warme blokken: D=links, E=rechts (alle paren —
                # ring-fragmentjes kunnen er qua cx tussen zitten).
                for i in range(len(right)):
                    for j in range(i + 1, len(right)):
                        w1, w2 = right[i], right[j]
                        if not (0.6 * med_w <= w1["w"] <= 2.4 * med_w
                                and 0.6 * med_w <= w2["w"] <= 2.4 * med_w):
                            continue
                        if w1["x"] - (c["x"] + c["w"]) > 1.0 * med_w:
                            continue
                        if not (-0.5 * med_w <= w2["x"] - (w1["x"] + w1["w"]) <= 0.8 * med_w):
                            continue
                        score = abc_score + w1["a"] + w2["a"]
                        if best is None or score > best[0]:
                            best = (score, {**abc_h, "D": float(w1["h"]), "E": float(w2["h"])})
                # (b) één samengesmolten D+E-blok -> kolomprofiel-splitsing.
                for w1 in right:
                    if not (1.55 * med_w <= w1["w"] <= 3.4 * med_w):
                        continue
                    if w1["x"] - (c["x"] + c["w"]) > 1.0 * med_w:
                        continue
                    hD, hE = _split_warm(warm_mask, w1)
                    score = abc_score + w1["a"]
                    if best is None or score > best[0]:
                        best = (score, {**abc_h, "D": hD, "E": hE})
    if best is None:
        return None, {"reason": "geen geldige 5-op-een-rij (volgorde/band/gaten)"}

    heights = best[1]
    hs = sorted(heights.values())
    med = float(np.median(hs))
    letter = max(heights, key=heights.get)
    ratio = heights[letter] / max(1.0, med)
    rest = sorted(v for k, v in heights.items() if k != letter)
    # fail-safe: duidelijk uitvergroot maar plausibel, en de rest uniform.
    if ratio < 1.12:
        return None, {"reason": f"geen duidelijk uitvergroot vakje (ratio {ratio:.2f})",
                      "heights": heights}
    if ratio > 2.8:
        return None, {"reason": f"onwaarschijnlijke ratio {ratio:.2f} (achtergrond-match?)",
                      "heights": heights}
    if rest and rest[0] > 0 and rest[-1] / max(1.0, rest[0]) > 1.6:
        return None, {"reason": "niet-vergrote vakjes niet uniform", "heights": heights}
    return letter, {"ratio": round(ratio, 2),
                    "heights": {k: round(v, 1) for k, v in heights.items()},
                    "combo_area": int(best[0])}


def read_nutriscore(img_bgr, full_page=False):
    """Return (letter, info) of (None, reason). Probeert 4 oriëntaties."""
    best = None
    fail = {"reason": "geen geldige lezing in enige oriëntatie"}
    for rot, code in [(0, None), (90, cv2.ROTATE_90_CLOCKWISE),
                      (180, cv2.ROTATE_180), (270, cv2.ROTATE_90_COUNTERCLOCKWISE)]:
        img = img_bgr if code is None else cv2.rotate(img_bgr, code)
        letter, info = _read_oriented(img, full_page=full_page)
        if letter is not None:
            score = info.get("combo_area", 0)
            if best is None or score > best[0]:
                best = (score, letter, {**info, "rotatie": rot})
        elif rot == 0:
            fail = info
    if best is None:
        return None, fail
    return best[1], best[2]


def main(d):
    files = sorted(f for f in os.listdir(d) if f.lower().endswith(".png"))
    ok = wrong = none = 0
    fails = []
    for f in files:
        gt = f.split("_")[0]
        img = cv2.imread(os.path.join(d, f))
        if img is None:
            continue
        letter, info = read_nutriscore(img)
        if letter is None:
            none += 1
            fails.append((f, gt, "GEEN", info.get("reason", "")))
        elif letter == gt:
            ok += 1
        else:
            wrong += 1
            fails.append((f, gt, letter, json.dumps(info)))
    tot = ok + wrong + none
    print(f"totaal {tot} | juist {ok} ({ok/max(1,tot)*100:.0f}%) | fout {wrong} | geen-lezing {none}")
    for f, gt, got, why in fails:
        print(f"  {f}: verwacht {gt}, kreeg {got} — {why}")


if __name__ == "__main__":
    main(sys.argv[1])
