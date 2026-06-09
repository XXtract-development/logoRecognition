#!/usr/bin/env python3
"""
Epic 12 — universe-wide recognizability probe (answers: "can MOST keurmerken be
recognized?"). Runs INSIDE the ML container (needs torch + model_manager).

Embeds the ~884 official GS1-guide reference logos and measures TWO axes:

  A. INTER-CODE COLLISION (clean ref vs clean ref) — a DECISIVE-NEGATIVE test.
     For each code's clean logo, the nearest OTHER-code logo cosine. Codes with a
     cross-code neighbour >= threshold are *inherently confusable* even as pristine
     logos -> a hard floor on the unrecognizable fraction. (Clean separability does
     NOT prove recognizability; collisions DO disprove it. — per review.)

  B. DISTORTED-CROP -> REFERENCE (query-side, the axis that maps to recognition).
     Augment each clean logo to approximate a real artwork crop (downscale, blur,
     JPEG, small rotate), embed, match against the 884 clean references. Reports
     self-cosine (vs the real-crop 0.69 we measured on 4 gold classes), top-1
     accuracy, and accept@0.75. Augmentation realism is a proxy; the 4 gold classes
     anchor it.

Usage (in container): python3 spike_universe_separability.py --logos /tmp/guide-logos --out /tmp/uni.json
"""
from __future__ import annotations
import argparse, asyncio, io, json, os, sys, time
from collections import defaultdict
from typing import Any, Dict, List

import cv2  # noqa: F401  (kept for parity / future)
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

GATE = 0.75
GOLD_CLASSES = {  # the 4 classes we have REAL crop->ref numbers for (anchor the proxy)
    "GREEN_DOT", "FOREST_STEWARDSHIP_COUNCIL_MIX",
    "EUROPEAN_V_LABEL_VEGAN", "EU_ORGANIC_FARMING",
}


def _augment(im: Image.Image, rng: np.random.Generator) -> Image.Image:
    """Approximate a real small artwork crop: downscale hard, blur, JPEG, rotate."""
    im = im.convert("RGB")
    w, h = im.size
    # hard downscale then back up (print/scan at small size — 80% of guide logos < 200px)
    f = float(rng.uniform(0.18, 0.4))
    im = im.resize((max(8, int(w * f)), max(8, int(h * f)))).resize((w, h))
    im = im.filter(ImageFilter.GaussianBlur(radius=float(rng.uniform(0.4, 1.2))))
    im = im.rotate(float(rng.uniform(-6, 6)), expand=False, fillcolor=(255, 255, 255))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=int(rng.integers(45, 75)))
    return Image.open(io.BytesIO(buf.getvalue())).convert("RGB")


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--logos", required=True)
    ap.add_argument("--out")
    args = ap.parse_args()

    from app.ml.model_manager import model_manager
    if not model_manager.is_loaded:
        await model_manager.load_models()

    manifest = json.load(open(os.path.join(args.logos, "manifest.json")))
    entries = manifest["entries"]

    # ---- embed every guide logo ------------------------------------------
    codes: List[str] = []
    embs: List[np.ndarray] = []
    clean_by_code: Dict[str, Image.Image] = {}
    t0 = time.perf_counter()
    for e in entries:
        p = os.path.join(args.logos, e["file"])
        try:
            im = Image.open(p).convert("RGB")
        except Exception:
            continue
        v = await model_manager.generate_embedding(im)
        v = np.asarray(v, np.float32); v /= (np.linalg.norm(v) + 1e-9)
        codes.append(e["code"]); embs.append(v)
        clean_by_code.setdefault(e["code"], im)  # variant 0 = canonical clean ref
    E = np.stack(embs)  # (N,512) unit
    N = len(codes)
    code_arr = np.array(codes)
    print(f"embedded {N} logos / {len(set(codes))} codes in {(time.perf_counter()-t0):.0f}s", file=sys.stderr)

    # ---- A. inter-code collision -----------------------------------------
    S = E @ E.T
    np.fill_diagonal(S, -1.0)
    collide_at = {}
    for thr in (0.65, 0.70, 0.75, 0.80):
        bad = set()
        for i in range(N):
            # nearest neighbour of DIFFERENT code
            mask = code_arr != codes[i]
            if mask.any() and float(S[i][mask].max()) >= thr:
                bad.add(codes[i])
        collide_at[thr] = len(bad)
    uniq = sorted(set(codes))
    # nearest cross-code cosine per code (use the code's clean variant-0 row)
    first_row = {}
    for i, c in enumerate(codes):
        first_row.setdefault(c, i)
    nearest_cross = []
    for c in uniq:
        i = first_row[c]
        mask = code_arr != c
        nearest_cross.append(float(S[i][mask].max()) if mask.any() else -1.0)
    nc = np.array(nearest_cross)

    # ---- B. distorted-crop -> reference (query side) ---------------------
    ref_idx = [first_row[c] for c in uniq]
    R = E[ref_idx]              # (C,512) one clean ref per code
    rcodes = np.array(uniq)
    rng = np.random.default_rng(7)
    self_cos, top1_ok, accept_ok = [], 0, 0
    gold_self = defaultdict(list)
    for c in uniq:
        im = clean_by_code[c]
        aug = _augment(im, rng)
        q = await model_manager.generate_embedding(aug)
        q = np.asarray(q, np.float32); q /= (np.linalg.norm(q) + 1e-9)
        sims = R @ q
        j = int(sims.argmax()); top1 = rcodes[j]; top1_cos = float(sims[j])
        sc = float(R[list(rcodes).index(c)] @ q)
        self_cos.append(sc)
        if top1 == c:
            top1_ok += 1
            if top1_cos >= GATE:
                accept_ok += 1
        if c in GOLD_CLASSES:
            gold_self[c].append(round(sc, 3))
    sc = np.array(self_cos); C = len(uniq)

    def pct(a, p): return round(float(np.percentile(a, p)), 3)
    summary = {
        "n_logos": N, "n_codes": C,
        "A_inter_code_collision": {
            "codes_with_crosscode_neighbour_at": {str(k): {"codes": v, "frac": round(v / C, 3)} for k, v in collide_at.items()},
            "nearest_crosscode_cosine_pctiles": {"p10": pct(nc, 10), "p50": pct(nc, 50), "p90": pct(nc, 90)},
            "reading": "frac at 0.75 = inherently-confusable floor (clean ref collides with ANOTHER code's clean ref)",
        },
        "B_distorted_crop_to_reference": {
            "self_cosine_pctiles": {"p10": pct(sc, 10), "p50": pct(sc, 50), "p90": pct(sc, 90)},
            "top1_accuracy": round(top1_ok / C, 3),
            "accept_at_0.75": round(accept_ok / C, 3),
            "gold4_self_cosine": {k: v for k, v in gold_self.items()},
            "reading": "self-cosine p50 vs the REAL-crop 0.69 (4 gold classes) calibrates the proxy; "
                       "accept@0.75 ~ recognizability ceiling across the universe under distortion",
        },
    }
    print(json.dumps(summary, indent=2))
    if args.out:
        json.dump(summary, open(args.out, "w"), indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
