"""Bouwt de beoordelingspagina als artefact (CAP-19, toetsset.md §6a).

Leest de ITEMS uit de huidige artefactbron (de regel `const ITEMS = …;`) en het glutenvrij-oordeel per etiket uit de
voorinvulling van ronde 10, zet dat oordeel in `voorinvulling.keurmerken`, en schrijft het sjabloon met die ITEMS
buiten elke git-werkboom: de repository is publiek, de ITEMS bevatten etiketcodes en beeldadressen.

    uv run python invul/artefact/bouw.py --bron <artefactbron.html> \
        --voorinvulling ~/logo-meetset-20261018/proef-detector/toets/voorinvulling-r10-claude-haiku-5-5.json \
        --uit <pagina.html buiten de repository> --alleen-ai-glutenvrij --verwacht 35

Sinds ronde 11b (besluit Friso 12-11-2026) publiceert de hoofdsessie mét `--alleen-ai-glutenvrij`: alleen de etiketten
waarop de AI glutenvrij zag. `--verwacht N` weigert als er niet precies N etiketten getoond worden.

Ronde 12 (toetsset §6a): alleen de nieuwe etiketten, met beelden als asset-url (de hoofdsessie uploadt ze eerst):

    uv run python invul/artefact/bouw.py --items <toets>/items-r12-claude-haiku-5-5.json --lijst <upload.txt buiten de repo>
    uv run python invul/artefact/bouw.py --items <toets>/items-r12-claude-haiku-5-5.json \
        --assets <koppeltabel.json {bestandsnaam: url}> --uit <pagina.html buiten de repository>
"""
import argparse
import json
import os
import struct
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # ook als los script: uitslag uit de proefmap van de repo
from uitslag import KEURMERKEN_LOS, LETTERS  # noqa: E402

SJABLOON = Path(__file__).with_name("sjabloon.html")
GV = "DIET_FREE_FROM_GLUTEN"
KOP = "const ITEMS = "
LEEG = KOP + "[];\n"


def lees_items(html):
    regels = [r for r in html.split("\n") if r.startswith(KOP)]
    if len(regels) != 1:
        raise ValueError(f"bron: verwacht precies één regel '{KOP}…;', gevonden {len(regels)}")
    tekst = regels[0][len(KOP):].rstrip()
    if not tekst.endswith(";"):
        raise ValueError("bron: de ITEMS-regel eindigt niet op ';'")
    return json.loads(tekst[:-1])


def in_werkboom(pad):
    """Ligt `pad` (mag nog niet bestaan) in een git-werkboom? Kijkt vanaf de dichtstbijzijnde bestaande map.
    Alleen "not a git repository" telt als buiten; elke andere git-fout (of een pad in `.git`) telt als binnen."""
    p = Path(pad).absolute()
    if ".git" in p.parts:
        return True
    while not p.exists():
        p = p.parent
    p = p.resolve()
    if ".git" in p.parts:
        return True
    if not p.is_dir():
        p = p.parent
    r = subprocess.run(["git", "-C", str(p), "rev-parse", "--is-inside-work-tree"], capture_output=True, text=True,
                       env={**os.environ, "LC_ALL": "C"})  # Engelse foutmelding, ook bij een vertaalde git
    return not (r.returncode != 0 and "not a git repository" in r.stderr)


def bouw(bron, voorinvulling, uit, alleen_ai_glutenvrij=False, verwacht=None):
    """Schrijft de pagina naar `uit`; geeft de telling terug. Elke weigering is een ValueError en schrijft niets.
    `alleen_ai_glutenvrij` (ronde 11b, besluit Friso 12-11-2026): na de controles over de hele bron alleen de
    etiketten met AI-glutenvrij true houden, in bronvolgorde."""
    uit = Path(uit)
    if in_werkboom(uit):
        raise ValueError(f"uitvoer {uit} ligt in een git-werkboom; de pagina bevat etiketcodes")
    items = lees_items(Path(bron).read_text(encoding="utf-8"))
    oordelen = json.loads(Path(voorinvulling).read_text(encoding="utf-8"))
    ids = [it["id"] for it in items]
    if len(set(ids)) != len(ids):
        raise ValueError("bron: dubbele etiket-id's in ITEMS")
    onbekend = sorted(set(oordelen) - set(ids))
    if onbekend:
        raise ValueError(f"voorinvulling: {len(onbekend)} oordeel/oordelen voor een etiket dat niet in de bron staat")
    for it in items:
        k = (it.get("voorinvulling") or {}).get("keurmerken")
        if not k:  # anders verdwijnt de melding 'voorinvulling ontbreekt' en geldt Nutri-Score als gekozen
            raise ValueError(f"{it['id']}: geen bestaande voorinvulling")
        v = ((oordelen.get(it["id"]) or {}).get("keurmerken") or {}).get(GV)
        if not isinstance(v, bool):
            raise ValueError(f"{it['id']}: geen booleaans glutenvrij-oordeel")
        if GV in k and k[GV] is not v:
            raise ValueError(f"{it['id']}: bron heeft al een ander glutenvrij-oordeel")
        k[GV] = v
    totaal = len(items)
    if alleen_ai_glutenvrij:
        items = [it for it in items if it["voorinvulling"]["keurmerken"][GV]]
        if not items:
            raise ValueError("geen enkel etiket met AI-glutenvrij; een lege pagina wordt niet gebouwd")
    if verwacht is not None and len(items) != verwacht:
        raise ValueError(f"getoond {len(items)} van {totaal}, verwacht {verwacht}")
    _schrijf(items, uit)
    aanwezig = sum(it["voorinvulling"]["keurmerken"][GV] for it in items)
    return {"etiketten": len(items), "aanwezig": aanwezig, "afwezig": len(items) - aanwezig, "totaal": totaal}


