"""Story 20.2 — Generieke declaratie-gedreven oogst (categorie-3-uitrol en verder).

Generalisatie van het bewezen 12.15-patroon (``queue_harvest_nutriscore_declared``):
de kandidaat-bron is een code->GTIN-lijst-map in MinIO — gebouwd uit een
declaratie-METING (20.1: prod-Mongo als bron van waarheid) — en dus NIET de
mismatch-events. Dat dicht het 20.2-gat: de 17.1-bootstrap haalt kandidaten uit
``declared-not-found``-events, die voor een nooit-eerder-herkend veld per
definitie niet bestaan ("run leeg").

Per (code, gtin)-paar wordt de beste artwork-regio gezocht met de similarity-
pool STRIKT gescoped op de eigen referenties van die code (gids-zaad en/of door
mensen bevestigde echte crops — conditie C/19.9 doet dan vanzelf zijn werk in
``find_similar_references_by_codes``). Het label komt uit de DECLARATIE, nooit
uit de match.

Kernverschillen met de Nutri-Score-variant (bewust):
  * map-formaat ``{"codes": {code: [gtin, ...]}}`` — een GTIN mag onder
    meerdere codes staan (alcohol declareert zwangerschap + niet-rijden + 18+);
    elk (code, gtin)-paar is een eigen werk-eenheid.
  * idempotentie-marker per code (``declared-harvest:<code>``): dezelfde pagina
    mag per gedeclareerde code één kandidaat opleveren, maar nooit twee voor
    dezelfde code (dedup via ``review_item_exists``; READ, draait ook in
    DRY_RUN zodat de telling de echte run voorspelt).
  * geen prioriteits-codes: de scope is al expliciet (env of hele map).

Env (namespace ``DECLARED_HARVEST_``):
  DECLARED_HARVEST_MAP_KEY       MinIO-sleutel van de code->GTINs map
                                  (default flywheel-index/declared-harvest-map.json)
  DECLARED_HARVEST_CODES         comma-lijst; leeg = alle codes uit de map
  DECLARED_HARVEST_FLOOR         cosine-vloer (default 0.60 — gids-zaad-niveau,
                                  patroon 12.15; declaratie is de prior)
  DECLARED_HARVEST_BATCH         (code,gtin)-paren per run (default 400)
  DECLARED_HARVEST_PER_CODE_CAP  max kandidaten per code per run (default 15)
  DECLARED_HARVEST_MAX_SECONDS   tijd-box (default 1000)
  DECLARED_HARVEST_DRY_RUN       1/true/yes -> geen crop-upload, geen INSERT,
                                  geen state-write; kandidaten wel geteld
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

STATE_KEY = "keurmerk-harvest/declared-harvest-state.json"
DECLARED_MAP_KEY = os.environ.get(
    "DECLARED_HARVEST_MAP_KEY", "flywheel-index/declared-harvest-map.json"
)
FLOOR = float(os.environ.get("DECLARED_HARVEST_FLOOR", "0.60"))
BATCH = int(os.environ.get("DECLARED_HARVEST_BATCH", "400"))
PER_CODE_CAP = int(os.environ.get("DECLARED_HARVEST_PER_CODE_CAP", "15"))
MAX_SECONDS = float(os.environ.get("DECLARED_HARVEST_MAX_SECONDS", "1000"))
DRY_RUN = os.environ.get("DECLARED_HARVEST_DRY_RUN", "").lower() in ("1", "true", "yes")
# Story 20.7 — cross-code-discriminatie: verwerp een regio die ONgescopet op een
# ANDERE (naast-liggende, gelijkende) code met minstens deze marge beter lijkt dan
# op de gedeclareerde code. De scoped floor-match garandeert alleen dat de regio
# OP de code lijkt, niet dat hij niet nóg meer op een buur-icoon lijkt (auto/18+/
# zwangerschap staan naast elkaar en lijken ~0,6 op elkaar in de grove embedding).
CROSS_CODE_MARGIN = float(os.environ.get("DECLARED_HARVEST_CROSS_CODE_MARGIN", "0.03"))
HARVEST_CODES = {
    c.strip().upper()
    for c in os.environ.get("DECLARED_HARVEST_CODES", "").split(",")
    if c.strip()
}


def _marker(code: str) -> str:
    """Idempotentie-reason per code — zie moduledoc (AC2)."""
    return f"declared-harvest:{code}"


def _cross_code_rejected(declared_code, declared_sim, open_matches, margin) -> bool:
    """True als een ANDERE code de regio (ongescopet) met >= marge beter matcht
    dan de gedeclareerde code — dan is het een look-alike buur-icoon (Story 20.7).

    Pure beslissing, exhaustief getest. `open_matches` = ongescopete nearest-
    reference-resultaten ({t3777_code, similarity}). Leeg / geen sterkere rivaal
    (o.a. cold-start van andere codes) -> False (behouden).
    """
    for m in open_matches:
        if m.get("t3777_code") != declared_code and float(m.get("similarity", 0.0)) >= declared_sim + margin:
            return True
    return False


def _crop_bgr(img, b):
    """Identiek aan queue_harvest*(.py)'s helper (bewust lokaal)."""
    x, y, w, h = b
    x, y = max(0, x), max(0, y)
    c = img[y : y + h, x : x + w]
    return c if c.size and c.shape[0] >= 4 and c.shape[1] >= 4 else None


