"""Bounded visual region proposals; provider labels/scores never classify logos."""

import asyncio
import base64
import json
import logging
import math
import os

import cv2
import httpx

from app.ghs_review import provider_config

MAX_RESPONSE_BYTES = 256 * 1024
MAX_REGIONS = 64
# Product-owner decision 12-10-2026: tiling stays in the code but is off by
# default (one whole-label call, as before); VISUAL_PROPOSAL_MAX_CALLS opts in.
DEFAULT_MAX_CALLS = 1
MAX_CALLS_LIMIT = 6

logger = logging.getLogger(__name__)


def proposal_image(image):
    height, width = image.shape[:2]
    ratio = min(1.0, 2400 / max(height, width))
    small = (
        cv2.resize(
            image,
            (max(1, round(width * ratio)), max(1, round(height * ratio))),
            interpolation=cv2.INTER_AREA,
        )
        if ratio < 1
        else image
    )
    ok, encoded = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok or encoded.nbytes > 4 * 1024 * 1024:
        raise ValueError("Proposal image exceeds bounds")
    return base64.b64encode(encoded).decode("ascii")


def parse_proposals(envelope, width, height, stats=None):
    """Parse one provider answer. A reversed, degenerate or (after clipping or
    projection) empty box is skipped and counted in ``stats["skipped"]``; every
    other invalid answer stays a hard error."""

    def skip():
        if stats is not None:
            stats["skipped"] = stats.get("skipped", 0) + 1

    choices = envelope.get("choices")
    if not isinstance(choices, list) or len(choices) != 1:
        raise ValueError("Incomplete proposal response")
    choice = choices[0]
    if choice.get("finish_reason") != "stop":
        raise ValueError("Proposal response truncated")
    content = choice["message"]["content"]
    if not isinstance(content, str):
        raise ValueError("Invalid proposal content")

    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate proposal key")
            result[key] = value
        return result

    # Models sometimes put a sentence before the JSON object (or wrap it in a
    # markdown fence). Decode the first object and ignore surrounding prose; the
    # strict checks below still apply to that object.
    start = content.find("{")
    if start < 0:
        raise ValueError("Proposal content has no JSON object")
    parsed, _ = json.JSONDecoder(object_pairs_hook=unique_keys).raw_decode(
        content, start
    )
    if not isinstance(parsed, dict) or set(parsed) != {"regions"}:
        raise ValueError("Invalid proposal object")
    regions = parsed["regions"]
    if not isinstance(regions, list) or len(regions) > MAX_REGIONS:
        raise ValueError("Invalid proposal count")
    output = []
    seen = set()
    for region in regions:
        if not isinstance(region, dict) or set(region) != {"box_2d"}:
            raise ValueError("Invalid proposal region")
        box = region["box_2d"]
        if not (
            isinstance(box, list)
            and len(box) == 4
            and all(type(v) in (int, float) and math.isfinite(v) for v in box)
        ):
            raise ValueError("Invalid proposal coordinates")
        ymin, xmin, ymax, xmax = box
        if ymin >= ymax or xmin >= xmax:
            skip()
            continue
        # Models sometimes overshoot the image edge by a few units. Clip to the
        # image instead of rejecting the whole answer; a box that clips to
        # nothing is skipped.
        ymin, xmin, ymax, xmax = (
            min(1000, max(0, v)) for v in (ymin, xmin, ymax, xmax)
        )
        if ymin >= ymax or xmin >= xmax:
            skip()
            continue
        x0, y0 = math.floor(xmin * width / 1000), math.floor(ymin * height / 1000)
        x1, y1 = math.ceil(xmax * width / 1000), math.ceil(ymax * height / 1000)
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(width, x1), min(height, y1)
        if x0 >= x1 or y0 >= y1:
            skip()
            continue
        key = (x0, y0, x1, y1)
        if key not in seen:
            seen.add(key)
            output.append(
                {"bbox": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}}
            )
    return output


def max_calls():
    """Ceiling on provider calls per scan: env VISUAL_PROPOSAL_MAX_CALLS, 1..6, default 1.
    1 and 2 both mean the whole-label call only (tiles start at two tile calls)."""
    raw = os.environ.get("VISUAL_PROPOSAL_MAX_CALLS")
    if raw is None:
        return DEFAULT_MAX_CALLS
    try:
        value = int(raw)
    except ValueError:
        value = 0
    if 1 <= value <= MAX_CALLS_LIMIT:
        return value
    logger.warning("Invalid VISUAL_PROPOSAL_MAX_CALLS; using %d", DEFAULT_MAX_CALLS)
    return DEFAULT_MAX_CALLS


def reserve_seconds(remaining):
    """Reserve kept for the rest of the scan (classification): min(30 s, 25% of
    what remains). The visual phase stops at remaining - reserve; refinement runs
    while remaining >= reserve."""
    return min(30.0, 0.25 * remaining)


