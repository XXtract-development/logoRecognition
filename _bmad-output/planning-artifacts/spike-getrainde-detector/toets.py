"""Toetskandidaten en AI-voorinvulling (CAP-2; toetsset §4-§5, meetregels §2). Stdlib + Pillow.

Kandidaten komen alleen van toetsleveranciers, zonder GTIN's uit referenties/training_data en zonder fase-B-docs (die
filtering doet `main kandidaten` vóór `kandidaten`). De voorinvulling gebruikt een ander model dan K4-aa, via de
gedeelde zdr-client.

  python toets.py kandidaten --proef-map <PM> [--max-per 40] [--kant train]   (weigert als de lijst al bestaat)
  python toets.py kandidaten --proef-map <PM> --bestaand <kandidaten.json> [--bestaand <eerdere aanvulling.json> ...]
                  [--alleen CODE ...] [--alle CODE ...] [--max-per 40] [--naam <lijst>] [--print-laag-eerst]
                  (aanvulling: alleen nieuwe GTIN's, eigen lijst <toets>/<naam>.json die nooit overschreven wordt;
                   stdout: JSON met per keurmerk "toegevoegd" en "over")
  python toets.py ontdubbel --proef-map <PM> --manifest <gecombineerd/manifest.json> [--kandidaten <kandidaten-aanvulling.json>]
                  (ontdubbelt ook tegen een bestaande toets-docs.json en voegt de nieuwe docs daaraan toe)
  python toets.py voorinvulling --proef-map <PM> --manifest <gecombineerd/manifest.json> --zdr-logo <png>
                  [--grens <dollar> --besluit "<verwijzing>"]   (standaard de grens $65, besluit Friso 01-11-2026)
  python toets.py rapport --proef-map <PM>
  python toets.py lijst --proef-map <PM> --manifest <gecombineerd/manifest.json>   (bevestigde toetsetiketten voor de runs)
"""
import argparse
import collections
import copy
import hashlib
import io
import itertools
import json
import math
import shutil
import sys
import time
from pathlib import Path

import beelden
import openrouter
import scheiding
import uitslag

