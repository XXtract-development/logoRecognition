"""Frozen crop/whole-label accounting; structure fixtures do not prove image quality."""

from collections import defaultdict

from app.symbol_contract import GHS_CODES, normalize_code

LABELS = sorted(GHS_CODES) + ["UNKNOWN"]


def iou(a, b):
    x = max(a["x"], b["x"])
    y = max(a["y"], b["y"])
    w = max(0, min(a["x"] + a["width"], b["x"] + b["width"]) - x)
    h = max(0, min(a["y"] + a["height"], b["y"] + b["height"]) - y)
    inter = w * h
    union = a["width"] * a["height"] + b["width"] * b["height"] - inter
    return inter / union if union else 0


def match_objects(truth, predictions):
    """Maximum cardinality bipartite matching, not greedy IoU matching."""
    edges = [
        [
            j
            for j, p in enumerate(predictions)
            if normalize_code(t["label"]) == normalize_code(p["code"])
            and not p.get("uncertain")
            and iou(t["bbox"], p["bbox"]) >= 0.5
        ]
        for t in truth
    ]
    assigned = {}

    def augment(i, seen):
        for j in edges[i]:
            if j in seen:
                continue
            seen.add(j)
            if j not in assigned or augment(assigned[j], seen):
                assigned[j] = i
                return True
        return False

    for i in range(len(truth)):
        augment(i, set())
    return [(i, j) for j, i in assigned.items()]


