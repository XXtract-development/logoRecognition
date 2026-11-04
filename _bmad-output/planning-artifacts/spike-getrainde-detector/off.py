"""Open Food Facts-logo's als bron van de generator (CAP-17; trainingsset-en-herkenning §11, randvoorwaarden §4).
Stdlib + Pillow. Geen AI-aanroepen, geen kosten.

Per zoekopdracht een pool van hoogstens POOL willekeurige benoemde logo's (Robotoff `logos/search`, ruw bewaard onder
`<uit>/pools/`), per klasse (V-label: drie pools samen, ontdubbeld op id) de bruikbare records in de volgorde van
sha256(SEED + logo-id) tot GRENS behouden uitsneden. Alleen de crop-endpoint (één vakje zonder marge, JPEG); nooit een
hele foto. Afvallers per reden geteld (REDENEN); lekregel: toets-GTIN en toetsleverancier (GTIN of cijfers 2–8 = de
eerste 7 van een toets-GLN). Beleefd (User-Agent met contact, PAUZE s tussen het begin van twee verzoeken, WACHT bij
tijdelijke fouten, `Retry-After` tot MAX_RETRY_AFTER), hervatbaar (bewaarde pools, bestaande uitsneden, blijvende
uitkomsten in `<uit>/status.json`), noodstop na NOODSTOP tijdelijke fouten op rij, schijfgrens (stoppunt 9). Schrijft
alleen buiten een git-werkboom (beelden.veilig_doel).

  python off.py ophalen --proef-map <PM> [--uit <PM>/off] [--klasse K ...]
      → <uit>/uitsneden/<KLASSE>/<id>.jpg, <uit>/bronnen.json (index voor `generator.py tegels --off`),
        <uit>/rapport.json (ook op stdout); exitcode 3 bij noodstop, schijf vol of een mislukte pool
"""
import argparse
import hashlib
import http.client
import io
import json
import math
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path
from urllib.parse import urlencode

from PIL import Image

import beelden
import scheiding
from train import KLASSEN

SEED = "20261102"
GRENS = 1000  # behouden uitsneden per klasse
POOL = 2000  # records per zoekopdracht (de API kent geen offset: random=true)
MIN_PX = 64  # langste zijde van het vakje in de bronfoto
PAUZE = 0.6  # s tussen het begin van twee verzoeken (hoogstens 100 per minuut)
WACHT = (2, 4, 8, 16, 32)  # s, bij 429, 5xx, tijd op of verbindingsfout
MAX_RETRY_AFTER = 300
NOODSTOP = 20  # tijdelijk mislukte uitsneden op rij
MAX_BYTES = 3_000_000_000  # onder <uit> (stoppunt 9; GB = 10⁹ bytes)
MIN_VRIJ = 5_000_000_000  # vrije schijf
TIMEOUT = 60  # s per verzoek
UA = "XXtract logoRecognition proef (ict@xxtract.com)"
ROBOTOFF = "https://robotoff.openfoodfacts.org/api/v1/images"
PRODUCTEN = "https://images.openfoodfacts.org/images/products"
BRON = "https://world.openfoodfacts.org"
ATTRIBUTIE = (  # randvoorwaarden §4, letterlijk
    "Trained in part on logo crops from Open Food Facts product photos (© Open Food Facts contributors, "
    "https://world.openfoodfacts.org), licence CC BY-SA 3.0; logo boxes and annotations from the Open Food Facts "
    "database (Robotoff), licence ODbL.")
LICENTIE = "CC-BY-SA-3.0; ODbL"
REDENEN = ("verwijderd", "vakje_ongeldig", "te_klein", "geen_gtin", "toets_gtin", "toetsleverancier", "niet_op_te_halen",
           "dubbel", "bijna_gelijk")
