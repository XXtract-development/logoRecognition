"""K4-aa scan route: Gemini 3.8 Flash finds and names top-15 marks (spike variant K1a),
a SigLIP 2 top-3 gate keeps a report only when the crop's three best distinct reference
codes include it. Contract: _bmad-output/specs/spec-logo-scan-k4aa/{SPEC,ontwerp}.md.

Prompt, schema, reference sheet and windows are byte-equal to the spike
(fase-b/fb_k1.py, fb_common.py); the hashes are pinned in tests/test_k4aa_atdd.py.
Logs carry error classes and counts only: never the key, an image, the prompt or an answer.
"""

import asyncio
import base64
import hashlib
import io
import json
import logging
import math
import os
import threading
import time
from pathlib import Path

import asyncpg
import cv2
import httpx
import numpy as np
from fastapi import HTTPException
from PIL import Image, ImageOps

from app.core.config import settings
from app.services.artwork_proposals import tile_windows
from app.services.database import db_service
from app.symbol_contract import normalize_code

logger = logging.getLogger(__name__)

OPENROUTER = "https://openrouter.ai/api/v1"
MODEL = "google/gemini-3.8-flash"
PROVIDER = {"zdr": True, "data_collection": "deny"}
SIGLIP_MODEL_NAME = "google/siglip2-base-patch16-384@f775b65a"
SHEET_PATH = Path(__file__).resolve().parents[1] / "assets/k4aa/referentieblad.png"

TOP15 = sorted(
    [
        "RAINFOREST_ALLIANCE_PEOPLE_NATURE",
        "WEIDEMELK",
        "EU_ORGANIC_FARMING",
        "RECYCLABLE_GENERAL_CLAIM",
        "BETER_LEVEN_1_STER",
        "PREGNANCY_WARNING",
        "GREEN_DOT",
        "VEGAN",
        "NUTRISCORE_A",
        "EUROPEAN_V_LABEL_VEGAN",
        "FOREST_STEWARDSHIP_COUNCIL_MIX",
        "MARINE_STEWARDSHIP_COUNCIL_LABEL",
        "NUTRISCORE_C",
        "NUTRISCORE_B",
        "VEGAN_SOCIETY_VEGAN_LOGO",
    ]
)
# The only codes this route may hand out as a usable proposal; the rest are doubtful.
BRUIKBAAR = frozenset(
    {
        "WEIDEMELK",
        "MARINE_STEWARDSHIP_COUNCIL_LABEL",
        "RAINFOREST_ALLIANCE_PEOPLE_NATURE",
        "FOREST_STEWARDSHIP_COUNCIL_MIX",
        "BETER_LEVEN_1_STER",
        "VEGAN_SOCIETY_VEGAN_LOGO",
        "EUROPEAN_V_LABEL_VEGAN",
    }
)

