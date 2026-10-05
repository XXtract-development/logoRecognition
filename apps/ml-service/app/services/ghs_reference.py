"""Offline official-template GHS route; never claims field calibration or writes data."""

import hashlib
import json
import logging
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from app.symbol_contract import GHS_CODES, normalize_code

ASSET_ROOT = Path(__file__).resolve().parents[1] / "assets/ghs"
METHOD = "ghs-reference"
THRESHOLD = 0.87
PROPOSAL_FLOOR = 0.65
MARGIN = 0.035
MAX_CANDIDATES = 64
MAX_WORK_PIXELS = 4_000_000
PHOTO_PREPROCESSING = "neutral-quad-v1"
PARTIAL_PREPROCESSING = "partial-quad-v1"
EDGE_PAPER_PREPROCESSING = "edge-paper-ring-v1"
MIN_PHOTO_SIDE = 32


def _overlap(a, b):
    x, y, w, h = a
    ox, oy, ow, oh = b
    inter = max(0, min(x + w, ox + ow) - max(x, ox)) * max(
        0, min(y + h, oy + oh) - max(y, oy)
    )
    return inter / (w * h + ow * oh - inter) if inter else 0


def _photo_candidates(image):
    """Closed or physically near-complete quads; dedup after classification."""
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, (0, 90, 65), (12, 255, 255)) | cv2.inRange(
        hsv, (165, 90, 65), (180, 255, 255)
    )
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    groups = []
    covered_red = None
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[
        : MAX_CANDIDATES * 4
    ]:
        x, y, w, h = cv2.boundingRect(contour)
        if min(w, h) < MIN_PHOTO_SIDE or not 0.65 < w / h < 1.5:
            continue
        quad = cv2.approxPolyDP(contour, 0.035 * cv2.arcLength(contour, True), True)
        preprocessing = PHOTO_PREPROCESSING
        if (
            len(quad) != 4
            or not cv2.isContourConvex(quad)
            or not 0.30 < cv2.contourArea(contour) / (w * h) < 0.72
        ):
            hull = cv2.convexHull(contour)
            quad = cv2.approxPolyDP(hull, 0.035 * cv2.arcLength(hull, True), True)
            if len(quad) != 4 or not 0.30 < cv2.contourArea(hull) / (w * h) < 0.72:
                continue
            # A convex hull alone would invent edges for open artwork. Require
            # real red pixels on every edge, with only one pixel of raster tolerance.
            if covered_red is None:
                covered_red = cv2.dilate(mask, np.ones((3, 3), np.uint8))
            points = quad.reshape(-1, 2)
            coverage = []
            for index in range(4):
                edge = np.round(
                    np.linspace(points[index], points[(index + 1) % 4], 64)
                ).astype(int)
                coverage.append(float((covered_red[edge[:, 1], edge[:, 0]] > 0).mean()))
            if min(coverage) < 0.90 or float(np.mean(coverage)) < 0.95:
                continue
            preprocessing = PARTIAL_PREPROCESSING
        vertices = (quad.reshape(-1, 2) - [x, y]) / [w, h]
        expected = np.array([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]])
        if any(
            np.linalg.norm(vertices - point, axis=1).min() > 0.22 for point in expected
        ):
            continue
        box = (x, y, w, h)
        candidate = (box, quad.reshape(-1, 2).astype(np.float32), preprocessing)
        group = next((g for g in groups if _overlap(g[0][0], box) > 0.5), None)
        if group is not None:
            if len(group) < 2:
                group.append(candidate)
        elif len(groups) < MAX_CANDIDATES:
            groups.append([candidate])
    return groups


