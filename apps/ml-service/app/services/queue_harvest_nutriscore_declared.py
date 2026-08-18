"""
Story 12.15 — Declaratie-gedreven Nutri-Score-oogst (gedeclareerde letter =
grondwaarheid-label).

Vervangt de noisy kleur-gok van Story 12.12 (`_provisional_code`,
``queue_harvest_nutriscore.py``, 15% hitrate, ronde-1: 0 nieuwe C/D) door de
GEDECLAREERDE Nutri-Score-letter (GS1 `nutritionalScore`, A-E) als
gegarandeerd-juist label. De letter komt uit een vooraf gebouwde GTIN->letter
map (``build-nutriscore-declared-map.ts``, apps/api — hergebruikt de
bestaande ``resolveDeclaredMarks``/Story 12.7, MET de 12.7-regex-leak-guard),
geschreven naar een vaste MinIO-sleutel. Dit script leest die map en hergebruikt
verder de VOLLEDIGE 12.12-vorm-detectie ONGEWIJZIGD (region-proposer, gate,
``find_similar_references_by_codes`` tegen de NUTRISCORE_A..E-pool) — alleen
het LABEL verandert: niet de kleur-gok, maar de gedeclareerde letter.

Architectuurkeuze (story Task 1 — "kies de aanpak met de minste duplicatie"):
zie de docblock van ``build-nutriscore-declared-map.ts`` voor de volledige
motivatie. Kort: ``resolveDeclaredMarks`` (Prisma+Redis+catalog-fetch) bestaat
alleen TS-side; de vorm-detectie (region-proposer/embedding/pgvector) bestaat
alleen hier (Python). Een vooraf-berekende map + deze Python-oogst hergebruikt
beide bouwstenen ONGEWIJZIGD zonder een nieuw cross-taal HTTP-oppervlak.

Waarom een APART script (zelfde argumentatie als 12.12 t.o.v. queue_harvest.py
EN t.o.v. queue_harvest_nutriscore.py zelf): de matchstrategie hier is
letter-GERICHT (elke GTIN heeft precies één gedeclareerde letter — géén
letter-onafhankelijke kleur-gok, géén per-provisionele-code-bucket) en de
scope is een klein, expliciet GTIN-universum (het GTIN->letter-map-bestand),
niet "alle artwork-GTINs". Nul impact op queue_harvest.py/queue_harvest_
nutriscore.py: eigen state-key, eigen env-namespace, geen gedeelde module-state.
De kleine, pure crop/pagina-helpers zijn bewust LOKAAL gedupliceerd (zelfde
afweging als 12.12's docblock).

Mechaniek (per kandidaat-GTIN uit de declaratie-map):
    declared_letter (map) -> artwork-pagina's -> propose_regions -> per regio:
    embed -> keurmerk-gate (voorfilter) -> cosine tegen de Nutri-Score-pool
    (NUTRISCORE_A..E, ONGEWIJZIGDE 12.12-scoping) -> houd de BESTE (hoogste
    similarity) regio over -> AC3: alleen als die >= drempel, anders GTIN
    overslaan (geen fabricatie) -> AC4: idempotentie-check (bestaat er al een
    review-item voor deze (gtin, t3777_code, source_file)?) -> per-letter-cap
    -> upload crop -> INSERT open ArtworkReviewItem met
    t3777_code=NUTRISCORE_<gedeclareerde-letter>.

Scope (AC2, story): C/D-declarerende GTINs EERST — de declaratie-map bevat
alle resolved GTINs (A-E); dit script sorteert C/D vóór A/B/E zodat een
tijdgebonden batch (MAX_SECONDS) de C/D-prioriteit altijd eerst bedient.
``NUTRISCORE_DECLARED_HARVEST_LETTERS`` beperkt de scope desgewenst verder
(default "C,D" — A/B/E optioneel meenemen is een expliciete env-keuze).

Env:
  NUTRISCORE_DECLARED_MAP_KEY         MinIO-sleutel van de GTIN->letter map
                                       (default "flywheel-index/nutriscore-declared-map.json",
                                       geschreven door build-nutriscore-declared-map.ts)
  NUTRISCORE_DECLARED_HARVEST_FLOOR   cosine-drempel tegen de Nutri-Score-pool
                                       (default 0.60 — zelfde gekalibreerde
                                       waarde als 12.12/de corpus-diagnose)
  NUTRISCORE_DECLARED_HARVEST_LETTERS comma-lijst van te oogsten letters
                                       (default "C,D" — de story-scope; A/B/E
                                       optioneel meenemen = expliciete verbreding)
  NUTRISCORE_DECLARED_HARVEST_BATCH   max GTINs per run (default 400)
  NUTRISCORE_DECLARED_HARVEST_PER_CODE_CAP  max kandidaten per letter-bucket
                                       per run (flood-guard, default 15)
  NUTRISCORE_DECLARED_HARVEST_MAX_SECONDS  wall-clock-budget per run (default 1000)
  NUTRISCORE_DECLARED_HARVEST_DRY_RUN  harvest + classificeer normaal, maar
                                       sla crop-upload, DB-insert en state-write
                                       over (read-only vertrekpunt, AC4)
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

MARKER = "12.15 nutriscore-declaratie-oogst"
STATE_KEY = "keurmerk-harvest/nutriscore-declared-state.json"

# De vaste, letter-onafhankelijke Nutri-Score-pool waartegen de crop-VORM
# gematcht wordt (ONGEWIJZIGD t.o.v. 12.12) — het label dat we uiteindelijk
# opslaan komt NIET uit deze match maar uit de gedeclareerde-letter-map.
NUTRISCORE_CODES = [
    "NUTRISCORE_A",
    "NUTRISCORE_B",
    "NUTRISCORE_C",
    "NUTRISCORE_D",
    "NUTRISCORE_E",
]

DECLARED_MAP_KEY = os.environ.get(
    "NUTRISCORE_DECLARED_MAP_KEY", "flywheel-index/nutriscore-declared-map.json"
)
FLOOR = float(os.environ.get("NUTRISCORE_DECLARED_HARVEST_FLOOR", "0.60"))
BATCH = int(os.environ.get("NUTRISCORE_DECLARED_HARVEST_BATCH", "400"))
PER_CODE_CAP = int(os.environ.get("NUTRISCORE_DECLARED_HARVEST_PER_CODE_CAP", "15"))
MAX_SECONDS = float(os.environ.get("NUTRISCORE_DECLARED_HARVEST_MAX_SECONDS", "1000"))
DRY_RUN = os.environ.get("NUTRISCORE_DECLARED_HARVEST_DRY_RUN", "").lower() in (
    "1",
    "true",
    "yes",
)
_DEFAULT_LETTERS = "C,D"
HARVEST_LETTERS = {
    c.strip().upper()
    for c in os.environ.get(
        "NUTRISCORE_DECLARED_HARVEST_LETTERS", _DEFAULT_LETTERS
    ).split(",")
    if c.strip()
}
# Story-scope: C/D bedienen we altijd eerst binnen één batch (AC2), ongeacht
# welke letters verder in scope zitten.
_PRIORITY_LETTERS = ("C", "D")


def _crop_bgr(img, b):
    """Identiek aan queue_harvest(_nutriscore).py's helper (bewust lokaal)."""
    x, y, w, h = b
    x, y = max(0, x), max(0, y)
    c = img[y : y + h, x : x + w]
    return c if c.size and c.shape[0] >= 4 and c.shape[1] >= 4 else None


