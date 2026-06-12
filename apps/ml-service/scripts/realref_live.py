#!/usr/bin/env python3
"""
Story 12.3 — real-crop references, LIVE on the production reference library.

Adds confirmed real crops (active=true training_data) as reference_logos +
reference_embeddings ALONGSIDE the guide logos (POC condition C), through the
SAME production path the live detector uses (db_service.find_similar_references).
Every row this script inserts is tagged source='realref-live-poc' so it is
exactly reversible. The existing guide references (the 146 vectors) are NEVER
touched or cleared — this only INSERTs.

Subcommands:
  measure  --verdict V   leave-one-GTIN-out, THROUGH THE LIVE pgvector PATH:
                         1. measure guide-only top-1 on held-out crops (current DB)
                         2. add real-crop refs for the NON-held-out crops
                         3. measure +real-refs top-1 on the SAME held-out crops
                         4. REVERT (delete what it added) -> DB unchanged after
                         => the honest production delta, leak-free.
  deploy   --verdict V   add ALL real crops as references and KEEP them
                         (production change; reversible via `revert`).
  revert                 delete every row tagged source='realref-live-poc'.
  status                 count tagged rows currently live.

Usage (container):
  python3 realref_live.py measure --verdict /tmp/verdict-78.json --out /tmp/realref-live.json
  python3 realref_live.py deploy  --verdict /tmp/verdict-78.json
  python3 realref_live.py revert
"""
from __future__ import annotations
import argparse, asyncio, io, json, os, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

TAG = "realref-live-poc"


def _gtin_of(crop_path: str) -> str:
    parts = crop_path.split("/")
    return parts[1] if len(parts) > 1 else crop_path


async def _ensure_model():
    from app.ml.model_manager import model_manager
    if not model_manager.is_loaded:
        await model_manager.load_models()
    return model_manager


async def _add_ref(conn, model_manager, storage_service, label: str, crop_path: str, tag_suffix: str) -> bool:
    """Insert one tagged reference_logos row + its embedding. Returns True on success."""
    try:
        data = storage_service.get_training_image(crop_path)
        im = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:
        print("  add skip (load)", crop_path, str(exc)[:50], file=sys.stderr)
        return False
    emb = await model_manager.generate_embedding(im)
    row = await conn.fetchrow(
        """
        INSERT INTO reference_logos (t3777_code, variant_label, storage_path, source, active)
        VALUES ($1, $2, $3, $4, true)
        RETURNING id
        """,
        label, f"real-crop:{tag_suffix}", crop_path, TAG,
    )
    logo_id = str(row["id"])
    await conn.execute(
        "INSERT INTO reference_embeddings (reference_logo_id, embedding, created_at) VALUES ($1, $2, NOW())",
        logo_id, str(np.asarray(emb, dtype=np.float32).tolist()),
    )
    return True


async def _revert(conn) -> int:
    await conn.execute(
        "DELETE FROM reference_embeddings WHERE reference_logo_id IN "
        "(SELECT id FROM reference_logos WHERE source = $1)", TAG)
    res = await conn.execute("DELETE FROM reference_logos WHERE source = $1", TAG)
    try:
        return int(res.split()[-1])
    except (ValueError, IndexError):
        return 0


async def _top1(model_manager, db_service, crop_path: str) -> Optional[str]:
    from app.services.storage import storage_service
    data = storage_service.get_training_image(crop_path)
    im = Image.open(io.BytesIO(data)).convert("RGB")
    emb = np.asarray(await model_manager.generate_embedding(im), dtype=np.float32)
    hits = await db_service.find_similar_references(embedding=emb, limit=1, threshold=0.0)
    return hits[0]["t3777_code"] if hits else None