# --- K1a prompt (verbatim from the spike) -------------------------------------
OMSCHRIJVING = {
    "BETER_LEVEN_1_STER": "Dutch 'Beter Leven' animal-welfare mark with exactly ONE star (2 or 3 stars: use \"ander\").",  # noqa: E501
    "EUROPEAN_V_LABEL_VEGAN": "European V-Label: a V with a leaf, with the word 'vegan'.",
    "EU_ORGANIC_FARMING": "EU organic logo: white stars forming a leaf on a green rectangle.",  # noqa: E501
    "FOREST_STEWARDSHIP_COUNCIL_MIX": "FSC tree-and-check logo with the word 'MIX' (FSC 100% or FSC Recycled: use \"ander\").",  # noqa: E501
    "GREEN_DOT": "Der Gruene Punkt / Green Dot: two interlocking arrows forming a circle.",  # noqa: E501
    "MARINE_STEWARDSHIP_COUNCIL_LABEL": "MSC blue ecolabel: a fish shape with a tick, 'MSC'.",  # noqa: E501
    "NUTRISCORE_A": "Nutri-Score bar with the letter A highlighted (enlarged).",
    "NUTRISCORE_B": "Nutri-Score bar with the letter B highlighted (enlarged).",
    "NUTRISCORE_C": 'Nutri-Score bar with the letter C highlighted (enlarged). Highlighted D or E: use "ander".',  # noqa: E501
    "PREGNANCY_WARNING": "Alcohol warning pictogram: silhouette of a pregnant woman (often drinking) inside a circle with a diagonal strike-through. Not on the reference sheet.",  # noqa: E501
    "RAINFOREST_ALLIANCE_PEOPLE_NATURE": "Rainforest Alliance seal: a round seal with a frog and the text 'Rainforest Alliance' and 'people & nature'.",  # noqa: E501
    "RECYCLABLE_GENERAL_CLAIM": "Generic recycling symbol: a Moebius loop of three chasing arrows WITHOUT a material number or material name (numbered resin codes, sorting/bin pictograms, Triman and 'recycled content' seals: use \"ander\").",  # noqa: E501
    "VEGAN": "Generic vegan claim badge or stamp with the word 'VEGAN' that is neither the V-Label nor the Vegan Society sunflower. Not on the reference sheet.",  # noqa: E501
    "VEGAN_SOCIETY_VEGAN_LOGO": "The Vegan Society trademark: a sunflower-like flower with the word 'VEGAN'.",  # noqa: E501
    "WEIDEMELK": "Dutch 'Weidemelk' (meadow milk) logo: a round badge with a cow and the word 'WEIDEMELK' around it.",  # noqa: E501
}
INSTRUCTIE = (
    "You locate certification, recycling and nutrition marks on a product packaging label.\n"  # noqa: E501
    "Image 1 is a reference sheet with example marks, each captioned with its code. Image 2 is the label (or a section of it).\n"  # noqa: E501
    'Return only JSON {"logos":[{"code":"<CODE>","box_2d":[ymin,xmin,ymax,xmax]}]} with coordinates normalized 0..1000 '  # noqa: E501
    "relative to IMAGE 2. Report every visible occurrence separately with a tight box around the complete mark.\n"  # noqa: E501
    "Allowed codes:\n" + "\n".join(f"- {c}: {OMSCHRIJVING[c]}" for c in TOP15) + "\n"
    'Use "ander" for any other certification, recycling, nutrition or claim mark, or leave it out. '  # noqa: E501
    "Only report marks that are visibly printed; never infer a mark from text, ingredient lists or declarations. "  # noqa: E501
    'Ignore brand logos, barcodes and ordinary text. A label without any of these marks returns {"logos":[]}. At most 40 entries.'  # noqa: E501
)
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["logos"],
    "properties": {
        "logos": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["code", "box_2d"],
                "properties": {
                    "code": {"type": "string", "enum": TOP15 + ["ander"]},
                    "box_2d": {"type": "array", "items": {"type": "number"}},
                },
            },
        }
    },
}
DEEL = " Image 2 is one section of a larger label; include marks cut off at the section edge."  # noqa: E501

MAX_REPORTS = 64
MAX_INLINE_EMBEDDINGS = 8
EMBED_BATCH = 8
GATE_TOP = 3
MERGE_IOU = 0.5
RESERVE_S = (
    40.0  # kept free for the SigLIP step (<= 64 crops, 1 thread) after the calls
)
MIN_ATTEMPT_S = 15.0
MAX_ATTEMPT_S = 90.0
MAX_RETRIES = 2
SYNC_MAX_S = 120.0
SYNC_LOCK_ID = 0x4B34_4141  # "K4AA"
_CALLS = asyncio.Semaphore(6)  # provider calls in flight per process


# Deadline and disconnect signals of the strict runtime: never re-classified here.
_PASS = (HTTPException, asyncio.TimeoutError)


def _left(remaining):
    """Seconds left; 0.0 once the strict deadline has passed (its remaining() raises)."""
    try:
        return remaining()
    except HTTPException:
        return 0.0


class K4aaError(Exception):
    """A scan or sync failure with a stable class for the caller (no payloads)."""

    def __init__(self, klasse):
        super().__init__(klasse)
        self.klasse = klasse


def referentieblad_bytes():
    return SHEET_PATH.read_bytes()


def windows(width, height):
    return [(0, 0, width, height)] + tile_windows(width, height, 6)


def encode_window(img, max_side=1500, quality=85):
    """Spike ``fb_common.jpeg_b64``: longest side <= 1500 px (INTER_AREA), JPEG q85."""
    h, w = img.shape[:2]
    r = min(1.0, max_side / max(h, w))
    if r < 1:
        img = cv2.resize(
            img,
            (max(1, round(w * r)), max(1, round(h * r))),
            interpolation=cv2.INTER_AREA,
        )
    ok, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise K4aaError("image_invalid")
    return base64.b64encode(enc).decode("ascii"), img.shape[1], img.shape[0]


