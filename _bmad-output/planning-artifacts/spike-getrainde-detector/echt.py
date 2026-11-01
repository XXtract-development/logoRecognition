"""Echte trainingsvoorbeelden met AI-vakjes (CAP-5; trainingsset-en-herkenning §4). Stdlib + Pillow.

Alleen etiketten van trainingsleveranciers. Een vakje dat het model onzeker noemt of dat buiten het beeld valt, wordt
niet gebruikt, en elke tegel die zo'n vakje raakt valt af. Een zeker vakje dat een tegel maar deels raakt, wordt met het
zichtbare deel gelabeld als ≥ 60% zichtbaar is; anders valt de tegel af (half labelen werkt niet). Validatieset: per
klasse 30% van de etiketten, gesplitst op dHash-cluster (afstand ≤ 6, ketens), zodat bijna-gelijke etiketten aan één
kant blijven; een cluster dat de klasse boven 1,5× het doel zou brengen wordt overgeslagen (gemeld in het rapport).
AI-vakjes tellen alleen met x0 < x1, y0 < y1 en zijden ≥ 4 px; hetzelfde keurmerk in het hele etiket én in een tegel
wordt per code samengevoegd (herken.nms, IoU 0,5).

  python echt.py voorlabels --lijst <json [{doc_id, gln, pad}]> --proef-map <PM> --uit <voorlabels.json> --zdr-logo <png>
  python echt.py dataset --lijst <json> --voorlabels <voorlabels.json> --proef-map <PM> --uit <PM>/train/echt
                         [--meng <PM>/train/nagemaakt/train --meng-aantal 1000]   (fase 2: deel nagemaakte tegels erbij)
      → train/, valid/, test/ (kopie van valid, voor rfdetr), achtergronden.json (alleen de trainingskant),
        validatie-waarheid.json {doc: {"aanwezig": [...], "onzeker": [...]}}, validatie-lijst.json, rapport.json
  python echt.py validatie-uitslag --waarheid <echt/validatie-waarheid.json> --uit <echt/validatie-uitslag.json>
"""
import argparse
import io
import json
import random
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

import beelden
import herken
import openrouter
import scheiding
from train import KLASSEN
GELIJKEND = ("AGRICULTURE_BIOLOGIQUE", "BDIH_LOGO", "TRIMAN", "SEPARATE_COLLECTION", "SOCIETY_PLASTICS_INDUSTRY",
             "RETURNABLE_CAN_NL", "NUTRISCORE_D", "NUTRISCORE_E", "MINIMUM_DRINKING_AGE_18_WARNING",
             "DO_NOT_DRINK_AND_DRIVE_WARNING", "AQUACULTURE_STEWARDSHIP_COUNCIL", "BETER_LEVEN_1_STER",
             "BETER_LEVEN_2_STER", "EUROPEAN_V_LABEL_VEGAN", "EUROPEAN_V_LABEL_VEGETARIAN", "VEGAN")
SCHEMA_VOORLABELS = {
    "type": "object",
    "properties": {"vakjes": {"type": "array", "items": {
        "type": "object",
        "properties": {"beeld": {"type": "integer"},
                       "code": {"type": "string", "enum": [*KLASSEN, *GELIJKEND, "ander"]},
                       "box": {"type": "array", "items": {"type": "number"}},
                       "onzeker": {"type": "boolean"}},
        "required": ["beeld", "code", "box", "onzeker"], "additionalProperties": False}}},
    "required": ["vakjes"],
    "additionalProperties": False,
}
PROMPT = (
    "Image 0 is a whole product label; images 1, 2, ... are tiles of the same label. Draw a box around every printed "
    "quality mark, logo or pictogram you see. For each box give the image number it is drawn in, the code, the box as "
    "[x0, y0, x1, y1] in pixels of that image as you received it, and onzeker=true if you are not sure of the code or "
    "the box. Use these codes: " + ", ".join(KLASSEN) + " (Nutri-Score: the highlighted letter); look-alike marks: "
    + ", ".join(GELIJKEND) + "; anything else: ander. Text without a logo is not a mark."
)
MIN_ZICHTBAAR = 0.6
MIN_ZIJDE = 4  # px; kleinere of omgekeerde AI-vakjes tellen niet
MAX_TEGELS = 16  # per aanroep, naast het hele etiket