ZOEK = {  # trainingsset §11; geen RECYCLABLE_GENERAL_CLAIM (steekproef afgewezen)
    "EU_ORGANIC_FARMING": (("label", "en:eu-organic"),),
    "GREEN_DOT": (("label", "en:green-dot"),),
    **{f"NUTRISCORE_{x}": (("label", f"en:nutriscore-grade-{x.lower()}"),) for x in "ABCDE"},
    "EUROPEAN_V_LABEL_VEGAN": (("label", "en:european-vegetarian-union-vegan"),
                               ("label", "en:european-vegetarian-union-vegetarian"),
                               ("label", "en:european-vegetarian-union")),
    "MARINE_STEWARDSHIP_COUNCIL_LABEL": (("label", "en:sustainable-seafood-msc"),),
    "VEGAN_SOCIETY_VEGAN_LOGO": (("label", "en:the-vegan-society"),),
    "PREGNANCY_WARNING": (("label", "en:not-advised-for-pregnant-women"),),
    "WEIDEMELK": (("label", "fr:lait-de-paturage"),),
    # ronde 9 (besluit Friso 02-11-2026); en:fsc-recycled en en:fsc-100 bestaan niet (gemeten 02-11-2026)
    "FOREST_STEWARDSHIP_COUNCIL_LABEL": (("label", "en:fsc-mix"), ("label", "en:fsc")),
    "TRIMAN": (("label", "fr:triman"),),
    "SOCIETY_PLASTICS_INDUSTRY": tuple(  # de 16 verpakkingswaarden met treffers (trainingsset §11)
        ("packaging", w) for w in ("01-pet", "1-pet", "02-hdpe", "2-hdpe", "02-pe-hd", "03-pvc", "04-ldpe", "4-ldpe",
                                   "04-pe-ld", "05-pp", "5-pp", "06-ps", "07-other", "7-other", "07-o", "7-o")),
    "ON_THE_WAY_TO_PLANETPROOF": (("label", "en:planet-proof"),),
    # ronde 10 (besluit Friso 03-11-2026): Crossed Grain-logo. Id gemeten in static.openfoodfacts.org/data/taxonomies/
    # labels.json op 03-11-2026 ("Crossed Grain Trademark"); niet in de research gevonden. "en:no-gluten" is een claim, geen logo.
    "DIET_FREE_FROM_GLUTEN": (("label", "en:crossed-grain-trademark"),),
}
assert set(ZOEK) <= set(KLASSEN)


class Tijdelijk(Exception):
    """Na alle nieuwe pogingen nog steeds 429, 5xx, tijd op of verbindingsfout."""


class Blijvend(Exception):
    """Een andere 4xx: niet opnieuw proberen."""


class Noodstop(Exception):
    """NOODSTOP uitsneden op rij tijdelijk mislukt."""


class Schijfvol(Exception):
    """Meer dan max_bytes onder de OFF-map of minder dan min_vrij vrij (stoppunt 9)."""


def gtin14(barcode):
    """GTIN-14 (voorloopnullen) als de barcode na strip() alleen uit 8, 12, 13 of 14 cijfers bestaat; anders None."""
    s = str(barcode).strip() if barcode is not None else ""
    return s.zfill(14) if re.fullmatch(r"[0-9]{8}|[0-9]{12,14}", s) else None


def zoek_url(type_, waarde, n=POOL):
    sleutel = "taxonomy_value" if type_ == "label" else "value"
    return f"{ROBOTOFF}/logos/search?" + urlencode(
        {"type": type_, sleutel: waarde, "annotated": "true", "random": "true", "count": n})


def uitsnede_url(record):
    y0, x0, y1, x1 = record["bounding_box"]
    return f"{ROBOTOFF}/crop?" + urlencode(
        {"image_url": PRODUCTEN + record["source_image"], "y_min": y0, "x_min": x0, "y_max": y1, "x_max": x1})


def _vak(r):
    """(y_min, x_min, y_max, x_max, breedte, hoogte) of None als afbeelding of vakje ongeldig is."""
    im, box = r.get("image"), r.get("bounding_box")
    if not im or not im.get("width") or not im.get("height") or not isinstance(box, (list, tuple)) or len(box) != 4:
        return None
    try:
        y0, x0, y1, x1 = (float(v) for v in box)
    except (TypeError, ValueError):
        return None
    if not all(0 <= v <= 1 for v in (y0, x0, y1, x1)) or x1 <= x0 or y1 <= y0:
        return None
    return y0, x0, y1, x1, im["width"], im["height"]