def _logos(content):
    """The ``logos`` list of a model answer, or None when it is not readable."""
    try:
        obj, _ = json.JSONDecoder().raw_decode(content, content.find("{"))
        logos = obj["logos"]
    except Exception:
        return None
    return logos if isinstance(logos, list) else None


def parse(content, x0, y0, w, h):
    """Spike ``fb_k1.parse``: box_2d [ymin,xmin,ymax,xmax] 0..1000 → label pixels (float).
    Only top-15 codes with a usable box are kept; ``volgorde`` is the place in the answer.
    """
    out = []
    for i, it in enumerate(_logos(content) or []):
        code = it.get("code") if isinstance(it, dict) else None
        box = it.get("box_2d") if isinstance(it, dict) else None
        if code not in TOP15 or not (
            isinstance(box, list)
            and len(box) == 4
            and all(
                isinstance(v, (int, float)) and not isinstance(v, bool) for v in box
            )
        ):
            continue
        ymin, xmin, ymax, xmax = (min(1000, max(0, v)) for v in box)
        if ymin < ymax and xmin < xmax:
            vak = [
                x0 + xmin * w / 1000,
                y0 + ymin * h / 1000,
                x0 + xmax * w / 1000,
                y0 + ymax * h / 1000,
            ]
            out.append({"code": code, "vak": vak, "volgorde": i})
    return out


def top_codes(E, R, codes, k=GATE_TOP):
    """Per crop embedding: the ``k`` best distinct reference codes with their best cosine."""
    out = []
    for v in E:
        s = R @ v
        best = {}
        for j in np.argsort(-s):
            best.setdefault(codes[j], float(s[j]))
            if len(best) >= k:
                break
        out.append(list(best.items()))
    return out


def gate(meldingen, tops):
    """K4-xy rule: a report stays when its code is among its crop's top distinct codes."""
    kept = []
    for m, top in zip(meldingen, tops):
        score = dict(top).get(m["code"])
        if score is not None:
            kept.append({**m, "confidence": min(1.0, max(0.0, score))})
    return kept


def _iou(a, b):
    def area(v):
        return max(0, v[2] - v[0]) * max(0, v[3] - v[1])

    i = area([max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])])
    u = area(a) + area(b) - i
    return i / u if u > 0 else 0.0