def schoon(vakjes):
    """Alleen vakjes met zijden ≥ MIN_ZIJDE (dus x0 < x1, y0 < y1); dubbele vakjes van één code samengevoegd met
    herken.nms (score 1,0, IoU 0,5), zekere en onzekere apart zodat een onzeker vakje zijn tegels blijft uitsluiten."""
    goed = [v for v in vakjes if v["box"][2] - v["box"][0] >= MIN_ZIJDE and v["box"][3] - v["box"][1] >= MIN_ZIJDE]
    uit = []
    for sleutel in sorted({(v["code"], bool(v.get("onzeker"))) for v in goed}):
        groep = [{**v, "score": 1.0} for v in goed if (v["code"], bool(v.get("onzeker"))) == sleutel]
        uit += [{k: x for k, x in v.items() if k != "score"} for v in herken.nms(groep, 0.5)]
    return uit


def _maat(png):
    with Image.open(io.BytesIO(png)) as im:
        return im.size


def _snijd(a, b):
    return max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])


def _opp(r):
    return max(0, r[2] - r[0]) * max(0, r[3] - r[1])


def naar_tegels(etiketten, trainings_glns, tegel=1024, overlap=256):
    uit = []
    for e in etiketten:
        if e["gln"] not in trainings_glns:
            raise ValueError("etiket van een toetsleverancier in de trainingsinvoer")
        w, h = e["beeld"].size
        zeker, onzeker = [], []
        for v in schoon(e["vakjes"]):
            b = tuple(v["box"])
            buiten = b[0] < 0 or b[1] < 0 or b[2] > w or b[3] > h
            (onzeker if v.get("onzeker") or buiten else zeker).append((v["code"], b))
        for t in herken.tegels(w, h, tegel=tegel, overlap=overlap):
            if any(_opp(_snijd(t, b)) > 0 for _, b in onzeker):
                continue
            vakjes, bruikbaar = [], True
            for code, b in zeker:
                s = _snijd(t, b)
                if _opp(s) <= 0:
                    continue
                if _opp(s) < MIN_ZICHTBAAR * _opp(b):
                    bruikbaar = False
                    break
                vakjes.append({"code": code, "box": (s[0] - t[0], s[1] - t[1], s[2] - t[0], s[3] - t[1])})
            if bruikbaar:
                uit.append({"doc_id": e["doc_id"], "tegel": tuple(t), "vakjes": vakjes})
    return uit


def valsplit(etiketten, fractie=0.3, seed=20261031, overgeslagen=None):
    """(train, valid) als verzamelingen doc_id's; per klasse ±fractie, dHash-clusters nooit gesplitst. Een cluster dat de
    klasse boven 1,5× het doel zou brengen (bv. een lange dHash-keten) gaat niet naar validatie; met een lijst
    `overgeslagen` komt elk zo'n cluster daarin als {"klasse", "docs"}."""
    n = len(etiketten)
    ouder = list(range(n))

    def wortel(i):
        while ouder[i] != i:
            ouder[i] = ouder[ouder[i]]
            i = ouder[i]
        return i

    for i in range(n):
        for j in range(i):
            if scheiding.hamming(etiketten[i]["dhash"], etiketten[j]["dhash"]) <= 6:
                ouder[wortel(i)] = wortel(j)
    clusters = {}
    for i, e in enumerate(etiketten):
        clusters.setdefault(wortel(i), []).append(e)
    clusters = [clusters[k] for k in sorted(clusters)]
    rng = random.Random(seed)
    klassen = {c for e in etiketten for c in e["codes"]}
    per = {c: sum(c in e["codes"] for e in etiketten) for c in klassen}
    per[""] = sum(not e["codes"] for e in etiketten)  # etiketten zonder klasse: ook 30% (negatieven voor de drempels)
    valid = set()
    for c in sorted(per, key=lambda c: (per[c], c)):  # zeldzaamste klasse eerst
        doel = round(fractie * per[c])
        heeft = (lambda e, c=c: c in e["codes"]) if c else (lambda e: not e["codes"])
        kandidaat = [i for i, cl in enumerate(clusters) if any(heeft(e) for e in cl)]
        rng.shuffle(kandidaat)
        aantal = sum(heeft(e) for i in valid for e in clusters[i])
        for i in kandidaat:
            if aantal >= doel:
                break
            if i in valid:
                continue
            erbij = sum(heeft(e) for e in clusters[i])
            if aantal + erbij > 1.5 * doel:
                if overgeslagen is not None:
                    overgeslagen.append({"klasse": c or "(geen)", "docs": sorted(e["doc_id"] for e in clusters[i])})
                continue
            valid.add(i)
            aantal += erbij
    v = {e["doc_id"] for i in valid for e in clusters[i]}
    return {e["doc_id"] for e in etiketten} - v, v