def record_reden(r, toets_gtins, lev_gtins, lev_gln7):
    """De eerste passende recordreden (vaste volgorde, REDENEN[:6]) of None."""
    if (r.get("image") or {}).get("deleted"):
        return "verwijderd"
    vak = _vak(r)
    if vak is None:
        return "vakje_ongeldig"
    y0, x0, y1, x1, w, h = vak
    if max((x1 - x0) * w, (y1 - y0) * h) < MIN_PX:
        return "te_klein"
    g = gtin14(r.get("barcode"))
    if g is None:
        return "geen_gtin"
    if g in toets_gtins:
        return "toets_gtin"
    if g in lev_gtins or g[1:8] in lev_gln7:
        return "toetsleverancier"
    return None


def volgorde(records, seed=SEED):
    return sorted(records, key=lambda r: hashlib.sha256((seed + str(r["id"])).encode()).hexdigest())


class Haler:
    """Eén verzoek tegelijk, met User-Agent, minstens PAUZE s tussen het begin van twee verzoeken (ook bij een nieuwe
    poging) en nieuwe pogingen bij tijdelijke fouten (randvoorwaarden: trainingsset §11)."""

    def __init__(self, opener=urllib.request.urlopen, slaap=time.sleep, klok=time.monotonic):
        self.opener, self.slaap, self.klok, self.vorige = opener, slaap, klok, None

    def _verzoek(self, url):
        if self.vorige is not None:
            over = PAUZE - (self.klok() - self.vorige)
            if over > 0:
                self.slaap(over)
        self.vorige = self.klok()
        with self.opener(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=TIMEOUT) as antwoord:
            return antwoord.read()

    def get(self, url):
        for poging in range(len(WACHT) + 1):
            wacht = WACHT[poging] if poging < len(WACHT) else None
            try:
                return self._verzoek(url)
            except urllib.error.HTTPError as e:  # vóór URLError: HTTPError is er een subklasse van
                if e.code != 429 and e.code < 500:
                    raise Blijvend(f"HTTP {e.code}") from None
                try:
                    ra = float((e.headers or {}).get("Retry-After"))
                except (TypeError, ValueError):
                    ra = math.nan  # geen of een datum als Retry-After: de vaste wachttijd
                if wacht is not None and math.isfinite(ra):
                    wacht = min(max(ra, 0.0), MAX_RETRY_AFTER)
                fout = f"HTTP {e.code}"
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as e:
                fout = type(e).__name__  # socket.timeout is TimeoutError; ook een afgebroken read() (IncompleteRead)
            if wacht is None:
                raise Tijdelijk(f"{fout} na {len(WACHT)} nieuwe pogingen")
            self.slaap(wacht)


def _pool(data):
    """Het geparste zoekantwoord; geen JSON-object met een lijst `logos` → Tijdelijk (niets weggeschreven)."""
    try:
        antwoord = json.loads(data)
    except ValueError:
        antwoord = None
    if not isinstance(antwoord, dict) or not isinstance(antwoord.get("logos"), list):
        raise Tijdelijk("zoekantwoord is geen JSON-object met een lijst 'logos'")
    return antwoord


