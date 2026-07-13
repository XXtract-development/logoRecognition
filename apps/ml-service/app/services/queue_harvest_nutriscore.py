"""
Story 12.12 — Nutri-Score vorm-oogst (letter-onafhankelijk).

Volgt uit de 12.11-spike (synthetisch = NO-GO) + de corpus-vindbaarheid-diagnose
(`nutriscore-corpus-vindbaarheid-2026-07-13.md`, GO: ~734 Nutri-Score-achtige
regio's, ~160 C/D-achtig). Het Nutri-Score-logo heeft dezelfde VORM voor alle 5
letters (A-E) — het model kan de letter niet lezen (12.11), een mens wel. Deze
harvest zoekt dus letter-onafhankelijk op de vorm (cosine tegen de gecombineerde
Nutri-Score-referentiepool) en legt elke treffer als OPEN review-item voor; de
mens bevestigt de exacte letter via de bestaande relabel-picker (Story 12.7).
Een bevestigde crop wordt dan — via het bestaande accept->referentie-pad
(19.8/19.12) — een actieve `review-confirmed` `NUTRISCORE_<letter>`-referentie,
die conditie C (Story 19.9) voedt.

Waarom een APART script (niet een env-vlag ín queue_harvest.py, Story 19.10)?
  - queue_harvest.py's `topn`-scoping (top-N-by-volume ∪ sub-k − exclude) is
    zwaar getest (test_queue_harvest_19_10.py) en draait al elke nacht in
    productie. Een vlaktak daarbinnen zou vertakkingen toevoegen aan een
    bewezen, lopend pad en het risico op een regressie in die scoping vergroten
    voor iets dat conceptueel geen "code-scope" is maar een fundamenteel andere
    matchstrategie (vaste 5-letter-pool i.p.v. topn-codes, ruime letter-
    onafhankelijke drempel i.p.v. FLOOR=0.85 per-code).
  - Een los, expliciet aanroepbaar script (`python -m
    app.services.queue_harvest_nutriscore`) heeft NUL impact op queue_harvest.py
    — geen import, geen gedeelde module-state, geen gedeeld progress-bestand
    (aparte MinIO-state-key) — en is per-definitie niet de default-nachtrun
    (AC4): het draait alleen als iemand het expliciet start.
  - De kleine, pure crop/pagina-helpers (`_crop_bgr`, `_pick_page`) zijn bewust
    LOKAAL gedupliceerd (niet geïmporteerd uit queue_harvest.py) — ze zijn
    triviaal en stabiel, en een cross-module-import zou dit script alsnog aan
    queue_harvest.py's module-laadpad koppelen (en de test-isolatie compliceren,
    zie de dedicated ATDD-suite); duplicatie hier is de veiligere keuze voor een
    bewust apart, nul-impact script.

Mechaniek (per kandidaat-regio):
    regio -> embed -> keurmerk-gate (voorfilter, ongewijzigd) -> cosine tegen de
    Nutri-Score-pool (NUTRISCORE_A..E, letter-onafhankelijk, ruime drempel)
    -> grove HSV-kleur-gok (provisionele code) -> per-bucket-cap -> upload crop
    -> INSERT open ArtworkReviewItem.

Env:
  NUTRISCORE_HARVEST_FLOOR       cosine-drempel tegen de Nutri-Score-pool,
                                 letter-onafhankelijk (default 0.60 — de
                                 diagnose gebruikte exact deze waarde)
  NUTRISCORE_HARVEST_BATCH       max GTINs per run (default 400)
  NUTRISCORE_HARVEST_PER_CODE_CAP  max kandidaten per provisionele-code-bucket
                                 per run (flood-guard, patroon 19.10 PER_CODE_CAP;
                                 default 15)
  NUTRISCORE_HARVEST_MAX_SECONDS wall-clock-budget per run (default 1000)
  NUTRISCORE_HARVEST_DRY_RUN     harvest + classificeer normaal, maar sla crop-
                                 upload, DB-insert en state-write over (read-only
                                 vertrekpunt, AC6)
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

MARKER = "12.12 nutriscore-vorm-oogst (letter-onafhankelijk)"
STATE_KEY = "keurmerk-harvest/nutriscore-state.json"

# De vaste, letter-onafhankelijke Nutri-Score-pool: échte A/B/E-crops + de 5
# synthetische zaden (Story 12.11/19.15) leven allemaal onder deze 5 codes in
# reference_logos. `find_similar_references_by_codes` filtert al op
# active=true, dus we hoeven de pool niet vooraf te bevragen — ontbrekende
# letters (nog geen actieve ref) leveren simpelweg geen match voor die letter.
NUTRISCORE_CODES = [
    "NUTRISCORE_A",
    "NUTRISCORE_B",
    "NUTRISCORE_C",
    "NUTRISCORE_D",
    "NUTRISCORE_E",
]
# Provisionele placeholder voor een treffer waarvan de kleur-gok geen duidelijke
# dominante tint oplevert (laag-verzadigd/donker) — de mens kiest de letter.
PROVISIONAL_UNKNOWN = "NUTRISCORE"

FLOOR = float(os.environ.get("NUTRISCORE_HARVEST_FLOOR", "0.60"))
BATCH = int(os.environ.get("NUTRISCORE_HARVEST_BATCH", "400"))
PER_CODE_CAP = int(os.environ.get("NUTRISCORE_HARVEST_PER_CODE_CAP", "15"))
MAX_SECONDS = float(os.environ.get("NUTRISCORE_HARVEST_MAX_SECONDS", "1000"))
DRY_RUN = os.environ.get("NUTRISCORE_HARVEST_DRY_RUN", "").lower() in ("1", "true", "yes")


def _crop_bgr(img, b):
    """Identiek aan queue_harvest.py's helper (bewust lokaal, zie module-docstring)."""
    x, y, w, h = b
    x, y = max(0, x), max(0, y)
    c = img[y : y + h, x : x + w]
    return c if c.size and c.shape[0] >= 4 and c.shape[1] >= 4 else None


