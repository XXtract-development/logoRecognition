#!/usr/bin/env python3
"""
Story 12.1 / Task 1 — Extract official keurmerk logos from the GS1 Packaging Label Guide.

Reads the embedded images from the guide's `Labels_Packaging` sheet, maps each image to
its GDS code (column A), normalises to PNG, filters placeholders/EMF, and writes a manifest
that drives the bulk-import (Task 2). Read-only on the source xlsx.

Verified realities (adversarial review 2026-06-09): ~945 codes / ~1026 decodable images;
multiple images per code (variants); some images anchored to a neighbour row; EMF dropped
by openpyxl; JPEG present (must transcode); many logos < 200px.

Usage:
  python3 extract_gs1_label_guide.py \
      --xlsx ~/Downloads/Packaging_label_guide_January2026_3_1_35.xlsx \
      --out  apps/api/seeds/reference-logos \
      [--codes RECYCLABLE_GENERAL_CLAIM,TRIMAN,...]   # restrict (proof-slice); default = all

Exit 0 on success; writes {out}/manifest.json. Never mutates the xlsx.
"""
from __future__ import annotations
import argparse
import io
import json
import os
import sys
from collections import defaultdict

MIN_RES = 200          # 7.3 upload floor; flagged, not rejected (seeds may be smaller)
PLACEHOLDER_MAX = 4    # px; images this small (or width==1) are placeholders
NEIGHBOR_WINDOW = 2    # rows to scan upward for a code when the anchor row's col A is empty
SHEET = "Labels_Packaging"
FIELD_TYPE = "PackagingMarkedLabelAccreditationCode"  # GS1-codelijstnaam (Labels_Packaging == T3777)
GS1_FIELD = "packagingMarkedLabelAccreditationCode"   # GS1-declaratieveld (crosscheck)

# Story 20.1 — de gids bevat code-typo's zoals "CLOSE _THE_LID" (spatie voor de
# underscore op het Labels_Instructions-blad). Normaliseer naar de canonieke
# underscore-vorm en wijs header-/lopende-tekstrijen af als code.
# Ruim genoeg voor echte gids-codes (ENERGY_LABEL_A+, ..._(RCC), mixed case),
# maar wijst prose/header-rijen af (bevatten ":" of spaties na normalisatie).
_CODE_RE = __import__("re").compile(r"^[A-Za-z0-9_+().&'-]+$")


def _normalize_code(raw: str) -> str:
    import re
    code = raw.strip()
    code = re.sub(r"\s*_\s*", "_", code)   # spaties rond underscores weg
    code = re.sub(r"\s+", "_", code)       # resterende interne spaties -> underscore
    return code


def _is_valid_code(code: str) -> bool:
    return bool(code) and bool(_CODE_RE.match(code))


def _load_image_bytes(img):
    """openpyxl Image → raw bytes, across versions (.ref BytesIO/path or ._data())."""
    ref = getattr(img, "ref", None)
    if isinstance(ref, (bytes, bytearray)):
        return bytes(ref)
    if ref is not None and hasattr(ref, "read"):
        try:
            ref.seek(0)
        except Exception:
            pass
        data = ref.read()
        return bytes(data) if data else None
    if isinstance(ref, str) and os.path.isfile(ref):
        with open(ref, "rb") as fh:
            return fh.read()
    data_fn = getattr(img, "_data", None)
    if callable(data_fn):
        try:
            d = data_fn()
        except Exception:
            return None
        return bytes(d) if d else None  # type: ignore[arg-type]  # dynamic openpyxl API
    return None


def _code_for_anchor_row(ws, row_1based: int) -> tuple[str | None, bool]:
    """Code in column A at the anchor row, else nearest non-empty code above (flagged)."""
    exact = ws.cell(row=row_1based, column=1).value
    if exact and str(exact).strip():
        return str(exact).strip(), False
    for up in range(1, NEIGHBOR_WINDOW + 1):
        r = row_1based - up
        if r < 1:
            break
        v = ws.cell(row=r, column=1).value
        if v and str(v).strip():
            return str(v).strip(), True   # neighbour-anchor → needs review
    return None, False


