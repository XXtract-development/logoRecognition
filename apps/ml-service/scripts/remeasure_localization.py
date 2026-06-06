#!/usr/bin/env python3
"""
8.3R/8.3P hermeting — kalibratie en validatie van multi-scale lokalisatie op ACC.

8-3P-uitbreiding (precisie-kalibratie):
  - FP-baseline op het gepinde referentie-artwork (GTIN 08710679005795) met een
    VOORAF bevroren instellingenset (floor/drempels/k), vastgelegd in het rapport
    vóór de meting. Gate: ≤ 5 detecties.
  - Labelsample-generator: markdown-overzicht van álle overgebleven detecties op
    de ACC-artworks met crop-thumbnails als base64-data-URI's + scores, voor
    menselijke echt/vals-beoordeling.
  De per-klasse drempels komen uit ``LOCALIZE_CLASS_THRESHOLDS`` (env, ML-side
  geresolved in match_templates); de FP-baseline draait op de productie-min_score.

Reproduceerbaar AC4-script (story 8-3R). Draait IN de ml-service-container
tegen de echte ACC-data, ZONDER deploy:

  # op de host (vanilla), vanuit de repo-checkout of via cat-pipe:
  docker exec <ml-container> mkdir -p /tmp/eight3r
  docker cp apps/ml-service/app/services/localization.py <ml>:/tmp/eight3r/localization.py
  docker cp apps/ml-service/scripts/remeasure_localization.py <ml>:/tmp/eight3r/remeasure_localization.py
  docker exec <ml-container> python3 /tmp/eight3r/remeasure_localization.py > rapport.md

Module-loading: dit script laadt de NIEUWE localization.py expliciet vanaf
NEW_LOCALIZATION_PATH (default /tmp/eight3r/localization.py) en registreert
hem als ``app.services.localization`` in sys.modules vóór gebruik — de
geïnstalleerde (oude) module wordt zo verdrongen zonder package-shadowing.
Storage en logging komen uit de draaiende app (ongewijzigd).

STRIKT READ-ONLY: uitsluitend SELECT-queries; geen review-items, geen
rebuilds, geen schrijfacties naar MinIO.

Meet en rapporteert (markdown op stdout):
  1. Composiet-recall op de 9 review-items (gate: 9/9; IoU >= 0.3, juiste code)
  2. Score-distributies: geplante logo's vs. niet-geplante detecties
  3. Drempel-kalibratie: recall + FP per kandidaat-drempel; keuze + onderbouwing
  4. Natuurlijke opbrengst op de geimporteerde artworks (mét distributie —
     facade-guard: overleven echte keurmerken de composiet-drempel?)
  5. Throughput per bestand + extrapolatie naar de 39k-voorraad
"""

import asyncio
import importlib.util
import json
import os
import sys
import time
from collections import defaultdict

NEW_LOCALIZATION_PATH = os.environ.get("NEW_LOCALIZATION_PATH", "/tmp/eight3r/localization.py")
CALIBRATION_FLOOR = 0.30  # capture-drempel voor distributies (bewust laag)
IOU_GATE = 0.30
CANDIDATE_THRESHOLDS = [round(0.30 + 0.05 * i, 2) for i in range(13)]  # 0.30 .. 0.90

# 8-3P — gepind FP-baseline-artwork (8-3R-referentie, GTIN 08710679005795).
PINNED_FP_GTIN = "08710679005795"
PINNED_FP_KEY = os.environ.get("PINNED_FP_KEY", f"artwork/{PINNED_FP_GTIN}/{PINNED_FP_GTIN}.jpg")
PINNED_FP_GATE = int(os.environ.get("PINNED_FP_GATE", "5"))  # ≤ 5 detecties
# Productie-min_score voor de FP-baseline (per-klasse env-drempels winnen ML-side).
FP_BASELINE_MIN_SCORE = float(os.environ.get("FP_BASELINE_MIN_SCORE", "0.55"))


def load_new_localization():
    """Laad de nieuwe localization.py en registreer als app.services.localization."""
    import app.services  # parent package uit de draaiende app

    spec = importlib.util.spec_from_file_location("app.services.localization", NEW_LOCALIZATION_PATH)
    assert spec is not None and spec.loader is not None, f"Kan module niet laden: {NEW_LOCALIZATION_PATH}"
    mod = importlib.util.module_from_spec(spec)
    sys.modules["app.services.localization"] = mod
    spec.loader.exec_module(mod)
    return mod


