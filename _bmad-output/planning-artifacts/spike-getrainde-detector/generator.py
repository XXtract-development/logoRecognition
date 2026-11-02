"""Nagemaakte trainingstegels (CAP-4; trainingsset-en-herkenning §2-§3). Eigen beeldbewerking met Pillow/numpy, geen
Albumentations.

Per tegel 1-3 gelabelde logo's (klasse en variant willekeurig, 40-200 px, ±5° draaiing, lichte vervaging), met kans 0,3
een ongelabeld gelijkend keurmerk (hard negatief), geen overlap tussen geplakte objecten, een logo dat deels buiten de
tegel valt alleen als ≥ 60% zichtbaar is (gelabeld met het zichtbare deel), 0-10% lege tegels, JPEG-kwaliteit 60-95.
Uitvoer in COCO (`<uit>/<split>/_annotations.coco.json`), zoals `rfdetr` dat leest; vaste seed → identieke bytes.

  python generator.py logos --proef-map <PM>     logos/bronnen.json, gelijkend.json, referenties.json (+ -herkomst) uit de
                                                momentopname (+ logos/handmatig.json, bv. het zwangerschapspictogram)
  python generator.py tegels --proef-map <PM> --achtergronden <achtergronden.json> --uit <PM>/train/nagemaakt
                      --n 5000 --seed 20261031 [--split train] [--tegel 1024] [--off <PM>/off/bronnen.json]
      --off (CAP-17, trainingsset §11): de index van `off.py ophalen`; per geplakt logo van een klasse met
      OFF-uitsneden met kans AANDEEL_OFF een OFF-uitsnede in plaats van de eigen bron, als foto zoals hij is (geen
      afgeleide varianten). Alleen in split train; schrijft dan <uit>/herkomst.json (attributie en licentie van OFF).
"""
import argparse
import hashlib
import io
import json
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageFilter, ImageOps

import beelden
import off as offbron
from train import KLASSEN
from train import VARIANTEN as KLASSE_VAN_VARIANT  # VARIANTEN hieronder zijn de beeldvarianten

CATEGORIE = {k: i + 1 for i, k in enumerate(KLASSEN)}  # COCO-categorie-id's 1..13, naam = code
VARIANTEN = ("kleur", "zwartwit", "lijn", "negatief")
MIN_PX, MAX_PX, MAX_HOEK, KANS_GELIJKEND, MIN_ZICHTBAAR = 40, 200, 5.0, 0.3, 0.6
AANDEEL_OFF = 0.5  # kans op een OFF-uitsnede in plaats van de eigen bron (trainingsset §11)


def _op_wit(im):
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im.convert("RGBA"))
    return bg.convert("RGB")


def varianten(logo):
    """kleur, zwartwit (grijs + drempel), lijn (omtrek) en negatief (wit op donker), elk RGBA op de maat van het logo."""
    logo = logo.convert("RGBA")
    alfa = logo.getchannel("A")
    zw = logo.convert("L").point(lambda v: 255 if v >= 128 else 0)
    inkt = _op_wit(logo).convert("L").point(lambda v: 255 if v < 200 else 0)
    rand = ImageChops.subtract(inkt, inkt.filter(ImageFilter.MinFilter(5)))
    lijn = Image.new("RGBA", logo.size, (0, 0, 0, 0))
    lijn.putalpha(rand)
    zwart = Image.merge("RGBA", (zw, zw, zw, alfa))
    return {"kleur": logo, "zwartwit": zwart, "lijn": lijn,
            "negatief": ImageOps.invert(_op_wit(logo).convert("L")).convert("RGBA")}


def _sha_beeld(im):
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return hashlib.sha256(buf.getvalue()).hexdigest()


def _controleer_gtin(bron, trainings_gtins, wat, verplicht=False):
    g = bron.get("gtin")
    if (g is None and verplicht) or (g is not None and g not in trainings_gtins):
        raise ValueError(f"{wat} met GTIN {g!r} hoort niet bij een trainingsleverancier")


