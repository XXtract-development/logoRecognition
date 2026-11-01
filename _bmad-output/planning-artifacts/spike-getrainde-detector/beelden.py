"""Beelden ophalen en bouwen (CAP-15; toetsset §1 en §3). Alleen standaardbibliotheek + Pillow.

Alleen lezen op productie: de ophaalquery is één SELECT op replica-db, rsync/ssh draaien met `nice -n 19` aan de
serverkant en zonder schrijfopties. Lagen samenvoegen volgt ~/logo-meetset-20261018/bouw.py (overgenomen, niet
geïmporteerd). Elke schrijver in de proef gaat via `veilig_doel`: nooit iets binnen een git-werkboom.

  python beelden.py ophaallijst --paren paren.tsv --uit <map> [--doelmarkt 528]   (ssh replica-db, alleen SELECT)
  python beelden.py ophalen --lijst <map>/ophaal-paden.txt --doel <map>/bron-raw   (rsync vanaf banana, alleen lezen)
  python beelden.py bouwen --ophaallijst <map>/ophaallijst.tsv --bron <map>/bron-raw --uit <map>/gecombineerd
  python beelden.py origineel-paden --paren paren.tsv --uit <map> [--manifest <map>/gecombineerd/manifest.json]
                    (docs zonder gebouwde print-laag: ls in de bekende docmap) [--alleen-pdf: PDF-origineel van elk doc]
  python beelden.py bouwen-origineel --originelen <map>/originelen.tsv --bron <map>/bron-raw --uit <map>/gecombineerd
  python beelden.py pdftekst --originelen <map>/originelen.tsv --bron <map>/bron-raw --uit <map>/certificaten.json
                    (vult een bestaand certificaten.json aan: andere docs blijven, docs uit de lijst krijgen de nieuwe uitkomst)
"""
import argparse
import csv
import hashlib
import io
import json
import math
import os
import re
import shlex
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

from PIL import Image, PngImagePlugin

Image.MAX_IMAGE_PIXELS = None
PngImagePlugin.MAX_TEXT_CHUNK = 1 << 30

MAX_ZIJDE = 4096
MAX_LAAG_BYTES = 20 * 1024 * 1024
MAX_PNG_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 250_000_000
BRON = "banana:/media/Xmedia/"


class BinnenRepo(Exception):
    """Doelpad ligt in een git-werkboom; klantdata hoort daar nooit."""


class TeGroot(Exception):
    """Samengevoegd beeld boven MAX_PIXELS (de pijplijn weigert het ook)."""


def veilig_doel(pad):
    """Geeft `pad` terug als het (of zijn dichtstbijzijnde bestaande ouder) niet in een git-werkboom ligt."""
    pad = Path(pad).expanduser()
    bestaand = pad.absolute()
    while not bestaand.exists():
        bestaand = bestaand.parent
    bestaand = bestaand.resolve()
    for map_ in (bestaand, *bestaand.parents):  # zelfde uitkomst als `git rev-parse --show-toplevel`, zonder git aan te roepen
        if (map_ / ".git").exists() or map_.name == ".git":
            raise BinnenRepo(f"{pad} ligt in git-werkboom {map_}")
    return pad


def _cijfers(waarde, naam):
    if not re.fullmatch(r"\d+", str(waarde)):
        raise ValueError(f"{naam} moet alleen cijfers bevatten")
    return str(waarde)


def ophaalquery(paren, doelmarkt="528"):
    """Eén SELECT, zoals eindtest-logo-pijplijn/ophaal-lijst-maken.py: actieve media, doelmarkt, converted op nas."""
    dm = _cijfers(doelmarkt, "doelmarkt")
    lijst = ",".join(f"('{_cijfers(g, 'gln')}','{_cijfers(t, 'gtin')}')" for g, t in paren)
    if not lijst:
        raise ValueError("geen paren")
    return ("SELECT /*+ MAX_EXECUTION_TIME(30000) */ m.gln,m.gtin,m.id,c.id,c.location "
            "FROM xxtractdbmedia.media m JOIN xxtractdbmedia.converted c ON c.mediaId=m.id "
            f"WHERE m.active='1' AND m.targetMarket='{dm}' AND c.storageType='nas' AND (m.gln,m.gtin) IN ({lijst});")


def ssh_opdracht(args, host="banana"):
    return ["ssh", host, "nice", "-n", "19", *args]


def rsync_opdracht(lijst, doel):
    """rsync --files-from vanaf banana, alleen lezen; `nice -n 19` aan de serverkant."""
    doel = veilig_doel(doel)
    return ["rsync", "-a", f"--files-from={lijst}", "--rsync-path=nice -n 19 rsync", BRON, str(doel)]


