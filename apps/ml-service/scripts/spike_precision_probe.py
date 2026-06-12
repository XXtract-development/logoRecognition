#!/usr/bin/env python3
"""
Story 12.3 — PRECISION probe: does adding real-crop references raise false accepts?

Real-crop references sit closer to the query distribution than guide logos, so a
fair worry is that non-keurmerk regions now cross the open-set accept threshold
(0.75) more often. This probe measures the accept rate on region-proposer regions
(12.2 AC3 method) against WHATEVER reference set is currently live — run it once
guide-only, then again after `realref_live.py deploy`, then `revert`.

It reads the live DB (db_service.find_similar_references), so the delta between the
two runs is the precision impact of the real-crop references.

Caveat (honest): the artworks DO contain real keurmerken, so an accept is not
necessarily a false positive — an increase can be a newly-recognised real logo
(good) OR a spurious non-logo match (bad). Without per-region labels the two
can't be fully separated; report the accept-rate delta + the accepted-code mix
and read it alongside the held-out top-1 recall gain.

Read-only w.r.t. the reference library. Usage (container):
  python3 spike_precision_probe.py --n-artworks 12 --threshold 0.75 --out /tmp/prec-guide.json
"""
from __future__ import annotations
import argparse, asyncio, json, os, sys
from collections import Counter
from typing import Any, Dict, List, Optional

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # spike_region_proposer
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


async def run(n_artworks: int, threshold: float, out_path: Optional[str]) -> int:
    import cv2
    from spike_region_proposer import propose_regions
    from app.ml.model_manager import model_manager
    from app.services.database import db_service
    from app.services.synthesis import _load_backgrounds
    from app.services.classification import _to_pil

    if not model_manager.is_loaded:
        await model_manager.load_models()

    backgrounds = await _load_backgrounds(limit=n_artworks)
    print(f"artworks={len(backgrounds)}", file=sys.stderr)

    total_regions = 0
    accepts = 0
    accepted_codes: Counter = Counter()
    sims_all: List[float] = []
    for bi, bg in enumerate(backgrounds):
        img = bg["image"]
        boxes, _ = propose_regions(img)
        for (x, y, w, h) in boxes:
            x, y = max(0, x), max(0, y)
            crop = img[y:y + h, x:x + w]
            if crop.size == 0 or crop.shape[0] < 8 or crop.shape[1] < 8:
                continue
            total_regions += 1
            emb = np.asarray(await model_manager.generate_embedding(_to_pil(crop)), dtype=np.float32)
            hits = await db_service.find_similar_references(embedding=emb, limit=1, threshold=0.0)
            if hits:
                sim = float(hits[0]["similarity"])
                sims_all.append(sim)
                if sim >= threshold:
                    accepts += 1
                    accepted_codes[hits[0]["t3777_code"]] += 1
        print(f"  artwork {bi+1}/{len(backgrounds)}: regions so far={total_regions} accepts={accepts}", file=sys.stderr)

    out = {
        "note": "accept rate on proposer regions vs the currently-live reference set",
        "threshold": threshold,
        "artworks": len(backgrounds),
        "total_regions": total_regions,
        "accepts_ge_threshold": accepts,
        "accept_rate": round(accepts / max(1, total_regions), 4),
        "sim_p50": round(float(np.percentile(sims_all, 50)), 4) if sims_all else None,
        "sim_p95": round(float(np.percentile(sims_all, 95)), 4) if sims_all else None,
        "sim_p99": round(float(np.percentile(sims_all, 99)), 4) if sims_all else None,
        "accepted_code_mix": dict(accepted_codes.most_common(15)),
    }
    print(json.dumps(out, indent=2))
    if out_path:
        json.dump(out, open(out_path, "w"), indent=2)
        print(f"\nWrote {out_path}", file=sys.stderr)
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-artworks", type=int, default=12)
    ap.add_argument("--threshold", type=float, default=0.75)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    sys.exit(asyncio.run(run(args.n_artworks, args.threshold, args.out)))


if __name__ == "__main__":
    main()
