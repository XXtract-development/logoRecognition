"""Herkenning op het hele etiket (CAP-7; trainingsset-en-herkenning §6 en §8).

Lichte functies (tegels, NMS, band, drempels, certificaatnummers, beslissing) gebruiken alleen stdlib + numpy.
`rfdetr`/`torch` worden alleen lui geïmporteerd in `laad_model` en `voorspel` (groep `detector`).

  python herken.py detecteer --model <ckpt> --maat N --lijst lijst.json --uit kandidaten.json [--threads 8]
  python herken.py drempels --kandidaten valid-kandidaten.json --waarheid waarheid.json --uit drempels.json
  python herken.py beslis --kandidaten toets-kandidaten.json --drempels drempels.json --lijst lijst.json \
      --referenties referenties.json --grootboek <PM>/uitgaven.json --uit route-da.json --meta route-da-meta.json \
      [--certificaten cert.json]
Met --bevroren <bevroren.json> controleren `detecteer` en `beslis` eerst de bevriezing en nemen ze maat, tegel, overlap,
drempel en beoordelaarmodel uit het bevroren onderdeel `instellingen` (die waarden dan niet op de opdrachtregel).
Uitvoer wordt na elk etiket weggeschreven; opnieuw starten slaat klare etiketten over. Een routebestand van `beslis`
is {"status": "gestart"|"voltooid"|"afgebroken", "etiketten": {doc: [codes] | {"fout": klasse}}}.
"""
import argparse
import io
import json
import re
import sys
import time
from pathlib import Path

import numpy as np

from train import KLASSEN, MATEN

NS = tuple(f"NUTRISCORE_{x}" for x in "ABCDE")  # één groep bij NMS (besluit Friso 01-11-2026: D en E eigen klassen)
MSC, EU, FSC = "MARINE_STEWARDSHIP_COUNCIL_LABEL", "EU_ORGANIC_FARMING", "FOREST_STEWARDSHIP_COUNCIL_LABEL"
CERTIFICAAT = {
    FSC: re.compile(r"FSC[®\s]*[-–]?\s*C\s?\d{6}"),  # ronde 9 (trainingsset §8)
    MSC: re.compile(r"MSC[-–\s]*C[-–\s]*\d{5}"),
    EU: re.compile(r"\b[A-Z]{2}[-–\s]*(?:BIO|ÖKO|OKO|ORG|ECO|EKO|ØKO|OEKO)[-–\s]*\d{2,3}\b"),
}
VLOER, GEEN_HOOG, MIN_MET, MIN_ZONDER = 0.05, 1.01, 10, 30


# --- tegels en meetkunde --------------------------------------------------------------------------------------------
def _starts(lengte, tegel, overlap):
    if lengte <= tegel:
        return [0]
    stap, s = tegel - overlap, []
    while len(s) * stap + tegel < lengte:
        s.append(len(s) * stap)
    return s + [lengte - tegel]


def tegels(w, h, tegel=1024, overlap=256):
    """Vaste, overlappende tegels (x0, y0, x1, y1) die het hele etiket dekken; afstand tussen starts <= tegel - overlap."""
    if not 0 <= overlap < tegel:
        raise ValueError(f"overlap {overlap} moet tussen 0 en de tegel ({tegel}) liggen")
    return [(x, y, min(x + tegel, w), min(y + tegel, h)) for y in _starts(h, tegel, overlap) for x in _starts(w, tegel, overlap)]


def naar_etiket(box, tegel):
    return (box[0] + tegel[0], box[1] + tegel[1], box[2] + tegel[0], box[3] + tegel[1])


def _iou(a, b):
    i = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i
    return i / u if u > 0 else 0.0


def nms(kandidaten, iou=0.5):
    """Gulzige NMS vanaf IoU `iou`, per klasse; Nutri-Score A–E als één groep (één balk geeft één letter)."""
    groep = lambda c: "NUTRISCORE" if c in NS else c  # noqa: E731
    blijft = []
    for k in sorted(kandidaten, key=lambda x: -x["score"]):
        if all(groep(b["code"]) != groep(k["code"]) or _iou(b["box"], k["box"]) < iou for b in blijft):
            blijft.append(k)
    return blijft