def _vorm(rng, im):
    """Schaal (langste zijde 40-200 px), draai ±5°, vervaag licht; bijgesneden tot het niet-transparante deel."""
    im = im.convert("RGBA")
    s = rng.randint(MIN_PX, MAX_PX)
    f = s / max(im.size)
    im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
    im = im.rotate(rng.uniform(-MAX_HOEK, MAX_HOEK), Image.BICUBIC, expand=True)
    rand = Image.new("RGBA", (im.width + 6, im.height + 6), (0, 0, 0, 0))
    rand.paste(im, (3, 3))
    im = rand.convert("RGBa").filter(ImageFilter.GaussianBlur(rng.uniform(0.0, 1.0))).convert("RGBA")
    box = im.getchannel("A").getbbox()
    return im.crop(box) if box else None


def _vrij(r, bezet):
    return all(r[2] <= b[0] or b[2] <= r[0] or r[3] <= b[1] or b[3] <= r[1] for b in bezet)


def _plaats(rng, w, h, tegel, bezet, deels):
    """Linksboven (x, y) en het zichtbare vak, of None. `deels`: ≥ 60% zichtbaar mag, anders helemaal binnen."""
    if w > tegel or h > tegel:
        return None
    for _ in range(40):
        if deels:
            x, y = rng.randint(-round(0.4 * w), tegel - round(0.6 * w)), rng.randint(-round(0.4 * h), tegel - round(0.6 * h))
        else:
            x, y = rng.randint(0, tegel - w), rng.randint(0, tegel - h)
        r = (max(0, x), max(0, y), min(tegel, x + w), min(tegel, y + h))
        if (r[2] - r[0]) * (r[3] - r[1]) >= MIN_ZICHTBAAR * w * h and _vrij(r, bezet):
            return x, y, r
    return None


def _beeld(bron):
    """Het beeld van een achtergrond: meegegeven (`beeld`) of pas nu geopend en weer losgelaten (`pad`), zodat niet alle
    etiketten tegelijk in het geheugen staan."""
    if "beeld" in bron:
        return bron["beeld"]
    with Image.open(bron["pad"]) as im:
        return im.convert("RGB")


def _off_beeld(x):
    """Een OFF-uitsnede als RGBA: meegegeven beeld of pas nu geopend pad."""
    if isinstance(x, Image.Image):
        return x.convert("RGBA")
    with Image.open(x) as im:
        return im.convert("RGBA")


def _sha_bron(bron):
    return _sha_beeld(bron["beeld"]) if "beeld" in bron else hashlib.sha256(Path(bron["pad"]).read_bytes()).hexdigest()


def _achtergrond(rng, im, tegel):
    if min(im.size) < tegel:
        f = tegel / min(im.size)
        im = im.resize((max(tegel, round(im.width * f)), max(tegel, round(im.height * f))), Image.LANCZOS)
    x, y = rng.randint(0, im.width - tegel), rng.randint(0, im.height - tegel)
    return im.crop((x, y, x + tegel, y + tegel)).convert("RGBA")


