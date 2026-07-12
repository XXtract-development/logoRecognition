"""Story 19.13 — herstel de dode RECYCLABLE-referenties.

Achtergrond (ACC-diagnose 2026-07-11): `RECYCLABLE_GENERAL_CLAIM` heeft 26
real-crop-referenties (``source='realref-live-poc'``, aangemaakt door de 12.3-POC)
die op enig moment `active=false` zijn gezet ÉN hun embedding kwijtraakten. Alleen
de zwakke ``gs1-guide``-plaat is nog actief, waardoor echte recycle-crops als
FAIRTRADE/EU_ORGANIC worden geclassificeerd. Dit script herstelt die 26 refs naar
hun oorspronkelijke, werkende staat.

Beleid (AC 2): **alle** dode refs worden hersteld (geen dedup) — dit herstelt de
staat die de POC bewijsbaar naar top-1 100% bracht. De 22 near-duplicaten uit één
GTIN zijn onschadelijk voor herkenning (elke RECYCLABLE-query matcht er één op
~1,0; precisie is post-herstel spot-gecheckt); dedup is een mogelijke latere
optimalisatie.

Per ref: laad de crop uit MinIO (``storage_path``) en genereer de embedding
**buiten** de transactie (de trage stappen houden geen pooled connectie in een
open transactie vast, command_timeout=60s). Alleen de twee writes (insert +
activeren) draaien in een korte per-ref transactie met een ``FOR UPDATE``-lock op
de ref-rij (serialiseert een onbedoelde parallelle run). Ná de inserts wordt de
ivfflat-index ge-REINDEX't zodat de nieuwe vectoren ook via de index vindbaar zijn
(niet alleen via de 19.14-probes-verhoging).

**Idempotent:** een ref die al een embedding heeft ÉN actief is wordt overgeslagen;
herdraaien verandert niets. Niet-laadbare crops en embedding-fouten worden per ref
overgeslagen mét telling (één kapotte crop breekt de run niet af, geen halve staat).

Gebruik::

    python -m scripts.restore_recyclable_refs            # DRY-RUN (geen writes)
    python -m scripts.restore_recyclable_refs --apply     # voer de writes uit

Exit-code: 0 bij succes; 1 als er dode refs waren maar er niets is hersteld (bv.
MinIO onbereikbaar) — zodat een geautomatiseerde aanroeper de mislukking ziet. De
writes raken uitsluitend de RECYCLABLE-``realref-live-poc``-rijen; NOOIT een andere
code. ACC-schrijf alleen met expliciete toestemming.
"""

import argparse
import asyncio
import io
import sys
from typing import Union

import numpy as np
from PIL import Image

from app.core.config import settings

T3777_CODE = "RECYCLABLE_GENERAL_CLAIM"
SOURCE = "realref-live-poc"


async def _dead_refs(conn):
    """De te herstellen refs: doelcode + POC-bron + inactief + geen embedding."""
    return await conn.fetch(
        """
        SELECT rl.id, rl.storage_path, rl.variant_label
        FROM reference_logos rl
        LEFT JOIN reference_embeddings re ON re.reference_logo_id = rl.id
        WHERE rl.t3777_code = $1
          AND rl.source = $2
          AND rl.active = false
          AND re.id IS NULL
        ORDER BY rl.variant_label
        """,
        T3777_CODE,
        SOURCE,
    )


async def _load_and_embed(
    model_manager, storage_service, row
) -> Union[np.ndarray, str]:
    """Laad de crop + genereer de embedding — BUITEN elke DB-transactie.

    Retourneert de embedding, of een skip-reden ('skip-load' | 'skip-embed'). Zo
    breekt één kapotte crop/embedding de run niet af en houdt de trage inference
    geen open transactie vast.
    """
    crop_path = row["storage_path"]
    try:
        data = storage_service.get_training_image(crop_path)
        im = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:  # noqa: BLE001 — crop niet laadbaar → overslaan+tellen
        print(f"  skip (load): {crop_path} — {str(exc)[:60]}", file=sys.stderr)
        return "skip-load"

    try:
        emb = np.asarray(await model_manager.generate_embedding(im), dtype=np.float32)
    except Exception as exc:  # noqa: BLE001 — embedding-fout → overslaan+tellen
        print(f"  skip (embed): {crop_path} — {str(exc)[:60]}", file=sys.stderr)
        return "skip-embed"

    # Vorm-/waardecheck: verkeerde dimensie of NaN/inf zou de pgvector-INSERT laten
    # falen en de run afbreken — vang het hier als benigne skip.
    if emb.shape != (settings.EMBEDDING_DIM,) or not np.isfinite(emb).all():
        print(
            f"  skip (embed): {crop_path} — ongeldige embedding shape={emb.shape}",
            file=sys.stderr,
        )
        return "skip-embed"
    return emb


