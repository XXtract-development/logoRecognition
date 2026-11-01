"""Lokale K4-aa-runner (CAP-12; trainingsset-en-herkenning §9, meetregels §7). De functies zijn stdlib-only en krijgen de
k4aa-module als parameter; `main` laadt `apps/ml-service/app/services/k4aa.py` (origin/acc 8c9373d, niet gewijzigd) en
vervangt alleen in dit proces de ACC-referenties door de gefilterde momentopname van 30-10-2026. Niets op ACC.

Elke detectie binnen de 8 keurmerken telt als melding, ook met requires_review. `budget_exhausted` en andere
K4aaError-klassen zijn routefouten voor dat etiket; `no_zdr_provider` stopt de hele run.

  python k4aa_lokaal.py --ml-service <hoofdrepo>/apps/ml-service --proef-map <PM> --lijst <toets-lijst.json>
                        --uit <route.json> --meta <route-meta.json> --zdr-logo <png> [--alle-referenties]
                        [--budget 300 | --bevroren <PM>/bevroren.json]
  (draait in de omgeving van de ml-service: fastapi, cv2, httpx, torch, transformers; sleutel uit OPENROUTER_API_KEY)

Vóór het eerste klantetiket: een zdr-proef met een officieel logo en de uitgavengrens van de post "k4aa" (grootboek
PROEF_MAP/uitgaven.json); vóór elk etiket stopt de run als het volgende de grens zou passeren. Uitvoer na elk etiket;
opnieuw starten slaat klare etiketten over. Run-bestand: {"status", "reden"?, "etiketten": {doc: [codes] | {"fout"}}}.
"""
import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

import openrouter
import scheiding
from train import KLASSEN

PUBLIEK = {"gs1-packaging-label-guide", "synthetic-nutriscore-bootstrap"}
ACHT = set(KLASSEN)
PER_ETIKET = 0.012  # dollar, raming randvoorwaarden §3
MOMENTOPNAME = Path.home() / "logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/momentopname"


def filter_referenties(refs, gtin_naar_gln, trainings_glns):
    """Alleen publieke bronnen en uitsneden waarvan de GTIN bij een trainingsleverancier hoort."""
    uit = []
    for r in refs:
        bron = r.get("source") or ""
        gtins = scheiding.gtins_uit_paden([r.get("path") or ""])
        if bron in PUBLIEK or bron.startswith("http") or (
                len(gtins) == 1 and gtin_naar_gln.get(next(iter(gtins))) in trainings_glns):
            uit.append(r)
    return uit


def meldingen_uit(resultaat):
    return {d["t3777_code"] for d in resultaat.get("detections", []) if d.get("t3777_code") in ACHT}


def draai_etiket(k4aa, data, budget_s=300):
    eind = time.monotonic() + budget_s
    start = time.monotonic()
    try:
        r = asyncio.run(k4aa.scan(data, lambda: eind - time.monotonic()))
    except k4aa.K4aaError as e:
        if e.klasse == "no_zdr_provider":
            raise openrouter.RunStop("geen_zdr") from None
        return {"fout": e.klasse}
    return {"meldingen": meldingen_uit(r), "kosten": float(r.get("stats", {}).get("cost_usd") or 0.0),
            "tijd": float(time.monotonic() - start),
            "requires_review": {d["t3777_code"] for d in r.get("detections", [])
                                if d.get("requires_review") and d.get("t3777_code") in ACHT}}


def draai(k4aa, lijst, run, meta, bewaker, budget_s, bewaar):
    """Loopt de etiketten af en slaat klare over; vóór elk etiket stopt de run (RunStop "budget") als het volgende de
    grens van de post zou passeren; na elk etiket worden de echte kosten geboekt en `bewaar()` aangeroepen."""
    for e in lijst:
        doc = e["doc_id"]
        if doc in run["etiketten"]:
            continue
        if not bewaker.mag(PER_ETIKET):
            raise openrouter.RunStop("budget")
        r = draai_etiket(k4aa, Path(e["pad"]).read_bytes(), budget_s)
        bewaker.boek(r.get("kosten", 0.0))
        run["etiketten"][doc] = r if "fout" in r else sorted(r["meldingen"])
        meta[doc] = {"gln": e["gln"], "tijd": r.get("tijd"), "kosten": r.get("kosten", 0.0), "beoordeeld": 0,
                     "requires_review": sorted(r.get("requires_review", []))}
        bewaar()


def refset_sha(ids, mo=MOMENTOPNAME):
    """Hash van de referentieset: de gebruikte referentie-id's én de inhoud van de embeddings."""
    import hashlib

    npz = hashlib.sha256((Path(mo) / "embeddings.npz").read_bytes()).hexdigest()
    return hashlib.sha256(json.dumps({"ids": ids, "embeddings": npz}).encode()).hexdigest()