def _schrijf(items, uit):
    """Sjabloon met deze ITEMS atomisch naar `uit` (nooit '</script>' in het scriptblok)."""
    sjabloon = SJABLOON.read_text(encoding="utf-8")
    if sjabloon.count(LEEG) != 1:
        raise ValueError("sjabloon: verwacht precies één lege ITEMS-regel")
    data = json.dumps(items, ensure_ascii=False).replace("</", "<\\/")  # nooit '</script>' in het scriptblok
    html = sjabloon.replace(LEEG, KOP + data + ";\n")
    uit.parent.mkdir(parents=True, exist_ok=True)
    tijdelijk = uit.with_name(uit.name + ".tmp")
    tijdelijk.write_text(html, encoding="utf-8")
    os.replace(tijdelijk, uit)


def png_maat(pad):
    """(breedte, hoogte) uit de PNG-kop (IHDR); geen PNG of geen bestand → ValueError."""
    try:
        with open(pad, "rb") as f:
            kop = f.read(24)
    except OSError as e:
        raise ValueError(f"beeld {Path(pad).name} niet te lezen: {e}") from None
    if len(kop) < 24 or kop[:8] != b"\x89PNG\r\n\x1a\n" or kop[12:16] != b"IHDR":
        raise ValueError(f"beeld {Path(pad).name} is geen PNG")
    return struct.unpack(">II", kop[16:24])


def lees_nieuw(items):
    """Itemlijst van `toets.py voorinvulling --met-glutenvrij`; geeft (lijst, map waartegen de paden relatief zijn)."""
    items = Path(items)
    lijst = json.loads(items.read_text(encoding="utf-8"))
    if not isinstance(lijst, list) or not all(isinstance(it, dict) and isinstance(it.get("id"), str)
                                              and isinstance(it.get("beeld"), str)
                                              and isinstance(it.get("hint", []), list) and all(isinstance(h, str) for h in it.get("hint", []))
                                              for it in lijst):
        raise ValueError("items: verwacht een lijst etiketten met 'id', 'beeld' en een lijst 'hint'-paden")
    ids = [it["id"] for it in lijst]
    if len(set(ids)) != len(ids):
        raise ValueError("items: dubbele etiket-id's")
    return lijst, items.parent


def bouw_nieuw(items, assets, uit):
    """Ronde 12 (toetsset §6a): de pagina met alleen de nieuwe etiketten. `beeld` en uitsneden als asset-url uit de
    koppeltabel {bestandsnaam: url}, `ww`/`wh` = maat van het lokale beeld, voorinvulling = 12 losse + glutenvrij +
    Nutri-Score, of leeg bij een mislukte voorinvulling. Elke weigering is een ValueError en schrijft niets."""
    uit = Path(uit)
    if in_werkboom(uit):
        raise ValueError(f"uitvoer {uit} ligt in een git-werkboom; de pagina bevat etiketcodes")
    lijst, basis = lees_nieuw(items)
    koppel = json.loads(Path(assets).read_text(encoding="utf-8"))
    if not isinstance(koppel, dict):
        raise ValueError("koppeltabel: verwacht een object {bestandsnaam: url}")
    codes = set(KEURMERKEN_LOS) | {GV}

    def url(pad):
        naam = Path(pad).name
        if not isinstance(koppel.get(naam), str) or not koppel[naam]:
            raise ValueError(f"koppeltabel: geen url voor {naam}")
        return koppel[naam]

    uit_items, leeg = [], 0
    for it in lijst:
        v = it.get("voorinvulling") or {}
        k = v.get("keurmerken") or {}
        if v.get("fout") or not k:
            voor, leeg = {"keurmerken": {}, "nutriscore": []}, leeg + 1
        elif set(k) != codes or not all(isinstance(x, bool) for x in k.values()):
            raise ValueError(f"{it['id']}: gedeeltelijke voorinvulling (verwacht de 12 losse en glutenvrij)")
        else:
            ns = v.get("nutriscore") or []
            if not isinstance(ns, list) or set(ns) - set(LETTERS):
                raise ValueError(f"{it['id']}: Nutri-Score is geen lijst letters A–E")
            voor = {"keurmerken": {c: k[c] for c in (*KEURMERKEN_LOS, GV)}, "nutriscore": list(ns)}
        ww, wh = png_maat(basis / it["beeld"])
        uit_items.append({"id": it["id"], "beeld": url(it["beeld"]),
                          "hint": [{"u": url(h), "n": Path(h).name} for h in it.get("hint", [])],
                          "voorinvulling": voor, "ww": ww, "wh": wh})
    _schrijf(uit_items, uit)
    return {"etiketten": len(uit_items), "zonder_voorinvulling": leeg}


