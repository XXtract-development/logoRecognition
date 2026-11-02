"""NutriGreen omzetten naar COCO (CAP-16; trainingsset-en-herkenning §10, randvoorwaarden §4). Stdlib + Pillow.

Bron: Zenodo-record 10020545 (`dataset.zip`, md5 MD5; `data.csv` met YOLO-vakjes: middelpunt en maat, genormaliseerd).
De zip wordt nooit in zijn geheel uitgepakt: elk beeld wordt los uit de zip gelezen. Elke foto wordt één tegel als JPEG,
langste zijde hoogstens `tegel`, met dezelfde 13 categorieën als generator.py en echt.py. Een foto zonder annotatie is
een achtergrond. Vallen af (geteld): annotatie zonder foto, foto met EXIF-oriëntatie ≠ 1, foto van een
toetsleverancier (barcodenaam = toets-GTIN, of dezelfde eerste 7 cijfers als een toets-GLN), en dubbele namen.
Schrijft alleen buiten een git-werkboom (beelden.veilig_doel). Geen AI-aanroepen, geen kosten.

  python nutrigreen.py omzetten --zip <PM>/nutrigreen/download/dataset.zip --csv <PM>/nutrigreen/download/data.csv
                       --proef-map <PM> --uit <PM>/nutrigreen/coco [--tegel 1024]
      → <uit>/_annotations.coco.json, de beelden, <uit>/rapport.json (ook op stdout)
"""
import argparse
import csv
import hashlib
import io
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

from PIL import Image

import beelden
import scheiding
from train import CATEGORIEEN, KLASSEN  # noqa: F401 (KLASSEN: dezelfde klassenlijst als de andere gereedschappen)

MD5 = "6836b94d5c065aee397fad8415396e5a"
KLASSE = {0: "NUTRISCORE_A", 1: "NUTRISCORE_B", 2: "NUTRISCORE_C", 3: "NUTRISCORE_D", 4: "NUTRISCORE_E",
          5: "EU_ORGANIC_FARMING", 6: "EUROPEAN_V_LABEL_VEGAN"}  # 5 = BIO, 6 = V-Label (vegan en vegetarisch)
ATTRIBUTIE = (  # randvoorwaarden §4, letterlijk
    'Trained in part on the NutriGreen Image Dataset: A Collection of Annotated Nutrition, Organic, and Vegan Food Products'
    ', by Jan Drole, Igor Pravst, Tome Eftimov and Barbara Koroušić Seljak'
    '; Zenodo, doi:10.5281/zenodo.10020545; licence CC BY-SA 4.0.')
LICENTIE = "CC-BY-SA-4.0"
BRON = "doi:10.5281/zenodo.10020545"
BEELD = (".jpg", ".jpeg", ".png")


def lees_csv(pad):
    """{stam: [(code, x, y, w, h)]}; stam = `File Name` zonder `.txt`. Een onbekende klasse-id of een getal buiten
    [0, 1] → ValueError met het regelnummer van het bestand (kop = regel 1)."""
    uit = {}
    with open(pad, newline="", encoding="utf-8") as f:
        rd = csv.DictReader(f)
        for r in rd:
            try:
                code = KLASSE[int(r["Class ID"])]
                getallen = tuple(float(r[k]) for k in ("X", "Y", "Width", "Height"))
                if not all(0 <= g <= 1 for g in getallen):
                    raise ValueError
            except (KeyError, TypeError, ValueError):
                raise ValueError(f"{Path(pad).name} regel {rd.line_num}: ongeldige annotatie") from None
            uit.setdefault(r["File Name"].removesuffix(".txt"), []).append((code, *getallen))
    return uit


def _md5(pad):
    h = hashlib.md5()
    with open(pad, "rb") as f:
        for blok in iter(lambda: f.read(1 << 20), b""):
            h.update(blok)
    return h.hexdigest()


def _toets(stam, gtins, gln7):
    """Bestandsnaam is een barcode (8–14 cijfers) van een toets-GTIN of met het GLN-voorvoegsel van een toetsleverancier."""
    if not re.fullmatch(r"\d{8,14}", stam):
        return False
    z = stam.zfill(14)
    return z in gtins or z[1:8] in gln7