def _matrix(pm, alle, mo=MOMENTOPNAME):
    """SigLIP-matrix van de (gefilterde) referenties uit de momentopname; egale referenties (std < 3) vallen af."""
    import numpy as np
    from PIL import Image

    inv = pm / "invoer"
    refs = json.loads((inv / "momentopname/actieve-refs.json").read_text())
    if not alle:
        train = set(json.loads((pm / "scheiding.json").read_text())["trainingsleveranciers"])
        decl = scheiding.lees_declaraties(inv / "declaraties-prod-basiseenheden-20261008.tsv")
        gtin_gln = {g: gln for _, gln, g, _ in decl} | dict((g, gln) for gln, g in scheiding.lees_alcohol(inv / "alcohol-kandidaten.tsv"))
        refs = filter_referenties(refs, gtin_gln, train)
    mo = Path(mo)
    emb = np.load(mo / "embeddings.npz")
    per_pad = {p: v for p, v in zip(emb["pad"], emb["siglip"])}
    gebruikt, rijen, codes = [], [], []
    for r in refs:
        bestand = mo / "bestanden" / r["path"]
        if r["path"] not in per_pad or not bestand.exists() or np.asarray(Image.open(bestand).convert("L")).std() < 3:
            continue
        gebruikt.append(r["id"])
        rijen.append(per_pad[r["path"]])
        codes.append(r["code"])
    return np.stack(rijen).astype(np.float32), codes, sorted(gebruikt)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ml-service", required=True, type=Path)
    ap.add_argument("--proef-map", required=True, type=Path)
    ap.add_argument("--lijst", required=True, type=Path, help="[{doc_id, pad, gln}] van de bevestigde toetsetiketten")
    ap.add_argument("--uit", required=True, type=Path)
    ap.add_argument("--meta", required=True, type=Path)
    ap.add_argument("--zdr-logo", type=Path, help="niet-klantbeeld (officieel logo) voor de zdr-proef")
    ap.add_argument("--alle-referenties", action="store_true", help="alleen informatief: alle 540 referenties")
    ap.add_argument("--budget", type=float, help="tijdsbudget per etiket in s (standaard 300; met --bevroren uit de bevriezing)")
    ap.add_argument("--bevroren", type=Path, help="bevroren.json: eerst controleren; budget en referentieset daaruit")
    ap.add_argument("--raming", type=float, default=8.0, help="raming van de post k4aa in dollar (randvoorwaarden §3)")
    ap.add_argument("--alleen-referentieset", action="store_true", help="schrijf alleen de referentieset (voor bevroren.json)")
    a = ap.parse_args(argv)
    import beelden
    import bevries
    import kosten

    uit, meta_pad = beelden.veilig_doel(a.uit), beelden.veilig_doel(a.meta)
    budget, bevroren_set = (300.0 if a.budget is None else a.budget), None
    if a.bevroren:
        if a.budget is not None:
            raise SystemExit("met --bevroren komt het tijdsbudget uit de bevroren instellingen, niet van de opdrachtregel")
        try:
            inst, onderdelen = bevries.bevroren_instellingen(a.bevroren)
        except bevries.Gewijzigd as e:
            raise SystemExit(f"geweigerd: {e}") from None
        budget, bevroren_set = float(inst["k4aa_budget"]), json.loads(Path(onderdelen["k4aa"]["pad"]).read_text())["sha256"]
    R, codes, ids = _matrix(a.proef_map, a.alle_referenties)
    refset = refset_sha(ids)
    if bevroren_set and not a.alle_referenties and refset != bevroren_set:
        raise SystemExit("geweigerd: de referentieset wijkt af van de bevroren set")
    (uit.parent / f"{uit.stem}-referentieset.json").write_text(
        json.dumps({"sha256": refset, "ids": ids, "budget_s": budget}, indent=1))
    if a.alleen_referentieset:
        print("referentieset", refset[:12], f"({len(ids)} referenties)")
        return 0
    if not a.zdr_logo:
        raise SystemExit("--zdr-logo ontbreekt: zonder zdr-proef gaat er geen klantartwork naar de aanbieder")
    run = bevries.lees_run(uit)
    if run["status"] != "gestart":
        raise SystemExit(f"{uit} is al afgesloten (status {run['status']}); een nieuwe run gaat via bevries.py run --herhaling")
    meta = json.loads(meta_pad.read_text()) if meta_pad.exists() else {}
    lijst = json.loads(a.lijst.read_text())
    bewaker = kosten.Bewaker("k4aa", a.raming, grootboek=a.proef_map / "uitgaven.json")
    try:
        bewaker.controleer_start(sum(e["doc_id"] not in run["etiketten"] for e in lijst) * PER_ETIKET)
    except kosten.BudgetOverschreden as e:
        raise SystemExit(f"stoppunt 5: {e}") from None
    os.environ["GHS_REVIEW_API_KEY"] = os.environ["OPENROUTER_API_KEY"]  # alleen in dit proces
    os.environ.setdefault("GHS_REVIEW_BASE_URL", "https://openrouter.ai/api/v1")
    sys.path.insert(0, str(a.ml_service))
    from app.services import k4aa  # noqa: E402

    async def referenties(_run_blocking):
        return R, codes, 0

    k4aa._reference_matrix = referenties  # lokaal, in dit proces; de module zelf blijft ongewijzigd

    def bewaar():
        bevries.schrijf_run(uit, run)
        meta_pad.write_text(json.dumps(meta, indent=1))

    try:
        openrouter.Client(k4aa.MODEL, "beoordelaar").zdr_proef(a.zdr_logo.read_bytes())  # vóór het eerste klantetiket
        draai(k4aa, lijst, run, meta, bewaker, budget, bewaar)
    except openrouter.RunStop as e:
        run.update(status="afgebroken", reden=e.reden)
        bewaar()
        print(f"run afgebroken: {e.reden}", file=sys.stderr)
        return 3
    run["status"] = "voltooid"
    bewaar()
    print(len(run["etiketten"]), "etiketten; referentieset", refset[:12], f"({len(ids)} referenties)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