def voorlabels(client, beeld_png, tegels, maat=None):
    """Heel etiket, dan hoogstens MAX_TEGELS tegels per aanroep (meer tegels: extra aanroepen); vakjes van de 10
    klassen in etiketcoördinaten, opgeschoond met `schoon`. `tegels` = [(png, (x0, y0, x1, y1) in het etiket)];
    `maat` = (w, h) van het etiket als het hele beeld verkleind is. Een antwoord in een andere vorm: EtiketFout."""
    w0, h0 = _maat(beeld_png)
    heel = ((maat or (w0, h0))[0] / w0, (maat or (w0, h0))[1] / h0, 0, 0)
    uit = []
    try:
        for start in range(0, max(1, len(tegels)), MAX_TEGELS):
            deel = tegels[start:start + MAX_TEGELS]
            a, _ = client.vraag(PROMPT, [beeld_png, *(t for t, _ in deel)], SCHEMA_VOORLABELS, verwacht=0.012)
            schalen = [heel]
            for png, (x0, y0, x1, y1) in deel:
                tw, th = _maat(png)
                schalen.append(((x1 - x0) / tw, (y1 - y0) / th, x0, y0))
            for v in a["vakjes"]:
                if v["code"] not in KLASSEN or not 0 <= v["beeld"] < len(schalen) or len(v["box"]) != 4:
                    continue
                sx, sy, dx, dy = schalen[v["beeld"]]
                b = v["box"]
                uit.append({"code": v["code"], "box": (round(b[0] * sx + dx), round(b[1] * sy + dy), round(b[2] * sx + dx),
                                                        round(b[3] * sy + dy)), "onzeker": bool(v["onzeker"])})
    except (TypeError, AttributeError, KeyError, ValueError):
        raise openrouter.EtiketFout("antwoord_ongeldig") from None
    return schoon(uit)


def rapport(train, valid):
    """Per klasse: etiketten en zekere vakjes die overblijven, voor training en validatie."""
    r = {}
    for k in KLASSEN:
        r[k] = {}
        for kant, lijst in (("train", train), ("valid", valid)):
            vakjes = [sum(v["code"] == k and not v.get("onzeker") for v in e["vakjes"]) for e in lijst]
            r[k][f"{kant}_etiketten"] = sum(n > 0 for n in vakjes)
            r[k][f"{kant}_vakjes"] = sum(vakjes)
    return r


# --- opdrachtregel (lijm) ----------------------------------------------------------------------------------------

def _png(im):
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def _rgb(pad):
    with Image.open(pad) as im:
        return im.convert("RGB")


def _coco(tegels, pad_per_doc, map_):
    """Tegels als COCO-set; elk etiket wordt één keer geopend, gebruikt en losgelaten (niet alles tegelijk in het geheugen)."""
    map_.mkdir(parents=True, exist_ok=True)
    cat = {k: i + 1 for i, k in enumerate(KLASSEN)}  # zelfde categorieën als generator.py
    coco = {"images": [], "annotations": [],
            "categories": [{"id": i, "name": k, "supercategory": "keurmerk"} for k, i in cat.items()]}
    huidig = beeld = None
    for i, t in enumerate(tegels):
        if t["doc_id"] != huidig:
            huidig, beeld = t["doc_id"], _rgb(pad_per_doc[t["doc_id"]])
        naam = f"{t['doc_id']}-{t['tegel'][0]}-{t['tegel'][1]}.png"
        beeld.crop(t["tegel"]).save(map_ / naam)
        coco["images"].append({"id": i, "file_name": naam, "width": t["tegel"][2] - t["tegel"][0],
                               "height": t["tegel"][3] - t["tegel"][1]})
        for v in t["vakjes"]:
            x0, y0, x1, y1 = v["box"]
            coco["annotations"].append({"id": len(coco["annotations"]), "image_id": i, "category_id": cat[v["code"]],
                                        "bbox": [x0, y0, x1 - x0, y1 - y0], "area": (x1 - x0) * (y1 - y0), "iscrowd": 0})
    (map_ / "_annotations.coco.json").write_text(json.dumps(coco, indent=1))