def uitvoerder(args):
    """Het enige pad naar externe programma's (pdftoppm, pdftotext, rsync, ssh); bij een fout eerst stderr tonen."""
    r = subprocess.run(list(args), capture_output=True)
    if r.returncode:
        sys.stderr.write(r.stderr.decode(errors="replace"))
        raise subprocess.CalledProcessError(r.returncode, list(args), r.stdout, r.stderr)
    return r.stdout


def naar_rgb(beeld):
    """Alfa plat op wit, CMYK/P/L omgezet naar RGB (voor beelden uit het origineel)."""
    if beeld.mode == "RGB":
        return beeld
    if beeld.mode in ("RGBA", "LA", "PA") or (beeld.mode == "P" and "transparency" in beeld.info):
        beeld = beeld.convert("RGBA")
        bg = Image.new("RGB", beeld.size, "white")
        bg.paste(beeld, mask=beeld.getchannel("A"))
        return bg
    return beeld.convert("RGB")


def _laag(p):
    im = Image.open(p)
    im.seek(0)
    if im.width > MAX_ZIJDE or im.height > MAX_ZIJDE or Path(p).stat().st_size > MAX_LAAG_BYTES:
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.split()[3])
        bg.thumbnail((MAX_ZIJDE, MAX_ZIJDE), Image.LANCZOS)
        buf = io.BytesIO()
        bg.save(buf, "JPEG", quality=85)
        im = Image.open(buf)
    return im.convert("RGB") if im.mode != "RGB" else im


def samenvoegen(paden):
    """Lagen onder elkaar op wit, links uitgelijnd (bouw.py); boven MAX_PIXELS → TeGroot."""
    lagen = [_laag(p) for p in paden]
    if not lagen:
        raise ValueError("geen lagen")
    w, h = max(i.width for i in lagen), sum(i.height for i in lagen)
    if w * h > MAX_PIXELS:
        raise TeGroot(f"{w}x{h} boven {MAX_PIXELS} pixels")
    uit, y = Image.new("RGB", (w, h), "white"), 0
    for i in lagen:
        uit.paste(i, (0, y))
        y += i.height
    return uit


def opslaan(beeld, pad):
    """PNG zoals bouw.py (compress_level 6); boven MAX_PNG_BYTES verkleind met factor √(max/grootte)."""
    pad = veilig_doel(pad)
    beeld.save(pad, "PNG", optimize=False, compress_level=6)
    pct = None
    if pad.stat().st_size > MAX_PNG_BYTES:
        pct = math.sqrt(MAX_PNG_BYTES / pad.stat().st_size) * 100
        beeld = beeld.resize((round(beeld.width * pct / 100), round(beeld.height * pct / 100)), Image.LANCZOS)
        beeld.save(pad, "PNG", compress_level=6)
    data = pad.read_bytes()
    return {"sha256": hashlib.sha256(data).hexdigest(), "w": beeld.width, "h": beeld.height, "bytes": len(data),
            "verkleind_procent": pct}


def render_pdf(pdf, uitvoerder=uitvoerder):
    """PDF-pagina's via pdftoppm op 150 dpi (poppler, los proces), in paginavolgorde."""
    with tempfile.TemporaryDirectory() as tmp:
        voorvoegsel = Path(tmp) / "pagina"
        uitvoerder(["pdftoppm", "-r", "150", "-png", str(pdf), str(voorvoegsel)])
        paden = sorted(Path(tmp).glob("pagina-*.png"), key=lambda p: int(p.stem.rsplit("-", 1)[1]))
        maten = []
        for p in paden:  # maat lezen zonder te decoderen: te groot → weigeren vóór het geheugen vol loopt
            with Image.open(p) as im:
                maten.append(im.size)
        if maten and max(w for w, _ in maten) * sum(h for _, h in maten) > MAX_PIXELS:
            raise TeGroot(f"PDF-pagina's samen boven {MAX_PIXELS} pixels")
        paginas = []
        for p in paden:
            with Image.open(p) as im:
                im.load()
                paginas.append(im.copy())
    return paginas


def pagina_samen(paginas):
    """PDF-pagina's onder elkaar zoals de lagen; elk beeld eerst naar RGB."""
    if not paginas:
        raise TeGroot("geen pagina's")
    lagen = [naar_rgb(p) for p in paginas]
    w, h = max(i.width for i in lagen), sum(i.height for i in lagen)
    if w * h > MAX_PIXELS:
        raise TeGroot(f"{w}x{h} boven {MAX_PIXELS} pixels")
    uit, y = Image.new("RGB", (w, h), "white"), 0
    for i in lagen:
        uit.paste(i, (0, y))
        y += i.height
    return uit


