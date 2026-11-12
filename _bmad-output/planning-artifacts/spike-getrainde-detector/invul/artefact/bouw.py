"""Bouwt de beoordelingspagina als artefact (CAP-19, toetsset.md §6a).

Leest de ITEMS uit de huidige artefactbron (de regel `const ITEMS = …;`) en het glutenvrij-oordeel per etiket uit de
voorinvulling van ronde 10, zet dat oordeel in `voorinvulling.keurmerken`, en schrijft het sjabloon met die ITEMS
buiten elke git-werkboom: de repository is publiek, de ITEMS bevatten etiketcodes en beeldadressen.

    uv run python invul/artefact/bouw.py --bron <artefactbron.html> \
        --voorinvulling ~/logo-meetset-20261018/proef-detector/toets/voorinvulling-r10-claude-haiku-5-5.json \
        --uit <pagina.html buiten de repository> --alleen-ai-glutenvrij --verwacht 35

Sinds ronde 11b (besluit Friso 12-11-2026) publiceert de hoofdsessie mét `--alleen-ai-glutenvrij`: alleen de etiketten
waarop de AI glutenvrij zag. `--verwacht N` weigert als er niet precies N etiketten getoond worden.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

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
    sjabloon = SJABLOON.read_text(encoding="utf-8")
    if sjabloon.count(LEEG) != 1:
        raise ValueError("sjabloon: verwacht precies één lege ITEMS-regel")
    data = json.dumps(items, ensure_ascii=False).replace("</", "<\\/")  # nooit '</script>' in het scriptblok
    html = sjabloon.replace(LEEG, KOP + data + ";\n")
    uit.parent.mkdir(parents=True, exist_ok=True)
    tijdelijk = uit.with_name(uit.name + ".tmp")
    tijdelijk.write_text(html, encoding="utf-8")
    os.replace(tijdelijk, uit)
    aanwezig = sum(it["voorinvulling"]["keurmerken"][GV] for it in items)
    return {"etiketten": len(items), "aanwezig": aanwezig, "afwezig": len(items) - aanwezig, "totaal": totaal}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--bron", required=True, type=Path)
    p.add_argument("--voorinvulling", required=True, type=Path)
    p.add_argument("--uit", required=True, type=Path)
    p.add_argument("--alleen-ai-glutenvrij", action="store_true",
                   help="alleen de etiketten waarop de AI glutenvrij zag (ronde 11b, besluit Friso 12-11-2026)")
    p.add_argument("--verwacht", type=int, help="weiger als er niet precies zoveel etiketten getoond worden")
    a = p.parse_args(argv)
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
