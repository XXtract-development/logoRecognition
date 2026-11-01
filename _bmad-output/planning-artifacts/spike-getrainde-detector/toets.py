"""Toetskandidaten en AI-voorinvulling (CAP-2; toetsset §4-§5, meetregels §2). Stdlib + Pillow.

Kandidaten komen alleen van toetsleveranciers, zonder GTIN's uit referenties/training_data en zonder fase-B-docs (die
filtering doet `main kandidaten` vóór `kandidaten`). De voorinvulling gebruikt een ander model dan K4-aa, via de
gedeelde zdr-client.

  python toets.py kandidaten --proef-map <PM> [--max-per 40] [--alleen CODE --bestaand <kandidaten.json>] [--kant train]
  python toets.py ontdubbel --proef-map <PM> --manifest <gecombineerd/manifest.json> [--kandidaten <kandidaten-aanvulling.json>]
                  (ontdubbelt ook tegen een bestaande toets-docs.json en voegt de nieuwe docs daaraan toe)
  python toets.py voorinvulling --proef-map <PM> --manifest <gecombineerd/manifest.json> --zdr-logo <png>
  python toets.py rapport --proef-map <PM>
  python toets.py lijst --proef-map <PM> --manifest <gecombineerd/manifest.json>   (bevestigde toetsetiketten voor de runs)
"""
import argparse
import hashlib
import io
import json
import shutil
import sys
import time
from pathlib import Path

import beelden
import openrouter
import scheiding

K7 = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "PREGNANCY_WARNING",
      "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO")
NS = ("NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C")
GELIJKEND = {  # meetregels §2 (codes; "nationale bio-logo's" en "andere gekleurde schalen" hebben geen code)
    "EU_ORGANIC_FARMING": ("AGRICULTURE_BIOLOGIQUE", "BDIH_LOGO"),
    "GREEN_DOT": ("RECYCLABLE_GENERAL_CLAIM", "TRIMAN", "SEPARATE_COLLECTION", "SOCIETY_PLASTICS_INDUSTRY", "RETURNABLE_CAN_NL"),
    "RECYCLABLE_GENERAL_CLAIM": ("GREEN_DOT", "TRIMAN", "SEPARATE_COLLECTION", "SOCIETY_PLASTICS_INDUSTRY", "RETURNABLE_CAN_NL"),
    "NUTRISCORE": ("NUTRISCORE_D", "NUTRISCORE_E"),
    "PREGNANCY_WARNING": ("MINIMUM_DRINKING_AGE_18_WARNING", "DO_NOT_DRINK_AND_DRIVE_WARNING"),
    "MARINE_STEWARDSHIP_COUNCIL_LABEL": ("AQUACULTURE_STEWARDSHIP_COUNCIL",),
    "WEIDEMELK": ("BETER_LEVEN_1_STER", "BETER_LEVEN_2_STER"),
    "VEGAN_SOCIETY_VEGAN_LOGO": ("EUROPEAN_V_LABEL_VEGAN", "EUROPEAN_V_LABEL_VEGETARIAN", "VEGAN"),
}
GELIJKEND_CODES = sorted({c for v in GELIJKEND.values() for c in v} - set(K7) - set(NS))
OMSCHRIJVING = {
    "EU_ORGANIC_FARMING": "EU organic logo: a leaf outline made of white stars on a green rectangle",
    "GREEN_DOT": "Der Grüne Punkt / Green Dot: a circle with two interlocking arrows",
    "RECYCLABLE_GENERAL_CLAIM": "generic recycling symbol: three chasing arrows forming a triangle (Möbius loop)",
    "PREGNANCY_WARNING": "pictogram of a pregnant woman drinking, crossed out (alcohol warning)",
    "MARINE_STEWARDSHIP_COUNCIL_LABEL": "MSC blue fish label: a fish shaped like a tick mark, 'certified sustainable seafood MSC'",
    "WEIDEMELK": "Dutch 'Weidemelk' meadow-milk logo",
    "VEGAN_SOCIETY_VEGAN_LOGO": "The Vegan Society trademark: a sunflower with the word 'Vegan'",
}
SCHEMA_VOORINVULLING = {
    "type": "object",
    "properties": {
        "keurmerken": {"type": "array", "items": {
            "type": "object",
            "properties": {"code": {"type": "string", "enum": list(K7)}, "aanwezig": {"type": "boolean"},
                           "tegels": {"type": "array", "items": {"type": "integer"}}},
            "required": ["code", "aanwezig", "tegels"], "additionalProperties": False}},
        "nutriscore": {"type": "array", "items": {"type": "string", "enum": ["A", "B", "C", "D", "E"]}},
        "gelijkend": {"type": "array", "items": {"type": "string", "enum": GELIJKEND_CODES}},
    },
    "required": ["keurmerken", "nutriscore", "gelijkend"],
    "additionalProperties": False,
}
PROMPT = (
    "You check a product label for printed marks. Image 1 is the whole label; the next images are tiles of the same "
    "label at full resolution, numbered 0, 1, 2, ... in the order given. For each of these marks say whether it is "
    "printed on the label as a logo or pictogram (text alone does not count) and list the tile numbers where you see it:\n"
    + "\n".join(f"- {c}: {o}" for c, o in OMSCHRIJVING.items())
    + "\nNutri-Score: list every letter (A-E) that is highlighted on a printed Nutri-Score scale; empty if there is none."
    "\nAlso list look-alike marks you see from: " + ", ".join(GELIJKEND_CODES) + "."
)