def _beeld(data):
    """Tijdelijk als de bytes geen beeld zijn dat Pillow kan lezen (bv. een HTML-foutpagina met status 200)."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()
    except Exception:  # UnidentifiedImageError, OSError, SyntaxError, …: elk niet-leesbaar antwoord
        raise Tijdelijk("uitsnede is geen leesbaar beeld") from None


def _schrijf(pad, data):
    pad.parent.mkdir(parents=True, exist_ok=True)
    pad.write_bytes(data)
    return len(data)


def ophalen(uit, haler, toets_gtins, lev_gtins, lev_gln7, toets_hashes, klassen=None, grens=GRENS, seed=SEED,
            max_bytes=MAX_BYTES, min_vrij=MIN_VRIJ, vrij=None):
    """Haalt de uitsneden op (zie de moduletekst); geeft het rapport en schrijft bronnen.json en rapport.json."""
    uit = beelden.veilig_doel(uit)
    uit.mkdir(parents=True, exist_ok=True)
    vrij = vrij or (lambda: shutil.disk_usage(uit).free)
    klassen = ZOEK if klassen is None else klassen
    status_pad = uit / "status.json"
    status = {str(k): v for k, v in json.loads(status_pad.read_text()).items()} if status_pad.exists() else {}
    bronnen_pad, rapport_pad = uit / "bronnen.json", uit / "rapport.json"
    oud_index = json.loads(bronnen_pad.read_text(encoding="utf-8")) if bronnen_pad.exists() else []
    vorig = json.loads(rapport_pad.read_text(encoding="utf-8")) if rapport_pad.exists() else {}
    bronnen_pad.unlink(missing_ok=True)  # een run die vroeg stopt, laat geen index met verwijderde uitsneden achter
    totaal = sum(p.stat().st_size for p in uit.rglob("*") if p.is_file())  # lopend bijgehouden, niet per uitsnede geteld
    pools, index, per_klasse, op_rij = {}, [], {}, 0
    try:
        for klasse, zoek in klassen.items():
            records, n_off = {}, 0
            for type_, waarde in zoek:
                pad = uit / "pools" / f"{type_}-{waarde.replace(':', '_')}.json"
                if not pad.exists():
                    ruw = haler.get(zoek_url(type_, waarde))  # mislukt: de uitzondering gaat door
                    _pool(ruw)  # eerst controleren: een kapot antwoord zou elke hervatting vergiftigen
                    totaal += _schrijf(pad, ruw)
                ruw = pad.read_bytes()
                pools[pad.relative_to(uit).as_posix()] = hashlib.sha256(ruw).hexdigest()
                antwoord = _pool(ruw)
                n_off += antwoord.get("count", 0)
                for r in antwoord.get("logos", []):
                    records.setdefault(r["id"], r)
            af = dict.fromkeys(REDENEN, 0)
            bruikbaar = []
            for r in records.values():
                reden = record_reden(r, toets_gtins, lev_gtins, lev_gln7)
                if reden:
                    af[reden] += 1
                    oud = uit / "uitsneden" / klasse / f"{r['id']}.jpg"
                    if oud.exists():  # bv. een nieuwe toets-GTIN: weg, de volgende in de volgorde komt ervoor in de plaats
                        totaal -= oud.stat().st_size
                        oud.unlink()
                else:
                    bruikbaar.append(r)
            gezien, behouden = set(), []
            for r in volgorde(bruikbaar, seed):
                if len(behouden) >= grens:
                    break
                sid, pad = str(r["id"]), uit / "uitsneden" / klasse / f"{r['id']}.jpg"
                if sid in status:
                    af[status[sid]] += 1
                    continue
                if pad.exists():
                    data = pad.read_bytes()
                else:
                    try:
                        data = haler.get(uitsnede_url(r))
                        _beeld(data)
                        op_rij = 0
                    except Tijdelijk:
                        af["niet_op_te_halen"] += 1  # geen blijvende uitkomst: een volgende run probeert hem opnieuw
                        op_rij += 1
                        if op_rij >= NOODSTOP:
                            raise Noodstop(f"{NOODSTOP} uitsneden op rij tijdelijk mislukt (laatste: logo {sid})")
                        continue
                    except Blijvend:
                        status[sid] = "niet_op_te_halen"
                        af["niet_op_te_halen"] += 1
                        op_rij = 0
                        continue
                sha = hashlib.sha256(data).hexdigest()
                reden = "dubbel" if sha in gezien else None
                if reden is None and toets_hashes:  # filters ook op bestaande uitsneden (de toetsset kan gegroeid zijn)
                    dh = scheiding.dhash(Image.open(io.BytesIO(data)))
                    if any(scheiding.hamming(dh, t) <= 6 for t in toets_hashes.values()):
                        reden = "bijna_gelijk"
                if reden:
                    status[sid] = reden
                    af[reden] += 1
                    if pad.exists():
                        totaal -= pad.stat().st_size
                        pad.unlink()
                    continue
                if not pad.exists():
                    if totaal + len(data) > max_bytes or vrij() < min_vrij:
                        raise Schijfvol(f"{totaal + len(data)} bytes onder {uit} (grens {max_bytes}) of "
                                        f"minder dan {min_vrij} bytes vrij; stoppunt 9")
                    totaal += _schrijf(beelden.veilig_doel(pad), data)
                gezien.add(sha)
                behouden.append((r, pad, sha, len(data)))
            index += [{"klasse": klasse, "pad": str(pad.absolute()), "logo_id": r["id"], "gtin14": gtin14(r.get("barcode")),
                       "source_image": r.get("source_image"), "sha256": sha, "annotator": r.get("username")}
                      for r, pad, sha, _ in behouden]
            per_klasse[klasse] = {"off": n_off, "pool": len(records), "afgevallen": af, "behouden": len(behouden),
                                  "annotatoren": dict(Counter(r.get("username") for r, *_ in behouden)),
                                  "bytes": sum(n for *_, n in behouden)}
    finally:
        if status or status_pad.exists():  # blijvende uitkomsten blijven bewaard, ook bij een noodstop
            status_pad.write_text(json.dumps(status, indent=1, sort_keys=True))
    # klassen buiten deze run (bv. --klasse WEIDEMELK na een volle run) houden hun index en rapport
    index = [e for e in oud_index if e["klasse"] not in klassen] + index
    per_klasse = {**{k: v for k, v in vorig.get("klassen", {}).items() if k not in klassen}, **per_klasse}
    pools = {**vorig.get("pools", {}), **pools}
    rapport = {"klassen": per_klasse, "bytes": totaal, "vrij": vrij(), "pools": pools, "seed": seed, "grens": grens,
               "bron": BRON, "attributie": ATTRIBUTIE, "licentie": LICENTIE}
    bronnen_pad.write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8")
    rapport_pad.write_text(json.dumps(rapport, indent=1, ensure_ascii=False), encoding="utf-8")
    return rapport


def toets_gtins(pm):
    """GTIN-14's van de toetsset: tweede deel van elk doc-id in `<PM>/toets/toets-docs.json` (leeg als hij ontbreekt)."""
    pad = Path(pm) / "toets" / "toets-docs.json"
    return {d.split("-")[1].zfill(14) for d in json.loads(pad.read_text())} if pad.exists() else set()