def _waarheid(vakjes, w, h):
    """(zekere codes, codes met alleen onzekere of buiten het beeld vallende vakjes) van één etiket."""
    zeker, alle = set(), set()
    for v in schoon(vakjes):
        b = v["box"]
        alle.add(v["code"])
        if not v["onzeker"] and b[0] >= 0 and b[1] >= 0 and b[2] <= w and b[3] <= h:
            zeker.add(v["code"])
    return zeker, alle - zeker


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="stap", required=True)
    v = sub.add_parser("voorlabels")
    v.add_argument("--lijst", required=True, type=Path)
    v.add_argument("--proef-map", required=True, type=Path)
    v.add_argument("--uit", required=True, type=Path)
    v.add_argument("--zdr-logo", required=True, type=Path)
    v.add_argument("--model", default="google/gemini-3.8-flash")
    v.add_argument("--raming", type=float, default=10.0)
    d = sub.add_parser("dataset")
    d.add_argument("--lijst", required=True, type=Path)
    d.add_argument("--voorlabels", required=True, type=Path)
    d.add_argument("--proef-map", required=True, type=Path)
    d.add_argument("--uit", required=True, type=Path)
    d.add_argument("--tegel", type=int, default=1024)
    d.add_argument("--overlap", type=int, default=256)
    d.add_argument("--meng", type=Path, help="COCO-map met nagemaakte tegels die (deels) bij train komen")
    d.add_argument("--meng-aantal", type=int, default=1000)
    w = sub.add_parser("validatie-uitslag")
    w.add_argument("--waarheid", required=True, type=Path)
    w.add_argument("--uit", required=True, type=Path)
    a = ap.parse_args(argv)
    if a.stap == "validatie-uitslag":  # AI-vakjes van de validatieset in het schema van uitslag.json, voor tel_proef
        import uitslag as us

        uit = {}
        for doc, waar in json.loads(a.waarheid.read_text()).items():
            aanwezig, onzeker = set(waar["aanwezig"]), set(waar["onzeker"])
            ns = sorted(c[-1] for c in aanwezig if c.startswith("NUTRISCORE_"))
            uit[doc] = {"status": "bevestigd",
                        "keurmerken": {k: "aanwezig" if k in aanwezig else "onzeker" if k in onzeker else "afwezig"
                                       for k in us.KEURMERKEN7},
                        "nutriscore": ns if ns or not any(c.startswith("NUTRISCORE_") for c in onzeker) else "onleesbaar",
                        "veranderd": [], "opmerking": "validatie (AI-vakjes, niet door Friso bevestigd)", "tijd": ""}
        beelden.veilig_doel(a.uit).write_text(json.dumps(uit, indent=1))
        print(len(uit), "validatie-etiketten")
        return 0
    lijst = json.loads(a.lijst.read_text())  # (validatie-uitslag is hierboven al afgehandeld)
    train_glns = set(json.loads((a.proef_map / "scheiding.json").read_text())["trainingsleveranciers"])
    if any(e["gln"] not in train_glns for e in lijst):
        raise SystemExit("lijst bevat een toetsleverancier")

    if a.stap == "voorlabels":
        import kosten

        uit = beelden.veilig_doel(a.uit)
        klaar = json.loads(uit.read_text()) if uit.exists() else {}
        af = {d for d, r in klaar.items() if d != "_zdr_proef" and "fout" not in r}  # een mislukt etiket opnieuw proberen
        bewaker = kosten.Bewaker("voorlabels + achtergrondscreening", a.raming, grootboek=a.proef_map / "uitgaven.json")
        bewaker.controleer_start(sum(e["doc_id"] not in af for e in lijst) * 0.012)
        client = openrouter.Client(a.model, "voorlabels", bewaker=bewaker)
        klaar["_zdr_proef"] = client.zdr_proef(a.zdr_logo.read_bytes())
        geweigerd = 0
        for e in lijst:
            if e["doc_id"] in af:
                continue
            im = _rgb(e["pad"])
            heel = im.copy()
            heel.thumbnail((1500, 1500))
            vak = herken.tegels(*im.size)
            try:
                klaar[e["doc_id"]] = {"vakjes": voorlabels(client, _png(heel), [(_png(im.crop(t)), t) for t in vak], im.size)}
                geweigerd = 0
            except openrouter.EtiketFout as f:
                klaar[e["doc_id"]] = {"fout": f.klasse}
                geweigerd = geweigerd + 1 if f.klasse == "geweigerd" else 0
            uit.write_text(json.dumps(klaar, indent=1))
            if geweigerd >= 5:
                raise SystemExit("5 etiketten op rij geweigerd door de aanbieder: run gestopt (zie randvoorwaarden §2)")
        print(len(lijst), "etiketten, uitgegeven $%.2f" % bewaker.uitgegeven)
        return 0

    uit = beelden.veilig_doel(a.uit)
    vl = json.loads(a.voorlabels.read_text())
    et, pad, waarheid = [], {}, {}
    for e in lijst:
        r = vl.get(e["doc_id"], {})
        if "vakjes" not in r:
            continue  # mislukte voorlabels: niet gebruikt
        with Image.open(e["pad"]) as im:  # alleen maat en dHash; het beeld zelf wordt pas per tegelset geopend
            maat, dh = im.size, scheiding.dhash(im)
        zeker, onzeker = _waarheid(r["vakjes"], *maat)
        pad[e["doc_id"]], waarheid[e["doc_id"]] = e["pad"], {"aanwezig": sorted(zeker), "onzeker": sorted(onzeker)}
        et.append({"doc_id": e["doc_id"], "gln": e["gln"], "beeld": SimpleNamespace(size=maat), "vakjes": r["vakjes"],
                   "codes": zeker, "dhash": dh, "meldingen": sorted({x["code"] for x in r["vakjes"]})})
    overgeslagen = []
    train, valid = valsplit(et, overgeslagen=overgeslagen)
    for kant, docs in (("train", train), ("valid", valid)):
        _coco(naar_tegels([e for e in et if e["doc_id"] in docs], train_glns, a.tegel, a.overlap), pad, uit / kant)
    if a.meng:  # vaste keuze: de eerste N nagemaakte tegels (de generator schudt al met zijn seed)
        coco = json.loads((uit / "train" / "_annotations.coco.json").read_text())
        extra = json.loads((a.meng / "_annotations.coco.json").read_text())
        if extra["categories"] != coco["categories"]:
            raise SystemExit("--meng: andere categorieën dan de echte set; samenvoegen op id zou klassen verwisselen")
        ids = [im["id"] for im in extra["images"][:a.meng_aantal]]
        nieuw = {i: len(coco["images"]) + n for n, i in enumerate(ids)}
        for im in extra["images"][:a.meng_aantal]:
            shutil.copyfile(a.meng / im["file_name"], uit / "train" / im["file_name"])
            coco["images"].append({**im, "id": nieuw[im["id"]]})
        for x in extra["annotations"]:
            if x["image_id"] in nieuw:
                coco["annotations"].append({**x, "id": len(coco["annotations"]), "image_id": nieuw[x["image_id"]]})
        (uit / "train" / "_annotations.coco.json").write_text(json.dumps(coco, indent=1))
    shutil.copytree(uit / "valid", uit / "test", dirs_exist_ok=True)  # rfdetr wil een test-map; de toetsset is het nooit
    rp = {**rapport([e for e in et if e["doc_id"] in train], [e for e in et if e["doc_id"] in valid]),
          "_overgeslagen_clusters": overgeslagen}
    (uit / "rapport.json").write_text(json.dumps(rp, indent=1))
    achtergronden = [{"pad": pad[e["doc_id"]], "gtin": e["doc_id"].split("-")[1], "meldingen": e["meldingen"]}
                     for e in et if e["doc_id"] in train]  # alleen de trainingskant: validatie blijft buiten de generator
    (uit / "achtergronden.json").write_text(json.dumps(achtergronden, indent=1))
    (uit / "validatie-waarheid.json").write_text(json.dumps({d: waarheid[d] for d in sorted(valid)}, indent=1))
    (uit / "validatie-lijst.json").write_text(json.dumps([e for e in lijst if e["doc_id"] in valid], indent=1))
    print(json.dumps(rp, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
