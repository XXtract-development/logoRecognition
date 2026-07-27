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
# Story 20.9 — keyline-guard: een technische snijlijn-/cutter-pagina (nauwelijks
# bedrukte inhoud, lege panelen) mag geen kandidaten opleveren. Detail-maat =
# gecomprimeerde-PNG-bytes-per-pixel; keyline-sheets liggen ~0,01-0,02, echt
# bedrukt artwork ~0,10-0,29 (gemeten). Env-drempel; <= 0 schakelt de guard uit.
KEYLINE_MAX_BPP = float(os.environ.get("DECLARED_HARVEST_KEYLINE_MAX_BPP", "0.03"))
HARVEST_CODES = {
    c.strip().upper()
    for c in os.environ.get("DECLARED_HARVEST_CODES", "").split(",")
    if c.strip()
}


def _marker(code: str) -> str:
    """Idempotentie-reason per code — zie moduledoc (AC2)."""
    return f"declared-harvest:{code}"


def _page_detail_bpp(img) -> float:
    """Detail-maat van een pagina: gecomprimeerde-PNG-bytes per pixel (Story 20.9).
    Vlakke keyline-/cutter-sheets comprimeren extreem (lage bpp); echt bedrukt
    artwork heeft veel detail (hoge bpp). Retourneert 0.0 bij een lege pagina."""
    h, w = img.shape[:2]
    if h * w == 0:
        return 0.0
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        return 0.0
    return len(buf) / float(h * w)


def _is_keyline(detail: float, threshold: float) -> bool:
    """True als de pagina onder de detail-drempel ligt (technische keyline-sheet).
    threshold <= 0 schakelt de guard uit (Story 20.9, AC4). Strikt `<` zodat een
    pagina precies op de drempel als 'genoeg detail' telt."""
    if threshold <= 0:
        return False
    return detail < threshold


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


# ---------------------------------------------------------------------------
# Story 20.11 — geheugenbewaking (AC4)
# ---------------------------------------------------------------------------

# Stop gecontroleerd zodra het cgroup-geheugen boven deze fractie van de limiet
# komt. Bewust de CGROUP meten en niet de eigen RSS: de limiet wordt gedeeld met
# de draaiende ml-service, dus "mijn eigen RSS is nog laag" zegt niets over de
# ruimte die er nog is. 0 of leeg schakelt de bewaking uit.
MEM_STOP_FRACTION = float(os.environ.get("DECLARED_HARVEST_MEM_STOP_FRACTION", "0.75"))

# Elke N verwerkte paren: eerst flushen (crops + rijen), dan pas checkpointen.
FLUSH_EVERY = int(os.environ.get("DECLARED_HARVEST_FLUSH_EVERY", "25"))


def _read_int(path: str):
    try:
        with open(path) as fh:
            v = fh.read().strip()
        return None if v in ("max", "") else int(v)
    except Exception:
        return None


def cgroup_memory() -> tuple:
    """
    (gebruik, limiet) in bytes uit de cgroup, of (None, None) als het niet leesbaar
    is. Ondersteunt cgroup v2 (memory.current/memory.max) én v1
    (memory.usage_in_bytes/memory.limit_in_bytes). Geen extra dependency.
    """
    use = _read_int("/sys/fs/cgroup/memory.current")
    lim = _read_int("/sys/fs/cgroup/memory.max")
    if use is None:
        use = _read_int("/sys/fs/cgroup/memory/memory.usage_in_bytes")
        lim = _read_int("/sys/fs/cgroup/memory/memory.limit_in_bytes")
    # v1 zonder limiet zet een absurd hoog getal; behandel dat als "geen limiet".
    if lim is not None and lim > (1 << 62):
        lim = None
    return use, lim


def memory_pressure(fraction: float = None) -> bool:
    """True zodra het cgroup-gebruik boven de drempel komt (AC4)."""
    frac = MEM_STOP_FRACTION if fraction is None else fraction
    if frac <= 0:
        return False
    use, lim = cgroup_memory()
    if not use or not lim:
        return False
    return (use / lim) >= frac


def _crop_bgr(img, b):
    """
    Identiek aan queue_harvest*(.py)'s helper (bewust lokaal).

    Story 20.11 — geeft een LOSGEKOPPELDE kopie terug, geen numpy-view. Een view
    houdt de VOLLEDIGE pagina-array in leven zolang de crop bestaat; omdat crops tot
    de insert in `queue` blijven staan, hield één batch daardoor tot ~105 hele
    artworks tegelijk vast (OOM-kill op ACC, 7,03 GB bij een limiet van 8 GiB die
    gedeeld wordt met de draaiende service). Een crop is enkele KB's, de pagina vele
    MB's — de kopie is dus verwaarloosbaar en snijdt de koppeling door.
    Invariant: `crop.base is None`.
    """
    x, y, w, h = b
    x, y = max(0, x), max(0, y)
    c = img[y : y + h, x : x + w]
    if not (c.size and c.shape[0] >= 4 and c.shape[1] >= 4):
        return None
    return c.copy()


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