def _photo_glyph(image, box, quad, diagnostics=None):
    """Physical contour rectification and automatic neutral-paper segmentation."""
    x, y, w, h = box
    points = quad - [x, y]
    center = points.mean(axis=0)
    angles = np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0])
    points = points[np.argsort(angles)]
    points = np.roll(points, -int(np.argmin(points[:, 1])), axis=0).astype(np.float32)
    target = np.array([[64, 0], [127, 64], [64, 127], [0, 64]], np.float32)
    rectified = cv2.warpPerspective(
        image[y : y + h, x : x + w],
        cv2.getPerspectiveTransform(points, target),
        (128, 128),
        borderValue=(255, 255, 255),
    )
    hsv = cv2.cvtColor(rectified, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(rectified, cv2.COLOR_BGR2GRAY)
    yy, xx = np.indices(gray.shape)
    radius = abs(xx / 127 - 0.5) + abs(yy / 127 - 0.5)
    neutral = hsv[:, :, 1] < 85
    interior = radius < 0.40
    eligible = neutral & interior
    if eligible.sum() < 100 or float(neutral[interior].mean()) < 0.65:
        return None
    values = gray[eligible]
    low, high = np.percentile(values, [10, 90])
    if high < 90 or high - low < 40:
        return None
    threshold, _ = cv2.threshold(values, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    annulus = (radius > 0.30) & (radius < 0.40)
    white = neutral & (gray > threshold)
    if float(white[annulus].mean()) < 0.50:
        # Dense glyphs can occupy the inner annulus. Border-adjacent paper
        # must remain neutral and light on every physical side independently.
        ring = (radius > 0.40) & (radius < 0.46)
        for sector in (
            (xx >= 64) & (yy < 64),
            (xx >= 64) & (yy >= 64),
            (xx < 64) & (yy >= 64),
            (xx < 64) & (yy < 64),
        ):
            if float(white[ring & sector].mean()) < 0.65:
                return None
        if diagnostics is not None:
            diagnostics["preprocessing"] = EDGE_PAPER_PREPROCESSING
    binary = np.where(neutral & (gray <= threshold), 0, 255).astype(np.uint8)
    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


def _photo_recovery(image, existing, wanted):
    from app.services.ghs_specialist import classify

    additions = []
    for group in _photo_candidates(image):
        box = group[0][0]
        if any(
            not d.get("uncertain", True)
            and _overlap(
                box, tuple(d["bbox"][k] for k in ["x", "y", "width", "height"])
            )
            > 0.5
            for d in existing
        ):
            continue
        proposals = []
        for candidate in group:
            candidate_box, quad = candidate[:2]
            preprocessing = candidate[2] if len(candidate) > 2 else PHOTO_PREPROCESSING
            diagnostics = {}
            glyph = _photo_glyph(image, candidate_box, quad, diagnostics)
            if diagnostics.get("preprocessing"):
                preprocessing += ":" + diagnostics["preprocessing"]
            learned = classify(glyph) if glyph is not None else None
            if learned is not None:
                eligible = (
                    diagnostics.get("preprocessing") != EDGE_PAPER_PREPROCESSING
                    or learned.get("uncertain", True) is False
                )
                proposals.append(
                    {**learned, "_preprocessing": preprocessing, "_eligible": eligible}
                )
        # Inconsistent interpretations of the same physical stroke are ambiguous.
        if not proposals or len({p["t3777_code"] for p in proposals}) != 1:
            continue
        proposals = [p for p in proposals if p["_eligible"]]
        if not proposals:
            continue
        chosen = max(proposals, key=lambda p: p["support_similarity"])
        if chosen["t3777_code"] not in wanted:
            continue
        preprocessing = chosen.pop("_preprocessing")
        chosen.pop("_eligible")
        x, y, w, h = box
        additions.append(
            {
                **chosen,
                "reference_version": chosen["reference_version"] + ":" + preprocessing,
                "bbox": {"x": x, "y": y, "width": w, "height": h},
            }
        )
    return additions


def _bgr(image):
    if isinstance(image, np.ndarray):
        return image[:, :, :3]
    return cv2.cvtColor(np.asarray(image.convert("RGB")), cv2.COLOR_RGB2BGR)


def regions(image, minimum_white=0.65):
    """Require an actual closed red diamond, keeping other graphics out of this route."""
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, (0, 90, 65), (12, 255, 255)) | cv2.inRange(
        hsv, (165, 90, 65), (180, 255, 255)
    )
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[
        : MAX_CANDIDATES * 4
    ]:
        x, y, w, h = cv2.boundingRect(contour)
        if min(w, h) < 16 or not 0.65 < w / h < 1.5:
            continue
        area = cv2.contourArea(contour)
        approx = cv2.approxPolyDP(contour, 0.035 * cv2.arcLength(contour, True), True)
        if len(approx) != 4 or not 0.30 < area / (w * h) < 0.72:
            continue
        vertices = (approx.reshape(-1, 2) - np.array([x, y])) / np.array([w, h])
        expected = np.array([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]])
        if any(
            np.linalg.norm(vertices - point, axis=1).min() > 0.22 for point in expected
        ):
            continue
        # A real GHS diamond has a white interior behind its black symbol.
        # Background artwork holes/flowers are not accepted as red rings.
        inner = hsv[y : y + h, x : x + w]
        yy, xx = np.indices((h, w))
        radius = abs(xx / w - 0.5) + abs(yy / h - 0.5)
        white_annulus = (radius > 0.30) & (radius < 0.40)
        white = (inner[:, :, 1] < 85) & (inner[:, :, 2] > 160)
        if float(white[white_annulus].mean()) < minimum_white:
            continue
        boxes.append((x, y, w, h))
    # Inner/outer contours of the same red stroke are one candidate. Prefer
    # the outer box, including when the diamond is nested in a red label frame.
    output = []
    for box in sorted(boxes, key=lambda b: b[2] * b[3], reverse=True):
        x, y, w, h = box
        duplicate = False
        for ox, oy, ow, oh in output:
            inter = max(0, min(x + w, ox + ow) - max(x, ox)) * max(
                0, min(y + h, oy + oh) - max(y, oy)
            )
            if inter / (w * h + ow * oh - inter) > 0.7 or inter / (w * h) > 0.98:
                duplicate = True
                break
        if not duplicate:
            output.append(box)
    return output[:MAX_CANDIDATES]