# --- drempels en beslissing -----------------------------------------------------------------------------------------
def band(score, laag, hoog):
    return "melding" if score >= hoog else "beoordelaar" if score >= laag else "niets"


def _bereken(beste, vals, rooster):
    laag = max(VLOER, float(np.percentile(beste, 5))) if beste else VLOER
    grens = max(vals, default=float("-inf"))
    hoog = min((s for s in rooster if s >= laag and s > grens), default=GEEN_HOOG)
    return laag, float(hoog)


def _per_code(validatie, code):
    beste, vals, rooster, met = [], [], [], 0
    for e in validatie:
        scores = [float(k["score"]) for k in e["kandidaten"] if k["code"] == code]
        rooster += scores
        if code in e["codes"]:
            met += 1
            if scores:
                beste.append(max(scores))
        else:
            vals += scores
    return beste, vals, rooster, met, len(validatie) - met


def drempels(validatie, codes):
    """(laag, hoog) per code volgens trainingsset §6. `laag` = P5 van de beste kandidaatscore per validatie-etiket mét
    de code (vloer 0,05); `hoog` = kleinste roosterwaarde >= laag waarboven geen etiket zónder de code een kandidaat van
    die code heeft (anders 1,01). Minder dan 10 mét of 30 zonder: de drempels over alle codes samen."""
    per = {c: _per_code(validatie, c) for c in codes}
    samen = [sum((p[i] for p in per.values()), []) for i in range(3)]
    gezamenlijk = _bereken(*samen)
    return {c: _bereken(*p[:3]) if p[3] >= MIN_MET and p[4] >= MIN_ZONDER else gezamenlijk for c, p in per.items()}


def certificaten(tekst):
    """Codes waarvan een certificaatnummer in de PDF-tekst staat; None = geen tekst (route A n.v.t.)."""
    if tekst is None:
        return None
    return {c for c, p in CERTIFICAAT.items() if p.search(tekst)}


def beslis(kandidaten, drempels, certificaten, beoordeel, max_beoordelingen=10):
    """Band per code: >= hoog melding; in de band bevestigt een certificaatnummer (zonder beoordelaar), anders de
    beoordelaar van hoog naar laag tot `ja`, hoogstens `max_beoordelingen` per etiket. Een fout van de beoordelaar
    (openrouter.EtiketFout) gaat naar boven: routefout, nooit een stille `nee`."""
    meldingen, in_band = set(), []
    for k in kandidaten:
        if k["code"] not in drempels:
            continue
        b = band(k["score"], *drempels[k["code"]])
        if b == "melding":
            meldingen.add(k["code"])
        elif b == "beoordelaar":
            in_band.append(k)
    door_certificaat = {k["code"] for k in in_band if certificaten and k["code"] in certificaten} - meldingen
    meldingen |= door_certificaat
    beoordeeld = 0
    for k in sorted(in_band, key=lambda x: -x["score"]):
        if beoordeeld >= max_beoordelingen:
            break
        if k["code"] in meldingen:
            continue
        beoordeeld += 1
        if beoordeel(k) == "ja":
            meldingen.add(k["code"])
    zonder_kandidaat = set(certificaten or ()) - {k["code"] for k in kandidaten}
    return {"meldingen": meldingen, "beoordeeld": beoordeeld, "door_certificaat": door_certificaat,
            "certificaat_zonder_kandidaat": zonder_kandidaat}


# --- detector (groep `detector`, lui geïmporteerd) ------------------------------------------------------------------
def laad_model(checkpoint, maat):
    """RF-DETR-model uit een eigen checkpoint, voor herkenning op de processor."""
    from train import _rfdetr_klasse

    if maat not in MATEN:
        raise ValueError(f"onbekende maat {maat!r}; kies uit {sorted(MATEN)}")
    klasse = _rfdetr_klasse(maat)
    model = klasse(pretrain_weights=str(checkpoint), device="cpu")
    return model


