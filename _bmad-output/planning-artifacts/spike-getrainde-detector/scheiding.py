"""Scheiding training/toets op leverancier (GLN) en bijna-duplicaatcontrole (CAP-1; toetsset §1-§2).

Regel: kandidaten = per rij de 2 leveranciers met de meeste unieke GTIN's; kies uitputtend de verzameling
trainingsleveranciers waarvoor de oplopend gesorteerde rij `min(toets/2, train)` lexicografisch het grootst is;
gelijkspel: kleinste verzameling, dan laagste gesorteerde rij GLN's. Toets-GTIN's zonder GTIN's uit referenties,
`training_data` en de fase-B-meetset. De extra rijen (ronde 5: Nutri-Score D, E en V-label, vegan of vegetarisch) worden
met de gekozen leveranciers geteld, maar tellen niet mee in de keuze (toetsset §2); ronde 9 voegt er vier aan toe (FSC met
varianten, Triman, kunststofcode, PlanetProof). Alleen standaardbibliotheek + Pillow.

  python scheiding.py invoer --proef-map <PROEF_MAP>              kopieert de invoer eenmalig naar PROEF_MAP/invoer (+ sha256)
  python scheiding.py kies --proef-map <PROEF_MAP>                schrijft PROEF_MAP/scheiding.json
  python scheiding.py kies --proef-map <PROEF_MAP> --reden "<…>"  nieuwe versie (alleen met dezelfde trainingsleveranciers;
                                                                  de vorige blijft als scheiding.<tijdstempel>.json)
  python scheiding.py dhash --toets <map> --train <map> [--valid <map>] --uit <json>
"""
import argparse
import csv
import hashlib
import itertools
import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

from PIL import Image

import beelden
from train import VARIANTEN

RIJEN = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C",
         "PREGNANCY_WARNING", "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO")
RIJEN_EXTRA = ("NUTRISCORE_D", "NUTRISCORE_E", "EUROPEAN_V_LABEL_VEGAN",  # ronde 5: geteld, niet in de keuze
               "FOREST_STEWARDSHIP_COUNCIL_LABEL", "TRIMAN", "SOCIETY_PLASTICS_INDUSTRY", "ON_THE_WAY_TO_PLANETPROOF")  # ronde 9
REDEN_EXTRA = ("ronde 5 (besluit Friso 01-11-2026) en ronde 9 (besluit Friso 02-11-2026): de toetsset is op de 5 "
               "trainingsleveranciers van 31-10 gebouwd en voorgevuld en wordt niet opnieuw gebouwd; de keuze gebruikt "
               "alleen de 10 oorspronkelijke rijen, de extra rijen worden met de gekozen leveranciers geteld (toetsset §2)")
REGEL = ("leverancier (GLN) aan precies één kant; kandidaten = per rij de 2 leveranciers met de meeste unieke GTIN's; "
         "uitputtend de verzameling met lexicografisch grootste oplopende rij min(toets/2, train); gelijkspel: kleinste "
         "verzameling, dan laagste gesorteerde GLN-rij; toets zonder GTIN's uit referenties, training_data en fase-B-meetset")
INVOER = {  # naam in PROEF_MAP/invoer: pad relatief aan (hoofdrepo | meetmap)
    "declaraties-prod-basiseenheden-20261008.tsv": ("repo", "_bmad-output/planning-artifacts/eindtest-logo-pijplijn/declaraties-prod-basiseenheden-20261008.tsv"),
    "pool-met-converted-laag-20261008.txt": ("repo", "_bmad-output/planning-artifacts/eindtest-logo-pijplijn/pool-met-converted-laag-20261008.txt"),
    "basiseenheden-met-media-20261008.tsv": ("repo", "_bmad-output/planning-artifacts/eindtest-logo-pijplijn/basiseenheden-met-media-20261008.tsv"),
    "alcohol-kandidaten.tsv": ("meet", "alcohol-kandidaten.tsv"),
    "voorlopige-selectie.json": ("meet", "ontwikkelmeting-20261028/voorlopige-selectie.json"),
    "momentopname/actieve-refs.json": ("meet", "ontwikkelmeting-20261028/fase-b/momentopname/actieve-refs.json"),
    "momentopname/training-data-actief.tsv": ("meet", "ontwikkelmeting-20261028/fase-b/momentopname/training-data-actief.tsv"),
}