def main(argv=None):
    import nutrigreen

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="stap", required=True)
    o = sub.add_parser("ophalen")
    o.add_argument("--proef-map", required=True, type=Path)
    o.add_argument("--uit", type=Path, help="standaard <PM>/off")
    o.add_argument("--klasse", action="append", help=f"standaard alle: {', '.join(ZOEK)}")
    a = ap.parse_args(argv)
    onbekend = [k for k in a.klasse or () if k not in ZOEK]
    if onbekend:
        print(f"onbekende klasse {onbekend}; bekend: {', '.join(ZOEK)}", file=sys.stderr)
        return 2
    pm = a.proef_map
    glns, gtins = nutrigreen._toetsleveranciers(pm)
    beeldmap = pm / "toets" / "beelden"
    try:
        rapport = ophalen(a.uit or pm / "off", Haler(), toets_gtins(pm), {g.zfill(14) for g in gtins},
                          {g[:7] for g in glns}, scheiding._hashes(beeldmap) if beeldmap.is_dir() else {},
                          klassen={k: ZOEK[k] for k in a.klasse} if a.klasse else None)
    except (Noodstop, Schijfvol, Tijdelijk, Blijvend) as e:
        print(f"ophalen gestopt ({type(e).__name__}): {e}", file=sys.stderr)
        return 3
    print(json.dumps(rapport, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
