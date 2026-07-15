"""Volledige-artwork-test van de A1 balk-detector (read-only).

Voor alle GTINs in de declaratie-map (142, letters A-E): laad de artwork-pagina,
draai read_nutriscore(full_page=True) en vergelijk met de gedeclareerde letter.
Rapporteert totaal + per-letter + held-out (GTIN is geen referentie-bron).
"""
import asyncio, json, re, sys, time
import cv2
import numpy as np

sys.path.insert(0, "/tmp")
from ns_band_detector import read_nutriscore  # noqa: E402


def pick_page(ks):
    ks = sorted(k for k in ks if k.lower().endswith((".png", ".jpg", ".jpeg")))
    for k in ks:
        if "converted-0" in k:
            return k
    for k in ks:
        if re.search(r"_0*1\.(png|jpe?g)$", k, re.I):
            return k
    return ks[0] if ks else None


async def main():
    from app.services.database import db_service
    from app.services.storage import storage_service

    storage_service.connect()
    await db_service.connect()

    raw = storage_service.get_training_image("flywheel-index/nutriscore-declared-map.json")
    entries = json.loads(raw.decode())["entries"]

    async with db_service.pool.acquire() as c:
        rows = await c.fetch(
            "SELECT storage_path FROM reference_logos WHERE t3777_code LIKE 'NUTRISCORE\\_%' AND active=true AND storage_path IS NOT NULL"
        )
    ref_gtins = set()
    for r in rows:
        p = (r["storage_path"] or "").split("/")
        if len(p) > 1:
            ref_gtins.add(p[1])

    keys = [k for k in storage_service.list_training_images(prefix="artwork/") if k.lower().endswith((".png", ".jpg", ".jpeg"))]
    by_gtin = {}
    for k in keys:
        p = k.split("/")
        if len(p) > 2:
            by_gtin.setdefault(p[1], []).append(k)

    gtins = sorted(g for g in entries if g in by_gtin)
    t0 = time.perf_counter()
    per = {"ok": 0, "wrong": 0, "none": 0}
    per_letter = {}
    heldout = {"ok": 0, "wrong": 0, "none": 0, "tot": 0}
    wrongs, nones = [], []
    times = []
    for i, g in enumerate(gtins):
        L = entries[g]
        src = pick_page(by_gtin[g])
        try:
            data = storage_service.get_training_image(src)
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        except Exception:
            img = None
        pl = per_letter.setdefault(L, {"ok": 0, "wrong": 0, "none": 0})
        ho = g not in ref_gtins
        if ho:
            heldout["tot"] += 1
        if img is None:
            per["none"] += 1; pl["none"] += 1
            if ho: heldout["none"] += 1
            nones.append((g, L, "laad-fout"))
            continue
        t1 = time.perf_counter()
        letter, info = read_nutriscore(img, full_page=True)
        times.append(time.perf_counter() - t1)
        if letter is None:
            per["none"] += 1; pl["none"] += 1
            if ho: heldout["none"] += 1
            nones.append((g, L, info.get("reason", "")[:60]))
        elif letter == L:
            per["ok"] += 1; pl["ok"] += 1
            if ho: heldout["ok"] += 1
        else:
            per["wrong"] += 1; pl["wrong"] += 1
            if ho: heldout["wrong"] += 1
            wrongs.append((g, L, letter, info.get("ratio"), info.get("rotatie")))
        if (i + 1) % 20 == 0:
            print(f"[{i+1}/{len(gtins)}] ok={per['ok']} wrong={per['wrong']} none={per['none']}", flush=True)

    out = {
        "total_gtins": len(gtins),
        "result": per,
        "per_letter": per_letter,
        "heldout": heldout,
        "wrong_cases": wrongs,
        "none_cases": nones[:30],
        "median_seconds_per_page": round(float(np.median(times)), 2) if times else None,
        "total_seconds": round(time.perf_counter() - t0, 1),
    }
    print("RESULT_JSON " + json.dumps(out))


if __name__ == "__main__":
    asyncio.run(main())
