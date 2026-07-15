"""Story 12.22 — Nutri-Score-familie-head: deterministische balk-lezer.

Leest de Nutri-Score-letter uit een crop of volledige artwork-pagina via
kleurgeometrie (géén ML): vind de gestandaardiseerde 5-vakjes-balk
(donkergroen→lichtgroen→geel→oranje→rood) en lees de letter als het
UITvergrote vakje. Gevalideerd in spike 12.21b op echte ACC-data:
45 crops → 42 juist / 0 fout; 142 volledige pagina's → 91 juist / 2 fout /
49 geen-lezing (97,8% precisie bij lezing; 0,32 s/pagina op CPU) — tegenover
1/6 voor de embedding-route (spike 12.21). Zie ook de technical research
(research-technical-logo-herkenning-2026-07-14.md §3/§4.4).

Ontwerp (lessen uit de spike-iteraties, 12.21b §"Iteratie-lessen"):
  1. ANKERS: zoek per B-kandidaat (lichtgroen — zeldzaam op verpakkingen) een
     naburige A links en C rechts. Kleurvensters zijn gekalibreerd op de twee
     op ACC gemeten DRUKvarianten (drukwerk wijkt af van de officiële hex):
     variant 1: A~55-60  B~44-46  C~24  D~9-12  E~0-3   (OpenCV H, 0-180)
     variant 2: A~72-78  B~40-44  C~24  D~16    E~4-7
  2. WARM: D (oranje) en E (rood) overlappen qua hue tussen drukvarianten →
     één warm venster; daarna twee vormen: (a) twee losse blokken (het
     uitvergrote vakje heeft een witte ring en is een eigen component), of
     (b) één samengesmolten D+E-blok → splitsen op het kolomprofiel.
  3. FAIL-SAFE: bij twijfel géén lezing (nooit gokken) — ratio-venster
     [min_ratio, 2.8] + uniformiteit van de niet-vergrote vakjes.
  4. Oriëntatie-robuust: 0/90/180/270 graden (verticale en ondersteboven-
     gedrukte varianten komen in de echte data voor).
  5. Volledige pagina's: GEEN morphology-close (overbrugt de witte ring naar
     gekleurde achtergronden, bv. rood fruit) en een absolute minimum-
     segmentoppervlakte.

Env:
  NUTRISCORE_READER_MIN_RATIO  ratio-vloer voor "duidelijk uitvergroot".
      Default 1.12 (review-stand). Kruischeck-stand 1.18 = 0 fouten gemeten
      op de 142-pagina-validatie (12.21b §ratio-drempel).

Bekende beperkingen (bewust, met vangnet-route): monochrome drukken (0%
kleurverzadiging) en sterk afwijkende drukvarianten geven "geen lezing" —
daarvoor is het A2-vangnet (klein 5-klasse-model, NutriGreen) de vervolg-story.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.core.logging import logger

DEFAULT_MIN_RATIO = 1.12
MAX_RATIO = 2.8

# Ankerkleuren (letter, [(H-lo, H-hi), ...], S-min, V-min) — beide drukvarianten.
_ANCHORS = [
    ("A", [(50, 83)], 50, 35),
    ("B", [(37, 49)], 50, 50),
    ("C", [(20, 31)], 70, 90),
]
# D+E samen: oranje t/m rood, incl. hue-wraparound.
_WARM = ([(0, 19), (172, 180)], 70, 60)


def _min_ratio(min_ratio: Optional[float]) -> float:
    """Ratio-vloer: param > env > default; sanity-geclamped op >= 1.05 zodat een
    typo (bv. '0') nooit meetruis als 'uitvergroot vakje' laat doorgaan."""
    value = None
    if min_ratio is not None:
        value = float(min_ratio)
    else:
        raw = os.environ.get("NUTRISCORE_READER_MIN_RATIO")
        if raw:
            try:
                value = float(raw)
            except ValueError:
                logger.warning(
                    "Ongeldige NUTRISCORE_READER_MIN_RATIO — default gebruikt",
                    extra={"raw": raw, "default": DEFAULT_MIN_RATIO},
                )
    if value is None:
        return DEFAULT_MIN_RATIO
    return max(1.05, value)


def _components(mask: np.ndarray, min_area: float) -> List[Dict[str, Any]]:
    n, _lab, stats, cent = cv2.connectedComponentsWithStats(mask, 8)
    out: List[Dict[str, Any]] = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if a >= min_area:
            out.append({"x": int(x), "y": int(y), "w": int(w), "h": int(h), "a": int(a),
                        "cx": float(cent[i][0]), "cy": float(cent[i][1])})
    return out


def _mask(hsv: np.ndarray, ranges, s_min: int, v_min: int, close: bool) -> np.ndarray:
    m = np.zeros(hsv.shape[:2], np.uint8)
    for h_lo, h_hi in ranges:
        m |= cv2.inRange(hsv, np.array([h_lo, s_min, v_min], np.uint8),
                         np.array([h_hi, 255, 255], np.uint8))
    if close:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return m


def _y_overlap(comps) -> bool:
    return max(q["y"] for q in comps) < min(q["y"] + q["h"] for q in comps)


def _split_warm(warm_mask: np.ndarray, comp: Dict[str, Any]) -> Tuple[float, float]:
    """Splits een samengesmolten D+E-blok via het kolomprofiel → (h_D, h_E)."""
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
        # geen duidelijk dal (aaneengesloten even hoge vakjes) → middensplitsing
        if col_s[split] > 0.82 * float(col_s.max()):
            split = w // 2
    h_d = float(col[:split].max()) if split > 0 else 0.0
    h_e = float(col[split:].max()) if split < w else 0.0
    return h_d, h_e


def _read_oriented(img_bgr: np.ndarray, full_page: bool, min_ratio: float):
    """Eén oriëntatie: horizontale balk links→rechts A..E."""
    if full_page:
        mx = max(img_bgr.shape[:2])
        if mx > 3000:
            s = 3000.0 / mx
            img = cv2.resize(img_bgr, (max(1, int(img_bgr.shape[1] * s)),
                                       max(1, int(img_bgr.shape[0] * s))))
        else:
            img = img_bgr
        area_min: float = 100.0
    else:
        h0 = 220
        scale = h0 / max(1, img_bgr.shape[0])
        img = cv2.resize(img_bgr, (max(1, int(img_bgr.shape[1] * scale)), h0))
        area_min = img.shape[0] * img.shape[1] * 0.002
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    per: Dict[str, List[Dict[str, Any]]] = {}
    for letter, ranges, s_min, v_min in _ANCHORS:
        per[letter] = _components(_mask(hsv, ranges, s_min, v_min, close=not full_page), area_min)
    warm_mask = _mask(hsv, *_WARM, close=not full_page)
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

                def _seg(comp):
                    return {"h": float(comp["h"]), "top": float(comp["y"]),
                            "bot": float(comp["y"] + comp["h"]),
                            "fill": comp["a"] / max(1.0, comp["w"] * comp["h"])}

                abc_seg = {"A": _seg(a), "B": _seg(b), "C": _seg(c)}
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
                            best = (score, {**abc_seg, "D": _seg(w1), "E": _seg(w2)})
                # (b) één samengesmolten D+E-blok → kolomprofiel-splitsing (het
                # blok levert de gedeelde top/bot als bounds voor beide helften).
                for w1 in right:
                    if not (1.55 * med_w <= w1["w"] <= 3.4 * med_w):
                        continue
                    if w1["x"] - (c["x"] + c["w"]) > 1.0 * med_w:
                        continue
                    h_d, h_e = _split_warm(warm_mask, w1)
                    blk = _seg(w1)
                    score = abc_score + w1["a"]
                    if best is None or score > best[0]:
                        best = (score, {**abc_seg,
                                        "D": {"h": h_d, "top": blk["top"], "bot": blk["bot"], "fill": None},
                                        "E": {"h": h_e, "top": blk["top"], "bot": blk["bot"], "fill": None}})
    if best is None:
        return None, {"reason": "geen geldige 5-op-een-rij (volgorde/band/gaten)"}

    segs = best[1]
    heights = {k: v["h"] for k, v in segs.items()}
    med = float(np.median(sorted(heights.values())))
    letter = max(heights, key=heights.get)
    ratio = heights[letter] / max(1.0, med)
    rest = sorted(v for k, v in heights.items() if k != letter)
    if ratio < min_ratio:
        return None, {"reason": f"geen duidelijk uitvergroot vakje (ratio {ratio:.2f})",
                      "heights": heights}
    if ratio > MAX_RATIO:
        return None, {"reason": f"onwaarschijnlijke ratio {ratio:.2f} (achtergrond-match?)",
                      "heights": heights}
    # Adversarial-review M1: de niet-vergrote vakjes van het echte logo zijn
    # GELIJK van hoogte (was 1.6 — liet oplopende staafdiagrammen door).
    if rest and rest[0] > 0 and rest[-1] / max(1.0, rest[0]) > 1.3:
        return None, {"reason": "niet-vergrote vakjes niet uniform", "heights": heights}
    # Adversarial-review M1 (herzien op echte data): een centrering-eis bleek
    # GEFALSIFICEERD — een officiële drukvariant is bodem-uitgelijnd (het
    # uitvergrote vakje steekt alleen bóven uit; 5 echte crops). De werkende
    # discriminator t.o.v. een staafdiagram is het WITTE LETTER-GLYPH in het
    # vakje: een echte NS-box heeft een gat in het kleurmasker (vul-graad
    # duidelijk < 1), een massieve staaf niet.
    win_fill = segs[letter].get("fill")
    if win_fill is not None and win_fill > 0.96:
        return None, {"reason": f"massief vlak zonder letter-glyph (vul {win_fill:.2f})",
                      "heights": heights}
    return letter, {"ratio": round(ratio, 2),
                    "heights": {k: round(v, 1) for k, v in heights.items()},
                    "combo_area": int(best[0])}


def read_nutriscore(
    img_bgr: np.ndarray,
    full_page: bool = False,
    min_ratio: Optional[float] = None,
) -> Tuple[Optional[str], Dict[str, Any]]:
    """Lees de Nutri-Score-letter uit een BGR-beeld.

    Returns:
        (letter, info) bij een geldige lezing — info bevat ratio/heights/rotatie
        (observability, AC6); (None, {"reason": ...}) bij geen lezing (fail-safe).
    ``min_ratio``-parameter wint van de env `NUTRISCORE_READER_MIN_RATIO`,
    die wint van de default 1.12.
    """
    floor = _min_ratio(min_ratio)
    # Adversarial-review H1: begrens de kosten in het live classify-pad. Een
    # degenerate sliver-bbox (bv. 5×20000 px) zou in crop-modus naar hoogte 220
    # geschaald worden → honderden MB's en >10 s op de gedeelde CPU-host,
    # terwijl er nooit een leesbare balk in zit. Het logo zelf is ~5,5:1
    # (5 vakjes + marge); ruim daarbuiten = per definitie geen lezing.
    h0, w0 = img_bgr.shape[:2]
    if h0 < 8 or w0 < 8:
        return None, {"reason": f"beeld te klein ({w0}x{h0})"}
    aspect = max(h0, w0) / max(1, min(h0, w0))
    if not full_page and aspect > 12.0:
        return None, {"reason": f"implausibele beeldverhouding ({aspect:.0f}:1)"}
    best = None
    fail: Dict[str, Any] = {"reason": "geen geldige lezing in enige oriëntatie"}
    for rot, code in [(0, None), (90, cv2.ROTATE_90_CLOCKWISE),
                      (180, cv2.ROTATE_180), (270, cv2.ROTATE_90_COUNTERCLOCKWISE)]:
        img = img_bgr if code is None else cv2.rotate(img_bgr, code)
        letter, info = _read_oriented(img, full_page=full_page, min_ratio=floor)
        if letter is not None:
            score = info.get("combo_area", 0)
            if best is None or score > best[0]:
                best = (score, letter, {**info, "rotatie": rot})
        elif rot == 0:
            fail = info
    if best is None:
        return None, fail
    return best[1], best[2]