def voorspel(model, tegel, drempel):
    """Kandidaten in tegelcoördinaten: [{"code", "box", "score"}]; alleen klassen uit de trainingsset."""
    det = model.predict(tegel, threshold=drempel)
    namen = set(model.class_names)  # rfdetr nummert de COCO-categorieën 0..n-1; slot n = geen object
    return [{"code": str(c), "box": [float(v) for v in box], "score": float(s)}
            for box, s, c in zip(det.xyxy, det.confidence, det.data["class_name"]) if c in namen]


# --- opdrachtregel (lijm; zie DRAAIPLAN) ---------------------------------------------------------------------------
STANDAARD = {"maat": None, "tegel": 1024, "overlap": 256, "drempel": VLOER, "beoordelaar_model": "google/gemini-3.8-flash"}
PER_BEOORDELING = 0.002  # dollar, raming randvoorwaarden §3


def _schrijf(pad, data):
    from beelden import veilig_doel

    pad = veilig_doel(pad)
    pad.parent.mkdir(parents=True, exist_ok=True)
    pad.write_text(json.dumps(data, indent=1, sort_keys=True, default=sorted))


def _instellingen(a, namen):
    """Waarden uit de bevroren instellingen (met --bevroren; dan niet ook op de opdrachtregel), anders opdrachtregel/standaard."""
    if not a.bevroren:
        return {n: STANDAARD[n] if getattr(a, n) is None else getattr(a, n) for n in namen}
    import bevries

    dubbel = [n for n in namen if getattr(a, n) is not None]
    if dubbel:
        raise SystemExit(f"met --bevroren komen {dubbel} uit de bevroren instellingen, niet van de opdrachtregel")
    try:
        inst, onderdelen = bevries.bevroren_instellingen(a.bevroren)
    except bevries.Gewijzigd as e:
        raise SystemExit(f"geweigerd: {e}") from None
    return {**{n: inst[n] for n in namen}, "_onderdelen": onderdelen}


def _detecteer(a):
    from PIL import Image

    w = _instellingen(a, ("maat", "tegel", "overlap", "drempel"))
    if a.bevroren and not Path(a.model).resolve().is_relative_to(Path(w["_onderdelen"]["model"]["pad"]).resolve()):
        raise SystemExit("met --bevroren moet --model in het bevroren onderdeel `model` liggen")
    if w["maat"] is None:
        raise SystemExit("--maat ontbreekt")
    resultaat = Path(a.model).parent / "train-resultaat.json"  # een checkpoint met andere klassen leest codes verkeerd
    klassen = json.loads(resultaat.read_text()).get("klassen") if resultaat.exists() else None
    if klassen != list(KLASSEN):
        raise SystemExit(f"geweigerd: {resultaat} ontbreekt of heeft andere klassen dan train.KLASSEN ({klassen})")
    import torch  # groep `detector`; pas na de controles

    torch.set_num_threads(a.threads)
    model = laad_model(a.model, w["maat"])
    uit = json.loads(Path(a.uit).read_text()) if Path(a.uit).exists() else {}
    for item in json.loads(Path(a.lijst).read_text()):
        if item["doc_id"] in uit:
            continue  # klaar in een eerdere start
        t0, c0 = time.perf_counter(), time.process_time()
        try:
            with Image.open(item["pad"]) as im:
                beeld = im.convert("RGB")
            arr, kand, n = np.asarray(beeld), [], 0
            for t in tegels(beeld.width, beeld.height, w["tegel"], w["overlap"]):
                if arr[t[1]:t[3], t[0]:t[2]].std() < 3:
                    continue  # lege tegel
                n += 1
                kand += [{**k, "box": list(naar_etiket(k["box"], t))} for k in voorspel(model, beeld.crop(t), w["drempel"])]
            uit[item["doc_id"]] = {"kandidaten": nms(kand), "tegels": n, "cpu_s": time.process_time() - c0,
                                   "wand_s": time.perf_counter() - t0}
        except OSError as e:  # beeld onleesbaar: routefout voor dit etiket
            uit[item["doc_id"]] = {"fout": type(e).__name__, "wand_s": time.perf_counter() - t0}
        _schrijf(Path(a.uit), uit)  # na elk etiket: een onderbreking verliest niets
    _schrijf(Path(a.uit), uit)
    return 0