def tile_windows(width, height, calls):
    """(x0, y0, x1, y1) tiles in row order for ``calls - 1`` tile calls; [] when
    fewer than two tiles are allowed or one cell covers the whole label."""
    if calls - 1 < 2:
        return []
    side = 1600.0
    while math.ceil(width / side) * math.ceil(height / side) > calls - 1:
        side *= 1.1
    cols, rows = math.ceil(width / side), math.ceil(height / side)
    if cols * rows == 1:
        return []
    cell_w, cell_h = width / cols, height / rows
    pad_x, pad_y = 0.075 * cell_w, 0.075 * cell_h
    return [
        (
            max(0, math.floor(c * cell_w - pad_x)),
            max(0, math.floor(r * cell_h - pad_y)),
            min(width, math.ceil((c + 1) * cell_w + pad_x)),
            min(height, math.ceil((r + 1) * cell_h + pad_y)),
        )
        for r in range(rows)
        for c in range(cols)
    ]


def _failure_class(exc):
    status = getattr(getattr(exc, "response", None), "status_code", None)
    return type(exc).__name__ + (f"_{status}" if status is not None else "")


def merge_proposals(groups):
    """Concatenate per-call boxes in call order; drop a box with IoU >= 0.7 to a box
    kept from an EARLIER call. Boxes within one answer are never merged."""
    from app.services.localization import _iou

    kept = []
    for group in groups:
        earlier = list(kept)
        kept.extend(
            box
            for box in group
            if all(_iou(box["bbox"], k["bbox"]) < 0.7 for k in earlier)
        )
    return kept


async def visual_proposals(image, codes, remaining_seconds, reserve=0.0):
    """Whole label plus up to ``max_calls() - 1`` tiles, in parallel; one failing
    call fails the localization. The phase stops at ``remaining_seconds() - reserve``
    (the caller computes the reserve once, see ``reserve_seconds``). Returns
    ``(boxes, stats)``."""
    # Lazy import avoids runtime context coupling for default localization callers.
    from app.api.artwork import strict_blocking

    base, key, models = provider_config()
    height, width = image.shape[:2]
    budget = remaining_seconds() - reserve
    windows = [(0, 0, width, height)] + tile_windows(width, height, max_calls())
    prompt = (
        'Return only JSON {"regions":[{"box_2d":[ymin,xmin,ymax,xmax]}]}. '
        "Coordinates are normalized 0..1000 for the entire image. Find all visibly present "
        "certification, recycling, environmental, nutritional score and hazardous-substance "
        "pictograms in any rotation. Include the complete readable mark, not one letter. "
        "Exclude product brands, printer logos, cooking instructions, ordinary text and barcodes. "
        "Do not infer a logo from a product declaration. Do not supply labels or confidence. "
        "At most 64 regions. A genuinely negative image has regions: []. "
        "Active reference classes for visual context only: "
        + ", ".join(sorted(set(codes or [])))
    )
    tile_prompt = (
        prompt
        + " This image is one section of a larger label; include marks cut off at the section edge."
    )
    stats = {"calls": len(windows), "tokens_in": 0, "tokens_out": 0, "skipped": 0}

    async def request(index, window):
        x0, y0, x1, y1 = window
        encoded = await strict_blocking(proposal_image, image[y0:y1, x0:x1])
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(budget), follow_redirects=False
        ) as client:
            async with client.stream(
                "POST",
                base + "/chat/completions",
                headers={"Authorization": "Bearer " + key},
                json={
                    "model": models[0],
                    "messages": [
                        {"role": "system", "content": tile_prompt if index else prompt},
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": "data:image/jpeg;base64," + encoded,
                                        "detail": "high",
                                    },
                                }
                            ],
                        },
                    ],
                    "response_format": {"type": "json_object"},
                    "max_tokens": 8192,
                },
            ) as response:
                response.raise_for_status()
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_RESPONSE_BYTES:
                        raise ValueError("Proposal response exceeds size limit")
        envelope = json.loads(data)
        usage = envelope.get("usage") if isinstance(envelope, dict) else None
        for field, name in (
            ("tokens_in", "prompt_tokens"),
            ("tokens_out", "completion_tokens"),
        ):
            count = usage.get(name) if isinstance(usage, dict) else None
            if (
                stats[field] is not None
                and isinstance(count, int)
                and not isinstance(count, bool)
            ):
                stats[field] += count
            else:
                stats[field] = None
        boxes = parse_proposals(envelope, x1 - x0, y1 - y0, stats)
        for box in boxes:
            box["bbox"]["x"] += x0
            box["bbox"]["y"] += y0
        return boxes

    async def run_all():
        try:
            async with asyncio.TaskGroup() as group:
                tasks = [
                    group.create_task(request(i, w)) for i, w in enumerate(windows)
                ]
        except BaseExceptionGroup as failed:
            # Class per failed call only: no URLs, keys, bodies or image data.
            logger.warning(
                "Visual proposal calls failed: %d of %d (%s)",
                len(failed.exceptions),
                len(windows),
                ", ".join(_failure_class(exc) for exc in failed.exceptions),
            )
            # First failure cancels the rest; surface it unwrapped so the route
            # maps it to its usual error class.
            raise failed.exceptions[0] from None
        return [task.result() for task in tasks]

    groups = await asyncio.wait_for(run_all(), budget)
    return merge_proposals(groups), stats