def merge(meldingen):
    """Spike ``tel.samenvoegen`` with score 0: same code and IoU >= 0.5 chain into one
    group; the member with the lowest ``orde`` stays (confidence plays no part)."""
    parent = list(range(len(meldingen)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, a in enumerate(meldingen):
        for j in range(i):
            b = meldingen[j]
            if a["code"] == b["code"] and _iou(a["vak"], b["vak"]) >= MERGE_IOU:
                parent[root(i)] = root(j)
    groups = {}
    for i, m in enumerate(meldingen):
        groups.setdefault(root(i), []).append(m)
    return sorted((min(g, key=lambda m: m["orde"]) for g in groups.values()),
                  key=lambda m: m["orde"])  # fmt: skip


def to_bbox(vak, width, height):
    """Float box → integer pixel box: floor/ceil, clamped to the image, at least 1 px."""
    x = min(max(math.floor(vak[0]), 0), width - 1)
    y = min(max(math.floor(vak[1]), 0), height - 1)
    x1 = max(min(math.ceil(vak[2]), width), x + 1)
    y1 = max(min(math.ceil(vak[3]), height), y + 1)
    return {"x": x, "y": y, "width": x1 - x, "height": y1 - y}


def _rgb(im):
    """Transparency on white, then RGB (spike ``fb_embed.rgb``)."""
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.split()[3])
        return bg
    return im.convert("RGB")


# --- SigLIP 2 image tower ------------------------------------------------------
_EMBEDDER = None
_EMBEDDER_LOCK = threading.Lock()


class _SiglipEmbedder:
    def __init__(self, path):
        from transformers import SiglipImageProcessor, SiglipVisionModel

        self.model = SiglipVisionModel.from_pretrained(path).eval()
        self.processor = SiglipImageProcessor.from_pretrained(path)

    def embed(self, images):
        import torch

        with torch.inference_mode():
            inputs = self.processor(images=images, return_tensors="pt")
            v = self.model(**inputs).pooler_output.float().numpy()
        return (v / np.linalg.norm(v, axis=1, keepdims=True)).astype(np.float32)


def get_embedder():
    """Lazy, once per worker; legacy requests and start-up never load SigLIP."""
    global _EMBEDDER
    if _EMBEDDER is None:
        with _EMBEDDER_LOCK:
            if _EMBEDDER is None:
                path = os.environ.get("K4AA_SIGLIP_PATH", "/opt/siglip2-vision")
                if not os.path.isdir(path):
                    raise K4aaError("siglip_model_unavailable")
                try:
                    _EMBEDDER = _SiglipEmbedder(path)
                except Exception:
                    logger.error("K4-aa SigLIP model could not be loaded")
                    raise K4aaError("siglip_model_unavailable") from None
    return _EMBEDDER


def _reference_image(path):
    from app.services.storage import storage_service

    return _rgb(Image.open(io.BytesIO(storage_service.get_training_image(path))))


def _has_embedding(row):
    return row["embedding"] is not None and row["embedded_path"] == row["storage_path"]


async def _active_references():
    try:
        return await db_service.get_siglip_references(SIGLIP_MODEL_NAME)
    except asyncpg.exceptions.UndefinedTableError:
        raise K4aaError("siglip_references_missing") from None


# --- references for the gate -----------------------------------------------------
_REF_CACHE = None  # (key, R, codes) per worker


async def _reference_matrix(run_blocking):
    """All active references vote. Missing or stale SigLIP embeddings (<= 8) are
    computed in memory only; more fail the scan rather than vote with a partial set."""
    global _REF_CACHE
    rows = await _active_references()
    if not rows:
        raise K4aaError("siglip_references_missing")
    key = hashlib.sha256(
        json.dumps(
            sorted(
                [str(r["id"]), r["t3777_code"], r["storage_path"], _has_embedding(r)]
                for r in rows
            )
        ).encode()
    ).hexdigest()
    if _REF_CACHE is not None and _REF_CACHE[0] == key:
        return _REF_CACHE[1], _REF_CACHE[2], 0
    missing = [r for r in rows if not _has_embedding(r)]
    if len(missing) > MAX_INLINE_EMBEDDINGS:
        raise K4aaError("siglip_references_incomplete")
    vectors = {str(r["id"]): np.asarray(r["embedding"], np.float32) for r in rows}
    if missing:
        embedder = await run_blocking(get_embedder)
        images = []
        for r in missing:
            try:
                images.append(await run_blocking(_reference_image, r["storage_path"]))
            except _PASS:
                raise
            except Exception:
                logger.warning("K4-aa reference image unavailable: id=%s", r["id"])
                raise K4aaError("siglip_references_incomplete") from None
        for r, v in zip(missing, await run_blocking(embedder.embed, images)):
            vectors[str(r["id"])] = v
    if len({v.shape for v in vectors.values()}) != 1:
        raise K4aaError("siglip_references_incomplete")
    R = np.stack([vectors[str(r["id"])] for r in rows])
    codes = [normalize_code(r["t3777_code"]) for r in rows]
    _REF_CACHE = (key, R, codes)
    return R, codes, len(missing)


# --- provider calls ----------------------------------------------------------------
def _config():
    base = settings.GHS_REVIEW_BASE_URL.strip().rstrip("/")
    key = settings.GHS_REVIEW_API_KEY.get_secret_value().strip()
    if base != OPENROUTER or not key:
        raise K4aaError("provider_unavailable")
    return base, key


def _backoff(attempt):
    return 2 * attempt


def _add_usage(totals, envelope):
    usage = envelope.get("usage")
    for field, name in (
        ("tokens_in", "prompt_tokens"),
        ("tokens_out", "completion_tokens"),
        ("cost_usd", "cost"),
    ):
        value = usage.get(name) if isinstance(usage, dict) else None
        ok = isinstance(value, (int, float)) and not isinstance(value, bool)
        totals[field] = (
            totals[field] + value if ok and totals[field] is not None else None
        )


async def _call(client, base, key, system, window_b64, sheet_b64, remaining, totals):
    body = {
        "model": MODEL,
        "temperature": 0,
        "max_tokens": 4096,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "logos", "strict": True, "schema": SCHEMA},
        },
        "usage": {"include": True},
        "messages": [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "data:image/png;base64," + sheet_b64,
                            "detail": "high",
                        },
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "data:image/jpeg;base64," + window_b64,
                            "detail": "high",
                        },
                    },
                ],
            },
        ],
        "reasoning": {"effort": "minimal"},
        "provider": PROVIDER,
    }
    for attempt in range(MAX_RETRIES + 1):
        if attempt:
            left = _left(remaining) - RESERVE_S - MIN_ATTEMPT_S
            await asyncio.sleep(max(0.0, min(_backoff(attempt), left)))
        async with _CALLS:
            # Measured after the wait for a slot, so a queued call never uses a stale budget.
            timeout = min(MAX_ATTEMPT_S, _left(remaining) - RESERVE_S)
            if timeout < MIN_ATTEMPT_S:
                raise K4aaError(
                    "provider_retry_exhausted" if attempt else "budget_exhausted"
                )
            totals["attempts"] += 1
            try:
                response = await client.post(
                    base + "/chat/completions",
                    json=body,
                    headers={"Authorization": "Bearer " + key},
                    timeout=httpx.Timeout(timeout),
                )
            except httpx.RequestError:
                continue
        status = response.status_code
        if status == 429 or status >= 500:
            continue
        if status == 404:  # no endpoint satisfies the zero-retention policy
            raise K4aaError("no_zdr_provider")
        if status in (401, 403):
            raise K4aaError("provider_auth")
        if status == 402:
            raise K4aaError("provider_payment")
        if status != 200:
            raise K4aaError("provider_rejected")
        try:
            envelope = response.json()
            choice = envelope["choices"][0]
            if not isinstance(choice, dict):
                raise TypeError
        except Exception:
            raise K4aaError("provider_malformed") from None
        _add_usage(totals, envelope)
        if choice.get("finish_reason") not in ("stop", "STOP"):
            continue
        message = choice.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or _logos(content) is None:
            continue
        return content, envelope.get("provider")
    raise K4aaError("provider_retry_exhausted")