def _drempels(a):
    """Waarheid {doc: {"aanwezig": [...], "onzeker": [...]}}; kandidaten van een onzekere code op dat etiket tellen niet
    (niet als vondst en niet als vals)."""
    kand, waarheid = json.loads(Path(a.kandidaten).read_text()), json.loads(Path(a.waarheid).read_text())
    validatie = [{"codes": set(waarheid[d]["aanwezig"]),
                  "kandidaten": [k for k in v["kandidaten"] if k["code"] not in waarheid[d].get("onzeker", ())]}
                 for d, v in kand.items() if d in waarheid and "kandidaten" in v]
    _schrijf(Path(a.uit), {c: list(v) for c, v in drempels(validatie, list(KLASSEN)).items()})
    return 0


def _png(beeld):
    buf = io.BytesIO()
    beeld.save(buf, "PNG")
    return buf.getvalue()


def _verwacht_beoordelingen(kandidaten, d, max_beoordelingen=10):
    return min(max_beoordelingen, sum(1 for k in kandidaten if k["code"] in d and band(k["score"], *d[k["code"]]) == "beoordelaar"))


def _beslis(a):
    from PIL import Image

    import beoordelaar
    import bevries
    import kosten
    import openrouter

    w = _instellingen(a, ("beoordelaar_model",))
    if a.bevroren:  # drempels en referentieplaatjes moeten de bevroren bestanden zijn
        o = w["_onderdelen"]
        for optie, naam, gegeven in (("drempels", "drempels", a.drempels), ("referenties", "referentieplaatjes", a.referenties)):
            if Path(gegeven).resolve() != Path(o[naam]["pad"]).resolve():
                raise SystemExit(f"met --bevroren moet --{optie} het bevroren onderdeel {naam} zijn")
    kand = json.loads(Path(a.kandidaten).read_text())
    d = {c: tuple(v) for c, v in json.loads(Path(a.drempels).read_text()).items()}
    index = json.loads(Path(a.referenties).read_text())
    ontbreekt = sorted(c for c in d if c not in index or not Path(index[c]).exists())
    if ontbreekt:
        raise SystemExit(f"stoppunt 7: geen referentieplaatje voor {', '.join(ontbreekt)}")
    refs = {c: Path(index[c]).read_bytes() for c in d}
    teksten = json.loads(Path(a.certificaten).read_text()) if a.certificaten else {}
    lijst = json.loads(Path(a.lijst).read_text())
    run = bevries.lees_run(a.uit)
    if run["status"] != "gestart":
        raise SystemExit(f"{a.uit} is al afgesloten (status {run['status']}); een nieuwe run gaat via bevries.py run --herhaling")
    meta = json.loads(Path(a.meta).read_text()) if Path(a.meta).exists() else {}
    open_ = [i for i in lijst if i["doc_id"] not in run["etiketten"]]
    bewaker = kosten.Bewaker("beoordelaar", raming=a.raming, grootboek=a.grootboek)  # validatie, D+A en D samen
    try:
        bewaker.controleer_start(PER_BEOORDELING * sum(_verwacht_beoordelingen(kand[i["doc_id"]].get("kandidaten", []), d)
                                                       for i in open_ if i["doc_id"] in kand))
    except kosten.BudgetOverschreden as e:
        raise SystemExit(f"stoppunt 5: {e}") from None
    try:
        client = openrouter.Client(w["beoordelaar_model"], "beoordelaar", bewaker=bewaker)
        client.zdr_proef(refs[sorted(refs)[0]])  # niet-klantbeeld: officieel referentieplaatje
        for item in open_:
            doc, t0, voor = item["doc_id"], time.perf_counter(), bewaker.uitgegeven
            r = {"beoordeeld": None, "door_certificaat": set()}
            if doc not in kand or "kandidaten" not in kand[doc]:
                run["etiketten"][doc] = {"fout": (kand.get(doc) or {}).get("fout", "geen_kandidaten")}
            else:
                with Image.open(item["pad"]) as im:
                    beeld = im.convert("RGB")

                def oordeel(k):
                    crop = _png(beoordelaar.uitsnede(beeld, k["box"]))
                    return beoordelaar.beoordeel(client, crop, refs[k["code"]], k["code"])

                try:
                    r = beslis(kand[doc]["kandidaten"], d, certificaten(teksten.get(doc)), oordeel)
                    run["etiketten"][doc] = sorted(r["meldingen"])
                except openrouter.EtiketFout as e:  # routefout voor dit etiket; RunStop stopt de hele run
                    run["etiketten"][doc], r = {"fout": e.klasse}, {"beoordeeld": None, "door_certificaat": set()}
            meta[doc] = {"gln": item.get("gln") or doc.split("-")[0],
                         "tijd": (kand.get(doc) or {}).get("wand_s", 0.0) + time.perf_counter() - t0,
                         "kosten": bewaker.uitgegeven - voor, "beoordeeld": r["beoordeeld"],
                         "door_certificaat": sorted(r["door_certificaat"])}
            bevries.schrijf_run(a.uit, run)  # na elk etiket; opnieuw starten slaat klare etiketten over
            _schrijf(Path(a.meta), meta)
    except openrouter.RunStop as e:
        run.update(status="afgebroken", reden=e.reden)
        bevries.schrijf_run(a.uit, run)
        print(f"run afgebroken: {e.reden}", file=sys.stderr)
        return 3
    run["status"] = "voltooid"
    bevries.schrijf_run(a.uit, run)
    _schrijf(Path(a.meta), meta)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="stap", required=True)
    d = sub.add_parser("detecteer")
    d.add_argument("--model", required=True, help="checkpoint")
    d.add_argument("--maat")
    d.add_argument("--lijst", required=True, help="json [{doc_id, pad}]")
    d.add_argument("--uit", required=True)
    d.add_argument("--threads", type=int, default=8)
    d.add_argument("--tegel", type=int)
    d.add_argument("--overlap", type=int)
    d.add_argument("--drempel", type=float, help=f"onderste score die de detector teruggeeft (standaard {VLOER})")
    d.add_argument("--bevroren", type=Path, help="bevroren.json: eerst controleren, instellingen daaruit")
    t = sub.add_parser("drempels")
    t.add_argument("--kandidaten", required=True)
    t.add_argument("--waarheid", required=True, help='json {doc_id: {"aanwezig": [codes], "onzeker": [codes]}} van de validatieset')
    t.add_argument("--uit", required=True)
    b = sub.add_parser("beslis")
    for naam in ("--kandidaten", "--drempels", "--lijst", "--referenties", "--uit", "--meta", "--grootboek"):
        b.add_argument(naam, required=True)
    b.add_argument("--certificaten", help="json {doc_id: pdftotext-tekst | null}")
    b.add_argument("--beoordelaar-model", dest="beoordelaar_model")
    b.add_argument("--raming", type=float, default=3.0, help="raming van de post beoordelaar in dollar (randvoorwaarden §3)")
    b.add_argument("--bevroren", type=Path, help="bevroren.json: eerst controleren, beoordelaarmodel daaruit")
    a = ap.parse_args(argv)
    return {"detecteer": _detecteer, "drempels": _drempels, "beslis": _beslis}[a.stap](a)


if __name__ == "__main__":
    sys.exit(main())