def genereer(achtergronden, logos, gelijkend, trainings_gtins, n_tegels, seed, uit, tegel=1024, leeg_fractie=0.05,
             split="train", off=None):
    """`off` = {klasse: [Image | pad]}: OFF-uitsneden (CAP-17), alleen in split train; lege lijsten tellen niet."""
    if not 0 <= leeg_fractie <= 0.1:
        raise ValueError("lege tegels: 0-10%")
    onbekend = [k for k in off or {} if k not in CATEGORIE]
    if onbekend:
        raise ValueError(f"OFF-uitsneden van onbekende klasse {onbekend}")
    off = {k: v for k, v in (off or {}).items() if v}
    if off and split != "train":
        raise ValueError(f"OFF-uitsneden alleen in split train, niet in {split}")
    for a in achtergronden:
        _controleer_gtin(a, trainings_gtins, "achtergrond", verplicht=True)
    for klasse, lijst in logos.items():
        if klasse not in CATEGORIE:
            raise ValueError(f"onbekende klasse {klasse}")
        for b in lijst:
            _controleer_gtin(b, trainings_gtins, f"logo {klasse}")
    for b in gelijkend:
        _controleer_gtin(b, trainings_gtins, "gelijkend keurmerk")
    ag = [a for a in achtergronden if not a.get("meldingen")]  # AI-screening meldde een van de 8: valt af
    if not ag or not any(logos.values()):
        raise ValueError("geen bruikbare achtergrond of logo")
    uit = beelden.veilig_doel(uit)
    map_ = uit / split
    map_.mkdir(parents=True, exist_ok=True)

    rng = random.Random(seed)
    bronnen = [(k, b, varianten(b["beeld"])) for k in sorted(logos) for b in logos[k]]
    bronnen = [(k, b, {n: v for n, v in vs.items() if v.getchannel("A").getbbox()}) for k, b, vs in bronnen]
    gl = [g["beeld"].convert("RGBA") for g in gelijkend]
    leeg = set(rng.sample(range(n_tegels), round(n_tegels * leeg_fractie)))
    coco = {"images": [], "annotations": [],
            "categories": [{"id": i, "name": k, "supercategory": "keurmerk"} for k, i in CATEGORIE.items()]}
    manifest = {"seed": seed, "tegel": tegel, "split": split, "n_tegels": n_tegels, "leeg_fractie": leeg_fractie,
                "logos": [{"klasse": k, "gtin": b.get("gtin"), "sha256": _sha_beeld(b["beeld"]), "varianten": sorted(vs)}
                          for k, b, vs in bronnen],
                "gelijkend": [{"gtin": g.get("gtin"), "sha256": _sha_beeld(g["beeld"])} for g in gelijkend],
                "achtergronden": [{"gtin": a["gtin"], "sha256": _sha_bron(a)} for a in ag],
                "beelden": [], "off": {}}
    for i in range(n_tegels):
        t = _achtergrond(rng, _beeld(rng.choice(ag)), tegel)
        bezet, objecten = [], []
        if i not in leeg:
            for nr in range(rng.randint(1, 3)):
                k, b, vs = rng.choice(bronnen)
                variant, uitsnede = rng.choice(sorted(vs)), None
                if off.get(k) and rng.random() < AANDEEL_OFF:  # zonder OFF voor k geen extra trekking: byte-gelijk
                    uitsnede = rng.choice(off[k])
                    variant, im = "off", _vorm(rng, _off_beeld(uitsnede))
                else:
                    im = _vorm(rng, vs[variant])
                plek = im and _plaats(rng, im.width, im.height, tegel, bezet, deels=True)
                if not plek and nr == 0 and im:  # elke niet-lege tegel heeft minstens één gelabeld logo
                    plek = _plaats(rng, im.width, im.height, tegel, bezet, deels=False)
                if not plek:
                    continue
                x, y, r = plek
                t.alpha_composite(im, (r[0], r[1]), (r[0] - x, r[1] - y, r[2] - x, r[3] - y))
                bezet.append(r)
                objecten.append({"klasse": k, "variant": variant, "bbox": [r[0], r[1], r[2] - r[0], r[3] - r[1]],
                                 "volledig": [im.width, im.height]})  # maat vóór afsnijden (60%-regel controleerbaar)
                if uitsnede is not None and not isinstance(uitsnede, Image.Image):
                    objecten[-1]["uitsnede"] = str(uitsnede)  # welke OFF-uitsnede (pad uit bronnen.json)
            if gl and rng.random() < KANS_GELIJKEND:
                im = _vorm(rng, rng.choice(gl))
                plek = im and _plaats(rng, im.width, im.height, tegel, bezet, deels=False)
                if plek:
                    t.alpha_composite(im, plek[:2])
                    bezet.append(plek[2])
        naam = f"{split}-{i:06d}.jpg"
        buf = io.BytesIO()
        t.convert("RGB").save(buf, "JPEG", quality=rng.randint(60, 95), subsampling=0)
        (map_ / naam).write_bytes(buf.getvalue())
        coco["images"].append({"id": i, "file_name": naam, "width": tegel, "height": tegel})
        for o in objecten:
            x, y, w, h = o["bbox"]
            coco["annotations"].append({"id": len(coco["annotations"]), "image_id": i, "category_id": CATEGORIE[o["klasse"]],
                                        "bbox": [x, y, w, h], "area": w * h, "iscrowd": 0})
        manifest["beelden"].append({"bestand": naam, "sha256": hashlib.sha256(buf.getvalue()).hexdigest(),
                                    "objecten": objecten, "gelijkend": len(bezet) - len(objecten)})
    tekst = json.dumps(coco, indent=1, sort_keys=True)
    (map_ / "_annotations.coco.json").write_text(tekst)
    manifest["coco_sha256"] = hashlib.sha256(tekst.encode()).hexdigest()
    for b in manifest["beelden"]:
        for o in b["objecten"]:
            if o["variant"] == "off":
                manifest["off"][o["klasse"]] = manifest["off"].get(o["klasse"], 0) + 1
    (uit / f"manifest-{split}.json").write_text(json.dumps(manifest, indent=1, sort_keys=True))
    if manifest["off"]:  # overschreven bij elke run met OFF; een run zonder OFF laat hem staan
        (uit / "herkomst.json").write_text(json.dumps(
            [{"bron": offbron.BRON, "attributie": offbron.ATTRIBUTIE, "licentie": offbron.LICENTIE}],
            indent=1, ensure_ascii=False), encoding="utf-8")
    return manifest