def schrijf_lijst(items, doel):
    """Absolute paden van beeld en uitsneden (uniek, één per regel) naar `doel` buiten elke git-werkboom."""
    doel = Path(doel)
    if in_werkboom(doel):
        raise ValueError(f"lijst {doel} ligt in een git-werkboom; de paden bevatten etiketcodes")
    lijst, basis = lees_nieuw(items)
    paden = list(dict.fromkeys(str((basis / p).resolve()) for it in lijst for p in [it["beeld"], *it.get("hint", [])]))
    doel.parent.mkdir(parents=True, exist_ok=True)
    doel.write_text("".join(f"{p}\n" for p in paden), encoding="utf-8")
    return len(paden)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--bron", type=Path)
    p.add_argument("--voorinvulling", type=Path)
    p.add_argument("--uit", type=Path)
    p.add_argument("--items", type=Path, help="ronde 12: itemlijst van de nieuwe etiketten (items-r12-<model>.json)")
    p.add_argument("--assets", type=Path, help="ronde 12: koppeltabel {bestandsnaam: asset-url}, met --items en --uit")
    p.add_argument("--lijst", type=Path, help="ronde 12: schrijf de te uploaden beeldpaden hierheen, zonder te bouwen")
    p.add_argument("--alleen-ai-glutenvrij", action="store_true",
                   help="alleen de etiketten waarop de AI glutenvrij zag (ronde 11b, besluit Friso 12-11-2026)")
    p.add_argument("--verwacht", type=int, help="weiger als er niet precies zoveel etiketten getoond worden")
    a = p.parse_args(argv)
    if a.items:
        if a.bron or a.voorinvulling or a.alleen_ai_glutenvrij or a.verwacht is not None:
            p.error("--items gaat niet samen met --bron, --voorinvulling, --alleen-ai-glutenvrij of --verwacht")
        if bool(a.lijst) == bool(a.assets or a.uit) or (not a.lijst and not (a.assets and a.uit)):
            p.error("--items vraagt óf --lijst, óf --assets met --uit")
        try:
            if a.lijst:
                n = schrijf_lijst(a.items.expanduser(), a.lijst.expanduser())
                print(f"{n} beelden te uploaden; geschreven: {a.lijst}")
                return 0
            t = bouw_nieuw(a.items.expanduser(), a.assets.expanduser(), a.uit.expanduser())
        except ValueError as e:
            print(f"geweigerd: {e}", file=sys.stderr)
            return 1
        print(f"{t['etiketten']} nieuwe etiketten; zonder voorinvulling {t['zonder_voorinvulling']}; geschreven: {a.uit}")
        return 0
    if a.assets or a.lijst:
        p.error("--assets en --lijst horen bij --items")
    if not (a.bron and a.voorinvulling and a.uit):
        p.error("--bron, --voorinvulling en --uit zijn verplicht zonder --items")
    try:
        t = bouw(a.bron.expanduser(), a.voorinvulling.expanduser(), a.uit.expanduser(), a.alleen_ai_glutenvrij, a.verwacht)
    except ValueError as e:
        print(f"geweigerd: {e}", file=sys.stderr)
        return 1
    if a.alleen_ai_glutenvrij:
        print(f"getoond {t['etiketten']} van {t['totaal']} etiketten (alleen AI-glutenvrij); geschreven: {a.uit}")
        return 0
    print(f"{t['etiketten']} etiketten; glutenvrij aanwezig {t['aanwezig']}, afwezig {t['afwezig']}; geschreven: {a.uit}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