def page_order(groups: dict) -> list:
    """
    Story 20.11 — volgorde van de pagina-groepen: op de KLEINSTE oorspronkelijke
    paar-index, NIET op de paginasleutel.

    Dat is geen cosmetiek. De offset is een aaneengesloten prefix over de
    OORSPRONKELIJKE parenlijst, dus de groep die `next_offset` bevat moet als
    eerste verwerkt worden. Sorteren op paginasleutel gaf een LIVELOCK: brak de
    run vroeg af (timebox of geheugenstop), dan bleef `to_offset == from_offset`
    en deed de volgende run exact hetzelfde werk opnieuw — stil, want dedup
    blokkeert dubbele rijen. Op ACC is de timebox het NORMALE pad (173 paren,
    ~28 s/paar tegen MAX_SECONDS=1000), geen randgeval.

    Deterministisch: paar-indices zijn uniek, dus de sleutel is een totale orde.
    """
    return sorted(groups, key=lambda src: min(groups[src]))


async def _flush(queue: dict, db_service, storage_service) -> int:
    """
    Story 20.11 (AC3) — schrijf de opgebouwde kandidaten weg en LEEG de queue.

    Wordt tussentijds aangeroepen (elke FLUSH_EVERY paren) én aan het eind. Het
    legen is essentieel: de queue houdt crop-arrays vast, en zonder legen zou het
    geheugen alsnog met de batch meegroeien. Retourneert het aantal ingevoegde rijen.
    In DRY_RUN wordt niets geschreven en blijft de queue staan (de telling moet de
    echte run blijven voorspellen).
    """
    if DRY_RUN:
        return 0
    n = 0
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
                n += 1
    queue.clear()
    return n