def _sha(seed, gtin):
    return hashlib.sha256((seed + gtin).encode()).hexdigest()


def _om_de_beurt(per_gln, seed):
    """GTIN's om de beurt per leverancier (GLN gesorteerd), binnen een leverancier op sha256(seed + GTIN)."""
    rijen = [sorted(per_gln[g], key=lambda t: _sha(seed, t)) for g in sorted(per_gln)]
    glns = sorted(per_gln)
    for i in range(max((len(r) for r in rijen), default=0)):
        for g, r in zip(glns, rijen):
            if i < len(r):
                yield g, r[i]


def kandidaten(rijen_toets, gelijkend, max_per=40, max_gelijkend=10, seed="20261031"):
    gekozen, uit = set(), []

    def neem(bronnen, maximum, reden):
        n = 0
        iters = [(rd, _om_de_beurt(per, seed)) for rd, per in bronnen]
        while n < maximum and iters:  # bij Nutri-Score om de beurt per letter
            for item in list(iters):
                rd, it = item
                volgende = next(((g, t) for g, t in it if t not in gekozen), None)
                if volgende is None:
                    iters.remove(item)
                    continue
                gekozen.add(volgende[1])
                uit.append({"gtin": volgende[1], "gln": volgende[0], "reden": rd})
                n += 1
                if n >= maximum:
                    break

    for code in K7[:3]:
        neem([(code, rijen_toets.get(code, {}))], max_per, code)
    neem([(c, rijen_toets.get(c, {})) for c in NS], max_per, "NUTRISCORE")
    for code in K7[3:]:
        neem([(code, rijen_toets.get(code, {}))], max_per, code)
    for keurmerk in sorted(gelijkend):
        neem([(f"gelijkend:{keurmerk}", gelijkend[keurmerk])], max_gelijkend, f"gelijkend:{keurmerk}")
    return uit


def ontdubbel(items):
    """GTIN's die blijven: eerste van elk GTIN, elke sha256 en elke dHash-groep (afstand ≤ 6)."""
    blijft, gtins, shas, hashes = [], set(), set(), []
    for i in items:
        if i["gtin"] in gtins or i["sha256"] in shas or any(scheiding.hamming(i["dhash"], h) <= 6 for h in hashes):
            continue
        blijft.append(i["gtin"])
        gtins.add(i["gtin"])
        shas.add(i["sha256"])
        hashes.append(i["dhash"])
    return blijft


MAX_TEGELS = 16  # per aanroep, naast het hele etiket (grens van de aanbieder op beelden per verzoek)


