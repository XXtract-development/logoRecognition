"""Bounded visual region proposals; provider labels/scores never classify logos."""

import asyncio
import base64
import json
import math

import cv2
import httpx

from app.ghs_review import provider_config

MAX_RESPONSE_BYTES = 256 * 1024
MAX_REGIONS = 64


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


def parse_proposals(envelope, width, height):
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

    parsed = json.loads(content, object_pairs_hook=unique_keys)
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
        if (
            not isinstance(box, list)
            or len(box) != 4
            or not all(
                type(v) in (int, float) and math.isfinite(v) and 0 <= v <= 1000
                for v in box
            )
        ):
            raise ValueError("Invalid proposal coordinates")
        ymin, xmin, ymax, xmax = box
        if ymin >= ymax or xmin >= xmax:
            raise ValueError("Invalid proposal order")
        x0, y0 = math.floor(xmin * width / 1000), math.floor(ymin * height / 1000)
        x1, y1 = math.ceil(xmax * width / 1000), math.ceil(ymax * height / 1000)
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(width, x1), min(height, y1)
        if x0 >= x1 or y0 >= y1:
            raise ValueError("Empty projected proposal")
        key = (x0, y0, x1, y1)
        if key not in seen:
            seen.add(key)
            output.append(
                {"bbox": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}}
            )
    return output


async def visual_proposals(image, codes, remaining_seconds):
    # Lazy import avoids runtime context coupling for default localization callers.
    from app.api.artwork import strict_blocking

    base, key, models = provider_config()
    encoded = await strict_blocking(proposal_image, image)
    height, width = image.shape[:2]
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

    async def request():
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(remaining_seconds()), follow_redirects=False
        ) as client:
            async with client.stream(
                "POST",
                base + "/chat/completions",
                headers={"Authorization": "Bearer " + key},
                json={
                    "model": models[0],
                    "messages": [
                        {"role": "system", "content": prompt},
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
        return parse_proposals(json.loads(data), width, height)

    return await asyncio.wait_for(request(), remaining_seconds())