LOS = uitslag.KEURMERKEN_LOS  # de 8 losse keurmerken (V-label inbegrepen, besluit Friso 01-11-2026)
NS = tuple(f"NUTRISCORE_{x}" for x in uitslag.LETTERS)  # A–E
V, VV = "EUROPEAN_V_LABEL_VEGAN", "EUROPEAN_V_LABEL_VEGETARIAN"
CODES = LOS + ("NUTRISCORE",)  # sleutels per keurmerk (rapport, melding)
AANVUL_CODES = CODES + NS  # --alleen/--alle: ook één Nutri-Score-letter (toetsset §4)
POOL = "pool-met-converted-laag-20261008.txt"  # docs met print-laag, in <PM>/invoer/
GELIJKEND = {  # meetregels §2 (codes; "nationale bio-logo's" en "andere gekleurde schalen" hebben geen code)
    "EU_ORGANIC_FARMING": ("AGRICULTURE_BIOLOGIQUE", "BDIH_LOGO"),
    "GREEN_DOT": ("RECYCLABLE_GENERAL_CLAIM", "TRIMAN", "SEPARATE_COLLECTION", "SOCIETY_PLASTICS_INDUSTRY", "RETURNABLE_CAN_NL"),
    "RECYCLABLE_GENERAL_CLAIM": ("GREEN_DOT", "TRIMAN", "SEPARATE_COLLECTION", "SOCIETY_PLASTICS_INDUSTRY", "RETURNABLE_CAN_NL"),
    "NUTRISCORE": (),  # D en E zijn sinds ronde 5 eigen letters
    "PREGNANCY_WARNING": ("MINIMUM_DRINKING_AGE_18_WARNING", "DO_NOT_DRINK_AND_DRIVE_WARNING"),
    "MARINE_STEWARDSHIP_COUNCIL_LABEL": ("AQUACULTURE_STEWARDSHIP_COUNCIL",),
    "WEIDEMELK": ("BETER_LEVEN_1_STER", "BETER_LEVEN_2_STER"),
    "VEGAN_SOCIETY_VEGAN_LOGO": ("VEGAN",),  # het V-label is sinds ronde 5 een eigen keurmerk
    V: ("VEGAN",),
}
GELIJKEND_CODES = sorted({c for v in GELIJKEND.values() for c in v} - set(LOS) - set(NS))
OMSCHRIJVING = {
    "EU_ORGANIC_FARMING": "EU organic logo: a leaf outline made of white stars on a green rectangle",
    "GREEN_DOT": "Der Grüne Punkt / Green Dot: a circle with two interlocking arrows",
    "RECYCLABLE_GENERAL_CLAIM": "generic recycling symbol: three chasing arrows forming a triangle (Möbius loop)",
    "PREGNANCY_WARNING": "pictogram of a pregnant woman drinking, crossed out (alcohol warning)",
    "MARINE_STEWARDSHIP_COUNCIL_LABEL": "MSC blue fish label: a fish shaped like a tick mark, 'certified sustainable seafood MSC'",
    "WEIDEMELK": "Dutch 'Weidemelk' meadow-milk logo",
    "VEGAN_SOCIETY_VEGAN_LOGO": "The Vegan Society trademark: a sunflower with the word 'Vegan'",
    V: "European V-Label: a stylised V with a leaf, with the word 'vegan' or 'vegetarian' under it (both count as this "
       "mark)",
}
SCHEMA_VOORINVULLING = {
    "type": "object",
    "properties": {
        "keurmerken": {"type": "array", "items": {
            "type": "object",
            "properties": {"code": {"type": "string", "enum": list(LOS)}, "aanwezig": {"type": "boolean"},
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


def kandidaten(rijen_toets, gelijkend, max_per=40, max_gelijkend=10, seed="20261031", bestaand=(), maxima=None,
               voorkeur=None):
    """Aanvulling (toetsset §4): `bestaand` = GTIN's die al kandidaat zijn (nooit gekozen, tellen voor geen maximum);
    `maxima` = {code of "NUTRISCORE": aantal of None (alles)}, ontbrekende sleutel = max_per; `voorkeur` = paren
    (gln, gtin) die per keurmerk eerst komen, daarna de rest, elk deel in de vaste volgorde."""
    gekozen, uit, maxima = set(bestaand), [], maxima or {}

    def volgorde(per):
        if not voorkeur:
            return _om_de_beurt(per, seed)
        deel = lambda wel: {g: {t for t in v if ((g, t) in voorkeur) == wel} for g, v in per.items()}  # noqa: E731
        return itertools.chain(_om_de_beurt(deel(True), seed), _om_de_beurt(deel(False), seed))

    def neem(bronnen, maximum, reden):
        n, maximum = 0, math.inf if maximum is None else maximum
        iters = [(rd, volgorde(per)) for rd, per in bronnen]
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

    for code in LOS[:3]:
        neem([(code, rijen_toets.get(code, {}))], maxima.get(code, max_per), code)
    neem([(c, rijen_toets.get(c, {})) for c in NS], maxima.get("NUTRISCORE", max_per), "NUTRISCORE")
    for code in LOS[3:]:
        neem([(code, rijen_toets.get(code, {}))], maxima.get(code, max_per), code)
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


RONDE = 5  # voorinvullingen met dit kenmerk vroegen het V-label zelf; zonder kenmerk: van vóór ronde 5 (toetsset §5)
MAX_TEGELS = 16  # per aanroep, naast het hele etiket (grens van de aanbieder op beelden per verzoek)
GRENS_VOORINVULLING = 65.0  # dollar, hard (besluit Friso 01-11-2026 ±14:05; randvoorwaarden §3)
PER_AANROEP = 0.06  # verwachte kosten per aanroep (heel etiket + hoogstens 16 tegels; randvoorwaarden §3)


def voorinvulling(client, beeld, tegels):
    """Heel etiket, dan per aanroep de tegels die `openrouter.delen` toelaat (hoogstens MAX_TEGELS en MAX_BEELD_BYTES,
    overzicht meegeteld); de uitkomsten worden samengevoegd (aanwezig = in een van de aanroepen, hinttegels op
    etiketindex). Alleen codes die het model teruggaf staan in `keurmerken`; een ontbrekende code blijft zonder
    voorinvulling. Mislukt (EtiketFout, ook `te_groot` zonder aanroep, of een onleesbaar antwoord) → lege velden met
    `fout`; RunStop gaat door. Elke uitkomst draagt `ronde` (sinds ronde 5 vraagt de voorinvulling het V-label zelf)."""
    leeg = {"keurmerken": {}, "nutriscore": [], "hinttegels": {}, "gelijkend": [], "model": client.model, "kosten": 0.0,
            "tijd": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "ronde": RONDE}
    keurmerken, letters, hint, gelijkend, prijs, ruw = {}, set(), {}, set(), 0.0, []
    try:
        for r in openrouter.delen([len(t) for t in tegels], vast=len(beeld), max_aantal=MAX_TEGELS):
            deel = tegels[r.start:r.stop]
            a, p = client.vraag(PROMPT, [beeld, *deel], SCHEMA_VOORINVULLING, verwacht=PER_AANROEP)
            prijs += p
            ruw.append(a)
            for k in a["keurmerken"]:
                if k["code"] not in LOS:
                    continue
                keurmerken[k["code"]] = keurmerken.get(k["code"], False) or bool(k["aanwezig"])
                if k["aanwezig"]:
                    hint.setdefault(k["code"], set()).update(r.start + i for i in k["tegels"] if 0 <= i < len(deel))
            letters |= {x for x in a["nutriscore"] if x in ("A", "B", "C", "D", "E")}
            gelijkend |= set(a["gelijkend"])
    except openrouter.EtiketFout as e:
        return {**leeg, "kosten": prijs, "fout": e.klasse}
    except (TypeError, AttributeError, KeyError, ValueError):  # antwoord niet in de verwachte vorm
        return {**leeg, "kosten": prijs, "fout": "antwoord_ongeldig"}
    return {**leeg, "keurmerken": keurmerken, "nutriscore": sorted(letters),
            "hinttegels": {c: sorted(s) for c, s in hint.items() if s}, "gelijkend": sorted(gelijkend), "kosten": prijs,
            "ruw": ruw[0] if len(ruw) == 1 else ruw}


def met_v_label(v):
    """Kopie van één voorinvulling met een V-label-oordeel (toetsset §5): alleen bij een geslaagde voorinvulling van
    vóór ronde 5 (geen `ronde`, geen `fout`, niet-lege `keurmerken`) zonder V-label-oordeel geldt V-label vegan of
    vegetarisch in `gelijkend` als aanwezig, anders afwezig. Al het andere blijft ongewijzigd (een nieuwe voorinvulling
    zonder V-label-oordeel laat het V-label zonder keuze). Geen aanroep, geen kosten."""
    uit = copy.deepcopy(v)
    k = uit.get("keurmerken")
    if "fout" not in uit and "ronde" not in uit and isinstance(k, dict) and k and V not in k:
        k[V] = bool({V, VV} & set(uit.get("gelijkend", [])))
    return uit


def rapport(voorinvullingen):
    """Per keurmerk (9) het aantal etiketten waarop het volgens de voorinvulling waarschijnlijk staat; Nutri-Score als
    groep (minstens één letter A–E), V-label via `met_v_label`."""
    r = dict.fromkeys(CODES, 0)
    for v in map(met_v_label, voorinvullingen.values()):
        for c in LOS:
            r[c] += bool(v.get("keurmerken", {}).get(c))
        r["NUTRISCORE"] += bool(set(v.get("nutriscore", [])) & set(uitslag.LETTERS))
    return r


def letters(voorinvullingen):
    """Per Nutri-Score-letter het aantal etiketten waarop de voorinvulling hem zag (informatief; het besluit valt op de
    groep)."""
    return {x: sum(x in v.get("nutriscore", []) for v in voorinvullingen.values()) for x in uitslag.LETTERS}


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


def jpeg(im):
    """Overzicht en tegels voor de aanbieder: JPEG kwaliteit 90 (randvoorwaarden §5); hinttegels en paginabeelden blijven PNG."""
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def aanroepen(pad):
    """Verwacht aantal aanroepen voor één etiket (startcontrole, §3): 1 per 16 tegels, minstens 1; maat uit het bestand."""
    import herken
    from PIL import Image

    with Image.open(pad) as im:
        return max(1, math.ceil(len(herken.tegels(*im.size)) / MAX_TEGELS))


def grens_uit(ap, a, standaard):
    """(grens, besluit of None). Een andere grens dan de standaard alleen als eindig bedrag ≥ 0 met een niet-lege
    besluitverwijzing (randvoorwaarden §3), anders stopt de opdrachtregel vóór elke aanroep."""
    if a.grens is None:
        return standaard, None
    if not (a.besluit or "").strip():
        ap.error("--grens vraagt een niet-leeg --besluit \"<verwijzing naar het besluit van Friso>\"; niets gestart")
    if not math.isfinite(a.grens) or a.grens < 0:
        ap.error("--grens moet een eindig bedrag van 0 of meer zijn; niets gestart")
    return a.grens, a.besluit.strip()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="stap", required=True)
    k = sub.add_parser("kandidaten")
    k.add_argument("--proef-map", required=True, type=Path)
    k.add_argument("--max-per", type=int, default=40)
    k.add_argument("--alleen", action="append", choices=AANVUL_CODES, metavar="CODE",
                   help="aanvullen: hoogstens --max-per nieuwe voor dit keurmerk (code, NUTRISCORE of één letter "
                        "NUTRISCORE_A..E; herhaalbaar)")
    k.add_argument("--alle", action="append", choices=AANVUL_CODES, metavar="CODE",
                   help="aanvullen: alles wat voor dit keurmerk overblijft, ook boven 40 (herhaalbaar)")
    k.add_argument("--bestaand", action="append", type=Path,
                   help="aanvullen: eerdere kandidatenlijst (herhaalbaar); alleen nieuwe GTIN's komen erbij")
    k.add_argument("--naam", help="naam van de lijst (standaard kandidaten-aanvulling bij --bestaand, anders kandidaten); "
                                  "een aanvulling overschrijft nooit een bestaande lijst")
    k.add_argument("--print-laag-eerst", action="store_true",
                   help="per keurmerk eerst de GTIN's met print-laag (invoer/" + POOL + "), dan de rest")
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
    v.add_argument("--zdr-logo", type=Path, required=True, help="niet-klantbeeld (officieel logo) voor de zdr-proef")
    v.add_argument("--docs", type=Path, help="json-lijst doc_id's (uitvoer van ontdubbel); standaard alle in het manifest")
    v.add_argument("--grens", type=float, help=f"andere uitgavengrens dan ${GRENS_VOORINVULLING:.0f}; alleen met --besluit")
    v.add_argument("--besluit", help="verwijzing naar het besluit van Friso over --grens")
    r = sub.add_parser("rapport")
    r.add_argument("--proef-map", required=True, type=Path)
    a = ap.parse_args(argv)
    if a.stap == "kandidaten":
        if (a.alleen or a.alle) and not a.bestaand:
            ap.error("--alleen/--alle vraagt --bestaand (anders zou kandidaten.json overschreven worden)")
        if a.bestaand and not (a.alleen or a.alle):
            ap.error("een aanvulling (--bestaand) vraagt --alleen of --alle (geen gelijkende kandidaten, toetsset §4)")
        if set(a.alleen or []) & set(a.alle or []):
            ap.error("dezelfde code bij --alleen en --alle: kies één van de twee")
        if all(any(c == "NUTRISCORE" or c in NS for c in x or []) for x in (a.alleen, a.alle)):
            ap.error("Nutri-Score (groep of letter) bij --alleen en --alle samen: de groep heeft één maximum")
        if a.naam is not None and (Path(a.naam).name != a.naam or a.naam in ("", ".", "..")):
            ap.error("--naam is een bestandsnaam zonder map (geen /, . of ..)")
    if a.stap == "voorinvulling":
        grens, besluit = grens_uit(ap, a, GRENS_VOORINVULLING)
    toets_map = beelden.veilig_doel(a.proef_map / "toets")
    toets_map.mkdir(parents=True, exist_ok=True)

    if a.stap == "kandidaten":
        rijen_toets, gelijkend = _toets_rijen(a.proef_map, a.kant)
        if a.kant == "train":
            gelijkend, toets_map = {}, beelden.veilig_doel(a.proef_map / "train")
            toets_map.mkdir(parents=True, exist_ok=True)
        doel = toets_map / f"{a.naam or ('kandidaten-aanvulling' if a.bestaand else 'kandidaten')}.json"
        paren = doel.with_name(f"{doel.stem}-paren.tsv")
        if doel.exists() or paren.exists():  # nooit overschrijven, ook kandidaten.json van 31-10 niet (toetsset §4)
            raise SystemExit(f"{doel} of {paren.name} bestaat al: niets overschreven; kies een andere --naam")
        rij_codes = lambda c: NS if c == "NUTRISCORE" else (c,)  # noqa: E731
        alle = set(a.alle or [])
        keuze = [c for c in AANVUL_CODES if c in alle | set(a.alleen or [])]
        if keuze:  # aanvulling: alleen de gekozen rijen (een letter beperkt de Nutri-Score-groep), geen gelijkende
            houd = {r for c in keuze for r in rij_codes(c)}
            rijen_toets = {r: (v if r in houd else {}) for r, v in rijen_toets.items()}
            gelijkend = {}
        bestaand = {i["gtin"] for p in a.bestaand or [] for i in json.loads(p.read_text())}
        voorkeur = None
        if a.print_laag_eerst:  # één doc_id GLN-GTIN-doelmarkt per regel
            pool = (a.proef_map / "invoer" / POOL).read_text().split()
            voorkeur = {tuple(d.split("-")[:2]) for d in pool if d.count("-") == 2}
        maxima = dict.fromkeys("NUTRISCORE" if c in NS else c for c in alle)  # een letter: maximum van de groep
        lijst = kandidaten(rijen_toets, gelijkend, max_per=a.max_per, bestaand=bestaand, maxima=maxima, voorkeur=voorkeur)
        doel.write_text(json.dumps(lijst, indent=1) + "\n")
        paren.write_text("gln\tgtin\n" + "".join(f"{i['gln']}\t{i['gtin']}\n" for i in lijst))
        nieuw = {i["gtin"] for i in lijst}
        tel = collections.Counter(i["reden"] for i in lijst)
        per_keurmerk = {}
        for c in keuze or CODES:
            alle_gtins = set().union(*(v for r in rij_codes(c) for v in rijen_toets.get(r, {}).values()))
            per_keurmerk[c] = {"toegevoegd": sum(tel[r] for r in rij_codes(c)), "over": len(alle_gtins - bestaand - nieuw)}
        print(json.dumps({"kandidaten": len(lijst), "bestand": str(doel), "per_keurmerk": per_keurmerk}, indent=1))
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
        bewaker = kosten.Bewaker("voorinvulling toets", 42.0, grootboek=a.proef_map / "uitgaven.json", grens=grens)  # raming §3, informatief
        print(f"grens voorinvulling ${grens:.2f}", f"(besluit: {besluit})" if besluit else "(standaard)")
        n = sum(aanroepen(a.manifest.parent / f"{d}.png") for d in docs if d not in klaar)  # open etiketten
        bewaker.controleer_start(n * PER_AANROEP)  # vóór de client en de zdr-proef
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
                klaar[doc] = {**voorinvulling(client, jpeg(overzicht), [jpeg(im.crop(t)) for t in vakken]), "beeldtype": "jpeg"}
                uitvoer.write_text(json.dumps(klaar, indent=1) + "\n")  # na elk etiket: een onderbreking verliest niets
                geweigerd = geweigerd + 1 if klaar[doc].get("fout") == "geweigerd" else 0  # te_groot breekt de reeks
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
            items.append({"id": doc, "beeld": f"beelden/{doc}.png", "hint": hint,
                          "voorinvulling": met_v_label(klaar[doc])})  # voorinvulling.json blijft zoals hij is
        (toets_map / "zdr-proef.json").write_text(json.dumps({**proef, "grens": grens, "besluit": besluit}) + "\n")
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
        vi = json.loads((toets_map / "voorinvulling.json").read_text())
        rp = rapport(vi)
        stop = stoppunt2(rp)  # alleen over de 9; per letter is informatief
        print(json.dumps({"rapport": rp, "nutriscore_per_letter": letters(vi), "stoppunt_2": stop}, indent=1))
        return 2 if stop else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
