#!/usr/bin/env python3
"""
Story 12.6 — assemble candidate keurmerk crops for HUMAN labelling.

Turns "label keurmerken on artwork" (an impossible manual hunt) into "accept/reject
pre-surfaced candidates". Runs the existing class-agnostic pipeline (propose ->
classify) over real artwork, keeps regions whose nearest reference is a TOP-N code
above a low recall-biased floor, and emits a per-code labelling queue: the crop PNG
+ predicted code + confidence + bbox + sourceFile. A human (PO) then confirms
ECHT/VALS and tightens the bbox; confirmed ECHT rows become the acceptance dataset
(same schema as gold-set-oogstrun.json) — the clean, frozen eval set 12.5/12.3 need.

Deliberately HIGH-RECALL / low-precision (floor 0.45): the human rejects false
positives; we must not miss true marks. Cost is ~constant in #classes (12.2-AC1).

Usage (container):
  python3 assemble_acceptance_candidates.py --sources /tmp/sources.json \
      --topn /tmp/topn.json --floor 0.45 --outdir /tmp/cand --max 200
sources.json = ["artwork/<gtin>/<file>.png", ...]; topn.json = ["GREEN_DOT", ...]
"""
from __future__ import annotations
import argparse, asyncio, json, os, sys, time
from collections import defaultdict
from typing import Any, Dict, List

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spike_region_proposer import propose_regions  # noqa: E402
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def crop_bgr(img, b):
    x, y, w, h = b; x, y = max(0, x), max(0, y)
    c = img[y:y + h, x:x + w]
    return c if c.size and c.shape[0] >= 4 and c.shape[1] >= 4 else None


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", required=True)
    ap.add_argument("--topn", required=True)
    ap.add_argument("--floor", type=float, default=0.45)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--max", type=int, default=200)
    args = ap.parse_args()

    from app.ml.model_manager import model_manager
    from app.services.database import db_service
    from app.services.storage import storage_service
    from app.services.classification import _to_pil
    if not model_manager.is_loaded:
        await model_manager.load_models()

    topn = set(json.load(open(args.topn)))
    sources = json.load(open(args.sources))[:args.max]
    os.makedirs(args.outdir, exist_ok=True)
    queue: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    t0 = time.perf_counter()

    for si, src in enumerate(sources):
        try:
            data = storage_service.get_training_image(src)
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        except Exception:
            continue
        if img is None:
            continue
        boxes, _ = propose_regions(img)
        for b in boxes:
            c = crop_bgr(img, b)
            if c is None:
                continue
            emb = np.asarray(await model_manager.generate_embedding(_to_pil(c)), np.float32)
            matches = await db_service.find_similar_references(embedding=emb, limit=1, threshold=args.floor)
            if not matches:
                continue
            m = matches[0]; code = m["t3777_code"]
            if code not in topn:
                continue
            cid = f"{code}__{si}_{b[0]}_{b[1]}"
            cv2.imwrite(os.path.join(args.outdir, cid + ".png"), c)
            queue[code].append({
                "candidate_id": cid, "sourceFile": src,
                "bbox": {"x": int(b[0]), "y": int(b[1]), "width": int(b[2]), "height": int(b[3])},
                "predicted_code": code, "confidence": round(float(m["similarity"]), 3),
                "crop": cid + ".png", "label": None,  # human fills ECHT/VALS
            })
        if si % 25 == 0:
            print(f"[{si+1}/{len(sources)}] {sum(len(v) for v in queue.values())} candidates", file=sys.stderr)

    flat = [r for rows in queue.values() for r in rows]
    json.dump({"meta": {"sources": len(sources), "floor": args.floor, "topn": sorted(topn),
                         "candidates": len(flat), "per_code": {k: len(v) for k, v in queue.items()}},
               "candidates": flat}, open(os.path.join(args.outdir, "candidates.json"), "w"), indent=2)
    print(json.dumps({"sources": len(sources), "candidates": len(flat),
                      "per_code": {k: len(v) for k, v in sorted(queue.items())},
                      "seconds": round(time.perf_counter() - t0, 1)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