async def cmd_measure(verdict_path: str, out_path: Optional[str]) -> int:
    from app.services.database import db_service
    from app.services.storage import storage_service
    model_manager = await _ensure_model()

    verdict = json.load(open(verdict_path))
    by_class: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    for row in verdict:
        by_class[row["label"]].append({"gtin": _gtin_of(row["crop_path"]), "crop_path": row["crop_path"]})

    # leave-one-GTIN-out: hold out the lexicographically-largest GTIN per class
    # that has >=2 GTINs. Held-out crops = queries; the rest become real refs.
    held_queries: List[Dict[str, str]] = []
    ref_crops: List[Dict[str, str]] = []
    eval_classes: List[str] = []
    for c, items in by_class.items():
        gtins = sorted({it["gtin"] for it in items})
        if len(gtins) < 2:
            continue
        hold = gtins[-1]
        eval_classes.append(c)
        for it in items:
            (held_queries if it["gtin"] == hold else ref_crops).append({"label": c, **it})
    print(f"eval classes={len(eval_classes)} held-out queries={len(held_queries)} ref crops={len(ref_crops)}", file=sys.stderr)

    async with db_service.get_connection() as conn:
        # clean any leftover tagged rows first
        await _revert(conn)

    # --- BEFORE: guide-only top-1 on held-out queries (current live DB) -------
    def score(preds: List[Optional[str]], labels: List[str]) -> Dict[str, float]:
        per_ok: Dict[str, int] = defaultdict(int); per_n: Dict[str, int] = defaultdict(int)
        for p, c in zip(preds, labels):
            per_n[c] += 1; per_ok[c] += int(p == c)
        tot = sum(per_n.values()); ok = sum(per_ok.values())
        micro = ok / max(1, tot)
        macro = float(np.mean([per_ok[c] / per_n[c] for c in per_n])) if per_n else 0.0
        return {"micro": round(micro, 4), "macro": round(macro, 4),
                "per_class": {c: round(per_ok[c] / per_n[c], 3) for c in sorted(per_n)}}

    labels = [q["label"] for q in held_queries]
    before = score([await _top1(model_manager, db_service, q["crop_path"]) for q in held_queries], labels)

    # --- ADD real refs (non-held-out crops), tagged ---------------------------
    added = 0
    async with db_service.get_connection() as conn:
        for i, rc in enumerate(ref_crops):
            if await _add_ref(conn, model_manager, storage_service, rc["label"], rc["crop_path"], f"m{i}"):
                added += 1
    print(f"added {added} real-crop refs (tagged {TAG})", file=sys.stderr)

    # --- AFTER: same held-out queries, now with real refs present -------------
    after = score([await _top1(model_manager, db_service, q["crop_path"]) for q in held_queries], labels)

    # --- REVERT so production is unchanged by `measure` -----------------------
    async with db_service.get_connection() as conn:
        removed = await _revert(conn)
    print(f"reverted {removed} tagged rows (DB unchanged after measure)", file=sys.stderr)

    out = {
        "mode": "measure", "note": "leave-one-GTIN-out via LIVE pgvector; DB reverted after",
        "eval_classes": sorted(eval_classes), "held_out_queries": len(held_queries),
        "real_refs_added_then_removed": added,
        "guide_only": {"micro": before["micro"], "macro": before["macro"]},
        "with_real_refs": {"micro": after["micro"], "macro": after["macro"]},
        "delta_micro": round(after["micro"] - before["micro"], 4),
        "delta_macro": round(after["macro"] - before["macro"], 4),
        "per_class_before": before["per_class"],
        "per_class_after": after["per_class"],
    }
    print(json.dumps(out, indent=2))
    if out_path:
        json.dump(out, open(out_path, "w"), indent=2)
        print(f"\nWrote {out_path}", file=sys.stderr)
    return 0


async def cmd_deploy(verdict_path: str) -> int:
    from app.services.database import db_service
    from app.services.storage import storage_service
    model_manager = await _ensure_model()
    verdict = json.load(open(verdict_path))
    added = 0
    async with db_service.get_connection() as conn:
        await _revert(conn)  # idempotent: clear prior tagged rows first
        for i, row in enumerate(verdict):
            if await _add_ref(conn, model_manager, storage_service, row["label"], row["crop_path"], f"d{i}"):
                added += 1
    print(json.dumps({"mode": "deploy", "real_refs_added": added, "tag": TAG}, indent=2))
    return 0


async def cmd_revert() -> int:
    from app.services.database import db_service
    async with db_service.get_connection() as conn:
        removed = await _revert(conn)
    print(json.dumps({"mode": "revert", "rows_removed": removed, "tag": TAG}, indent=2))
    return 0


async def cmd_status() -> int:
    from app.services.database import db_service
    async with db_service.get_connection() as conn:
        n = await conn.fetchval("SELECT COUNT(*) FROM reference_logos WHERE source = $1", TAG)
        tot = await conn.fetchval("SELECT COUNT(*) FROM reference_logos WHERE active = true")
        emb = await conn.fetchval("SELECT COUNT(*) FROM reference_embeddings")
    print(json.dumps({"tagged_real_refs": n, "active_reference_logos": tot, "reference_embeddings": emb}, indent=2))
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("measure"); m.add_argument("--verdict", required=True); m.add_argument("--out", default=None)
    d = sub.add_parser("deploy"); d.add_argument("--verdict", required=True)
    sub.add_parser("revert")
    sub.add_parser("status")
    args = ap.parse_args()
    if args.cmd == "measure":
        sys.exit(asyncio.run(cmd_measure(args.verdict, args.out)))
    elif args.cmd == "deploy":
        sys.exit(asyncio.run(cmd_deploy(args.verdict)))
    elif args.cmd == "revert":
        sys.exit(asyncio.run(cmd_revert()))
    elif args.cmd == "status":
        sys.exit(asyncio.run(cmd_status()))


if __name__ == "__main__":
    main()
