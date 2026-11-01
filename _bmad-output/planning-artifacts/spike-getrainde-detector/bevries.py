"""Bevriezing en eenmalige toetsrun (CAP-11; meetregels §6). Alleen standaardbibliotheek.

Vóór de eerste toetsrun staan de sha256's van alle onderdelen uit meetregels §6 in `bevroren.json`; een toetsrun met een
gewijzigd onderdeel wordt geweigerd. De eerste toetsrun per route telt: een volgende mag alleen met `herhaling` en een
vastgelegde technische reden, en de eerste uitslag blijft staan.

  python bevries.py bevries --uit <PM>/bevroren.json --onderdeel scheiding=<pad> --onderdeel uitslag=<pad> ...
  python bevries.py controleer --bevroren <PM>/bevroren.json --onderdeel scheiding=<pad> ...
  python bevries.py run --map <PM>/uitvoer --route da [--herhaling --reden "<technische reden>"]
  python bevries.py laatste --map <PM>/uitvoer --route da     (pad van de laatste run met status "voltooid")
  python bevries.py hash --pad <PM>/scheiding.json --uit <PM>/scheiding-bevroren.json   (één onderdeel vastleggen)

Onderdeel `referentieplaatjes` = het indexbestand {code: png}; de hash gaat over de inhoud van elk genoemd beeld.
Onderdeel `instellingen` = JSON met INSTELLINGEN (maat, tegel, overlap, drempel, beoordelaarmodel, K4-aa-budget).
Onderdeel `code` vult `bevries` zelf: één hash over de code die beslist en telt (CODE).
Een run-bestand is {"route", "run", "status": "gestart"|"voltooid"|"afgebroken", "reden"?, "etiketten": {...}}.
"""
import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import beelden

VERPLICHT = ("scheiding", "uitslag", "model", "drempels", "beoordelaar", "k4aa", "telcode", "gewichten",
             "referentieplaatjes", "instellingen", "code")
HIER = Path(__file__).resolve().parent
CODE = (*(HIER / n for n in ("herken.py", "beoordelaar.py", "openrouter.py", "uitslag.py", "tel_proef.py", "k4aa_lokaal.py")),
        HIER.parent / "spike-architectuurkeuze-logoherkenning" / "fase-b" / "tel.py")
INSTELLINGEN = ("maat", "tegel", "overlap", "drempel", "beoordelaar_model", "k4aa_budget")


class Gewijzigd(Exception):
    """Een bevroren onderdeel wijkt af van zijn sha256."""


class AlGedraaid(Exception):
    """De eerste toetsrun van deze route bestaat al; herhalen alleen met herhaling + technische reden."""


def _sha(pad):
    pad = Path(pad)
    if pad.is_dir():  # map: sha256 over (relatief pad, sha256) van elk bestand, gesorteerd
        regels = [f"{p.relative_to(pad).as_posix()} {_sha(p)}" for p in sorted(pad.rglob("*")) if p.is_file()]
        return hashlib.sha256("\n".join(regels).encode()).hexdigest()
    return hashlib.sha256(pad.read_bytes()).hexdigest()


def _sha_lijst(paren):
    return hashlib.sha256("\n".join(f"{naam} {_sha(p)}" for naam, p in paren).encode()).hexdigest()


def _sha_onderdeel(naam, pad):
    """sha256 van een onderdeel; `code` en `referentieplaatjes` over de inhoud van de bestanden, niet over een index."""
    if naam == "code":
        return _sha_lijst((p.relative_to(HIER.parent).as_posix(), p) for p in CODE)
    if naam == "referentieplaatjes":
        index = json.loads(Path(pad).read_text())
        if not isinstance(index, dict) or not index:
            raise ValueError("referentieplaatjes: verwacht een index {code: png}")
        return _sha_lijst((code, Path(png)) for code, png in sorted(index.items()))
    if naam == "instellingen":
        ontbreekt = sorted(set(INSTELLINGEN) - set(json.loads(Path(pad).read_text())))
        if ontbreekt:
            raise ValueError(f"instellingen: ontbreekt {ontbreekt}")
    return _sha(pad)


def _nu():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def bevries(onderdelen, uit):
    onderdelen = {"code": HIER, **onderdelen}
    ontbreekt = sorted(set(VERPLICHT) - set(onderdelen))
    if ontbreekt:
        raise ValueError(f"verplichte onderdelen ontbreken: {ontbreekt}")
    uit = beelden.veilig_doel(uit)
    data = {"onderdelen": {n: {"pad": str(p), "sha256": _sha_onderdeel(n, p)} for n, p in sorted(onderdelen.items())}}
    if uit.exists():
        oud = json.loads(uit.read_text())
        if {n: v["sha256"] for n, v in oud["onderdelen"].items()} != {n: v["sha256"] for n, v in data["onderdelen"].items()}:
            raise Gewijzigd(f"{uit} bestaat al met andere hashes; bevroren onderdelen wijzigen niet meer")
        return oud
    data["tijd"] = _nu()
    uit.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n")
    return data