def _pick_page(keys):
    """Identiek aan queue_harvest(_nutriscore).py's helper (bewust lokaal)."""
    ks = sorted(k for k in keys if k.lower().endswith((".png", ".jpg", ".jpeg")))
    for k in ks:
        if "converted-0" in k:
            return k
    for k in ks:
        if re.search(r"_0*1\.(png|jpe?g)$", k, re.I):
            return k
    return ks[0] if ks else None


def _load_declared_map(storage_service) -> dict:
    """Laad de GTIN->letter map (gebouwd door build-nutriscore-declared-map.ts).

    Fail-safe: een ontbrekende/onleesbare/misvormde map levert een lege dict
    op (nooit een crash, nooit een gok) — het script haalt dan simpelweg 0
    kandidaten op en rapporteert dat, in plaats van te falen.
    """
    try:
        raw = storage_service.get_training_image(DECLARED_MAP_KEY)
        data = json.loads(
            raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw
        )
    except Exception:
        logger.warning(
            "Nutri-Score-declaratie-map niet leesbaar — 0 kandidaten",
            extra={"key": DECLARED_MAP_KEY},
        )
        return {}
    entries = data.get("entries") if isinstance(data, dict) else None
    if not isinstance(entries, dict):
        return {}
    out = {}
    for gtin, letter in entries.items():
        letter_u = str(letter).strip().upper()
        if letter_u in {"A", "B", "C", "D", "E"}:
            out[str(gtin)] = letter_u
    return out