def origineel_beeld(pad):
    """PNG/JPG/TIFF-origineel als RGB-beeld dat los staat van het bestand; boven MAX_PIXELS geweigerd vóór het decoderen."""
    with Image.open(pad) as im:
        im.seek(0)
        if im.width * im.height > MAX_PIXELS:
            raise TeGroot(f"{im.width}x{im.height} boven {MAX_PIXELS} pixels")
        im.load()
        beeld = naar_rgb(im)
        return beeld.copy() if beeld is im else beeld  # `with` sluit `im`; een RGB-origineel is anders onbruikbaar


def main(argv=None, run=uitvoerder):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="stap", required=True)
    a = sub.add_parser("ophaallijst")
    a.add_argument("--paren", required=True, help="tsv met kolommen gln, gtin")
    a.add_argument("--uit", required=True)
    a.add_argument("--doelmarkt", default="528")
    b = sub.add_parser("ophalen")
    b.add_argument("--lijst", required=True)
    b.add_argument("--doel", required=True)
    c = sub.add_parser("bouwen")
    c.add_argument("--ophaallijst", required=True)
    c.add_argument("--bron", required=True)
    c.add_argument("--uit", required=True)
    d = sub.add_parser("origineel-paden")
    d.add_argument("--paren", required=True)
    d.add_argument("--uit", required=True)
    d.add_argument("--doelmarkt", default="528")
    d.add_argument("--manifest", help="manifest.json van `bouwen`: docs met een gebouwde print-laag (sha256) overslaan")
    d.add_argument("--alleen-pdf", action="store_true",
                   help="route A: het PDF-origineel van elk doc, ook met print-laag (→ pdf-originelen.tsv)")
    for naam in ("bouwen-origineel", "pdftekst"):
        e = sub.add_parser(naam)
        e.add_argument("--originelen", required=True)
        e.add_argument("--bron", required=True)
        e.add_argument("--uit", required=True)
    args = ap.parse_args(argv)

    if args.stap == "ophaallijst":
        with open(args.paren) as f:
            paren = [(r["gln"], r["gtin"]) for r in csv.DictReader(f, delimiter="\t")]
        uit = veilig_doel(args.uit)
        sql = ophaalquery(paren, args.doelmarkt)
        # ssh voegt de argumenten samen tot één opdracht voor de shell op replica-db: de query dus gequote meegeven
        out = run(ssh_opdracht(["mysql", "--batch", "--skip-column-names", "-e", shlex.quote(sql)],
                               host="replica-db")).decode()
        uit.mkdir(parents=True, exist_ok=True)
        n = 0
        with open(uit / "ophaallijst.tsv", "w") as f, open(uit / "ophaal-paden.txt", "w") as p:
            f.write("doc_id\tmediaId\tconvId\tlocation\n")
            for regel in out.splitlines():
                gln, gtin, mid, cid, loc = regel.split("\t")
                f.write(f"{gln}-{gtin}-{args.doelmarkt}\t{mid}\t{cid}\t{loc}\n")
                p.write(loc.lstrip("/") + "\n")
                n += 1
        print(n, "lagen voor", len(paren), "producten")
    elif args.stap == "ophalen":
        run(rsync_opdracht(Path(args.lijst), Path(args.doel)))
    elif args.stap == "origineel-paden":
        uit = veilig_doel(args.uit)
        uit.mkdir(parents=True, exist_ok=True)
        with open(args.paren) as f:
            paren = [(r["gln"], r["gtin"]) for r in csv.DictReader(f, delimiter="\t")]
        gebouwd = set()
        if args.manifest and not args.alleen_pdf:  # alleen een gelukte bouw telt; een mislukte krijgt het origineel
            gebouwd = {tuple(d.split("-")[:2]) for d, m in json.loads(Path(args.manifest).read_text()).items() if "sha256" in m}
        voorkeur = (".pdf",) if args.alleen_pdf else (".pdf", ".tif", ".tiff", ".png", ".jpg", ".jpeg")
        gekozen, overgeslagen = [], []
        for gln, gtin in paren:
            doc = f"{gln}-{gtin}-{args.doelmarkt}"
            if (gln, gtin) in gebouwd:
                continue
            map_ = f"/media/Xmedia/{_cijfers(gln, 'gln')}/PACKAGING_ARTWORK/*/{_cijfers(gtin, 'gtin')}/{_cijfers(args.doelmarkt, 'doelmarkt')}/*"
            try:  # alleen de bekende docmap, nooit een volledige find
                regels = run(ssh_opdracht(["ls", "-1d", map_])).decode(errors="replace").splitlines()
            except subprocess.CalledProcessError as e:
                if e.returncode == 255:  # ssh zelf faalt (verbinding): geen "geen origineel", maar stoppen
                    raise
                overgeslagen.append((doc, "docmap leeg of onbereikbaar"))
                continue
            kandidaat = [r for r in regels if Path(r).suffix.lower() in voorkeur and "_converted" not in r and "_thumbnail" not in r]
            if not kandidaat:
                overgeslagen.append((doc, "geen origineel van type " + "/".join(voorkeur)))
                continue
            beste = min(kandidaat, key=lambda r: (voorkeur.index(Path(r).suffix.lower()), r))
            gekozen.append((doc, beste.removeprefix("/media/Xmedia/")))
        naam = "pdf-originelen" if args.alleen_pdf else "originelen"
        (uit / f"{naam}.tsv").write_text("doc_id\tlocation\n" + "".join(f"{d}\t{l}\n" for d, l in gekozen))
        (uit / f"{naam}-paden.txt").write_text("".join(f"{l}\n" for _, l in gekozen))
        (uit / f"{naam}-overgeslagen.tsv").write_text("doc_id\treden\n" + "".join(f"{d}\t{r}\n" for d, r in overgeslagen))
        print(len(gekozen), naam, "voor", len(paren), "producten;", len(overgeslagen), "overgeslagen")
    elif args.stap in ("bouwen-origineel", "pdftekst"):
        uit = veilig_doel(args.uit)
        with open(args.originelen) as f:
            originelen = [(r["doc_id"], Path(args.bron) / r["location"]) for r in csv.DictReader(f, delimiter="\t")]
        if args.stap == "pdftekst":  # route A: alleen PDF-originelen; mislukt pdftotext → null (n.v.t.)
            nieuw = {}
            for doc, pad in originelen:
                if pad.suffix.lower() == ".pdf":
                    try:
                        nieuw[doc] = run(["pdftotext", "-layout", str(pad), "-"]).decode(errors="replace")
                    except (OSError, subprocess.CalledProcessError):
                        nieuw[doc] = None
            tekst = json.loads(uit.read_text()) if uit.exists() else {}  # aanvullen: andere docs blijven (toetsset §3)
            tmp = uit.with_suffix(".tmp")  # atomisch: een onderbreking laat eerdere rondes heel (zoals kosten.Bewaker.boek)
            tmp.write_text(json.dumps({**tekst, **nieuw}, ensure_ascii=False))
            os.replace(tmp, uit)
            print(sum(v is not None for v in nieuw.values()), "PDF-teksten van", len(nieuw), "→", len({**tekst, **nieuw}),
                  "docs in", uit)
            return 0
        uit.mkdir(parents=True, exist_ok=True)
        mp = uit / "manifest.json"
        manifest = json.loads(mp.read_text()) if mp.exists() else {}
        for doc, pad in originelen:
            try:
                beeld = pagina_samen(render_pdf(pad, run)) if pad.suffix.lower() == ".pdf" else origineel_beeld(pad)
                manifest[doc] = {**opslaan(beeld, uit / f"{doc}.png"), "bron": "origineel"}
            except (OSError, TeGroot, subprocess.CalledProcessError) as e:
                manifest[doc] = {"fout": type(e).__name__, "bron": "origineel"}
        mp.write_text(json.dumps(manifest, indent=1, sort_keys=True))
        print(sum("sha256" in m for m in manifest.values()), "beelden in het manifest")
    else:
        uit = veilig_doel(args.uit)
        uit.mkdir(parents=True, exist_ok=True)
        per = defaultdict(list)
        with open(args.ophaallijst) as f:
            for r in csv.DictReader(f, delimiter="\t"):
                per[r["doc_id"]].append((int(r["mediaId"]), int(r["convId"]), Path(args.bron) / r["location"].lstrip("/")))
        mp = uit / "manifest.json"
        manifest = json.loads(mp.read_text()) if mp.exists() else {}
        for doc, lagen in sorted(per.items()):
            try:
                manifest[doc] = opslaan(samenvoegen([p for _, _, p in sorted(lagen)]), uit / f"{doc}.png")
            except (OSError, TeGroot) as e:
                manifest[doc] = {"fout": type(e).__name__}
        mp.write_text(json.dumps(manifest, indent=1, sort_keys=True))
        print(sum("sha256" in m for m in manifest.values()), "gebouwd,", sum("fout" in m for m in manifest.values()), "fout")
    return 0


if __name__ == "__main__":
    sys.exit(main())
