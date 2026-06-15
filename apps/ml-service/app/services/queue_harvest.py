"""
Story 12.4 — periodic server-side keurmerk-queue harvester.

Runs as a nightly Coolify scheduled task INSIDE the ml-service container
(`python -m app.services.queue_harvest`). Self-contained — no API hop:

  list artwork by GTIN (batched)  ->  propose regions (region_proposer)
   ->  embed (effb0)  ->  keurmerk gate (gate-v2)  ->  nearest reference
   ->  per-code cap  ->  upload crop  ->  INSERT open ArtworkReviewItem

Progress (next GTIN offset) persists in MinIO (`keurmerk-harvest/state.json`)
so each run advances and stops when all GTINs are covered. Time-bounded
(HARVEST_MAX_SECONDS) so a run never overruns the scheduled-task timeout.
Batches are disjoint GTIN sets, so it APPENDS (never clears the queue).

Operating point validated 2026-06-15: gate-v2 + floor 0.85 => ~74% precision,
no RECYCLABLE flood. See 12-4-gate-v2-resultaten.md + keurmerk-harvest-runbook.md.

Env:
  HARVEST_FLOOR          nearest-ref cosine floor (default 0.85)
  HARVEST_BATCH          max GTINs per run (default 400)
  HARVEST_PER_CODE_CAP   max candidates per code per run (default 25)
  HARVEST_MAX_SECONDS    wall-clock budget per run (default 1000)
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import time
from collections import defaultdict

import cv2
import numpy as np

from app.core.logging import logger

MARKER = "12.6 acceptatie-kandidaat (assembler)"
STATE_KEY = "keurmerk-harvest/state.json"
FLOOR = float(os.environ.get("HARVEST_FLOOR", "0.85"))
BATCH = int(os.environ.get("HARVEST_BATCH", "400"))
PER_CODE_CAP = int(os.environ.get("HARVEST_PER_CODE_CAP", "25"))
MAX_SECONDS = float(os.environ.get("HARVEST_MAX_SECONDS", "1000"))
# When set, harvest + classify normally but skip crop upload, DB insert and
# state write — for validating a run without mutating the live queue.
DRY_RUN = os.environ.get("HARVEST_DRY_RUN", "").lower() in ("1", "true", "yes")


def _crop_bgr(img, b):
    x, y, w, h = b
    x, y = max(0, x), max(0, y)
    c = img[y : y + h, x : x + w]
    return c if c.size and c.shape[0] >= 4 and c.shape[1] >= 4 else None


def _pick_page(keys):
    ks = sorted(k for k in keys if k.lower().endswith((".png", ".jpg", ".jpeg")))
    for k in ks:
        if "converted-0" in k:
            return k
    for k in ks:
        if re.search(r"_0*1\.(png|jpe?g)$", k, re.I):
            return k
    return ks[0] if ks else None


async def run_batch() -> dict:
    from app.ml.model_manager import model_manager
    from app.services.classification import _to_pil
    from app.services.database import db_service
    from app.services.keurmerk_gate import GATE_THRESHOLD, keurmerk_probability
    from app.services.region_proposer import propose_regions
    from app.services.storage import storage_service

    if not model_manager.is_loaded:
        await model_manager.load_models()
    storage_service.connect()
    await db_service.connect()

    # progress state
    try:
        state = json.loads(storage_service.get_training_image(STATE_KEY).decode("utf-8"))
    except Exception:
        state = {"next_offset": 0}
    next_offset = int(state.get("next_offset", 0))

    # all artwork GTINs (sorted, deterministic) under the artwork/{gtin}/ convention
    keys = [
        k
        for k in storage_service.list_training_images(prefix="artwork/")
        if k.lower().endswith((".png", ".jpg", ".jpeg"))
    ]
    by_gtin: dict = defaultdict(list)
    for k in keys:
        p = k.split("/")
        if len(p) > 2:
            by_gtin[p[1]].append(k)
    gtins = sorted(by_gtin)
    total = len(gtins)

    if next_offset >= total:
        logger.info("Keurmerk harvest complete — all GTINs covered", extra={"total": total})
        result = {"status": "complete", "total_gtins": total, "next_offset": next_offset}
        print(json.dumps(result))
        return result

    # topn = codes we can actually classify (active references); excludes deactivated (e.g. RECYCLABLE)
    async with db_service.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT t3777_code FROM reference_logos WHERE active=true AND t3777_code IS NOT NULL"
        )
    topn = {r["t3777_code"] for r in rows}

    end = min(next_offset + BATCH, total)
    queue: dict = defaultdict(list)
    t0 = time.perf_counter()
    i = next_offset
    while i < end:
        if time.perf_counter() - t0 > MAX_SECONDS:
            break
        gtin = gtins[i]
        src = _pick_page(by_gtin[gtin])
        i += 1
        if not src:
            continue
        try:
            data = storage_service.get_training_image(src)
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        except Exception:
            continue
        if img is None:
            continue
        boxes, _ = propose_regions(img)
        for b in boxes:
            c = _crop_bgr(img, b)
            if c is None:
                continue
            emb = np.asarray(await model_manager.generate_embedding(_to_pil(c)), np.float32)
            kp = keurmerk_probability(emb)
            if kp is not None and kp < GATE_THRESHOLD:
                continue
            matches = await db_service.find_similar_references(
                embedding=emb, limit=1, threshold=FLOOR
            )
            if not matches:
                continue
            code = matches[0]["t3777_code"]
            if code not in topn or len(queue[code]) >= PER_CODE_CAP:
                continue
            queue[code].append(
                {
                    "gtin": gtin,
                    "bbox": {"x": int(b[0]), "y": int(b[1]), "width": int(b[2]), "height": int(b[3])},
                    "confidence": round(float(matches[0]["similarity"]), 3),
                    "sourceFile": src,
                    "crop": c,
                    "cid": f"{code}__{i}_{b[0]}_{b[1]}",
                }
            )
    reached = i  # next run resumes here

    candidate_count = sum(len(v) for v in queue.values())

    # upload crops + INSERT open review items (append; batches are disjoint GTIN sets)
    inserted = 0
    if not DRY_RUN:
        async with db_service.pool.acquire() as conn:
            for code, items in queue.items():
                for r in items:
                    ok, buf = cv2.imencode(".png", r["crop"])
                    if not ok:
                        continue
                    crop_key = f"artwork-crops/{r['gtin']}/12_6_{r['cid']}.png"
                    storage_service.put_training_image(crop_key, buf.tobytes())
                    await conn.execute(
                        """
                        INSERT INTO artwork_review_items
                          (gtin, t3777_code, crop_path, bbox, confidence, method, reason, source_file, status, updated_at)
                        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, 'open', now())
                        """,
                        r["gtin"],
                        code,
                        crop_key,
                        json.dumps(r["bbox"]),
                        r["confidence"],
                        "embedding",
                        MARKER,
                        r["sourceFile"],
                    )
                    inserted += 1

        state["next_offset"] = reached
        state["total_gtins"] = total
        storage_service.put_training_image(
            STATE_KEY, json.dumps(state).encode("utf-8"), "application/json"
        )

    per_code = {k: len(v) for k, v in sorted(queue.items())}
    result = {
        "dry_run": DRY_RUN,
        "candidates": candidate_count,
        "inserted": inserted,
        "from_offset": next_offset,
        "to_offset": reached,
        "total_gtins": total,
        "remaining": total - reached,
        "per_code": per_code,
        "seconds": round(time.perf_counter() - t0, 1),
    }
    logger.info("Keurmerk harvest batch done", extra=result)
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    asyncio.run(run_batch())