def _scoped_gtins(declared_map: dict) -> list:
    """GTINs binnen de letter-scope (``HARVEST_LETTERS``), C/D eerst, dan
    alfabetisch op GTIN binnen elke groep (deterministisch)."""
    scoped = [
        gtin for gtin, letter in declared_map.items() if letter in HARVEST_LETTERS
    ]

    def sort_key(gtin: str):
        letter = declared_map[gtin]
        priority = 0 if letter in _PRIORITY_LETTERS else 1
        return (priority, gtin)

    return sorted(scoped, key=sort_key)


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

    # Alleen GTINs die ZOWEL artwork hebben ALS in de gedeclareerde-letter-scope
    # zitten komen in aanmerking (AC1/AC2) — C/D eerst.
    gtins = [g for g in _scoped_gtins(declared_map) if g in by_gtin]
    total = len(gtins)

    if next_offset >= total:
        logger.info(
            "Nutri-Score-declaratie-oogst compleet — alle scoped GTINs gedekt",
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
    skipped_below_floor = 0
    skipped_duplicate = 0
    skipped_cap = 0
    t0 = time.perf_counter()
    i = next_offset
    while i < end:
        if time.perf_counter() - t0 > MAX_SECONDS:
            break
        gtin = gtins[i]
        declared_letter = declared_map[gtin]
        declared_code = f"NUTRISCORE_{declared_letter}"
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
        # AC3: houd per GTIN alleen de BESTE (hoogste-similarity) regio over —
        # de declaratie garandeert de LETTER, niet de locatie; we forceren nooit
        # een crop onder de gedeclareerde letter als geen enkele regio de
        # confidence-drempel haalt.
        best = None  # (similarity, crop, bbox)
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
            sim = float(matches[0]["similarity"])
            if best is None or sim > best[0]:
                best = (sim, c, b)

        if best is None:
            # AC3: geen betrouwbaar gedetecteerd vakje -> overslaan, GEEN fabricatie.
            skipped_below_floor += 1
            continue

        sim, crop, bbox = best
        if len(queue[declared_code]) >= PER_CODE_CAP:
            # Observability (code-review-bevinding): apart geteld zodat een
            # operator "geen kandidaten meer" kan onderscheiden van "cap
            # bereikt, meer beschikbaar" i.p.v. dat dit stil in candidates=0
            # verdwijnt.
            skipped_cap += 1
            continue

        # AC4 — idempotentie: sla over als DEZE oogst (reason=MARKER) al een
        # review-item voor (gtin, source_file) aanmaakte, ongeacht de letter —
        # NIET gescoped op t3777_code (code-review-bevinding): de gedeclareerde-
        # letter-map kan tussen runs herbouwd worden (een declaratie kan
        # wijzigen, of een verse cache-hit resolveert anders), wat de letter
        # voor DEZELFDE GTIN/pagina zou veranderen. Een check op t3777_code zou
        # dan een TWEEDE, tegenstrijdig review-item voor dezelfde regio onder de
        # nieuwe letter toelaten i.p.v. "deze oogst verwerkte deze pagina al" te
        # herkennen — precies wat AC4's "geen dubbele refs per storage_path/GTIN"
        # vereist. Scoping op `reason` (i.p.v. helemaal geen scope) voorkomt dat
        # een ANDERE harvester (12.6/12.12/19.10) die legitiem een eigen
        # review-item voor een ANDERE code op dezelfde pagina heeft, hier als
        # "al door ons verwerkt" wordt aangezien. Dit is een READ (geen write)
        # en draait ook in DRY_RUN mee (AC4 = read-only METING, patroon 12.12's
        # test_ac5c_dry_run_meet_wel_de_kandidaten) — zodat de kandidatentelling
        # de echte run al voorspelt.
        exists = await db_service.review_item_exists(
            gtin=gtin, reason=MARKER, source_file=src
        )
        if exists:
            skipped_duplicate += 1
            continue

        queue[declared_code].append(
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
                "cid": f"{declared_code}__{i}_{bbox[0]}_{bbox[1]}",
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
                    crop_key = f"artwork-crops/{r['gtin']}/12_15_{r['cid']}.png"
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
        "skipped_below_floor": skipped_below_floor,
        "skipped_duplicate": skipped_duplicate,
        "skipped_cap": skipped_cap,
        "from_offset": next_offset,
        "to_offset": reached,
        "total_gtins": total,
        "remaining": total - reached,
        "per_code": per_code,
        "seconds": round(time.perf_counter() - t0, 1),
    }
    logger.info("Nutri-Score-declaratie-oogst batch klaar", extra=result)
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    asyncio.run(run_batch())
