"""Story 17.1 — zaad-zoek-service voor de bootstrap van lege keurmerk-klassen.

Een lege klasse (T3777-code zonder actieve referenties) kan zichzelf vullen met
ECHTE crops uit declarerende producten. Omdat de klasse geen actieve referenties
heeft om tegen te zoeken, gebruikt de bootstrap het GS1-gids-logo als ZOEKZAAD:
elke voorgestelde artwork-regio wordt via cosine tegen de ZAAD-embedding gemeten
(niet tegen een referentieset — die is leeg).

Deze module is STATELESS compute (AD-9): zaadbeeld + artwork-paden in, matches
(bbox, geuploade crop, zaad-cosine) uit. De API bezit de state (declaratie-guard,
nominatie, wachtrij-status) en beslist op de geretourneerde scores.

Recept (hergebruik van het 12.4-oogstpatroon in ``queue_harvest.py``):
    zaad embedden  ->  per GTIN-pagina propose_regions  ->  crop  ->  embed
     ->  keurmerk-gate (gate-v2, ruisreductie)  ->  cosine tegen de zaad-embedding
     ->  matches >= drempel  ->  crop uploaden naar ``artwork-crops/{gtin}/...``

NFR-6 (KRITIEK): het gids-zaadbeeld is UITSLUITEND zoekinstrument. Het wordt hier
NOOIT geüpload en verschijnt NOOIT in de output-crops. Structureel geborgd: het
zaad wordt enkel geëmbed (nooit ``put_training_image``), en een defensieve
inhouds-hash-guard sluit een per ongeluk als artwork-regio meegelifte kopie van
het zaad uit de output-crops uit.

Zacht falen per GTIN (NFR-3): een onleesbaar/ontbrekend beeld of een lege pagina
laat de run doorgaan met de volgende GTIN — één corrupt beeld stopt de bootstrap
niet. Time-box + per-code cap begrenzen de ~28s/beeld-lokalisatiekosten.
"""
from __future__ import annotations

import hashlib
import time
from typing import Any, Dict, List, Optional

import numpy as np

from app.core.logging import logger

# cv2 wordt LAZY geïmporteerd (binnen de functies die het nodig hebben) zodat de
# pure ``cosine``-drempellogica los te testen is in een omgeving zonder OpenCV
# (cv2 leeft alleen in het Docker-image). numpy blijft top-level.