def _pick_page(keys):
    """Identiek aan queue_harvest*(.py)'s helper (bewust lokaal)."""
    ks = sorted(k for k in keys if k.lower().endswith((".png", ".jpg", ".jpeg")))
    for k in ks:
        if "converted-0" in k:
            return k
    for k in ks:
        if re.search(r"_0*1\.(png|jpe?g)$", k, re.I):
            return k
    return ks[0] if ks else None


def _load_declared_map(storage_service) -> dict:
    """Laad de code->GTIN-lijst map. Fail-safe: onleesbaar/misvormd -> lege
    dict (0 kandidaten, gerapporteerd; nooit een crash of een gok)."""
    try:
        raw = storage_service.get_training_image(DECLARED_MAP_KEY)
        data = json.loads(raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw)
    except Exception:
        logger.warning(
            "Declaratie-oogst-map niet leesbaar — 0 kandidaten",
            extra={"key": DECLARED_MAP_KEY},
        )
        return {}
    codes = data.get("codes") if isinstance(data, dict) else None
    if not isinstance(codes, dict):
        return {}
    out: dict = {}
    for code, gtins in codes.items():
        code_u = str(code).strip().upper()
        if not code_u or not isinstance(gtins, list):
            continue
        clean = sorted({str(g).strip() for g in gtins if str(g).strip()})
        if clean:
            out[code_u] = clean
    return out


