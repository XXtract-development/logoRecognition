DEFAULT_T3777_CODES = {
    "EU_ORGANIC_FARMING",
    "BETER_LEVEN_1_STER",
    "MSC",
    "ASC",
    "FAIRTRADE",
    "FSC_MIX",
}
NUTRISCORE_CODES = {"A", "B", "C", "D", "E"}
GHS_CODES = {f"GHS{i:02d}" for i in range(1, 10)}


def allowed_codes(profile):
    explicit = {str(code).upper() for code in profile.get("codes", [])}
    codelists = set(profile.get("codelists", []))
    codes = set(explicit)
    if not codes or "T3777" in codelists or "PackagingMarkedLabelAccreditationCode" in codelists:
        codes |= DEFAULT_T3777_CODES
    if "NutritionalScore" in codelists:
        codes |= NUTRISCORE_CODES
    if "GHSSymbolDescriptionCode" in codelists:
        codes |= GHS_CODES
    return codes


def classify_codelist(code):
    if code in NUTRISCORE_CODES:
        return "NutritionalScore"
    if code in GHS_CODES:
        return "GHSSymbolDescriptionCode"
    return "T3777"


def normalize_detection(raw, profile, model_version, elapsed_ms):
    code = str(raw.get("code") or raw.get("t3777_code") or raw.get("value") or "").strip().upper()
    confidence = float(raw.get("confidence") or raw.get("match_confidence") or raw.get("score") or 0)
    method = str(raw.get("method") or "embedding")
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
    if confidence < float(profile.get("visionThreshold", 0.75)):
        return None
    if code not in allowed_codes(profile):
        return None
    return {
        "code": code,
        "codelist": classify_codelist(code),
        "confidence": confidence,
        "bbox": raw.get("bbox"),
        "cropRef": raw.get("cropRef") or raw.get("crop_path"),
        "method": method,
        "modelVersion": model_version,
        "processingTimeMs": elapsed_ms,
        "uncertain": bool(raw.get("uncertain", False)),
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
        seen.add(key)
        out.append(normalized)
    return out