def main() -> int:
    import openpyxl
    from PIL import Image as PILImage

    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--codes", default="", help="comma-separated code filter; default all")
    # Story 20.1 — multi-sheet: extraheer desgewenst een ander gids-blad met
    # bijpassende GS1-veld-metadata (bv. Labels_Instructions / consumerUsage).
    ap.add_argument("--sheet", default=SHEET)
    ap.add_argument("--field-type", default=FIELD_TYPE, dest="field_type")
    ap.add_argument("--gs1-field", default=GS1_FIELD, dest="gs1_field")
    # Opt-in (20.1): default UIT zodat het bestaande Labels_Packaging-gedrag
    # byte-identiek blijft (codes met spaties/plussen zijn daar al zo geseed).
    ap.add_argument("--normalize-codes", action="store_true", dest="normalize_codes")
    # Review-L2 (20.1): hernoem codes via een JSON-map {bronCode: doelCode}; de
    # bron-naam wordt als guideSourceCode in het manifest bewaard (herkomst-alias).
    ap.add_argument("--code-map", default="", dest="code_map")
    args = ap.parse_args()

    xlsx = os.path.expanduser(args.xlsx)
    out = os.path.expanduser(args.out)
    code_filter = {c.strip() for c in args.codes.split(",") if c.strip()} or None

    if not os.path.isfile(xlsx):
        print(f"ERROR: xlsx not found: {xlsx}", file=sys.stderr)
        return 2
    os.makedirs(out, exist_ok=True)

    code_map = {}
    if args.code_map:
        with open(os.path.expanduser(args.code_map)) as fh:
            code_map = {k: v for k, v in json.load(fh).items() if not k.startswith("_")}

    wb = openpyxl.load_workbook(xlsx, data_only=True)   # full load (images); read-only intent
    if args.sheet not in wb.sheetnames:                  # review-L1: nette fout i.p.v. KeyError
        print(f"ERROR: sheet not found: {args.sheet} (beschikbaar: {wb.sheetnames})", file=sys.stderr)
        return 2
    ws = wb[args.sheet]

    # Group images per code first so multi-image rows become numbered variants.
    per_code: dict[str, list] = defaultdict(list)
    stats = {"images": 0, "no_code": 0, "neighbor": 0, "emf_skipped": 0,
             "placeholder": 0, "decode_fail": 0}

    for img in getattr(ws, "_images", []):
        stats["images"] += 1
        try:
            row0 = img.anchor._from.row  # 0-based
        except Exception:
            continue
        code, neighbor = _code_for_anchor_row(ws, row0 + 1)
        if code and args.normalize_codes:
            code = _normalize_code(str(code))
            if not _is_valid_code(code):
                code = None
        if not code:
            stats["no_code"] += 1
            continue
        if code_filter and code not in code_filter:
            continue
        raw = _load_image_bytes(img)
        if not raw:
            stats["decode_fail"] += 1
            continue
        per_code[code].append((raw, neighbor))
        if neighbor:
            stats["neighbor"] += 1

    manifest = []
    for code in sorted(per_code):
        variant = 0
        for raw, neighbor in per_code[code]:
            try:
                im = PILImage.open(io.BytesIO(raw))
                im.load()
            except Exception:
                stats["emf_skipped"] += 1   # EMF/WMF/unsupported → reported, not blocking
                continue
            orig_fmt = im.format or "PNG"
            w, h = im.size
            if w <= PLACEHOLDER_MAX or h <= PLACEHOLDER_MAX or w == 1:
                stats["placeholder"] += 1
                continue
            code_dir = os.path.join(out, code)
            os.makedirs(code_dir, exist_ok=True)
            fname = f"{variant}.png"
            fpath = os.path.join(code_dir, fname)
            # Flatten any transparency onto WHITE. The embedding pipeline does
            # convert("RGB"), which composites alpha onto BLACK — a transparent
            # line-art logo (e.g. RECYCLABLE: 86% transparent) then becomes a
            # near-black image and yields a DEGENERATE embedding (norm ~3.9 vs
            # ~9.3 healthy) that cosine-matches everything → 1.00 false positives.
            # Keurmerken sit on light packaging, so white is the right neutral bg.
            if im.mode in ("RGBA", "LA", "P"):
                rgba = im.convert("RGBA")
                bg = PILImage.new("RGB", rgba.size, (255, 255, 255))
                bg.paste(rgba, mask=rgba.split()[-1])
                im = bg
            else:
                im = im.convert("RGB")
            im.save(fpath, "PNG")           # PNG/JPEG/GIF → PNG (transcode, opaque-on-white)
            source_code = code
            mapped = code_map.get(code, code)
            manifest.append({
                "code": mapped,
                "fieldType": args.field_type,
                "gs1Field": args.gs1_field,
                **({"guideSourceCode": source_code} if mapped != source_code else {}),
                "variant": variant,
                "file": os.path.relpath(fpath, out),
                "width": w, "height": h,
                "origFormat": orig_fmt,
                "anchor": "neighbor" if neighbor else "exact",
                "belowMinRes": (w < MIN_RES or h < MIN_RES),
                "needsReview": neighbor,    # neighbour-anchor is not silently trusted
                "source": "gs1-packaging-label-guide",
            })
            variant += 1

    with open(os.path.join(out, "manifest.json"), "w") as fh:
        json.dump({"sheet": args.sheet, "stats": stats, "entries": manifest}, fh, indent=2)

    codes_done = len({m["code"] for m in manifest})
    print(f"codes={codes_done} entries={len(manifest)} "
          f"neighbor={stats['neighbor']} multi_image_codes="
          f"{sum(1 for c in per_code if len(per_code[c])>1)} "
          f"emf_skipped={stats['emf_skipped']} placeholder={stats['placeholder']} "
          f"no_code={stats['no_code']}")
    if code_filter:
        missing = code_filter - {m["code"] for m in manifest}
        if missing:
            print(f"WARN: requested codes without usable image: {sorted(missing)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