def decode(img_bytes, with_alpha=False):
    import cv2
    import numpy as np

    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED if with_alpha else cv2.IMREAD_COLOR)
    return img


def iou(a, b):
    ax2, ay2 = a["x"] + a["width"], a["y"] + a["height"]
    bx2, by2 = b["x"] + b["width"], b["y"] + b["height"]
    iw = max(0, min(ax2, bx2) - max(a["x"], b["x"]))
    ih = max(0, min(ay2, by2) - max(a["y"], b["y"]))
    inter = iw * ih
    if inter == 0:
        return 0.0
    union = a["width"] * a["height"] + b["width"] * b["height"] - inter
    return inter / union if union else 0.0


def crop_thumb_data_uri(img, bbox, max_dim=96):
    """Knip de detectie-crop uit en codeer als base64 PNG data-URI (thumbnail).

    Voor het menselijke label-overzicht (AC4c) — leesbaar in elke markdown-
    viewer zonder externe bestanden. Geeft '' terug bij een lege/ongeldige crop.
    """
    import base64

    import cv2

    h, w = img.shape[:2]
    x0 = max(0, min(int(bbox["x"]), w))
    y0 = max(0, min(int(bbox["y"]), h))
    x1 = max(0, min(int(bbox["x"]) + int(bbox["width"]), w))
    y1 = max(0, min(int(bbox["y"]) + int(bbox["height"]), h))
    if x1 <= x0 or y1 <= y0:
        return ""
    crop = img[y0:y1, x0:x1]
    ch, cw = crop.shape[:2]
    f = max_dim / max(ch, cw) if max(ch, cw) > max_dim else 1.0
    if f < 1.0:
        crop = cv2.resize(crop, (max(1, int(cw * f)), max(1, int(ch * f))), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".png", crop)
    if not ok:
        return ""
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode()


def run_flow(loc, img, variants, min_score):
    """Repliceer de endpoint-flow op service-niveau: tile → match → collapse → NMS.

    Bewust een kopie van de flow in artwork.py:localize_artwork — het script
    meet de NIEUWE engine; het draaiende (oude) HTTP-endpoint is ongeschikt.
    """
    tiles = loc.tile_image(img)
    per_tile_best = {}
    for tile_idx, tile in enumerate(tiles):
        for match in loc.match_templates(tile["image"], variants, min_score=min_score):
            key = (match["t3777_code"], tile_idx)
            best = per_tile_best.get(key)
            if best is None or match["score"] > best["score"]:
                abs_match = dict(match)
                abs_match["bbox"] = {
                    "x": match["bbox"]["x"] + tile["x_offset"],
                    "y": match["bbox"]["y"] + tile["y_offset"],
                    "width": match["bbox"]["width"],
                    "height": match["bbox"]["height"],
                }
                per_tile_best[key] = abs_match
    return loc.merge_detections(list(per_tile_best.values())), len(tiles)