async def _call_all(base, key, encoded, remaining, totals):
    sheet_b64 = base64.b64encode(referentieblad_bytes()).decode("ascii")
    async with httpx.AsyncClient(follow_redirects=False) as client:
        try:
            async with asyncio.TaskGroup() as group:
                tasks = [
                    group.create_task(
                        _call(
                            client,
                            base,
                            key,
                            INSTRUCTIE + (DEEL if i else ""),
                            b64,
                            sheet_b64,
                            remaining,
                            totals,
                        )
                    )
                    for i, b64 in enumerate(encoded)
                ]
        except BaseExceptionGroup as failed:
            # The first definitive failure cancels the other windows.
            raise failed.exceptions[0] from None
    return [t.result() for t in tasks]


# --- scan ---------------------------------------------------------------------------
async def scan(data, remaining):
    """One label (PNG/JPEG bytes) → gated, merged top-15 detections plus cost stats.
    ``remaining()`` gives the seconds left of the caller's budget."""
    from app.api.artwork import strict_blocking

    started = time.monotonic()
    base, key = _config()
    if _left(remaining) - RESERVE_S < MIN_ATTEMPT_S:
        raise K4aaError("budget_exhausted")
    if not data:
        raise K4aaError("image_invalid")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise K4aaError("image_invalid")
    H, W = img.shape[:2]
    try:
        # cv2 applies EXIF orientation; PIL only after exif_transpose.
        pil = await strict_blocking(
            lambda: _rgb(ImageOps.exif_transpose(Image.open(io.BytesIO(data))))
        )
    except _PASS:
        raise
    except Exception:
        raise K4aaError("image_invalid") from None
    if pil.size != (W, H):
        raise K4aaError("image_invalid")
    # References first: an incomplete pool must fail before any paid provider call.
    R, codes, inline = await _reference_matrix(strict_blocking)
    wins = windows(W, H)
    encoded = [
        (await strict_blocking(encode_window, img[y0:y1, x0:x1]))[0]
        for (x0, y0, x1, y1) in wins
    ]
    totals = {"attempts": 0, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}
    try:
        answers = await asyncio.wait_for(
            _call_all(base, key, encoded, remaining, totals),
            max(0.001, _left(remaining) - RESERVE_S),
        )
    except TimeoutError:
        raise K4aaError("budget_exhausted") from None
    except K4aaError as exc:
        logger.warning(
            "K4-aa provider calls failed (%s), windows=%d", exc.klasse, len(wins)
        )
        raise
    reports = []
    for i, ((x0, y0, x1, y1), (content, _)) in enumerate(zip(wins, answers)):
        for m in parse(content, x0, y0, x1 - x0, y1 - y0):
            reports.append(
                {"code": m["code"], "vak": m["vak"], "orde": (i, m["volgorde"])}
            )
    found = len(reports)
    reports = reports[:MAX_REPORTS]

    valid, crops = [], []
    for n, m in enumerate(reports):
        x0, y0, x1, y1 = m["vak"]
        if min(x1, W) - max(x0, 0) < 1 or min(y1, H) - max(y0, 0) < 1:
            continue
        box = (
            max(0, round(x0)),
            max(0, round(y0)),
            min(W, round(x1)),
            min(H, round(y1)),
        )
        if box[2] - box[0] < 1 or box[3] - box[1] < 1:
            continue  # rounding collapsed it (round(1.5) == round(2.5))
        valid.append(n)
        crops.append(pil.crop(box))
    tops = [[] for _ in reports]  # an invalid box has an empty top and drops out
    if crops:
        embedder = await strict_blocking(get_embedder)
        E = []
        for b in range(0, len(crops), EMBED_BATCH):
            if _left(remaining) <= 0:
                raise K4aaError("budget_exhausted")
            E.append(await strict_blocking(embedder.embed, crops[b : b + EMBED_BATCH]))
        for n, top in zip(valid, top_codes(np.concatenate(E), R, codes)):
            tops[n] = top
    kept = merge(gate(reports, tops))

    stats = {
        "calls": len(wins),
        **totals,
        "providers": [provider for _, provider in answers],
        "k1_meldingen": found,
        "na_poort": len(kept),
        "dropped": found - len(reports),
        "referenties": len(codes),
        "inline_embedded": inline,
    }
    logger.info(
        "K4-aa scan done: windows=%d reports=%d kept=%d dropped=%d s=%.1f",
        len(wins),
        found,
        len(kept),
        stats["dropped"],
        time.monotonic() - started,
    )
    detections = []
    for m in kept:
        uncertain = m["code"] not in BRUIKBAAR
        detections.append(
            {
                "bbox": to_bbox(m["vak"], W, H),
                "t3777_code": m["code"],
                "confidence": m["confidence"],
                "method": "k4aa",
                "uncertain": uncertain,
                "requires_review": uncertain,
            }
        )
    return {"detections": detections, "stats": stats}