def controleer(bevroren, onderdelen):
    for naam, v in json.loads(Path(bevroren).read_text())["onderdelen"].items():
        pad = Path(onderdelen.get(naam, v["pad"]))
        try:
            gelijk = pad.exists() and _sha_onderdeel(naam, pad) == v["sha256"]
        except (OSError, ValueError):  # een genoemd bestand ontbreekt of de index is kapot
            gelijk = False
        if not gelijk:
            raise Gewijzigd(f"bevroren onderdeel {naam} is gewijzigd of ontbreekt")


def bevroren_instellingen(bevroren):
    """Controleert de bevriezing en geeft (instellingen, onderdelen) uit bevroren.json; gooit Gewijzigd."""
    controleer(bevroren, {})
    onderdelen = json.loads(Path(bevroren).read_text())["onderdelen"]
    return json.loads(Path(onderdelen["instellingen"]["pad"]).read_text()), onderdelen


def lees_run(pad):
    """Run-bestand; een vers geregistreerde (of nog niet bestaande) run heeft status "gestart" en nog geen etiketten."""
    pad = Path(pad)
    data = json.loads(pad.read_text()) if pad.exists() else {"status": "gestart"}
    data.setdefault("status", "gestart")
    data.setdefault("etiketten", {})
    return data


def schrijf_run(pad, data):
    """Atomisch: een onderbreking laat altijd een leesbaar run-bestand achter."""
    pad = beelden.veilig_doel(pad)
    tmp = pad.with_name(pad.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=1, sort_keys=True, ensure_ascii=False))
    os.replace(tmp, pad)


def laatste(map_, route):
    """Pad van de laatste run van `route` met status "voltooid" (volgorde uit runs.jsonl), of None."""
    runs = Path(map_) / "runs.jsonl"
    regels = [json.loads(r) for r in runs.read_text(encoding="utf-8").splitlines() if r.strip()] if runs.exists() else []
    for r in reversed([r for r in regels if r["route"] == route]):
        pad = Path(map_) / f"{route}-run{r['run']}.json"
        if pad.exists() and lees_run(pad)["status"] == "voltooid":
            return pad
    return None


def registreer_run(map_, route, herhaling=False, reden=None):
    """Pad voor de volgende toetsrun van `route` (eerste: `<route>-run1.json`); legt start en reden vast in runs.jsonl."""
    map_ = beelden.veilig_doel(map_)
    n = 1
    while (map_ / f"{route}-run{n}.json").exists():
        n += 1
    if n > 1 and not (herhaling and reden):
        raise AlGedraaid(f"{route}: de eerste toetsrun telt; herhalen alleen met --herhaling en een technische reden")
    pad = map_ / f"{route}-run{n}.json"
    with open(pad, "x") as f:  # een gestarte run telt, ook als hij halverwege stopt
        json.dump({"route": route, "run": n, "status": "gestart", "gestart": _nu()}, f)
    with open(map_ / "runs.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps({"route": route, "run": n, "tijd": _nu(), "herhaling": herhaling, "reden": reden},
                           ensure_ascii=False) + "\n")
    return pad


def _paren(lijst):
    return {n: Path(p) for n, p in (x.split("=", 1) for x in lijst or [])}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="stap", required=True)
    b = sub.add_parser("bevries")
    b.add_argument("--uit", required=True, type=Path)
    b.add_argument("--onderdeel", action="append", required=True)
    c = sub.add_parser("controleer")
    c.add_argument("--bevroren", required=True, type=Path)
    c.add_argument("--onderdeel", action="append")
    r = sub.add_parser("run")
    r.add_argument("--map", required=True, type=Path)
    r.add_argument("--route", required=True)
    r.add_argument("--herhaling", action="store_true")
    r.add_argument("--reden")
    la = sub.add_parser("laatste")
    la.add_argument("--map", required=True, type=Path)
    la.add_argument("--route", required=True)
    h = sub.add_parser("hash")
    h.add_argument("--pad", required=True, type=Path)
    h.add_argument("--uit", required=True, type=Path)
    a = ap.parse_args(argv)
    try:
        if a.stap == "hash":
            uit = beelden.veilig_doel(a.uit)
            if uit.exists():
                raise Gewijzigd(f"{uit} bestaat al")
            uit.write_text(json.dumps({"pad": str(a.pad), "sha256": _sha(a.pad), "tijd": _nu()}, indent=1) + "\n")
            print(uit.read_text())
            return 0
        if a.stap == "laatste":
            pad = laatste(a.map, a.route)
            if pad is None:
                raise ValueError(f"{a.route}: geen voltooide run in {a.map}")
            print(pad)
            return 0
        if a.stap == "bevries":
            print(json.dumps(bevries(_paren(a.onderdeel), a.uit), indent=1))
        elif a.stap == "controleer":
            controleer(a.bevroren, _paren(a.onderdeel))
            print("ongewijzigd")
        else:
            print(registreer_run(a.map, a.route, a.herhaling, a.reden))
    except (Gewijzigd, AlGedraaid, ValueError) as e:
        print(f"geweigerd: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