def omzetten(zip_pad, annotaties, uit, tegel=1024, toets_gtins=(), toets_glns=(), md5=MD5):
    """Zet de NutriGreen-zip om naar COCO in `uit`; geeft het rapport. ValueError (niets geschreven) bij een andere md5."""
    gevonden = _md5(zip_pad)
    if gevonden != md5:
        raise ValueError(f"{zip_pad}: md5 {gevonden}, verwacht {md5}; niets omgezet")
    uit = beelden.veilig_doel(uit)
    gtins, gln7 = {str(g).zfill(14) for g in toets_gtins}, {str(g)[:7] for g in toets_glns}
    af = dict.fromkeys(("annotatie_zonder_beeld", "exif_orientatie", "toetsleverancier", "dubbele_naam"), 0)
    cat = {c["name"]: c["id"] for c in CATEGORIEEN}
    coco = {"images": [], "annotations": [], "categories": CATEGORIEEN}
    per_beeld, per_vak = Counter(), Counter()
    with zipfile.ZipFile(zip_pad) as z:
        leden = sorted(n for n in z.namelist() if not n.endswith("/") and n.lower().endswith(BEELD))
        stam = {n: Path(n).stem for n in leden}
        aantal = Counter(stam.values())
        af["annotatie_zonder_beeld"] = len(set(annotaties) - set(aantal))
        uit.mkdir(parents=True, exist_ok=True)
        for naam in leden:
            s = stam[naam]
            if aantal[s] > 1:
                af["dubbele_naam"] += 1  # per beeld: de annotatie is niet aan één foto te koppelen
                continue
            if _toets(s, gtins, gln7):
                af["toetsleverancier"] += 1
                continue
            im = Image.open(io.BytesIO(z.read(naam)))  # één lid tegelijk in het geheugen, nooit de hele zip uitgepakt
            if im.getexif().get(0x0112, 1) != 1:  # richting van de vakjes onzeker
                af["exif_orientatie"] += 1
                continue
            w, h = im.size
            f = min(1.0, tegel / max(w, h))
            nw, nh = round(w * f), round(h * f)
            beeld = beelden.naar_rgb(im)  # alfa plat op wit
            if f < 1:
                beeld = beeld.resize((nw, nh), Image.LANCZOS)
            i = len(coco["images"])
            bestand = f"nutrigreen-{i:05d}.jpg"
            beeld.save(uit / bestand, "JPEG", quality=90)
            coco["images"].append({"id": i, "file_name": bestand, "width": nw, "height": nh, "ng_naam": s})
            codes = set()
            for code, x, y, bw, bh in annotaties.get(s, []):
                x0, y0 = max(0.0, (x - bw / 2) * w * f), max(0.0, (y - bh / 2) * h * f)
                x1, y1 = min(nw, (x + bw / 2) * w * f), min(nh, (y + bh / 2) * h * f)
                if x1 <= x0 or y1 <= y0:
                    continue
                coco["annotations"].append({"id": len(coco["annotations"]), "image_id": i, "category_id": cat[code],
                                            "bbox": [x0, y0, x1 - x0, y1 - y0], "area": (x1 - x0) * (y1 - y0),
                                            "iscrowd": 0})
                codes.add(code)
                per_vak[code] += 1
            per_beeld.update(codes)
    (uit / "_annotations.coco.json").write_text(json.dumps(coco, indent=1))  # ASCII-escapes: namen met tekens buiten ASCII
    met = {a["image_id"] for a in coco["annotations"]}
    return {"beelden": {c: per_beeld[c] for c in KLASSE.values()}, "vakjes": {c: per_vak[c] for c in KLASSE.values()},
            "tegels": len(coco["images"]), "zonder_vakje": len(coco["images"]) - len(met), "afgevallen": af,
            "md5": gevonden, "bron": BRON, "attributie": ATTRIBUTIE, "licentie": LICENTIE, "tegel": tegel}


def _toetsleveranciers(pm):
    """(GLN's, GTIN's) van toetsleveranciers: alle GLN's in declaraties en alcohollijst buiten de trainingsleveranciers."""
    inv = pm / "invoer"
    train = set(json.loads((pm / "scheiding.json").read_text())["trainingsleveranciers"])
    paren = [(gln, gtin) for _, gln, gtin, _ in scheiding.lees_declaraties(inv / "declaraties-prod-basiseenheden-20261008.tsv")]
    paren += scheiding.lees_alcohol(inv / "alcohol-kandidaten.tsv")
    toets = [(gln, gtin) for gln, gtin in paren if gln not in train]
    return {gln for gln, _ in toets}, {gtin for _, gtin in toets}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="stap", required=True)
    o = sub.add_parser("omzetten")
    o.add_argument("--zip", required=True, type=Path)
    o.add_argument("--csv", required=True, type=Path)
    o.add_argument("--proef-map", required=True, type=Path)
    o.add_argument("--uit", required=True, type=Path)
    o.add_argument("--tegel", type=int, default=1024)
    a = ap.parse_args(argv)
    glns, gtins = _toetsleveranciers(a.proef_map)
    try:
        rapport = omzetten(a.zip, lees_csv(a.csv), a.uit, tegel=a.tegel, toets_gtins=gtins, toets_glns=glns)
    except ValueError as e:
        print(f"niet omgezet: {e}", file=sys.stderr)
        return 2
    tekst = json.dumps(rapport, indent=1, ensure_ascii=False)
    (beelden.veilig_doel(a.uit) / "rapport.json").write_text(tekst + "\n", encoding="utf-8")
    print(tekst)
    return 0


if __name__ == "__main__":
    sys.exit(main())
