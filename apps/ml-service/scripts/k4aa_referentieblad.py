"""Bouwt het K4-aa-referentieblad met 15 tegels (SPEC-nutriscore-k4aa-de CAP-1).

Het blad van de spike (13 tegels, sha256 d39f1905...) levert de bestaande tegels als celuitsneden;
Nutri-Score D en E komen uit de synthetische seeds (zelfde stijl als A/B/C). De tegels staan
alfabetisch in een raster van 4 kolommen (cel 360x294, bladgrootte 1440x1176).

Uitvoer is gepind in tests/test_k4aa_atdd.py (sha256 van het blad); macOS-Arial 14.

  python scripts/k4aa_referentieblad.py --base <spike-blad.png> --seed-d <D.png> --seed-e <E.png> \
      --out app/assets/k4aa/referentieblad.png
"""

import argparse
import io
import os

from PIL import Image, ImageDraw, ImageFont

CELL_W, CELL_H, COLS = 360, 294, 4
OLD = sorted(
    [
        "BETER_LEVEN_1_STER", "EUROPEAN_V_LABEL_VEGAN", "EU_ORGANIC_FARMING",
        "FOREST_STEWARDSHIP_COUNCIL_MIX", "GREEN_DOT", "MARINE_STEWARDSHIP_COUNCIL_LABEL",
        "NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C", "RAINFOREST_ALLIANCE_PEOPLE_NATURE",
        "RECYCLABLE_GENERAL_CLAIM", "VEGAN_SOCIETY_VEGAN_LOGO", "WEIDEMELK",
    ]
)  # fmt: skip
TILES = sorted(OLD + ["NUTRISCORE_D", "NUTRISCORE_E"])
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"


def _cell(c, r):
    return (CELL_W * c, CELL_H * r, CELL_W * (c + 1), CELL_H * (r + 1))


def _rgb(im):
    """Transparency on white, then RGB (as the spike)."""
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.split()[3])
        return bg
    return im.convert("RGB")


def _new_tile(seed, code):
    cell = Image.new("RGB", (CELL_W, CELL_H), "white")
    bar = _rgb(Image.open(seed))
    r = min(320 / bar.width, 240 / bar.height)  # spike fit: inside 320x240
    bar = bar.resize((round(bar.width * r), round(bar.height * r)), Image.LANCZOS)
    cell.paste(bar, (20, 10))
    font = (
        ImageFont.truetype(FONT, 14)
        if os.path.exists(FONT)
        else ImageFont.load_default()
    )
    ImageDraw.Draw(cell).text((10, 268), code, fill="black", font=font)
    return cell


def build(base, seeds):
    """base: spike sheet (path or bytes); seeds: {"NUTRISCORE_D": path, "NUTRISCORE_E": path} → PNG bytes."""
    old = Image.open(io.BytesIO(base) if isinstance(base, bytes) else base).convert(
        "RGB"
    )
    tiles = {code: old.crop(_cell(i % COLS, i // COLS)) for i, code in enumerate(OLD)}
    tiles.update({c: _new_tile(p, c) for c, p in seeds.items()})
    rows = -(-len(TILES) // COLS)
    sheet = Image.new("RGB", (CELL_W * COLS, CELL_H * rows), "white")
    for i, code in enumerate(TILES):
        sheet.paste(tiles[code], (CELL_W * (i % COLS), CELL_H * (i // COLS)))
    out = io.BytesIO()
    sheet.save(out, "PNG")
    return out.getvalue()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--seed-d", required=True)
    ap.add_argument("--seed-e", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    data = build(a.base, {"NUTRISCORE_D": a.seed_d, "NUTRISCORE_E": a.seed_e})
    with open(a.out, "wb") as fh:
        fh.write(data)