def evaluate(samples, predictions, crop_predictions=None):
    matrix = {a: {b: 0 for b in LABELS} for a in LABELS}
    crop_matrix = {a: {b: 0 for b in LABELS} for a in LABELS}
    prediction_abstentions = 0
    uncertain_proposals = 0
    sizes = defaultdict(lambda: {"truth": 0, "matched": 0})
    stats = {
        c: {
            "families": set(),
            "readableFamilies": set(),
            "correctFamilies": set(),
            "matched": 0,
            "truth": 0,
            "misses": 0,
            "extras": 0,
            "abstentions": 0,
            "cropCorrect": 0,
            "cropTotal": 0,
            "cropAbstentions": 0,
        }
        for c in GHS_CODES
    }
    failed_families = set()
    positive_families = set()
    uncertain_families = set()
    negative_pages = 0
    negative_page_errors = 0
    negative = set()
    negative_errors = set()
    quality = defaultdict(
        lambda: {"labels": 0, "matched": 0, "misses": 0, "extras": 0, "uncertain": 0}
    )
    critical = []
    for sample in samples:
        preds = [
            p
            for p in predictions.get(sample["sampleId"], [])
            if normalize_code(p["code"]) in GHS_CODES
        ]
        prediction_abstentions += sum(
            normalize_code(p["code"]) == "UNKNOWN"
            for p in predictions.get(sample["sampleId"], [])
        )
        uncertain_proposals += sum(bool(p.get("uncertain")) for p in preds)
        truths = sample["objects"]
        readable = [
            t
            for t in truths
            if sample["readability"] == "readable"
            and t.get("readable", True)
            and normalize_code(t["label"]) in GHS_CODES
        ]
        uncertain = len(readable) != len(truths) or sample["readability"] != "readable"
        matches = match_objects(readable, preds)
        mi = {i for i, j in matches}
        mj = {j for i, j in matches}
        extra = [p for j, p in enumerate(preds) if j not in mj]
        if truths:
            positive_families.add(sample["familyId"])
        if extra or uncertain or len(matches) != len(readable):
            failed_families.add(sample["familyId"])
        for i, t in enumerate(readable):
            px = min(t["bbox"]["width"], t["bbox"]["height"])
            bucket = "<24" if px < 24 else "24-48" if px <= 48 else ">48"
            sizes[bucket]["truth"] += 1
            sizes[bucket]["matched"] += int(i in mi)
        q = quality[str(sample["quality"])]
        q["labels"] += 1
        q["matched"] += len(matches)
        q["misses"] += len(readable) - len(matches)
        q["extras"] += len(extra)
        q["uncertain"] += int(uncertain)
        if uncertain:
            uncertain_families.add(sample["familyId"])
        if not truths and sample["readability"] == "readable":
            negative_pages += 1
            negative_page_errors += int(bool(preds))
            negative.add(sample["familyId"])
            if preds:
                negative_errors.add(sample["familyId"])
        for c in {normalize_code(t["label"]) for t in truths} & GHS_CODES:
            s = stats[c]
            s["families"].add(sample["familyId"])
            target = [
                i for i, t in enumerate(readable) if normalize_code(t["label"]) == c
            ]
            s["truth"] += len(target)
            s["matched"] += sum(i in mi for i in target)
            s["misses"] += sum(i not in mi for i in target)
            if target and not uncertain:
                s["readableFamilies"].add(sample["familyId"])
            if uncertain:
                s["abstentions"] += 1
            # Every object must match and no extra classes/duplicates on the label.
            if target and not uncertain and len(matches) == len(readable) and not extra:
                s["correctFamilies"].add(sample["familyId"])
            else:
                s.setdefault("failedFamilies", set()).add(sample["familyId"])
        for p in extra:
            stats[normalize_code(p["code"])]["extras"] += 1
        for i, t in enumerate(readable):
            actual = normalize_code(t["label"])
            if i in mi:
                matrix[actual][actual] += 1
            else:
                overlaps = [p for p in extra if iou(t["bbox"], p["bbox"]) >= 0.5]
                predicted = (
                    normalize_code(
                        max(overlaps, key=lambda p: iou(t["bbox"], p["bbox"]))["code"]
                    )
                    if overlaps
                    else "UNKNOWN"
                )
                if overlaps and (
                    max(overlaps, key=lambda p: iou(t["bbox"], p["bbox"])).get(
                        "uncertain", False
                    )
                    or predicted == actual
                ):
                    predicted = "UNKNOWN"
                matrix[actual][predicted] += 1
                if predicted not in {"UNKNOWN", actual}:
                    critical.append(
                        {
                            "sampleId": sample["sampleId"],
                            "truth": actual,
                            "prediction": predicted,
                        }
                    )
        for t in truths:
            if sample["readability"] != "readable" or not t.get("readable", True):
                matrix["UNKNOWN"]["UNKNOWN"] += 1
        for j, p in enumerate(preds):
            if j not in mj and not any(
                iou(t["bbox"], p["bbox"]) >= 0.5 for t in readable
            ):
                matrix["UNKNOWN"][normalize_code(p["code"])] += 1
        for index, t in enumerate(truths):
            if not t.get("cropPath"):
                continue
            c = normalize_code(t["label"])
            crop_result = (crop_predictions or {}).get(
                f"{sample['sampleId']}:{index}", "UNKNOWN"
            )
            crop_uncertain = isinstance(crop_result, dict) and crop_result.get(
                "uncertain", False
            )
            pred = normalize_code(
                crop_result.get("code", "UNKNOWN")
                if isinstance(crop_result, dict)
                else crop_result
            )
            truth_readable = (
                sample["readability"] == "readable"
                and t.get("readable", True)
                and c in GHS_CODES
            )
            if crop_uncertain or not truth_readable:
                pred = "UNKNOWN"
            crop_matrix[c if truth_readable else "UNKNOWN"][
                pred if pred in LABELS else "UNKNOWN"
            ] += 1
            if c in stats:
                stats[c]["cropTotal"] += 1
                stats[c]["cropCorrect"] += int(
                    c == pred and not crop_uncertain and truth_readable
                )
                stats[c]["cropAbstentions"] += int(crop_uncertain or pred == "UNKNOWN")
    negative -= positive_families | uncertain_families
    negative_errors &= negative
    for c, s in stats.items():
        s["correctFamilies"] -= s.pop("failedFamilies", set()) | failed_families
        s["readableFamilies"] -= uncertain_families
        for key in ["families", "readableFamilies", "correctFamilies"]:
            s[key] = len(s[key])
        s["status"] = (
            "insufficient-evidence"
            if s["readableFamilies"] < 20 or len(negative) < 100
            else (
                "pilot-target-met-human-review"
                if s["correctFamilies"] / s["readableFamilies"] >= 0.9
                and len(negative_errors) / len(negative) <= 0.05
                else "below-pilot-target"
            )
        )
    return {
        "classes": stats,
        "confusionMatrix": matrix,
        "cropConfusionMatrix": crop_matrix,
        "predictionAbstentions": prediction_abstentions,
        "uncertainProposals": uncertain_proposals,
        "sizeBuckets": dict(sizes),
        "criticalConfusions": critical,
        "negativeLabels": {"errors": len(negative_errors), "total": len(negative)},
        "negativePages": {"errors": negative_page_errors, "total": negative_pages},
        "quality": dict(quality),
        "fieldQualityProven": False,
    }