# Crop-uploadprefix — spiegelt queue_harvest.py (``artwork-crops/{gtin}/...``).
CROP_PREFIX = "artwork-crops"
# Marker in de crop-sleutel zodat bootstrap-crops herkenbaar zijn in de opslag.
CROP_MARKER = "17_1_bootstrap"


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine-similariteit tussen twee vectoren (richting-gebaseerd, AD-9).

    Pure functie — deterministisch en los te testen (dit is de drempelvergelijking
    van de bootstrap). Een nulvector levert 0.0 (geen richting, nooit een match).
    """
    a = np.asarray(a, dtype=np.float32).flatten()
    b = np.asarray(b, dtype=np.float32).flatten()
    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def _crop_bgr(img: np.ndarray, b) -> Optional[np.ndarray]:
    """Snijd een bbox uit een BGR-beeld; None bij een te kleine/lege crop.

    Identiek aan queue_harvest.py::_crop_bgr — bewust gedupliceerd zodat de
    bootstrap-service niet afhankelijk wordt van de harvester-module (die als
    ``__main__`` draait).
    """
    x, y, w, h = b
    x, y = max(0, x), max(0, y)
    c = img[y : y + h, x : x + w]
    return c if c.size and c.shape[0] >= 4 and c.shape[1] >= 4 else None


def _content_digest(crop_bgr: np.ndarray) -> str:
    """Inhouds-digest van een crop voor de zaad-lek-guard (NFR-6).

    Bewust LOKAAL en simpel (SHA-256 over de genormaliseerde pixelbuffer): dit is
    GEEN canonieke inhouds-hash (die leeft in ``/ml/phash``, AD-14) maar enkel een
    interne gelijkheids-check om te voorkomen dat een als artwork-regio meegelifte
    kopie van het zaadbeeld in de output-crops belandt. RGB, vaste 64x64-resize
    zodat schaalverschillen tussen zaad en regio niet doorwerken.
    """
    import cv2

    rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
    small = cv2.resize(rgb, (64, 64), interpolation=cv2.INTER_AREA)
    return hashlib.sha256(np.ascontiguousarray(small.astype("uint8")).tobytes()).hexdigest()


async def search_with_seed(
    *,
    seed_path: str,
    gtin_pages: List[Dict[str, Any]],
    threshold: float,
    per_code_cap: int = 25,
    max_seconds: float = 1000.0,
) -> Dict[str, Any]:
    """Zoek met het gids-zaad naar echte keurmerk-crops binnen de opgegeven GTINs.

    Args:
        seed_path: MinIO-object-key van het gids-zaadbeeld (``reference-logos/...``).
            UITSLUITEND zoekinstrument — nooit geüpload, nooit in de output (NFR-6).
        gtin_pages: per GTIN de te doorzoeken pagina-object-keys
            ``[{"gtin": str, "page_key": str}, ...]``. De API kiest de pagina.
        threshold: cosine-drempel tegen de zaad-embedding (bootstrap-drempel 0,93).
        per_code_cap: max aantal matches (crops) dat de run oplevert (budget-guard).
        max_seconds: wall-clock time-box; bij overschrijding stopt de run netjes en
            rapporteert hij hoeveel GTINs verwerkt zijn (het restant blijft aan de API).

    Returns:
        ``{"seed_path", "threshold", "matches": [{gtin, bbox, seed_cosine, crop_path,
        source_file}], "gtins_processed", "gtins_total", "timed_out", "seed_leaks_skipped"}``.
        Elke match is een ECHTE artwork-crop (geen zaad), al geüpload naar
        ``artwork-crops/{gtin}/...`` zodat de API-nominatie (13.2) enkel de key nodig heeft.
    """
    import cv2

    from app.ml.model_manager import model_manager
    from app.services.classification import _to_pil
    from app.services.keurmerk_gate import GATE_THRESHOLD, keurmerk_probability
    from app.services.region_proposer import propose_regions
    from app.services.storage import storage_service

    if not model_manager.is_loaded:
        await model_manager.load_models()
    storage_service.connect()

    # 1. Zaad-embedding (ENKEL embedden; het zaad wordt NOOIT geüpload — NFR-6).
    seed_data = storage_service.get_training_image(seed_path)
    seed_img = cv2.imdecode(np.frombuffer(seed_data, np.uint8), cv2.IMREAD_COLOR)
    if seed_img is None:
        raise ValueError(f"Zaadbeeld is geen leesbare afbeelding: {seed_path}")
    seed_emb = np.asarray(await model_manager.generate_embedding(_to_pil(seed_img)), np.float32)
    seed_digest = _content_digest(seed_img)

    matches: List[Dict[str, Any]] = []
    gtins_total = len(gtin_pages)
    gtins_processed = 0
    seed_leaks_skipped = 0
    timed_out = False
    t0 = time.perf_counter()

    for entry in gtin_pages:
        if len(matches) >= per_code_cap:
            break
        if time.perf_counter() - t0 > max_seconds:
            timed_out = True
            break

        gtin = str(entry.get("gtin", ""))
        page_key = entry.get("page_key")
        gtins_processed += 1
        if not page_key:
            continue

        # Zacht falen per GTIN (NFR-3): laad/decodeer-fout → volgende GTIN.
        try:
            data = storage_service.get_training_image(page_key)
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        except Exception as exc:
            logger.warning(
                "Bootstrap: kon artwork-pagina niet laden — GTIN overgeslagen",
                extra={"gtin": gtin, "page_key": page_key, "error": str(exc)},
            )
            continue
        if img is None:
            logger.warning(
                "Bootstrap: artwork-pagina onleesbaar — GTIN overgeslagen",
                extra={"gtin": gtin, "page_key": page_key},
            )
            continue

        try:
            boxes, _ = propose_regions(img)
        except Exception as exc:
            logger.warning(
                "Bootstrap: regio-voorstel faalde — GTIN overgeslagen",
                extra={"gtin": gtin, "error": str(exc)},
            )
            continue

        for b in boxes:
            if len(matches) >= per_code_cap:
                break
            c = _crop_bgr(img, b)
            if c is None:
                continue

            emb = np.asarray(await model_manager.generate_embedding(_to_pil(c)), np.float32)

            # Gate-v2 als voorfilter (ruisreductie): niet-keurmerk-achtige regio's weg.
            kp = keurmerk_probability(emb)
            if kp is not None and kp < GATE_THRESHOLD:
                continue

            sim = cosine(emb, seed_emb)
            if sim < threshold:
                continue

            # NFR-6-guard: een regio die inhoudelijk het zaadbeeld ís (een per
            # ongeluk meegelifte kopie van het gids-logo op de verpakking) mag
            # nooit als output-crop terugkomen — het zaad is geen artwork-vondst.
            if _content_digest(c) == seed_digest:
                seed_leaks_skipped += 1
                logger.info(
                    "Bootstrap: regio identiek aan zaadbeeld — uitgesloten (NFR-6)",
                    extra={"gtin": gtin},
                )
                continue

            ok, buf = cv2.imencode(".png", c)
            if not ok:
                continue
            crop_key = (
                f"{CROP_PREFIX}/{gtin}/{CROP_MARKER}_{b[0]}_{b[1]}_{b[2]}_{b[3]}.png"
            )
            storage_service.put_training_image(crop_key, buf.tobytes())

            matches.append(
                {
                    "gtin": gtin,
                    "bbox": {
                        "x": int(b[0]),
                        "y": int(b[1]),
                        "width": int(b[2]),
                        "height": int(b[3]),
                    },
                    "seed_cosine": round(float(sim), 4),
                    "crop_path": crop_key,
                    "source_file": page_key,
                }
            )

    result = {
        "seed_path": seed_path,
        "threshold": float(threshold),
        "matches": matches,
        "gtins_processed": gtins_processed,
        "gtins_total": gtins_total,
        "timed_out": timed_out,
        "seed_leaks_skipped": seed_leaks_skipped,
    }
    logger.info(
        "Bootstrap zaad-zoektocht voltooid",
        extra={
            "seed_path": seed_path,
            "matches": len(matches),
            "gtins_processed": gtins_processed,
            "gtins_total": gtins_total,
            "timed_out": timed_out,
            "seconds": round(time.perf_counter() - t0, 1),
        },
    )
    return result