async def _write_ref(conn, ref_id, emb: np.ndarray) -> str:
    """Schrijf één ref binnen een transactie. Retourneert 'restored' | 'skip-exists'.

    De caller omhult dit met ``async with conn.transaction()``. De ``FOR UPDATE``
    op de ref-rij serialiseert een onbedoelde parallelle run; de existing-check
    binnen die lock voorkomt dubbele embedding-rijen.
    """
    await conn.execute(
        "SELECT id FROM reference_logos WHERE id = $1 FOR UPDATE", ref_id
    )
    existing = await conn.fetchval(
        "SELECT 1 FROM reference_embeddings WHERE reference_logo_id = $1 LIMIT 1",
        ref_id,
    )
    if existing:
        await conn.execute(
            "UPDATE reference_logos SET active = true WHERE id = $1", ref_id
        )
        return "skip-exists"

    await conn.execute(
        "INSERT INTO reference_embeddings (reference_logo_id, embedding, created_at) "
        "VALUES ($1, $2, NOW())",
        ref_id,
        str(emb.tolist()),
    )
    await conn.execute("UPDATE reference_logos SET active = true WHERE id = $1", ref_id)
    return "restored"


async def run(apply: bool) -> int:
    from app.ml.model_manager import model_manager
    from app.services.database import db_service
    from app.services.storage import storage_service

    if not model_manager.is_loaded:
        await model_manager.load_models()

    async with db_service.get_connection() as conn:
        dead = await _dead_refs(conn)
        print(
            f"{'APPLY' if apply else 'DRY-RUN'} — {len(dead)} dode {T3777_CODE}-refs "
            f"({SOURCE}) om te herstellen."
        )
        if not apply:
            for r in dead:
                print(f"  zou herstellen: {r['variant_label']} → {r['storage_path']}")
            print("Dry-run: geen writes. Draai met --apply om te herstellen.")
            return 0

        counts = {"restored": 0, "skip-load": 0, "skip-embed": 0, "skip-exists": 0}
        for r in dead:
            loaded = await _load_and_embed(model_manager, storage_service, r)
            if isinstance(loaded, str):  # skip-load / skip-embed
                counts[loaded] += 1
                continue
            async with conn.transaction():
                counts[await _write_ref(conn, r["id"], loaded)] += 1

        # REINDEX zodat de nieuwe vectoren ook via de ivfflat-index vindbaar zijn
        # (het rebuild-pad doet dit ook; een ivfflat-index op nieuw ingevoegde
        # rijen kan anders leunen op verouderde clustercentroïden). No-op als er
        # geen ivfflat-index is. Best-effort: mag de reeds-gecommitte refs niet
        # terugdraaien.
        if counts["restored"]:
            try:
                await db_service.reindex_reference_embeddings()
            except Exception as exc:  # noqa: BLE001
                print(
                    f"  REINDEX faalde (non-fataal): {str(exc)[:80]}", file=sys.stderr
                )

    print(
        f"Klaar — hersteld: {counts['restored']}, "
        f"al-actief/embedding: {counts['skip-exists']}, "
        f"niet-laadbaar: {counts['skip-load']}, embedding-fout: {counts['skip-embed']}."
    )
    # Non-zero exit als er werk was maar niets lukte (bv. MinIO onbereikbaar) →
    # een geautomatiseerde aanroeper mag dit niet als succes lezen.
    if dead and counts["restored"] == 0 and counts["skip-exists"] == 0:
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Herstel dode RECYCLABLE-referenties (Story 19.13)."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Voer de writes uit (zonder deze vlag: dry-run, geen writes).",
    )
    args = parser.parse_args()
    return asyncio.run(run(args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