def descriptor(crop):
    gray = cv2.cvtColor(cv2.resize(crop, (96, 96)), cv2.COLOR_BGR2GRAY)
    # Interior black symbol, excluding the shared red outline.
    yy, xx = np.indices(gray.shape)
    interior = abs(xx - 47.5) + abs(yy - 47.5) < 36
    return ((gray < 110) & interior).astype(np.float32)


@lru_cache(maxsize=1)
def references():
    manifest = json.loads((ASSET_ROOT / "manifest.json").read_text())
    result = []
    for entry in manifest["templates"]:
        code = normalize_code(entry["code"])
        path = (ASSET_ROOT / entry["file"]).resolve()
        if (
            path.parent != ASSET_ROOT.resolve()
            or code not in GHS_CODES
            or entry["split"] != "reference"
        ):
            raise ValueError("Invalid GHS template provenance/split")
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError("GHS reference checksum mismatch")
        image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        boxes = regions(image)
        if not boxes:
            raise ValueError("Official template has no closed red diamond")
        x, y, w, h = max(boxes, key=lambda b: b[2] * b[3])
        result.append((code, descriptor(image[y : y + h, x : x + w])))
    if len(result) != 9 or len({r[0] for r in result}) != 9:
        raise ValueError("Nine unique templates required")
    return manifest["version"], result


def detect_ghs(image, codes=None):
    image = _bgr(image)
    original_h, original_w = image.shape[:2]
    scale = min(1.0, (MAX_WORK_PIXELS / (original_h * original_w)) ** 0.5)
    if scale < 1:
        image = cv2.resize(
            image,
            (max(1, int(original_w * scale)), max(1, int(original_h * scale))),
            interpolation=cv2.INTER_AREA,
        )
    version, refs = references()
    wanted = {normalize_code(c) for c in codes} if codes else GHS_CODES
    output = []
    strict_boxes = set(regions(image))
    for x, y, w, h in regions(image, minimum_white=0.50):
        vector = descriptor(image[y : y + h, x : x + w])
        scores = []
        for code, ref in refs:
            denom = float(vector.sum() + ref.sum())
            score = 2 * float((vector * ref).sum()) / denom if denom else 0
            scores.append((score, code))
        scores.sort(reverse=True)
        score, code = scores[0]
        strict = (x, y, w, h) in strict_boxes
        legacy_allowed = (
            strict and score >= PROPOSAL_FLOOR and score - scores[1][0] >= MARGIN
        )
        legacy = {
            "t3777_code": code,
            "confidence": score,
            "score": score,
            "method": METHOD,
            "bbox": {"x": x, "y": y, "width": w, "height": h},
            "uncertain": score < THRESHOLD,
            "reference_version": version,
            "requires_review": True,
        }
        chosen = legacy if legacy_allowed and score >= THRESHOLD else None
        if chosen is None:
            try:
                from app.services.ghs_specialist import classify

                chosen = classify(image[y : y + h, x : x + w])
            except Exception:
                logging.getLogger(__name__).warning(
                    "GHS specialist unavailable; retaining template route",
                    exc_info=False,
                )
            if chosen is None and legacy_allowed:
                chosen = legacy
        if chosen is not None and chosen["t3777_code"] in wanted:
            output.append(
                {
                    **chosen,
                    "bbox": {"x": x, "y": y, "width": w, "height": h},
                }
            )
    try:
        additions = _photo_recovery(image, output, wanted)
        combined = list(output)
        for addition in additions:
            box = tuple(addition["bbox"][k] for k in ["x", "y", "width", "height"])
            overlapping = [
                d
                for d in combined
                if _overlap(
                    box, tuple(d["bbox"][k] for k in ["x", "y", "width", "height"])
                )
                > 0.5
            ]
            if any(d["t3777_code"] != addition["t3777_code"] for d in overlapping):
                continue
            if overlapping:
                strongest = max(overlapping, key=lambda d: d["confidence"])
                if strongest["confidence"] >= addition["confidence"]:
                    continue
                combined = [d for d in combined if d not in overlapping]
            if len(combined) < MAX_CANDIDATES:
                combined.append(addition)
        output = combined
    except Exception:
        logging.getLogger(__name__).warning(
            "GHS photo recovery unavailable; retaining existing results", exc_info=False
        )
    sx, sy = original_w / image.shape[1], original_h / image.shape[0]
    for result in output:
        x, y, w, h = (result["bbox"][k] for k in ["x", "y", "width", "height"])
        left, top = int(x * sx), int(y * sy)
        right = min(original_w, int(np.ceil((x + w) * sx)))
        bottom = min(original_h, int(np.ceil((y + h) * sy)))
        result["bbox"] = {
            "x": left,
            "y": top,
            "width": right - left,
            "height": bottom - top,
        }
    return output


def classify_ghs(crop):
    detections = detect_ghs(crop)
    return (
        max(detections, key=lambda d: d["confidence"]) if len(detections) == 1 else None
    )