def _pick_page(keys):
    """Identiek aan queue_harvest.py's helper (bewust lokaal, zie module-docstring)."""
    ks = sorted(k for k in keys if k.lower().endswith((".png", ".jpg", ".jpeg")))
    for k in ks:
        if "converted-0" in k:
            return k
    for k in ks:
        if re.search(r"_0*1\.(png|jpe?g)$", k, re.I):
            return k
    return ks[0] if ks else None


def _provisional_code(crop_bgr: np.ndarray) -> str:
    """Grove HSV-kleur-gok voor de provisionele code van een geharveste crop.

    Echte Nutri-Score-kleuren: A=donkergroen, B=lichtgroen, C=geel, D=oranje,
    E=rood. Dit is UITDRUKKELIJK een ruwe gok (zoals ook gebruikt in de
    corpus-vindbaarheid-diagnose) — de mens overschrijft hem altijd via de
    relabel-picker (Story 12.7); het geeft de wachtrij alleen een plausibel
    startpunt in plaats van een altijd-fout label. Laag-verzadigde/donkere
    regio's (geen duidelijke dominante tint) vallen terug op de expliciete
    NUTRISCORE-placeholder in plaats van een gok te forceren.
    """
    try:
        hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
    except Exception:
        return PROVISIONAL_UNKNOWN
    sat = hsv[:, :, 1].astype(np.float32)
    val = hsv[:, :, 2].astype(np.float32)
    mask = (sat > 60) & (val > 60)
    if not np.any(mask):
        return PROVISIONAL_UNKNOWN
    hue = hsv[:, :, 0].astype(np.float32)
    h = float(np.median(hue[mask]))  # OpenCV-hue-bereik 0..179
    if h < 10 or h >= 170:
        return "NUTRISCORE_E"  # rood
    if h < 22:
        return "NUTRISCORE_D"  # oranje
    if h < 34:
        return "NUTRISCORE_C"  # geel
    if h < 62:
        return "NUTRISCORE_B"  # licht-/geelgroen
    if h < 95:
        return "NUTRISCORE_A"  # donker-/zuivergroen
    return PROVISIONAL_UNKNOWN


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

    try:
        state = json.loads(
            storage_service.get_training_image(STATE_KEY).decode("utf-8")
        )
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
    gtins = sorted(by_gtin)
    total = len(gtins)

    if next_offset >= total:
        logger.info(
            "Nutri-Score vorm-oogst compleet — alle GTINs gedekt",
            extra={"total": total},
        )
        result = {
            "status": "complete",
            "total_gtins": total,
            "next_offset": next_offset,
        }
        print(json.dumps(result))
        return result

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
            emb = np.asarray(
                await model_manager.generate_embedding(_to_pil(c)), np.float32
            )
            kp = keurmerk_probability(emb)
            if kp is not None and kp < GATE_THRESHOLD:
                continue
            matches = await db_service.find_similar_references_by_codes(
                embedding=emb,
                t3777_codes=NUTRISCORE_CODES,
                limit=1,
                threshold=FLOOR,
            )
            if not matches:
                continue
            provisional = _provisional_code(c)
            if len(queue[provisional]) >= PER_CODE_CAP:
                continue
            queue[provisional].append(
                {
                    "gtin": gtin,
                    "bbox": {
                        "x": int(b[0]),
                        "y": int(b[1]),
                        "width": int(b[2]),
                        "height": int(b[3]),
                    },
                    "confidence": round(float(matches[0]["similarity"]), 3),
                    "matched_code": matches[0]["t3777_code"],
                    "sourceFile": src,
                    "crop": c,
                    "cid": f"{provisional}__{i}_{b[0]}_{b[1]}",
                }
            )
    reached = i

    candidate_count = sum(len(v) for v in queue.values())

    inserted = 0
    if not DRY_RUN:
        async with db_service.pool.acquire() as conn:
            for provisional, items in queue.items():
                for r in items:
                    ok, buf = cv2.imencode(".png", r["crop"])
                    if not ok:
                        continue
                    crop_key = f"artwork-crops/{r['gtin']}/12_12_{r['cid']}.png"
                    storage_service.put_training_image(crop_key, buf.tobytes())
                    await conn.execute(
                        """
                        INSERT INTO artwork_review_items
                          (gtin, t3777_code, crop_path, bbox, confidence, method, reason, source_file, status, updated_at)
                        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, 'open', now())
                        """,
                        r["gtin"],
                        provisional,
                        crop_key,
                        json.dumps(r["bbox"]),
                        r["confidence"],
                        "embedding-shape",
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
    logger.info("Nutri-Score vorm-oogst batch klaar", extra=result)
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    asyncio.run(run_batch())