def _checkpoint(state: dict, storage_service, reached: int, total: int, done: bool = False) -> None:
    """
    Story 20.11 (AC3) — offset wegschrijven. ALTIJD ná een flush aanroepen, nooit
    ervoor: de offset mag nooit voorlopen op de daadwerkelijk ingevoegde rijen.
    `done=True` ruimt de run-marker op — blijft die staan, dan is de vorige run hard
    afgebroken.
    """
    if DRY_RUN:
        return
    state["next_offset"] = reached
    state["total_pairs"] = total
    if done:
        state.pop("in_progress", None)
        state.pop("run_started_at", None)
    storage_service.put_training_image(
        STATE_KEY, json.dumps(state).encode("utf-8"), "application/json"
    )


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
        # Story 20.11 — een achtergebleven run-marker van een hard afgebroken run
        # hoort hier ook opgeruimd te worden; anders blijft hij eeuwig staan en
        # suggereert hij ten onrechte een lopende run.
        had_marker = bool(state.get("in_progress"))
        if had_marker and not DRY_RUN:
            state.pop("in_progress", None)
            state.pop("run_started_at", None)
            storage_service.put_training_image(
                STATE_KEY, json.dumps(state).encode("utf-8"), "application/json"
            )
        result = {
            "status": "complete",
            "total_pairs": total,
            "next_offset": next_offset,
            "candidates": 0,
            "inserted": 0,
            "stale_marker_cleared": had_marker,
        }
        print(json.dumps(result))
        return result

    end = min(next_offset + BATCH, total)
    queue: dict = defaultdict(list)
    skipped_below_floor = 0
    skipped_duplicate = 0
    skipped_cap = 0
    skipped_cross_code = 0  # Story 20.7 — buur-icoon tegengehouden
    skipped_keyline = 0  # Story 20.9 — technische snijlijn-/cutter-pagina tegengehouden
    # Story 20.11 — tellen over ALLE flushes heen; `queue` wordt tussentijds geleegd.
    inserted_total = 0
    candidate_total = 0
    per_code_counts: dict = defaultdict(int)
    t0 = time.perf_counter()

    # Story 20.11 (AC3) — run-marker: blijft staan als de run hard wordt afgebroken
    # (SIGKILL kent geen handler), en wordt bij een nette afsluiting opgeruimd. Een
    # offset alleen is niet te onderscheiden van "er is nooit een run geweest".
    if not DRY_RUN:
        state["in_progress"] = True
        state["run_started_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        storage_service.put_training_image(
            STATE_KEY, json.dumps(state).encode("utf-8"), "application/json"
        )

    # Story 20.11 (AC2) — GROEPEREN PER BRONPAGINA. Voorheen liep de lus de paren in
    # volgorde af met een onbegrensde page-cache: die groeide met het aantal unieke
    # pagina's in de batch (7 GB bij 173 paren -> OOM). Door alle codes van dezelfde
    # pagina achter elkaar te doen is er nooit meer dan ÉÉN pagina tegelijk nodig, en
    # blijft de 20.2-winst (niet herhaald decoderen/MSER/PNG-encoden voor
    # multi-code-GTINs) volledig intact. Geheugen wordt zo batch-ONafhankelijk.
    window = list(range(next_offset, end))
    groups: dict = defaultdict(list)
    for idx in window:
        code, gtin = pairs[idx]
        src = _pick_page(by_gtin[gtin])
        if src:
            groups[src].append(idx)
    # Zie `page_order` — de volgorde is bepalend voor de offset-voortgang.
    ordered_pages = page_order(groups)

    # De offset slaat op de OORSPRONKELIJKE parenlijst, niet op de hergroepeerde
    # volgorde: we schuiven alleen op tot waar het aaneengesloten voorste deel af is.
    done_idx: set = set()
    # Paren zonder bruikbare pagina tellen als afgehandeld (ze werden ook voorheen
    # overgeslagen met i += 1).
    for idx in window:
        if not _pick_page(by_gtin[pairs[idx][1]]):
            done_idx.add(idx)

    def _reached() -> int:
        r = next_offset
        while r in done_idx:
            r += 1
        return r

    stopped_reason = None
    processed_since_flush = 0

    for src in ordered_pages:
        if time.perf_counter() - t0 > MAX_SECONDS:
            stopped_reason = "timebox"
            break
        # AC4 — gecontroleerd stoppen vóór de OOM-killer toeslaat.
        if memory_pressure():
            stopped_reason = "stopped_memory"
            logger.warning(
                "Declaratie-oogst stopt op geheugendruk",
                extra={"cgroup": cgroup_memory(), "fraction": MEM_STOP_FRACTION},
            )
            break  # de slot-flush + checkpoint hieronder bewaren het werk

        img = boxes = None
        is_keyline = False
        page_loaded = False

        for i in groups[src]:
            code, gtin = pairs[i]

            # De pagina wordt per GROEP één keer geladen en gelokaliseerd — dat is
            # exact de 20.2-winst, nu zonder onbegrensde cache.
            if not page_loaded:
                page_loaded = True
                try:
                    data = storage_service.get_training_image(src)
                    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
                except Exception:
                    img = None
                if img is not None:
                    boxes, _ = propose_regions(img)
                    # Story 20.9 — beslis eenmaal per pagina of het een technische
                    # keyline-/cutter-sheet is (geldt voor alle codes van deze pagina).
                    is_keyline = _is_keyline(_page_detail_bpp(img), KEYLINE_MAX_BPP)

            if img is None:
                done_idx.add(i)
                continue

            # Het paar is vanaf hier hoe dan ook afgehandeld — elk vervolgpad is
            # ofwel een kandidaat, ofwel een bewuste overslag (floor/dedup/cap/
            # cross-code/keyline). Aan het EIND markeren zou fout zijn: de meeste
            # paden verlaten de iteratie met `continue`, en die paren zouden dan
            # nooit meetellen voor de offset — de run zou ze eindeloos herhalen.
            done_idx.add(i)
            processed_since_flush += 1

            # Story 20.9 — keyline-pagina levert geen bruikbare crops (lege panelen).
            if is_keyline:
                skipped_keyline += 1
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

            # Story 20.11 — tel op `per_code_counts`, NIET op `len(queue[code])`:
            # de queue wordt tussentijds geleegd door de flush, dus daarop tellen zou
            # de cap per flush laten resetten i.p.v. per run. PER_CODE_CAP houdt
            # daarmee exact zijn oude, run-brede betekenis.
            if per_code_counts[code] >= PER_CODE_CAP:
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
            candidate_total += 1
            per_code_counts[code] += 1
        # Story 20.11 (AC2) — pagina expliciet loslaten zodra de groep klaar is.
        # Zonder dit bleef hij in de (voorheen onbegrensde) cache staan.
        img = boxes = None

        # Story 20.11 (AC3) — FLUSH-DAN-CHECKPOINT. Eerst het werk wegschrijven,
        # daarna pas de offset. Andersom (checkpointen vóór de flush) zou paren
        # stilzwijgend overslaan als de run daarna sneuvelt.
        if processed_since_flush >= FLUSH_EVERY:
            n = await _flush(queue, db_service, storage_service)
            inserted_total += n
            _checkpoint(state, storage_service, _reached(), total)
            processed_since_flush = 0

    reached = _reached()

    # Slot-flush + checkpoint voor de rest van de queue.
    inserted_total += await _flush(queue, db_service, storage_service)
    _checkpoint(state, storage_service, reached, total, done=True)

    candidate_count = candidate_total
    inserted = inserted_total

    # `queue` is door de flushes geleegd; tel per code apart mee.
    result = {
        "dry_run": DRY_RUN,
        # Story 20.11 (AC4) — expliciete status i.p.v. stil ophouden.
        "status": stopped_reason or "ok",
        "candidates": candidate_count,
        "inserted": inserted,
        "skipped_below_floor": skipped_below_floor,
        "skipped_duplicate": skipped_duplicate,
        "skipped_cap": skipped_cap,
        "skipped_cross_code": skipped_cross_code,
        "skipped_keyline": skipped_keyline,
        "total_pairs": total,
        "from_offset": next_offset,
        "to_offset": reached,
        "remaining": max(0, total - reached),
        "per_code": dict(per_code_counts),
        "seconds": round(time.perf_counter() - t0, 1),
    }
    logger.info("Declaratie-oogst batch klaar", extra=result)
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    asyncio.run(run_batch())