def _scoped_pairs(declared_map: dict) -> list:
    """Deterministische (code, gtin)-parenlijst binnen de env-scope."""
    pairs = []
    for code in sorted(declared_map):
        if HARVEST_CODES and code not in HARVEST_CODES:
            continue
        for gtin in declared_map[code]:
            pairs.append((code, gtin))
    return pairs


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

    declared_map = _load_declared_map(storage_service)

    try:
        state = json.loads(storage_service.get_training_image(STATE_KEY).decode("utf-8"))
    except Exception:
        state = {"next_offset": 0}
    next_offset = int(state.get("next_offset", 0))

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

    # Alleen paren waarvan de GTIN artwork heeft komen in aanmerking.
    pairs = [(c, g) for c, g in _scoped_pairs(declared_map) if g in by_gtin]
    total = len(pairs)

    if next_offset >= total:
        logger.info(
            "Declaratie-oogst compleet — alle scoped (code, GTIN)-paren gedekt",
            extra={"total": total},
        )
        result = {
            "status": "complete",
            "total_pairs": total,
            "next_offset": next_offset,
            "candidates": 0,
            "inserted": 0,
        }
        print(json.dumps(result))
        return result

    end = min(next_offset + BATCH, total)
    queue: dict = defaultdict(list)
    skipped_below_floor = 0
    skipped_duplicate = 0
    skipped_cap = 0
    skipped_cross_code = 0  # Story 20.7 — buur-icoon tegengehouden
    t0 = time.perf_counter()
    i = next_offset
    # Per-pagina-cache binnen de batch: een multi-code-GTIN (alcohol) leest en
    # localiseert zijn pagina maar één keer; de per-code pool-match verschilt.
    page_cache: dict = {}
    while i < end:
        if time.perf_counter() - t0 > MAX_SECONDS:
            break
        code, gtin = pairs[i]
        src = _pick_page(by_gtin[gtin])
        i += 1
        if not src:
            continue

        if src in page_cache:
            img, boxes = page_cache[src]
        else:
            try:
                data = storage_service.get_training_image(src)
                img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
            except Exception:
                continue
            if img is None:
                continue
            boxes, _ = propose_regions(img)
            page_cache[src] = (img, boxes)
        if img is None:
            continue

        # AC3: alleen de BESTE regio per paar; de declaratie garandeert de CODE,
        # niet de locatie — geen enkele regio >= floor betekent: overslaan.
        best = None  # (similarity, crop, bbox, embedding)
        for b in boxes:
            c = _crop_bgr(img, b)
            if c is None:
                continue
            emb = np.asarray(await model_manager.generate_embedding(_to_pil(c)), np.float32)
            kp = keurmerk_probability(emb)
            if kp is not None and kp < GATE_THRESHOLD:
                continue
            matches = await db_service.find_similar_references_by_codes(
                embedding=emb,
                t3777_codes=[code],
                limit=1,
                threshold=FLOOR,
            )
            if not matches:
                continue
            sim = float(matches[0]["similarity"])
            if best is None or sim > best[0]:
                best = (sim, c, b, emb)

        if best is None:
            skipped_below_floor += 1
            continue

        sim, crop, bbox, best_emb = best

        # Story 20.7 — cross-code-guard: matcht de gekozen regio ONgescopet op een
        # ANDERE code duidelijk beter, dan is het een buur-icoon → verwerpen.
        open_matches = await db_service.find_similar_references(
            embedding=best_emb, limit=3, threshold=0.0
        )
        if _cross_code_rejected(code, sim, open_matches, CROSS_CODE_MARGIN):
            skipped_cross_code += 1
            continue

        if len(queue[code]) >= PER_CODE_CAP:
            skipped_cap += 1
            continue

        # AC2/AC4 — idempotentie per code: READ, draait ook in DRY_RUN mee.
        exists = await db_service.review_item_exists(
            gtin=gtin, reason=_marker(code), source_file=src
        )
        if exists:
            skipped_duplicate += 1
            continue

        queue[code].append(
            {
                "gtin": gtin,
                "bbox": {
                    "x": int(bbox[0]),
                    "y": int(bbox[1]),
                    "width": int(bbox[2]),
                    "height": int(bbox[3]),
                },
                "confidence": round(sim, 3),
                "sourceFile": src,
                "crop": crop,
                "cid": f"{code}__{i}_{bbox[0]}_{bbox[1]}",
            }
        )
    reached = i

    candidate_count = sum(len(v) for v in queue.values())

    inserted = 0
    if not DRY_RUN:
        async with db_service.pool.acquire() as conn:
            for code, items in queue.items():
                for r in items:
                    ok, buf = cv2.imencode(".png", r["crop"])
                    if not ok:
                        continue
                    crop_key = f"artwork-crops/{r['gtin']}/20_2_{r['cid']}.png"
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
                        "embedding-declared",
                        _marker(code),
                        r["sourceFile"],
                    )
                    inserted += 1

        state["next_offset"] = reached
        state["total_pairs"] = total
        storage_service.put_training_image(
            STATE_KEY, json.dumps(state).encode("utf-8"), "application/json"
        )

    result = {
        "dry_run": DRY_RUN,
        "candidates": candidate_count,
        "inserted": inserted,
        "skipped_below_floor": skipped_below_floor,
        "skipped_duplicate": skipped_duplicate,
        "skipped_cap": skipped_cap,
        "skipped_cross_code": skipped_cross_code,
        "total_pairs": total,
        "from_offset": next_offset,
        "to_offset": reached,
        "remaining": max(0, total - reached),
        "per_code": {c: len(v) for c, v in queue.items()},
        "seconds": round(time.perf_counter() - t0, 1),
    }
    logger.info("Declaratie-oogst batch klaar", extra=result)
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    asyncio.run(run_batch())