def hoofdrepo():
    """De hoofdmap van de repository (bij een git-worktree: de map van de gedeelde .git), zonder git aan te roepen."""
    for map_ in Path(__file__).resolve().parents:
        git = map_ / ".git"
        if git.is_dir():
            return map_
        if git.is_file():  # worktree: "gitdir: <hoofdrepo>/.git/worktrees/<naam>"
            return Path(git.read_text().split("gitdir:", 1)[1].strip()).parents[2]
    raise FileNotFoundError("geen git-map gevonden")


def lees_declaraties(pad):
    """[(doc_id, gln, gtin, frozenset(codes))]; codes = t3777 ∪ dieet ∪ NUTRISCORE_<letter>."""
    uit = []
    with open(pad, encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            doc = (r.get("doc_id") or "").strip()
            delen = doc.split("-")
            if doc.startswith("#") or len(delen) != 3:
                continue
            codes = {c for veld in ("t3777", "dieet") for c in (r.get(veld) or "").split(";") if c}
            codes |= {f"NUTRISCORE_{x}" for x in (r.get("nutriscore") or "").split(";") if x in ("A", "B", "C", "D", "E")}
            uit.append((doc, delen[0], delen[1], frozenset(codes)))
    return uit


def lees_alcohol(pad):
    """[(gln, gtin)] uit de alcoholkandidaten (GLN, GTIN, brick, omschrijving)."""
    with open(pad, encoding="utf-8") as f:
        return [(r[0], r[1]) for r in csv.reader(f, delimiter="\t") if len(r) >= 2 and r[0] and not r[0].startswith("#")]


def gtins_uit_paden(regels):
    """GTIN's (14 cijfers tussen twee schuine strepen) uit referentiepaden en training_data-regels."""
    return {g for r in regels for g in re.findall(r"(?<=/)(\d{14})(?=/)", r)}


def bouw_rijen(declaraties, alcohol):
    """{rij: {gln: set(gtin)}} over RIJEN + RIJEN_EXTRA; zwangerschap = alcoholproducten (er is geen GS1-declaratie
    voor); een variant (vegetarisch V-label) telt in de rij van zijn klasse."""
    rijen = {r: {} for r in RIJEN + RIJEN_EXTRA}
    for _, gln, gtin, codes in declaraties:
        for rij in {VARIANTEN.get(c, c) for c in codes} & set(rijen):
            rijen[rij].setdefault(gln, set()).add(gtin)
    for gln, gtin in alcohol:
        rijen["PREGNANCY_WARNING"].setdefault(gln, set()).add(gtin)
    return rijen


def kies(rijen, uitgesloten):
    """Keuze op RIJEN alleen; per_rij telt ook RIJEN_EXTRA met de gekozen leveranciers (`buiten_keuze`)."""
    extra = {r: {g: set(v) for g, v in rijen.get(r, {}).items() if v} for r in RIJEN_EXTRA}
    rijen = {r: {g: set(v) for g, v in rijen.get(r, {}).items() if v} for r in RIJEN}
    alle = set().union(*(v for per in rijen.values() for v in per.values()))
    n_uit = len(alle & set(uitgesloten))
    if not n_uit:
        raise ValueError("nul uitgesloten GTIN's: referenties, training_data of fase-B-meetset ontbreken in de invoer")
    kandidaten = sorted({g for per in rijen.values() for g in sorted(per, key=lambda g: (-len(per[g]), g))[:2]})
    # per rij: bitmaskers per leverancier (alle GTIN's voor train, niet-uitgesloten voor toets)
    maskers = []
    for rij in RIJEN:
        per = rijen[rij]
        index = {t: i for i, t in enumerate(sorted(set().union(*per.values())))}
        m = {g: (sum(1 << index[t] for t in v), sum(1 << index[t] for t in v - set(uitgesloten))) for g, v in per.items()}
        vast = 0
        for g, (_, toets) in m.items():
            if g not in kandidaten:
                vast |= toets
        maskers.append(([(i, *m[g]) for i, g in enumerate(kandidaten) if g in m], vast))

    def rij_score(keuze):
        scores = []
        for per, vast in maskers:
            train, toets = 0, vast
            for i, mt, mo in per:
                if keuze >> i & 1:
                    train |= mt
                else:
                    toets |= mo
            scores.append(min(toets.bit_count() / 2, train.bit_count()))
        return sorted(scores)

    beste = None
    for grootte in range(len(kandidaten) + 1):  # kleinste verzameling eerst, combinaties in GLN-volgorde
        for combi in itertools.combinations(range(len(kandidaten)), grootte):
            s = rij_score(sum(1 << i for i in combi))
            if beste is None or s > beste[0]:
                beste = (s, combi)
    trainers = [kandidaten[i] for i in beste[1]]
    per_rij = {}
    for rij, per in {**rijen, **extra}.items():
        train = set().union(*(per[g] for g in trainers if g in per))
        toets = set().union(*(per[g] - set(uitgesloten) for g in per if g not in trainers))
        per_rij[rij] = {"train": len(train), "toets": len(toets),
                        "train_glns": sum(g in per for g in trainers),
                        "toets_glns": sum(1 for g in per if g not in trainers and per[g] - set(uitgesloten))}
        if rij in extra:
            per_rij[rij]["buiten_keuze"] = True
    return {"trainingsleveranciers": trainers, "kandidaten": kandidaten, "per_rij": per_rij, "score": beste[0],
            "uitgesloten_gtins": n_uit}


def dhash(beeld):
    """64-bit verschilhash van het hele beeld (grijs, 9×8)."""
    px = beeld.convert("L").resize((9, 8), Image.LANCZOS).tobytes()
    h = 0
    for y in range(8):
        for x in range(8):
            h = h << 1 | (px[y * 9 + x + 1] > px[y * 9 + x])
    return h


def hamming(a, b):
    return (a ^ b).bit_count()


def bijna_gelijk(train, toets, max_afstand=6):
    """Trainings-id's met een toetsbeeld op dHash-afstand ≤ max_afstand (die gaan uit de training)."""
    return {i for i, h in train.items() if any(hamming(h, t) <= max_afstand for t in toets.values())}


def schrijf(uitkomst, pad, invoerhashes, versie_reden=None):
    pad = beelden.veilig_doel(pad)
    data = {"regel": REGEL, **{k: uitkomst[k] for k in ("trainingsleveranciers", "per_rij", "score", "uitgesloten_gtins")},
            "kandidaten": uitkomst.get("kandidaten", []), "invoer": dict(invoerhashes),
            "rijen_buiten_keuze": {"rijen": list(RIJEN_EXTRA), "reden": REDEN_EXTRA}}
    if versie_reden:
        data["versie_reden"] = versie_reden
    pad.write_text(json.dumps(data, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    return pad


def _sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def _hashes(map_):
    return {p.relative_to(map_).as_posix(): dhash(Image.open(p)) for p in sorted(Path(map_).rglob("*"))
            if p.suffix.lower() in (".png", ".jpg", ".jpeg")}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="stap", required=True)
    for naam in ("invoer", "kies"):
        s = sub.add_parser(naam)
        s.add_argument("--proef-map", required=True, type=Path)
        if naam == "kies":
            s.add_argument("--reden", help="nieuwe versie van een bestaande scheiding.json (toetsset §7); alleen met "
                                           "dezelfde trainingsleveranciers")
    d = sub.add_parser("dhash")
    d.add_argument("--toets", required=True, type=Path)
    d.add_argument("--train", required=True, type=Path)
    d.add_argument("--valid", type=Path)
    d.add_argument("--uit", required=True, type=Path)
    a = ap.parse_args(argv)

    if a.stap == "invoer":
        doel = beelden.veilig_doel(a.proef_map / "invoer")
        basis = {"repo": hoofdrepo(), "meet": Path.home() / "logo-meetset-20261018"}
        hashes = {}
        for naam, (waar, rel) in INVOER.items():
            (doel / naam).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(basis[waar] / rel, doel / naam)
            hashes[naam] = _sha(doel / naam)
        (doel / "sha256.json").write_text(json.dumps(hashes, indent=1, sort_keys=True) + "\n")
        print(json.dumps(hashes, indent=1))
    elif a.stap == "kies":
        inv = a.proef_map / "invoer"
        rijen = bouw_rijen(lees_declaraties(inv / "declaraties-prod-basiseenheden-20261008.tsv"),
                           lees_alcohol(inv / "alcohol-kandidaten.tsv"))
        refs = json.loads((inv / "momentopname/actieve-refs.json").read_text())
        regels = [r.get("path") or "" for r in refs] + (inv / "momentopname/training-data-actief.tsv").read_text().splitlines()
        fase_b = json.loads((inv / "voorlopige-selectie.json").read_text())["etiketten"]
        k = kies(rijen, gtins_uit_paden(regels) | {e["doc_id"].split("-")[1] for e in fase_b})
        namen = ("declaraties-prod-basiseenheden-20261008.tsv", "alcohol-kandidaten.tsv", "voorlopige-selectie.json",
                 "momentopname/actieve-refs.json", "momentopname/training-data-actief.tsv")
        doel = beelden.veilig_doel(a.proef_map / "scheiding.json")
        reden = (a.reden or "").strip() or None
        if doel.exists():  # nieuwe versie: alleen met reden en dezelfde leveranciers (toetsset §2 en §7)
            oud = json.loads(doel.read_text(encoding="utf-8"))
            if reden is None:
                print(f"{doel} bestaat al: een nieuwe versie vraagt --reden; niets geschreven", file=sys.stderr)
                return 2
            if sorted(oud["trainingsleveranciers"]) != sorted(k["trainingsleveranciers"]):
                print("de nieuwe versie zou andere trainingsleveranciers kiezen; niets geschreven (besluit van Friso nodig)",
                      file=sys.stderr)
                return 2
            archief = doel.with_name(f"scheiding.{datetime.now().strftime('%Y%m%dT%H%M%S%f')}.json")
            if archief.exists():  # nooit een bestaand archief overschrijven
                print(f"{archief} bestaat al; niets geschreven", file=sys.stderr)
                return 2
            shutil.copy2(doel, archief)
        pad = schrijf(k, doel, {n: _sha(inv / n) for n in namen}, versie_reden=reden if doel.exists() else None)
        print(pad, "trainingsleveranciers:", len(k["trainingsleveranciers"]), "zwakste:", k["score"][0])
    else:
        toets, train = _hashes(a.toets), _hashes(a.train)
        uit = {"uit_training": sorted(bijna_gelijk(train, toets))}
        if a.valid:
            valid = _hashes(a.valid)
            uit["uit_validatie_vs_toets"] = sorted(bijna_gelijk(valid, toets))
            uit["uit_training_vs_validatie"] = sorted(bijna_gelijk(train, valid))
        uit["aantallen"] = {k: len(v) for k, v in uit.items()} | {"toets": len(toets), "train": len(train)}
        pad = beelden.veilig_doel(a.uit)
        pad.write_text(json.dumps(uit, indent=1) + "\n")
        print(json.dumps(uit["aantallen"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
