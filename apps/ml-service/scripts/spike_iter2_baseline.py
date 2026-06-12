#!/usr/bin/env python3
"""
Story 12.3 iteration-2 — STEP 1: re-measure the deployed effb0 embedding baseline
on the BROADENED verdict set (78 clean real crops / 24 classes).

This establishes the top-1 bar that iter2's fine-tuned head must beat. Runs INSIDE
the ML container (needs model_manager, db_service, storage, the reference library +
pgvector index). Read-only: no DB/storage mutation.

The verdict set is passed as JSON: a list of {"label": <t3777_code>, "crop_path":
<minio-key>} rows — produced from
  SELECT DISTINCT label, crop_path FROM training_data
  WHERE active=true AND crop_path IS NOT NULL
``label`` is the human-corrected ground truth (trust it, not the crop filename).

Metric = top-1 rank (threshold-free, scale-invariant — stap0 rejected accept@0.75
as backbone-confounded). Reports BOTH:
  - micro top-1: correct / total crops (RECYCLABLE-dominated, 26/78)
  - macro top-1: mean of per-class top-1 (the HEADLINE — avoids RECYCLABLE swamp)
Also reports top-5 (is the right code at least near?) and the median similarity of
the correct reference, to characterise the embedding's separation.

Usage (in container):
  python3 spike_iter2_baseline.py --verdict /tmp/verdict-78.json --out /tmp/iter2-baseline.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional

import numpy as np

# Repo root so `app.*` imports resolve (scripts/ lives under apps/ml-service)
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


async def run(verdict_path: str, out_path: Optional[str]) -> Dict[str, Any]:
    from app.ml.model_manager import model_manager
    from app.services.database import db_service
    from app.services.storage import storage_service
    from app.services.classification import _to_pil

    import cv2  # noqa: F401  (ensures cv2 present like the other harnesses)

    # Load the embedding model exactly like the live uvicorn workers / the 12.2
    # harness do — generate_embedding raises "model not loaded" otherwise.
    if not model_manager.is_loaded:
        await model_manager.load_models()

    with open(verdict_path) as fh:
        verdict: List[Dict[str, str]] = json.load(fh)

    # Reference library size (context for the rank).
    ref_n = len(await db_service.get_active_reference_logos())

    per_class_total: Dict[str, int] = defaultdict(int)
    per_class_top1: Dict[str, int] = defaultdict(int)
    per_class_top5: Dict[str, int] = defaultdict(int)
    correct_sims: List[float] = []      # similarity of the matching reference, when top-1 correct
    records: List[Dict[str, Any]] = []
    load_fail = 0
    emb_dim: Optional[int] = None

    for row in verdict:
        label = row["label"]
        key = row["crop_path"]
        try:
            data = storage_service.get_training_image(key)
            arr = np.frombuffer(data, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        except Exception as exc:  # storage/decoding failure -> count, don't crash
            load_fail += 1
            records.append({"label": label, "crop_path": key, "error": str(exc)[:120]})
            continue
        if img is None or img.size == 0:
            load_fail += 1
            records.append({"label": label, "crop_path": key, "error": "decode-none"})
            continue

        emb = await model_manager.generate_embedding(_to_pil(img))
        emb = np.asarray(emb, dtype=np.float32)
        emb_dim = int(emb.shape[0])
        # Rank the full library (threshold 0 -> pure ranking, no open-set cut).
        hits = await db_service.find_similar_references(embedding=emb, limit=5, threshold=0.0)
        codes = [h["t3777_code"] for h in hits]
        sims = [h["similarity"] for h in hits]

        per_class_total[label] += 1
        top1 = bool(codes and codes[0] == label)
        top5 = label in codes
        if top1:
            per_class_top1[label] += 1
            correct_sims.append(sims[0])
        if top5:
            per_class_top5[label] += 1

        records.append({
            "label": label,
            "crop_path": key,
            "top1_code": codes[0] if codes else None,
            "top1_sim": round(sims[0], 4) if sims else None,
            "top1_correct": top1,
            "top5_correct": top5,
            "top5_codes": codes,
        })

    total = sum(per_class_total.values())
    micro_top1 = sum(per_class_top1.values()) / max(1, total)
    micro_top5 = sum(per_class_top5.values()) / max(1, total)
    class_top1_rates = {c: per_class_top1[c] / per_class_total[c] for c in per_class_total}
    class_top5_rates = {c: per_class_top5[c] / per_class_total[c] for c in per_class_total}
    macro_top1 = sum(class_top1_rates.values()) / max(1, len(class_top1_rates))
    macro_top5 = sum(class_top5_rates.values()) / max(1, len(class_top5_rates))

    summary = {
        "verdict_crops": total,
        "verdict_classes": len(per_class_total),
        "reference_library_size": ref_n,
        "load_failures": load_fail,
        "embedding_dim": emb_dim,
        "micro_top1": round(micro_top1, 4),
        "macro_top1": round(macro_top1, 4),
        "micro_top5": round(micro_top5, 4),
        "macro_top5": round(macro_top5, 4),
        "correct_sim_median": round(float(np.median(correct_sims)), 4) if correct_sims else None,
        "correct_sim_p25": round(float(np.percentile(correct_sims, 25)), 4) if correct_sims else None,
        "per_class": {
            c: {
                "n": per_class_total[c],
                "top1": round(class_top1_rates[c], 3),
                "top5": round(class_top5_rates[c], 3),
            }
            for c in sorted(per_class_total, key=lambda k: -per_class_total[k])
        },
    }

    print(json.dumps(summary, indent=2))
    if out_path:
        with open(out_path, "w") as fh:
            json.dump({"summary": summary, "records": records}, fh, indent=2)
        print(f"\nWrote {out_path}", file=sys.stderr)
    return summary


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verdict", required=True, help="JSON list of {label, crop_path}")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    asyncio.run(run(args.verdict, args.out))


if __name__ == "__main__":
    main()
