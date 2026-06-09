#!/usr/bin/env python3
"""
Story 12.2 spike — stappen 2-5 measurement harness (AC1 + AC2 + AC3).

Runs INSIDE the ML container (needs cv2, model_manager, db_service, storage,
the reference library + pgvector index). Reuses the real production pieces:
  - propose_regions      (spike_region_proposer.py, class-agnostic trap-1)
  - model_manager.generate_embedding + db_service.find_similar_references (trap-2)
  - classify_crop        (embed -> pgvector -> open-set UNKNOWN marking)
  - tile_image / prepare_scaled_templates / match_templates  (template baseline)

Nothing here mutates the DB or storage. The N-scaling for the region-proposer
search term is simulated IN MEMORY (a conservative brute-force upper bound vs
production ivfflat which is sublinear). The template-match baseline is scaled by
REPLICATING the real reference templates x k — a faithful linear-in-#classes
measurement on this hardware, no DB writes.

Usage (in container):
  python3 spike_pipeline_eval.py ac1 --image-key <storage_path>
  python3 spike_pipeline_eval.py goldset --gold /tmp/gold-set-oogstrun.json [--limit N] [--out /tmp/ac2ac3.json]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # find spike_region_proposer
from spike_region_proposer import propose_regions  # noqa: E402

# Repo root so `app.*` imports resolve (scripts/ lives under apps/ml-service)
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

IOU_MATCH = 0.5  # a proposal "covers" a gold bbox at IoU >= 0.5


# --------------------------------------------------------------------------- #
# geometry helpers
# --------------------------------------------------------------------------- #
def iou_xywh(a: Tuple[int, int, int, int], b: Tuple[int, int, int, int]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x1, y1 = max(ax, bx), max(ay, by)
    x2, y2 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    iw, ih = max(0, x2 - x1), max(0, y2 - y1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    return inter / float(aw * ah + bw * bh - inter)


def crop_bgr(img: np.ndarray, box: Tuple[int, int, int, int]) -> Optional[np.ndarray]:
    x, y, w, h = box
    x, y = max(0, x), max(0, y)
    c = img[y:y + h, x:x + w]
    if c.size == 0 or c.shape[0] < 4 or c.shape[1] < 4:
        return None
    return c


# --------------------------------------------------------------------------- #
# AC1 — cost decoupling
# --------------------------------------------------------------------------- #
async def run_ac1(image_key: str) -> Dict[str, Any]:
    from app.ml.model_manager import model_manager
    from app.services.database import db_service
    from app.services.storage import storage_service
    from app.api.artwork import _load_reference_templates
    from app.services.localization import (
        LOCALIZE_OVERLAP,
        LOCALIZE_TILE_SIZE,
        LOCALIZE_MIN_SCORE,
        match_templates,
        prepare_scaled_templates,
        tile_image,
    )
    from app.services.classification import _to_pil

    if not model_manager.is_loaded:
        await model_manager.load_models()

    data = storage_service.get_training_image(image_key)
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"cannot decode {image_key}")
    H, W = img.shape[:2]

    # ---- region-proposer path (trap 1) -----------------------------------
    boxes, pstats = propose_regions(img)

    # ---- trap 2: embed every region once (cost is class-INDEPENDENT) ------
    crops = [c for c in (crop_bgr(img, b) for b in boxes) if c is not None]
    t0 = time.perf_counter()
    embs: List[np.ndarray] = []
    for c in crops:
        e = await model_manager.generate_embedding(_to_pil(c))
        embs.append(np.asarray(e, dtype=np.float32))
    embed_ms = (time.perf_counter() - t0) * 1000.0
    dim = int(embs[0].shape[0]) if embs else 0
    per_region_embed_ms = embed_ms / max(1, len(crops))

    # ---- trap 2: REAL pgvector search at the current library size --------
    real_n = len(await db_service.get_active_reference_logos())
    t0 = time.perf_counter()
    for e in embs:
        await db_service.find_similar_references(embedding=e, limit=1, threshold=0.0)
    real_search_ms = (time.perf_counter() - t0) * 1000.0

    # ---- trap 2: in-memory brute-force search at simulated N (upper bound)
    # brute force is LINEAR in N; production ivfflat is sublinear, so these
    # numbers OVER-state the class-dependent term -> only strengthens "~const".
    sim_curve: Dict[int, float] = {}
    if embs and dim:
        EM = np.stack(embs).astype(np.float32)
        EM /= (np.linalg.norm(EM, axis=1, keepdims=True) + 1e-9)
        rng = np.random.default_rng(12)
        for N in (5, 50, 200, 894):
            ref = rng.standard_normal((N, dim)).astype(np.float32)
            ref /= (np.linalg.norm(ref, axis=1, keepdims=True) + 1e-9)
            t0 = time.perf_counter()
            for _ in range(3):  # average a few passes
                sims = EM @ ref.T          # (regions x N) cosine
                _ = sims.argmax(axis=1)
            sim_curve[N] = (time.perf_counter() - t0) * 1000.0 / 3.0

    # ---- region-proposer TOTAL per-image latency at each N ----------------
    proposer_total = {
        N: round(pstats["propose_ms"] + embed_ms + sim_curve.get(N, 0.0), 1)
        for N in (5, 50, 200, 894)
    }

    # ---- template-match baseline: REAL measure at the real lib, scaled ----
    templates = await _load_reference_templates()
    base_n = len(templates)
    tiles = tile_image(img, tile_size=LOCALIZE_TILE_SIZE, overlap=LOCALIZE_OVERLAP)
    variants = prepare_scaled_templates(templates, tile_size=LOCALIZE_TILE_SIZE)
    t0 = time.perf_counter()
    for tile in tiles:
        match_templates(tile["image"], variants, min_score=LOCALIZE_MIN_SCORE)
    base_match_ms = (time.perf_counter() - t0) * 1000.0
    per_class_ms = base_match_ms / max(1, base_n)  # linear in #templates
    baseline_total = {N: round(per_class_ms * N, 1) for N in (5, 50, 200, 894)}

    return {
        "image": image_key,
        "dims": f"{W}x{H}",
        "proposer": {
            "propose_ms": pstats["propose_ms"],
            "regions": pstats["proposed"],
            "embedded_regions": len(crops),
            "embed_total_ms": round(embed_ms, 1),
            "per_region_embed_ms": round(per_region_embed_ms, 2),
            "embedding_dim": dim,
            "real_pgvector_n": real_n,
            "real_pgvector_search_ms_total": round(real_search_ms, 2),
            "inmemory_search_ms_by_N": {k: round(v, 3) for k, v in sim_curve.items()},
            "total_ms_by_N": proposer_total,
        },
        "baseline_template_match": {
            "measured_templates": base_n,
            "tiles": len(tiles),
            "variants": len(variants),
            "match_ms_measured": round(base_match_ms, 1),
            "per_template_ms": round(per_class_ms, 2),
            "extrapolated_total_ms_by_N": baseline_total,
        },
    }


# --------------------------------------------------------------------------- #
# AC2 + AC3 — gold-set non-regression (decomposed) + open-set
# --------------------------------------------------------------------------- #
async def run_goldset(gold_path: str, limit: Optional[int], out_path: Optional[str]) -> Dict[str, Any]:
    from app.services.classification import (
        classify_crop,
        CLASSIFY_UNKNOWN_CODE,
        CLASSIFY_THRESHOLD_EMBEDDING,
    )
    from app.services.storage import storage_service
    from app.ml.model_manager import model_manager

    if not model_manager.is_loaded:
        await model_manager.load_models()

    gold = json.load(open(gold_path))
    records = gold["records"]
    # group records by sourceFile so we propose ONCE per artwork
    by_src: Dict[str, List[dict]] = defaultdict(list)
    for r in records:
        by_src[r["sourceFile"]].append(r)
    sources = list(by_src.items())
    if limit:
        sources = sources[:limit]

    def accepted(res: Dict[str, Any]) -> bool:
        """Open-set accept: a real code above threshold and not marked uncertain."""
        return (
            res.get("t3777_code") != CLASSIFY_UNKNOWN_CODE
            and not res.get("uncertain", False)
        )

    def center_in(box, gb) -> bool:
        gcx, gcy = gb[0] + gb[2] / 2.0, gb[1] + gb[3] / 2.0
        return box[0] <= gcx <= box[0] + box[2] and box[1] <= gcy <= box[1] + box[3]

    per_record: List[Dict[str, Any]] = []
    confusion: Counter = Counter()        # (gold_code -> predicted) for ECHT, perfect crop
    proposer_hit = 0                       # strict IoU>=0.5
    proposer_hit_iou03 = 0                 # lenient IoU>=0.3
    proposer_surfaced = 0                  # gold center inside ANY proposed box (absorbed/loose)
    echt_total = 0
    vals_total = 0
    vals_rejected = 0                      # VALS crops correctly -> UNKNOWN/uncertain
    classify_correct_perfectcrop = 0
    e2e_correct = 0
    fp_regions = 0                         # proposed regions far from any gold logo, accepted
    fp_proposed_total = 0

    for si, (src, recs) in enumerate(sources):
        try:
            data = storage_service.get_training_image(src)
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        except Exception as exc:
            print(f"[{si+1}/{len(sources)}] FETCH FAIL {src}: {exc}", file=sys.stderr)
            continue
        if img is None:
            print(f"[{si+1}/{len(sources)}] DECODE FAIL {src}", file=sys.stderr)
            continue

        boxes, _ = propose_regions(img)
        gold_boxes = [(r["bbox"]["x"], r["bbox"]["y"], r["bbox"]["width"], r["bbox"]["height"]) for r in recs]

        # --- per gold record: proposer recall, perfect-crop classify, e2e ---
        for r, gb in zip(recs, gold_boxes):
            label = r["label"]
            gold_code = r["t3777Code"]
            # best-overlapping proposal
            best_iou, best_box = 0.0, None
            for b in boxes:
                i = iou_xywh(b, gb)
                if i > best_iou:
                    best_iou, best_box = i, b
            covered = best_iou >= IOU_MATCH
            covered_03 = best_iou >= 0.3
            surfaced = any(center_in(b, gb) for b in boxes)

            # perfect-crop classification (decouples embedding from proposer)
            gcrop = crop_bgr(img, gb)
            pc_res = await classify_crop(gcrop) if gcrop is not None else {"t3777_code": CLASSIFY_UNKNOWN_CODE, "uncertain": True, "confidence": 0.0}
            pc_code = pc_res.get("t3777_code")
            pc_acc = accepted(pc_res)

            # end-to-end (proposer box -> classify)
            e2e_code, e2e_acc, e2e_conf = CLASSIFY_UNKNOWN_CODE, False, 0.0
            if covered and best_box is not None:
                bcrop = crop_bgr(img, best_box)
                if bcrop is not None:
                    e2e_res = await classify_crop(bcrop)
                    e2e_code = e2e_res.get("t3777_code")
                    e2e_acc = accepted(e2e_res)
                    e2e_conf = e2e_res.get("confidence", 0.0)

            if label == "ECHT":
                echt_total += 1
                if covered:
                    proposer_hit += 1
                if covered_03:
                    proposer_hit_iou03 += 1
                if surfaced:
                    proposer_surfaced += 1
                confusion[(gold_code, pc_code if pc_acc else CLASSIFY_UNKNOWN_CODE)] += 1
                if pc_acc and pc_code == gold_code:
                    classify_correct_perfectcrop += 1
                if covered and e2e_acc and e2e_code == gold_code:
                    e2e_correct += 1
            else:  # VALS — open-set should reject (UNKNOWN / uncertain)
                vals_total += 1
                if not pc_acc:
                    vals_rejected += 1

            per_record.append({
                "id": r["id"], "label": label, "gold_code": gold_code,
                "proposer_iou": round(best_iou, 3), "covered": covered,
                "perfectcrop_code": pc_code, "perfectcrop_conf": round(pc_res.get("confidence", 0.0), 3),
                "perfectcrop_accepted": pc_acc,
                "e2e_code": e2e_code, "e2e_conf": round(e2e_conf, 3), "e2e_accepted": e2e_acc,
            })

        # --- AC3: proposer-introduced regions far from ANY gold logo --------
        for b in boxes:
            if any(iou_xywh(b, gb) >= 0.1 for gb in gold_boxes):
                continue  # near a (possibly real) logo — skip, not a clean negative
            fp_proposed_total += 1
            bcrop = crop_bgr(img, b)
            if bcrop is None:
                continue
            res = await classify_crop(bcrop)
            if accepted(res):
                fp_regions += 1

        print(f"[{si+1}/{len(sources)}] {src}  regions={len(boxes)} recs={len(recs)}", file=sys.stderr)

    summary = {
        "threshold_embedding": CLASSIFY_THRESHOLD_EMBEDDING,
        "iou_match": IOU_MATCH,
        "sources_evaluated": len(sources),
        "AC2": {
            "echt_total": echt_total,
            "proposer_recall": round(proposer_hit / max(1, echt_total), 3),
            "proposer_recall_iou03": round(proposer_hit_iou03 / max(1, echt_total), 3),
            "proposer_surfaced_center": round(proposer_surfaced / max(1, echt_total), 3),
            "classify_accuracy_perfect_crop": round(classify_correct_perfectcrop / max(1, echt_total), 3),
            "end_to_end_accuracy": round(e2e_correct / max(1, echt_total), 3),
            "confusion_goldcode_to_pred": {f"{k[0]}->{k[1]}": v for k, v in sorted(confusion.items())},
        },
        "AC3": {
            "vals_total": vals_total,
            "vals_open_set_rejected": vals_rejected,
            "vals_reject_rate": round(vals_rejected / max(1, vals_total), 3),
            "nonlogo_regions_evaluated": fp_proposed_total,
            "nonlogo_regions_accepted_as_code": fp_regions,
            "nonlogo_fp_rate": round(fp_regions / max(1, fp_proposed_total), 4),
            "note": "nonlogo FP may include REAL but unlabeled logos (gold-set labels one mark/image)",
        },
    }
    result = {"summary": summary, "per_record": per_record}
    if out_path:
        json.dump(result, open(out_path, "w"), indent=2)
        print(f"\nwrote {out_path}", file=sys.stderr)
    print(json.dumps(summary, indent=2))
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a1 = sub.add_parser("ac1")
    a1.add_argument("--image-key", required=True)
    a1.add_argument("--out")
    gs = sub.add_parser("goldset")
    gs.add_argument("--gold", required=True)
    gs.add_argument("--limit", type=int)
    gs.add_argument("--out")
    args = ap.parse_args()

    if args.cmd == "ac1":
        res = asyncio.run(run_ac1(args.image_key))
        print(json.dumps(res, indent=2))
        if args.out:
            json.dump(res, open(args.out, "w"), indent=2)
    elif args.cmd == "goldset":
        asyncio.run(run_goldset(args.gold, args.limit, args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