# --- reference embedding sync ----------------------------------------------------------
async def sync_reference_embeddings(limit=1000):
    """Add missing SigLIP embeddings and refresh ones whose reference file moved.
    Never deletes. One run at a time (advisory lock); stops after 120 s."""
    async with db_service.get_connection() as conn:
        if not await conn.fetchval("SELECT pg_try_advisory_lock($1)", SYNC_LOCK_ID):
            raise K4aaError("sync_busy")
        try:
            rows = await _active_references()
            todo = [r for r in rows if not _has_embedding(r)]
            added = updated = failed = 0
            if todo:
                embedder = await asyncio.to_thread(get_embedder)
            deadline = time.monotonic() + SYNC_MAX_S
            for b in range(0, min(limit, len(todo)), EMBED_BATCH):
                if time.monotonic() > deadline:
                    break
                batch = todo[b : min(b + EMBED_BATCH, limit)]
                images, loaded = [], []
                for r in batch:
                    try:
                        images.append(
                            await asyncio.to_thread(_reference_image, r["storage_path"])
                        )
                        loaded.append(r)
                    except Exception:
                        failed += 1
                        logger.warning(
                            "K4-aa sync: reference image failed: id=%s", r["id"]
                        )
                if not images:
                    continue
                vectors = await asyncio.to_thread(embedder.embed, images)
                for r, v in zip(loaded, vectors):
                    await db_service.upsert_siglip_embedding(
                        r["id"], SIGLIP_MODEL_NAME, r["storage_path"], v
                    )
                    if r["embedding"] is None:
                        added += 1
                    else:
                        updated += 1
        finally:
            await conn.execute("SELECT pg_advisory_unlock($1)", SYNC_LOCK_ID)
    summary = {
        "toegevoegd": added,
        "bijgewerkt": updated,
        "ontbrekend_rest": len(todo) - added - updated - failed,
        "mislukt": failed,
    }
    logger.info("K4-aa reference embeddings synced: %s", summary)
    return summary