def _lees(lijst):
    return [{**x, "beeld": Image.open(x["pad"])} for x in lijst]


def _gtin_gln(inv):
    import scheiding

    decl = scheiding.lees_declaraties(inv / "declaraties-prod-basiseenheden-20261008.tsv")
    return {g: gln for _, gln, g, _ in decl} | {g: gln for gln, g in scheiding.lees_alcohol(inv / "alcohol-kandidaten.tsv")}


def _logos(pm):
    """Logobronnen per klasse (trainingsset §2): publiek/GS1/synthetisch, plus schone uitsneden van trainingsleveranciers.
    Een variant (vegetarisch V-label, FSC Mix/Recycled/100%) is een bron van zijn klasse. Referentieplaatje: eigen code
    vóór variant, binnen elk http vóór GS1; een variant alleen voor FSC, dat geen eigen publiek bestand heeft (ronde 9)."""
    import scheiding
    import toets

    inv = pm / "invoer"
    mo = Path.home() / "logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/momentopname/bestanden"
    train = set(json.loads((pm / "scheiding.json").read_text())["trainingsleveranciers"])
    gtin_gln = _gtin_gln(inv)
    publiek = {"gs1-packaging-label-guide", "synthetic-nutriscore-bootstrap"}
    bronnen, gelijkend, referenties, varianten = [], [], {}, {}
    for r in json.loads((inv / "momentopname/actieve-refs.json").read_text()):
        pad, bron, klasse = mo / r["path"], r.get("source") or "", KLASSE_VAN_VARIANT.get(r["code"], r["code"])
        if klasse not in CATEGORIE and klasse not in toets.GELIJKEND_CODES or not pad.exists():
            continue
        if np.asarray(Image.open(pad).convert("L")).std() < 3:
            continue  # vrijwel egaal: valt altijd af (toetsset §2)
        if bron in publiek or bron.startswith("http"):
            gtin = None
        else:
            gtins = scheiding.gtins_uit_paden([r["path"]])
            gtin = next(iter(gtins)) if len(gtins) == 1 else None
            if gtin is None or gtin_gln.get(gtin) not in train:
                continue  # uitsnede niet van een trainingsleverancier
        item = {"klasse": klasse, "pad": str(pad), "gtin": gtin, "herkomst": f"{bron} {r['id']}",
                "sha256": hashlib.sha256(pad.read_bytes()).hexdigest(), "licentie": "alleen intern"}
        (bronnen if klasse in CATEGORIE else gelijkend).append(item)
        if klasse in CATEGORIE and gtin is None:  # verplicht referentieplaatje: bron 1 (http) vóór bron 2
            doel = referenties if r["code"] == klasse else varianten
            oud = doel.get(klasse)
            if oud is None or (bron.startswith("http") and not oud["herkomst"].startswith("http")):
                doel[klasse] = {"pad": str(pad), "herkomst": item["herkomst"], "sha256": item["sha256"]}
    if "FOREST_STEWARDSHIP_COUNCIL_LABEL" in varianten:  # alleen FSC: geen eigen publiek of GS1-bestand (trainingsset §2)
        referenties.setdefault("FOREST_STEWARDSHIP_COUNCIL_LABEL", varianten["FOREST_STEWARDSHIP_COUNCIL_LABEL"])
    handmatig = pm / "logos" / "handmatig.json"  # [{klasse, pad, herkomst, licentie}] — publieke bestanden, geen uitsneden
    for h in json.loads(handmatig.read_text()) if handmatig.exists() else []:
        item = {**h, "gtin": None, "sha256": hashlib.sha256(Path(h["pad"]).read_bytes()).hexdigest()}
        bronnen.append(item)
        referenties.setdefault(h["klasse"], {"pad": h["pad"], "herkomst": h["herkomst"], "sha256": item["sha256"]})
    ontbreekt = [k for k in KLASSEN if k not in referenties]
    return bronnen, gelijkend, referenties, ontbreekt


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="stap", required=True)
    lg = sub.add_parser("logos")
    lg.add_argument("--proef-map", required=True, type=Path)
    tg = sub.add_parser("tegels")
    tg.add_argument("--proef-map", required=True, type=Path)
    tg.add_argument("--achtergronden", required=True, type=Path, help="[{pad, gtin, meldingen: [...]}] (AI-screening)")
    tg.add_argument("--uit", required=True, type=Path)
    tg.add_argument("--n", type=int, required=True)
    tg.add_argument("--seed", type=int, default=20261031)
    tg.add_argument("--split", default="train")
    tg.add_argument("--tegel", type=int, default=1024)
    tg.add_argument("--off", type=Path, help="bronnen.json van off.py ophalen (alleen met --split train)")
    a = ap.parse_args(argv)
    if a.stap == "tegels" and a.off and a.split != "train":
        print(f"--off alleen in split train, niet in {a.split}; niets geschreven", file=sys.stderr)
        return 2
    logos_map = beelden.veilig_doel(a.proef_map / "logos")
    if a.stap == "logos":
        bronnen, gelijkend, referenties, ontbreekt = _logos(a.proef_map)
        logos_map.mkdir(parents=True, exist_ok=True)
        for naam, data in (("bronnen", bronnen), ("gelijkend", gelijkend), ("referenties-herkomst", referenties),
                           ("referenties", {k: v["pad"] for k, v in referenties.items()})):  # {code: png} voor herken.py beslis
            (logos_map / f"{naam}.json").write_text(json.dumps(data, indent=1, sort_keys=True))
        print(len(bronnen), "logobronnen,", len(gelijkend), "gelijkende,", len(referenties), "referentieplaatjes;",
              "ontbreekt (stoppunt 7 bij het bevriezen):", ontbreekt or "niets")
        return 0
    gtin_gln = _gtin_gln(a.proef_map / "invoer")
    train = set(json.loads((a.proef_map / "scheiding.json").read_text())["trainingsleveranciers"])
    gtins = {g for g, gln in gtin_gln.items() if gln in train}
    logos = {}
    for b in json.loads((logos_map / "bronnen.json").read_text()):
        logos.setdefault(b["klasse"], []).append({"beeld": Image.open(b["pad"]), "gtin": b.get("gtin")})
    off = {}
    for e in json.loads(a.off.read_text(encoding="utf-8")) if a.off else []:
        off.setdefault(e["klasse"], []).append(e["pad"])  # pad: het beeld wordt pas bij gebruik geopend
    m = genereer(json.loads(a.achtergronden.read_text()),  # achtergronden als pad: één tegelijk geopend
                 logos, _lees(json.loads((logos_map / "gelijkend.json").read_text())),
                 gtins, a.n, a.seed, a.uit, tegel=a.tegel, split=a.split, off=off)
    print(len(m["beelden"]), "tegels,", sum(len(b["objecten"]) for b in m["beelden"]), "gelabelde logo's →", a.uit / a.split)
    return 0


if __name__ == "__main__":
    sys.exit(main())