def voorinvulling(client, beeld_png, tegels):
    """Heel etiket, dan hoogstens MAX_TEGELS tegels per aanroep; meer tegels gaan in extra aanroepen waarvan de uitkomst
    wordt samengevoegd (aanwezig = in een van de aanroepen, hinttegels met de juiste tegelindex). Alleen codes die het
    model teruggaf staan in `keurmerken`; een ontbrekende code blijft zonder voorinvulling. Mislukt (EtiketFout of een
    onleesbaar antwoord) → lege velden met `fout`; RunStop gaat door."""
    leeg = {"keurmerken": {}, "nutriscore": [], "hinttegels": {}, "gelijkend": [], "model": client.model, "kosten": 0.0,
            "tijd": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    keurmerken, letters, hint, gelijkend, prijs, ruw = {}, set(), {}, set(), 0.0, []
    try:
        for start in range(0, max(1, len(tegels)), MAX_TEGELS):
            deel = tegels[start:start + MAX_TEGELS]
            a, p = client.vraag(PROMPT, [beeld_png, *deel], SCHEMA_VOORINVULLING, verwacht=0.06)
            prijs += p
            ruw.append(a)
            for k in a["keurmerken"]:
                if k["code"] not in K7:
                    continue
                keurmerken[k["code"]] = keurmerken.get(k["code"], False) or bool(k["aanwezig"])
                if k["aanwezig"]:
                    hint.setdefault(k["code"], set()).update(start + i for i in k["tegels"] if 0 <= i < len(deel))
            letters |= {x for x in a["nutriscore"] if x in ("A", "B", "C", "D", "E")}
            gelijkend |= set(a["gelijkend"])
    except openrouter.EtiketFout as e:
        return {**leeg, "kosten": prijs, "fout": e.klasse}
    except (TypeError, AttributeError, KeyError, ValueError):  # antwoord niet in de verwachte vorm
        return {**leeg, "kosten": prijs, "fout": "antwoord_ongeldig"}
    return {**leeg, "keurmerken": keurmerken, "nutriscore": sorted(letters),
            "hinttegels": {c: sorted(s) for c, s in hint.items() if s}, "gelijkend": sorted(gelijkend), "kosten": prijs,
            "ruw": ruw[0] if len(ruw) == 1 else ruw}


def rapport(voorinvullingen):
    """Per keurmerk (8) het aantal etiketten waarop het volgens de voorinvulling waarschijnlijk staat."""
    r = {c: 0 for c in K7}
    r["NUTRISCORE"] = 0
    for v in voorinvullingen.values():
        for c in K7:
            r[c] += bool(v.get("keurmerken", {}).get(c))
        r["NUTRISCORE"] += bool(set(v.get("nutriscore", [])) & {"A", "B", "C"})
    return r


def stoppunt2(rapport, minimum=16):
    return [k for k, n in rapport.items() if n < minimum]


# --- opdrachtregel (lijm; de functies hierboven zijn getest) ----------------------------------------------------

def _toets_rijen(pm, kant="toets"):
    """Rijen en gelijkende keurmerken aan de toetskant zonder uitgesloten GTIN's (zelfde invoer als de scheiding);
    met kant="train" de rijen van de trainingsleveranciers (bron van de echte trainingsvoorbeelden, trainingsset §4)."""
    inv = pm / "invoer"
    sch = json.loads((pm / "scheiding.json").read_text())
    train = set(sch["trainingsleveranciers"])
    decl = scheiding.lees_declaraties(inv / "declaraties-prod-basiseenheden-20261008.tsv")
    rijen = scheiding.bouw_rijen(decl, scheiding.lees_alcohol(inv / "alcohol-kandidaten.tsv"))
    refs = json.loads((inv / "momentopname/actieve-refs.json").read_text())
    regels = [r.get("path") or "" for r in refs] + (inv / "momentopname/training-data-actief.tsv").read_text().splitlines()
    fase_b = json.loads((inv / "voorlopige-selectie.json").read_text())["etiketten"]
    uit = scheiding.gtins_uit_paden(regels) | {e["doc_id"].split("-")[1] for e in fase_b}

    def toets(per):
        if kant == "train":
            return {g: set(v) for g, v in per.items() if g in train}
        return {g: v - uit for g, v in per.items() if g not in train and v - uit}

    rijen_toets = {r: toets(per) for r, per in rijen.items()}
    gelijkend = {}
    for keurmerk, codes in GELIJKEND.items():
        per = {}
        for _, gln, gtin, c in decl:
            if c & set(codes):
                per.setdefault(gln, set()).add(gtin)
        gelijkend[keurmerk] = toets(per)
    return rijen_toets, gelijkend


def _png(im):
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="stap", required=True)
    k = sub.add_parser("kandidaten")
    k.add_argument("--proef-map", required=True, type=Path)
    k.add_argument("--max-per", type=int, default=40)
    k.add_argument("--alleen", help="aanvullen: alleen dit keurmerk (code of NUTRISCORE)")
    k.add_argument("--bestaand", type=Path, help="aanvullen: eerdere kandidatenlijst; alleen nieuwe GTIN's komen erbij")
    k.add_argument("--kant", choices=("toets", "train"), default="toets")
    o = sub.add_parser("ontdubbel")
    o.add_argument("--proef-map", required=True, type=Path)
    o.add_argument("--manifest", required=True, type=Path)
    o.add_argument("--kandidaten", type=Path, help="kandidatenlijst (standaard <PM>/toets/kandidaten.json)")
    li = sub.add_parser("lijst")
    li.add_argument("--proef-map", required=True, type=Path)
    li.add_argument("--manifest", required=True, type=Path)
    v = sub.add_parser("voorinvulling")
    v.add_argument("--proef-map", required=True, type=Path)
    v.add_argument("--manifest", required=True, type=Path, help="manifest.json van beelden.py bouwen (doc_id → sha256, …)")
    v.add_argument("--model", default="anthropic/claude-sonnet-5.5")
    v.add_argument("--raming", type=float, default=21.0)
    v.add_argument("--zdr-logo", type=Path, required=True, help="niet-klantbeeld (officieel logo) voor de zdr-proef")
    v.add_argument("--docs", type=Path, help="json-lijst doc_id's (uitvoer van ontdubbel); standaard alle in het manifest")
    r = sub.add_parser("rapport")
    r.add_argument("--proef-map", required=True, type=Path)
    a = ap.parse_args(argv)
    if a.stap == "kandidaten" and a.alleen and not a.bestaand:
        ap.error("--alleen vraagt --bestaand (anders zou kandidaten.json overschreven worden)")
    toets_map = beelden.veilig_doel(a.proef_map / "toets")
    toets_map.mkdir(parents=True, exist_ok=True)

    if a.stap == "kandidaten":
        rijen_toets, gelijkend = _toets_rijen(a.proef_map, a.kant)
        if a.kant == "train":
            gelijkend, toets_map = {}, beelden.veilig_doel(a.proef_map / "train")
            toets_map.mkdir(parents=True, exist_ok=True)
        if a.alleen:
            houd = NS if a.alleen == "NUTRISCORE" else (a.alleen,)
            rijen_toets = {r: (v if r in houd else {}) for r, v in rijen_toets.items()}
            gelijkend = {}
        lijst = kandidaten(rijen_toets, gelijkend, max_per=a.max_per)
        if a.bestaand:
            oud = {i["gtin"] for i in json.loads(a.bestaand.read_text())}
            lijst = [i for i in lijst if i["gtin"] not in oud]
        naam = "kandidaten-aanvulling" if a.bestaand else "kandidaten"
        (toets_map / f"{naam}.json").write_text(json.dumps(lijst, indent=1) + "\n")
        (toets_map / f"{naam}-paren.tsv").write_text("gln\tgtin\n" + "".join(f"{i['gln']}\t{i['gtin']}\n" for i in lijst))
        print(len(lijst), "kandidaten →", toets_map / f"{naam}.json")
    elif a.stap == "voorinvulling":
        from PIL import Image

        import herken
        import kosten

        manifest = json.loads(a.manifest.read_text())
        docs = sorted(d for d, m in manifest.items() if "sha256" in m)
        if a.docs:
            docs = [d for d in json.loads(a.docs.read_text()) if d in set(docs)]
        uitvoer = toets_map / "voorinvulling.json"
        klaar = json.loads(uitvoer.read_text()) if uitvoer.exists() else {}
        klaar = {d: v for d, v in klaar.items() if "fout" not in v}  # een mislukte voorinvulling wordt opnieuw geprobeerd
        bewaker = kosten.Bewaker("voorinvulling toets", a.raming, grootboek=a.proef_map / "uitgaven.json")
        bewaker.controleer_start(sum(d not in klaar for d in docs) * 0.06)
        client = openrouter.Client(a.model, "voorinvulling", bewaker=bewaker)
        proef = client.zdr_proef(a.zdr_logo.read_bytes())
        (toets_map / "beelden").mkdir(exist_ok=True)
        items, geweigerd = [], 0
        for doc in docs:
            pad = a.manifest.parent / f"{doc}.png"
            im = Image.open(pad).convert("RGB")
            vakken = herken.tegels(*im.size)
            if doc not in klaar:
                overzicht = im.copy()
                overzicht.thumbnail((1500, 1500))
                klaar[doc] = voorinvulling(client, _png(overzicht), [_png(im.crop(t)) for t in vakken])
                uitvoer.write_text(json.dumps(klaar, indent=1) + "\n")  # na elk etiket: een onderbreking verliest niets
                geweigerd = geweigerd + 1 if klaar[doc].get("fout") == "geweigerd" else 0
                if geweigerd >= 5:
                    raise SystemExit("5 etiketten op rij geweigerd door de aanbieder: run gestopt (zie randvoorwaarden §2)")
            hint = []
            for c, idx in sorted(klaar[doc].get("hinttegels", {}).items()):
                for i in idx[:2]:
                    if 0 <= i < len(vakken):
                        h = toets_map / "beelden" / f"{doc}-{c}-{i}.png"
                        if not h.exists():
                            t = im.crop(vakken[i])
                            t.thumbnail((400, 400))
                            t.save(h)
                        hint.append(f"beelden/{h.name}")
            volledig = toets_map / "beelden" / f"{doc}.png"  # de pagina serveert alleen bestanden binnen de toetsmap
            if not volledig.exists():
                shutil.copyfile(pad, volledig)
            items.append({"id": doc, "beeld": f"beelden/{doc}.png", "hint": hint, "voorinvulling": klaar[doc]})
        (toets_map / "zdr-proef.json").write_text(json.dumps(proef) + "\n")
        (toets_map / "items.json").write_text(json.dumps(items, indent=1) + "\n")
        print(len(items), "etiketten, uitgegeven $%.2f" % bewaker.uitgegeven)
    elif a.stap == "ontdubbel":
        from PIL import Image

        manifest = json.loads(a.manifest.read_text())
        per_gtin = {d.split("-")[1]: d for d, m in manifest.items() if "sha256" in m}

        def item(doc):
            with Image.open(a.manifest.parent / f"{doc}.png") as im:
                return {"gtin": doc.split("-")[1], "sha256": manifest[doc]["sha256"], "dhash": scheiding.dhash(im)}

        doel = toets_map / "toets-docs.json"
        bestaand = json.loads(doel.read_text()) if doel.exists() else []  # aanvulling: eerst de docs die er al zijn
        nieuw = [item(per_gtin[i["gtin"]]) for i in json.loads((a.kandidaten or toets_map / "kandidaten.json").read_text())
                 if i["gtin"] in per_gtin and per_gtin[i["gtin"]] not in bestaand]
        blijft = set(ontdubbel([item(d) for d in bestaand] + nieuw))
        docs = bestaand + [per_gtin[x["gtin"]] for x in nieuw if x["gtin"] in blijft]
        doel.write_text(json.dumps(docs, indent=1) + "\n")
        print(len(docs) - len(bestaand), "van", len(nieuw), "nieuwe gebouwde kandidaten blijven na ontdubbelen;", len(docs), "in totaal")
    elif a.stap == "lijst":
        manifest = json.loads(a.manifest.read_text())
        uitslag = json.loads((toets_map / "uitslag.json").read_text(encoding="utf-8"))
        lijst = [{"doc_id": d, "gln": d.split("-")[0], "pad": str(a.manifest.parent / f"{d}.png"), "sha256": manifest[d]["sha256"],
                  "bron": manifest[d].get("bron", "print-laag")}
                 for d, r in sorted(uitslag.items()) if r.get("status") == "bevestigd"]
        (toets_map / "toets-lijst.json").write_text(json.dumps(lijst, indent=1) + "\n")
        print(len(lijst), "bevestigde toetsetiketten →", toets_map / "toets-lijst.json")
    else:
        rp = rapport(json.loads((toets_map / "voorinvulling.json").read_text()))
        stop = stoppunt2(rp)
        print(json.dumps({"rapport": rp, "stoppunt_2": stop}, indent=1))
        return 2 if stop else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