async def main():
    import asyncpg

    loc = load_new_localization()
    from app.services.storage import storage_service

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])

    # --- Referenties (templates) -------------------------------------------
    refs = await conn.fetch(
        "SELECT t3777_code, storage_path FROM reference_logos WHERE active = true ORDER BY t3777_code"
    )
    templates = []
    for r in refs:
        img = decode(storage_service.get_training_image(r["storage_path"]), with_alpha=True)
        templates.append({"t3777_code": r["t3777_code"], "image": img})
    variants = loc.prepare_scaled_templates(templates)

    print("# 8.3R Meetrapport — hermeting multi-scale lokalisatie (ACC)\n")
    print(f"- Referenties (actief): {len(templates)} — ladder-varianten: {len(variants)}")
    print(f"- Ladder: {loc.LOCALIZE_SCALE_MIN_PX}→min({loc.LOCALIZE_SCALE_MAX_PX}, tile {loc.LOCALIZE_TILE_SIZE})px, stap {loc.LOCALIZE_SCALE_STEP}")
    print(f"- Metric: CCOEFF_NORMED [0,1], degenerate-fallback < std {loc.LOCALIZE_DEGENERATE_STD}\n")

    # --- Composieten reconstrueren uit review-items -------------------------
    items = await conn.fetch(
        "SELECT id, gtin, t3777_code, bbox, source_file, crop_path, status "
        "FROM artwork_review_items ORDER BY created_at"
    )
    by_source = defaultdict(list)
    for it in items:
        bbox = it["bbox"] if isinstance(it["bbox"], dict) else json.loads(it["bbox"])
        by_source[it["source_file"]].append({**dict(it), "bbox": bbox})

    print(f"## 1. Composiet-recall ({len(items)} geplante logo's over {len(by_source)} bronbestanden)\n")

    planted_results = []   # per item: {code, score|None, found, best_iou}
    nonplanted = []        # detecties zonder geplante tegenhanger (per composiet)
    timings = []

    for source_file, its in sorted(by_source.items()):
        src = decode(storage_service.get_training_image(source_file))
        # Reconstructie: plak de bewaarde crop terug op de bbox (identiteit als
        # het bronbestand de composiet al bevat).
        for it in its:
            crop = decode(storage_service.get_training_image(it["crop_path"]))
            b = it["bbox"]
            ch = min(crop.shape[0], src.shape[0] - b["y"])
            cw = min(crop.shape[1], src.shape[1] - b["x"])
            src[b["y"] : b["y"] + ch, b["x"] : b["x"] + cw] = crop[:ch, :cw]

        t0 = time.monotonic()
        detections, n_tiles = run_flow(loc, src, variants, CALIBRATION_FLOOR)
        dt = time.monotonic() - t0
        timings.append((source_file, dt, n_tiles, src.shape[1], src.shape[0]))

        matched_det_ids = set()
        for it in its:
            best, best_iou = None, 0.0
            for di, d in enumerate(detections):
                if d["t3777_code"] != it["t3777_code"]:
                    continue
                v = iou(d["bbox"], it["bbox"])
                if v > best_iou:
                    best, best_iou = (di, d), v
            found = best is not None and best_iou >= IOU_GATE
            if found:
                matched_det_ids.add(best[0])
            planted_results.append(
                {
                    "source": source_file,
                    "code": it["t3777_code"],
                    "found": found,
                    "score": best[1]["score"] if best else None,
                    "iou": round(best_iou, 3),
                }
            )
        for di, d in enumerate(detections):
            if di not in matched_det_ids:
                nonplanted.append({"source": source_file, "code": d["t3777_code"], "score": d["score"]})

    found_count = sum(1 for p in planted_results if p["found"])
    print("| bron | code | gevonden | score | IoU |")
    print("|---|---|---|---|---|")
    for p in planted_results:
        score = f"{p['score']:.3f}" if p["score"] is not None else "—"
        print(f"| {p['source'].split('/')[-1][:32]} | {p['code']} | {'✅' if p['found'] else '❌'} | {score} | {p['iou']} |")
    print(f"\n**Recall-gate: {found_count}/{len(planted_results)}** (capture-drempel {CALIBRATION_FLOOR}, IoU ≥ {IOU_GATE})\n")

    # --- Kalibratie ----------------------------------------------------------
    planted_scores = sorted(p["score"] for p in planted_results if p["score"] is not None)
    np_scores = sorted(n["score"] for n in nonplanted)
    print("## 2. Score-distributies (composieten)\n")
    print(f"- Geplant (n={len(planted_scores)}): min {min(planted_scores or [0]):.3f} · "
          f"mediaan {planted_scores[len(planted_scores)//2] if planted_scores else 0:.3f} · max {max(planted_scores or [0]):.3f}")
    if np_scores:
        print(f"- Niet-geplant (n={len(np_scores)}): min {np_scores[0]:.3f} · max {np_scores[-1]:.3f}")
    else:
        print("- Niet-geplant: geen detecties boven de capture-drempel")

    print("\n## 3. Drempel-kalibratie\n")
    print("| drempel | recall (geplant) | FP (niet-geplant) |")
    print("|---|---|---|")
    chosen = None
    for th in CANDIDATE_THRESHOLDS:
        rec = sum(1 for p in planted_results if p["found"] and (p["score"] or 0) >= th)
        fp = sum(1 for n in nonplanted if n["score"] >= th)
        print(f"| {th:.2f} | {rec}/{len(planted_results)} | {fp} |")
        if rec == len(planted_results):
            chosen = (th, fp)  # hoogste drempel met volledige recall wint
    if chosen:
        print(f"\n**Gekalibreerde drempel: {chosen[0]:.2f}** — hoogste kandidaat met volledige composiet-recall; FP daarbij: {chosen[1]}.")
        print("(Oude 1446-telling is context, geen vergelijkbare baseline — andere metric/scaling-route.)\n")

    # --- Natuurlijke opbrengst ----------------------------------------------
    print("## 4. Natuurlijke opbrengst (echte artworks, géén gate — meting)\n")
    imports = await conn.fetch(
        "SELECT gtin, file_name, storage_path, mime_type, pages FROM artwork_imports "
        "WHERE status = 'imported' ORDER BY gtin, file_name"
    )
    image_keys = []
    for im in imports:
        pages = im["pages"] if isinstance(im["pages"], (dict, list)) else json.loads(im["pages"] or "{}")
        page_list = pages.get("pages", pages) if isinstance(pages, dict) else pages
        page_keys = [p.get("image_path") for p in page_list if isinstance(p, dict) and p.get("image_path")] if isinstance(page_list, list) else []
        if page_keys:
            image_keys.extend((im["gtin"], k) for k in page_keys)
        elif (im["mime_type"] or "").startswith("image/") and im["storage_path"]:
            image_keys.append((im["gtin"], im["storage_path"]))
        else:
            print(f"- ⚠️ overgeslagen (geen afbeeldingssleutel): {im['gtin']} {im['file_name']} ({im['mime_type']})")

    natural = []
    natural_imgs = {}  # key -> decoded image (hergebruik voor labelsample-crops)
    for gtin, key in image_keys:
        try:
            img = decode(storage_service.get_training_image(key))
            if img is None:
                print(f"- ⚠️ niet decodeerbaar: {key}")
                continue
        except Exception as exc:
            print(f"- ⚠️ niet ophaalbaar: {key} ({exc})")
            continue
        natural_imgs[key] = img
        t0 = time.monotonic()
        detections, n_tiles = run_flow(loc, img, variants, CALIBRATION_FLOOR)
        dt = time.monotonic() - t0
        timings.append((key, dt, n_tiles, img.shape[1], img.shape[0]))
        for d in detections:
            natural.append(
                {
                    "gtin": gtin,
                    "key": key,
                    "code": d["t3777_code"],
                    "score": d["score"],
                    "bbox": d["bbox"],
                    "threshold": d.get("threshold"),
                }
            )

    print(f"\nGescande natuurlijke afbeeldingen: {len(image_keys)} · detecties boven {CALIBRATION_FLOOR}: {len(natural)}\n")
    if natural:
        print("| gtin | bestand | code | score |")
        print("|---|---|---|---|")
        for n in sorted(natural, key=lambda x: -x["score"]):
            print(f"| {n['gtin']} | {n['key'].split('/')[-1][:32]} | {n['code']} | {n['score']:.3f} |")
        if chosen:
            above = [n for n in natural if n["score"] >= chosen[0]]
            print(f"\n**Facade-guard:** {len(above)}/{len(natural)} natuurlijke detecties overleven de composiet-gekalibreerde drempel {chosen[0]:.2f}.")
    else:
        print("Geen natuurlijke detecties boven de capture-drempel — distributie leeg (relevant voor bevinding 6).")

    # --- FP-baseline op het gepinde artwork (8-3P AC4b) ----------------------
    print("\n## 5. FP-baseline — gepind artwork (8-3P AC4b)\n")
    frozen = {
        "LOCALIZE_SCALE_MIN_PX (floor)": loc.LOCALIZE_SCALE_MIN_PX,
        "LOCALIZE_SCALE_STEP": loc.LOCALIZE_SCALE_STEP,
        "LOCALIZE_SCALE_MAX_PX": loc.LOCALIZE_SCALE_MAX_PX,
        "LOCALIZE_PEAKS_PER_VARIANT": getattr(loc, "LOCALIZE_PEAKS_PER_VARIANT", None),
        "LOCALIZE_COLLAPSE_TOP_K": getattr(loc, "LOCALIZE_COLLAPSE_TOP_K", None),
        "LOCALIZE_CLASS_THRESHOLDS": getattr(loc, "LOCALIZE_CLASS_THRESHOLDS", {}),
        "FP_BASELINE_MIN_SCORE (request)": FP_BASELINE_MIN_SCORE,
    }
    print("**Bevroren instellingenset (vastgelegd vóór de meting):**\n")
    for k, v in frozen.items():
        print(f"- `{k}` = `{v}`")
    print(f"\n- Gepind artwork: `{PINNED_FP_KEY}` (GTIN {PINNED_FP_GTIN}) · gate: ≤ {PINNED_FP_GATE} detecties · was 20 (8-3R-meetrapport)\n")

    fp_count = None
    try:
        pinned_img = decode(storage_service.get_training_image(PINNED_FP_KEY))
        if pinned_img is None:
            print(f"- ⚠️ gepind artwork niet decodeerbaar: {PINNED_FP_KEY}")
        else:
            fp_dets, _ = run_flow(loc, pinned_img, variants, FP_BASELINE_MIN_SCORE)
            fp_count = len(fp_dets)
            print(f"**FP-baseline: {fp_count} detecties** (gate ≤ {PINNED_FP_GATE}: "
                  f"{'PASSED' if fp_count <= PINNED_FP_GATE else 'FAILED'})\n")
            if fp_dets:
                print("| code | score | drempel | bbox |")
                print("|---|---|---|---|")
                for d in sorted(fp_dets, key=lambda x: -x["score"]):
                    b = d["bbox"]
                    thr = f"{d['threshold']:.2f}" if d.get("threshold") is not None else "—"
                    print(f"| {d['t3777_code']} | {d['score']:.3f} | {thr} | "
                          f"{b['x']},{b['y']} {b['width']}×{b['height']} |")
    except Exception as exc:
        print(f"- ⚠️ FP-baseline niet meetbaar: {PINNED_FP_KEY} ({exc})")

    # --- Labelsample-overzicht (8-3P AC4c) -----------------------------------
    print("\n## 6. Labelsample — overgebleven detecties (8-3P AC4c, wacht op labels)\n")
    print("Alle overgebleven detecties op de ACC-artworks met crop-thumbnail "
          "(base64 data-URI) en score, voor menselijke echt/vals-beoordeling. "
          "Vul de kolom **label** in (echt/vals) en bereken precision = echt / totaal.\n")
    if natural:
        print("| # | gtin | bestand | code | score | drempel | crop | label (echt/vals) |")
        print("|---|---|---|---|---|---|---|---|")
        for i, n in enumerate(sorted(natural, key=lambda x: -x["score"]), start=1):
            img = natural_imgs.get(n["key"])
            uri = crop_thumb_data_uri(img, n["bbox"]) if img is not None else ""
            cell = f"![crop]({uri})" if uri else "—"
            thr = f"{n['threshold']:.2f}" if n.get("threshold") is not None else "—"
            print(f"| {i} | {n['gtin']} | {n['key'].split('/')[-1][:28]} | {n['code']} | "
                  f"{n['score']:.3f} | {thr} | {cell} |  |")
        print(f"\nTotaal overgebleven detecties (≥ capture-drempel {CALIBRATION_FLOOR}): {len(natural)}. "
              "Beslismoment PO: precisie voldoende voor 8-3O-bulk → doorgaan; anders volgende iteratie.")
    else:
        print("Geen overgebleven detecties boven de capture-drempel — labelsample leeg.")

    # --- Throughput -----------------------------------------------------------
    print("\n## 7. Throughput\n")
    total = sum(t[1] for t in timings)
    avg = total / len(timings) if timings else 0
    print("| bestand | tijd (s) | tegels | afmeting |")
    print("|---|---|---|---|")
    for name, dt, n_tiles, w, h in timings:
        print(f"| {name.split('/')[-1][:40]} | {dt:.2f} | {n_tiles} | {w}×{h} |")
    print(f"\n- Gemiddeld {avg:.2f} s/bestand ({len(variants)} varianten × ~tegels)")
    print(f"- **Extrapolatie 39.000 bestanden: ~{avg * 39000 / 3600:.1f} uur** (single-threaded, huidige container)")

    await conn.close()
    recall_ok = found_count == len(planted_results)
    fp_ok = fp_count is not None and fp_count <= PINNED_FP_GATE
    print("\n---")
    print(f"Composiet-recall-gate: {'PASSED' if recall_ok else 'FAILED'} ({found_count}/{len(planted_results)})")
    fp_str = fp_count if fp_count is not None else "n/a"
    print(f"FP-baseline-gate: {'PASSED' if fp_ok else 'FAILED'} ({fp_str} ≤ {PINNED_FP_GATE} op {PINNED_FP_KEY}; was 20)")
    overall = recall_ok and fp_ok
    print(f"Gate-uitkomst (8-3P AC4): {'PASSED' if overall else 'BLOCKED/FAILED'}")
    return 0 if overall else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
