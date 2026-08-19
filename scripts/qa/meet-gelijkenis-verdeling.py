#!/usr/bin/env python3
"""Read-only meting: de beste gelijkenis per gold-set-uitsnede, ongeaggregeerd.

WAAROM DIT SCRIPT BESTAAT
De nulmeting van 2026-07-27 leverde alleen geaggregeerde percentages per drempel op;
het script erachter is niet bewaard. Daardoor kon niemand nagaan HOE VER de missers
naast een referentie zaten — precies de vraag die bepaalt of een drempel-/kalibratiefix
werkt of dat het een representatieprobleem is.

WAT HET DOET
Roept de bestaande, aantoonbaar read-only poortmeting aan (POST /ml/regression-eval,
zie apps/ml-service/app/api/flywheel.py: leest referentie-embeddings, embedt de
uitsneden stateless, schrijft niets) en bewaart de RUWE per-sample-uitkomsten,
inclusief `topSimilarity`.

De drempel in het verzoek staat daarom op 0.0: `topSimilarity` is drempel-ONAFHANKELIJK,
alleen de vlaggen `recognized`/`correct` hangen ervan af. Eén run levert zo de hele
drempelcurve, offline te berekenen uit de bewaarde JSON — geen tweede embed-ronde nodig.

De self-match-guard (leave-one-out op inhouds-hash én cropPath) zit in de poortfunctie
zelf en blijft dus actief; zonder die guard loopt elke score kunstmatig richting 1,0.

GEBRUIK (in de ml-service-container, waar de referenties en de uitsneden bereikbaar zijn)
    /opt/venv/bin/python meet-gelijkenis-verdeling.py --uit /tmp/gelijkenis-samples.json

Uitsluitend SELECT + één POST naar de meet-endpoint. Geen enkele schrijfactie.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_ML_URL = "http://localhost:8011/ml/regression-eval"

GOLD_SET_QUERY = """
    SELECT id::text AS id, crop_path, label, t3777_code, evidence
    FROM gold_set_records
    WHERE replaced_by_id IS NULL
      AND crop_path IS NOT NULL
    ORDER BY created_at DESC
"""


def _normaliseer_dsn(dsn: str) -> str:
    """Maak een Prisma-/SQLAlchemy-DSN geschikt voor asyncpg.

    Prisma hangt `?schema=public&connection_limit=...` achter de URL en SQLAlchemy
    gebruikt een `+driver`-suffix; asyncpg accepteert geen van beide.
    """
    for prefix, vervanging in (
        ("postgresql+asyncpg://", "postgresql://"),
        ("postgresql+psycopg2://", "postgresql://"),
        ("postgres+asyncpg://", "postgresql://"),
    ):
        if dsn.startswith(prefix):
            dsn = vervanging + dsn[len(prefix) :]
    return dsn.split("?", 1)[0]


async def lees_gold_set() -> list[dict]:
    """De ACTIEVE gold-set op uitsnede-niveau — dezelfde definitie als de poort.

    Spiegelt `getActiveGoldSet({cropOnly: true})` uit
    apps/api/src/services/flywheel/gold-set.ts: `replaced_by_id IS NULL` (actief) en
    `crop_path IS NOT NULL` (meetbaar). Wijkt die query daar ooit af, dan wijkt deze
    meting af — dat is bewust één plek om te controleren.
    """
    import asyncpg  # in de ml-service-image aanwezig (/opt/venv)

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL ontbreekt — draai dit script in de ml-service-container.")

    conn = await asyncpg.connect(_normaliseer_dsn(dsn))
    try:
        rijen = await conn.fetch(GOLD_SET_QUERY)
    finally:
        await conn.close()

    payload: list[dict] = []
    zonder_hash = 0
    for r in rijen:
        evidence = r["evidence"]
        if isinstance(evidence, str):
            try:
                evidence = json.loads(evidence)
            except json.JSONDecodeError:
                evidence = {}
        inhouds_hash = evidence.get("contentHash") if isinstance(evidence, dict) else None
        if not isinstance(inhouds_hash, str):
            inhouds_hash = None
            zonder_hash += 1
        payload.append(
            {
                "id": r["id"],
                "crop_path": r["crop_path"],
                "label": r["label"],
                "t3777_code": r["t3777_code"],
                "content_hash": inhouds_hash,
            }
        )

    print(f"gold-set (actief, met uitsnede): {len(payload)} records", file=sys.stderr)
    print(f"  waarvan zonder inhouds-hash:   {zonder_hash}", file=sys.stderr)
    return payload


def meet(payload: list[dict], ml_url: str, timeout: int) -> dict:
    """POST naar de read-only poortmeting. Drempel 0.0: zie de module-docstring."""
    verzoek = json.dumps(
        {
            "gold_set": payload,
            "shadow_candidates": [],
            "threshold": 0.0,
            "include_shadow": False,
        }
    ).encode()

    req = urllib.request.Request(
        ml_url,
        data=verzoek,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    print(f"meten via {ml_url} ({len(payload)} uitsneden embedden, dit duurt even)...", file=sys.stderr)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        # 422 = fail-closed uit de meting zelf (lege gold-set of een crop die niet
        # laadt). Toon het antwoord: dat noemt de exacte cropPath.
        raise SystemExit(f"meting faalde ({exc.code}): {exc.read().decode()[:600]}") from exc


def samenvatting(samples: list[dict]) -> None:
    """Korte controle-uitdraai; de echte analyse gebeurt op het JSON-bestand."""
    per_label: dict[str, list[float]] = {}
    for s in samples:
        per_label.setdefault(s.get("label", "?"), []).append(float(s["topSimilarity"]))

    print("\nteller/noemer per label en drempel (uit dezelfde run):", file=sys.stderr)
    drempels = (0.60, 0.70, 0.75, 0.80, 0.85, 0.90)
    for label, scores in sorted(per_label.items()):
        print(f"  {label}: n={len(scores)}", file=sys.stderr)
        for d in drempels:
            haalt = sum(1 for x in scores if x >= d)
            print(
                f"    >= {d:.2f}: {haalt}/{len(scores)}"
                f" ({100.0 * haalt / len(scores):.1f}%)",
                file=sys.stderr,
            )
        geen_match = sum(1 for x in scores if x < 0)
        if geen_match:
            print(
                f"    LET OP: {geen_match}/{len(scores)} hebben GEEN enkele vergelijkbare"
                " referentie (score -1) — dat is dekking, geen drempel.",
                file=sys.stderr,
            )


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--uit", required=True, help="pad voor de ruwe per-sample-JSON")
    p.add_argument("--ml-url", default=os.environ.get("MEET_ML_URL", DEFAULT_ML_URL))
    p.add_argument("--timeout", type=int, default=1800, help="seconden (580 uitsneden embedden duurt)")
    args = p.parse_args()

    payload = asyncio.run(lees_gold_set())
    resultaat = meet(payload, args.ml_url, args.timeout)
    samples = resultaat.get("samples", [])

    with open(args.uit, "w", encoding="utf-8") as fh:
        json.dump(
            {
                "gemeten_met": args.ml_url,
                "aantal_uitsneden": len(payload),
                "let_op": (
                    "threshold in het verzoek stond op 0.0; topSimilarity is"
                    " drempel-onafhankelijk, dus recognized/correct in deze samples zijn"
                    " NIET de live-uitkomst. Bereken elke drempel uit topSimilarity."
                ),
                "samples": samples,
            },
            fh,
            indent=1,
        )

    print(f"\n{len(samples)} samples bewaard in {args.uit}", file=sys.stderr)
    samenvatting(samples)


if __name__ == "__main__":
    main()
