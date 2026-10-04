DEFAULT_T3777_CODES = {
    "EU_ORGANIC_FARMING",
    "BETER_LEVEN_1_STER",
    "MSC",
    "ASC",
    "FAIRTRADE",
    "FSC_MIX",
}
NUTRISCORE_CODES = {"A", "B", "C", "D", "E"}
GHS_ALIASES = dict(
    zip(
        (f"GHS{i:02d}" for i in range(1, 10)),
        [
            "EXPLODING_BOMB",
            "FLAME",
            "FLAME_OVER_CIRCLE",
            "GAS_CYLINDER",
            "CORROSION",
            "SKULL_AND_CROSSBONES",
            "EXCLAMATION_MARK",
            "HEALTH_HAZARD",
            "ENVIRONMENT",
        ],
    )
)
GHS_CODES = set(GHS_ALIASES.values())
GHS_LEGACY = {name: code for code, name in GHS_ALIASES.items()}


def normalize_code(code):
    value = str(code).strip().upper()
    return GHS_ALIASES.get(value, value)


def allowed_codes(profile):
    explicit = {normalize_code(code) for code in profile.get("codes", [])}
    codelists = set(profile.get("codelists", []))
    codes = set(explicit)
    if (
        (not codes and not codelists)
        or "T3777" in codelists
        or "PackagingMarkedLabelAccreditationCode" in codelists
    ):
        codes |= DEFAULT_T3777_CODES
    if "NutritionalScore" in codelists:
        codes |= NUTRISCORE_CODES
    if "GHSSymbolDescriptionCode" in codelists:
        codes |= GHS_CODES if not explicit else (explicit & GHS_CODES)
    return codes


def classify_codelist(code):
    code = normalize_code(code)
    if code in NUTRISCORE_CODES:
        return "NutritionalScore"
    if code in GHS_CODES:
        return "GHSSymbolDescriptionCode"
    return "T3777"


def normalize_detection(raw, profile, model_version, elapsed_ms):
    code = (
        str(raw.get("code") or raw.get("t3777_code") or raw.get("value") or "")
        .strip()
        .upper()
    )
    code = normalize_code(code)
    confidence = float(
        raw.get("confidence") or raw.get("match_confidence") or raw.get("score") or 0
    )
    method = str(raw.get("method") or "embedding")
    if method in {"ghs-reference", "ghs-specialist"}:
        method = "classifier"  # Legacy enum: deterministic reference classification.
    if method not in {"embedding", "classifier"}:
        method = "embedding"

    if not code:
        return None
    if code == "UNKNOWN":
        return {
            "code": "UNKNOWN",
            "codelist": "T3777",
            "confidence": 0.0,
            "bbox": raw.get("bbox"),
            "cropRef": raw.get("cropRef") or raw.get("crop_path"),
            "method": method,
            "modelVersion": model_version,
            "processingTimeMs": elapsed_ms,
            "uncertain": True,
        }
    below_threshold = confidence < float(profile.get("visionThreshold", 0.75))
    if below_threshold and code not in GHS_CODES:
        return None
    if code not in allowed_codes(profile):
        return None
    return {
        "code": GHS_LEGACY.get(code, code),
        "codelist": classify_codelist(code),
        "confidence": confidence,
        "bbox": raw.get("bbox"),
        "cropRef": raw.get("cropRef") or raw.get("crop_path"),
        "method": method,
        "modelVersion": (
            raw.get("reference_version", model_version)
            if code in GHS_CODES
            else model_version
        ),
        "processingTimeMs": elapsed_ms,
        "uncertain": bool(raw.get("uncertain", False) or below_threshold),
    }


def normalize_detections(raw, profile, model_version, elapsed_ms):
    out = []
    seen = set()
    for detection in raw:
        normalized = normalize_detection(detection, profile, model_version, elapsed_ms)
        if normalized is None:
            continue
        key = (normalized["code"], str(normalized.get("bbox")))
        if key in seen:
            continue
        if normalize_code(normalized["code"]) in GHS_CODES and any(
            previous["code"] == normalized["code"]
            and _box_iou(previous.get("bbox"), normalized.get("bbox")) >= 0.5
            for previous in out
        ):
            continue
        seen.add(key)
        out.append(normalized)
    return out


def _box_iou(a, b):
    if not a or not b:
        return 0.0
    try:
        overlap = max(
            0, min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"])
        ) * max(
            0, min(a["y"] + a["height"], b["y"] + b["height"]) - max(a["y"], b["y"])
        )
        union = a["width"] * a["height"] + b["width"] * b["height"] - overlap
        return overlap / union if union > 0 else 0.0
    except (KeyError, TypeError, ValueError):
        return 0.0
