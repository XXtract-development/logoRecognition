"""Optie A — composieten regenereren met schone ground truth (akkoord Friso 2026-06-06).

EENMALIG UITGEVOERD op ACC (2026-06-06) als reparatie van het fase-B-ground-truth-
incident (zie 8-3R-meetrapport.md §1). Gecommit voor reproduceerbaarheid van de
AC4-gate-keten (adversarial-review MITS-1): regeneratie + remeasure_localization.py
vormen samen de falsifieerbare meting. NIET draaien zonder expliciete toestemming
(muteert artwork_review_items + MinIO-bronbestanden).

Mutaties (limitatief): UPDATE artwork_review_items (bbox, crop_path) van de 9 items;
MinIO: overwrite van de 3 source_file-objecten; 9 nieuwe crop-objecten.
Labels en (x,y)-posities blijven; bbox-afmetingen worden AR-correct voor het label.
"""
import asyncio, asyncpg, os, json, sys
import numpy as np, cv2
import importlib.util
import app.services
spec = importlib.util.spec_from_file_location("app.services.localization", "/tmp/eight3r/localization.py")
loc = importlib.util.module_from_spec(spec); sys.modules["app.services.localization"] = loc; spec.loader.exec_module(loc)
from app.services.storage import storage_service

async def main():
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    refs = await conn.fetch("SELECT t3777_code, storage_path FROM reference_logos WHERE active = true")
    ref_imgs = {r["t3777_code"]: cv2.imdecode(np.frombuffer(storage_service.get_training_image(r["storage_path"]), np.uint8), cv2.IMREAD_UNCHANGED) for r in refs}
    items = await conn.fetch("SELECT id, gtin, t3777_code, bbox, source_file, crop_path FROM artwork_review_items ORDER BY source_file, created_at")

    by_source = {}
    for it in items:
        by_source.setdefault(it["source_file"], []).append(it)

    for source_file, its in sorted(by_source.items()):
        data = storage_service.get_training_image(source_file)
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        H, W = img.shape[:2]
        print(f"== {source_file} ({W}x{H}) — {len(its)} plants ==")
        for i, it in enumerate(its):
            b = it["bbox"] if isinstance(it["bbox"], dict) else json.loads(it["bbox"])
            code = it["t3777_code"]
            ref = ref_imgs[code]
            rh, rw = ref.shape[:2]
            max_dim = max(b["width"], b["height"])
            f = max_dim / max(rh, rw)
            nw, nh = max(1, round(rw * f)), max(1, round(rh * f))
            # clamp binnen beeld
            x, y = b["x"], b["y"]
            nw, nh = min(nw, W - x), min(nh, H - y)
            scaled = cv2.resize(ref, (nw, nh), interpolation=cv2.INTER_AREA)
            region = img[y:y+nh, x:x+nw].astype(np.float32)
            if scaled.ndim == 3 and scaled.shape[2] == 4:
                a = scaled[:, :, 3:4].astype(np.float32) / 255.0
                img[y:y+nh, x:x+nw] = (scaled[:, :, :3].astype(np.float32) * a + region * (1 - a)).astype(np.uint8)
            else:
                img[y:y+nh, x:x+nw] = scaled[:, :, :3] if scaled.ndim == 3 else cv2.cvtColor(scaled, cv2.COLOR_GRAY2BGR)
            crop = img[y:y+nh, x:x+nw]
            crop_key = f"artwork-crops/{it['gtin']}/83r-{it['id'].hex[:12] if hasattr(it['id'],'hex') else str(it['id'])[:12]}.png"
            ok, buf = cv2.imencode(".png", crop)
            storage_service.put_training_image(crop_key, buf.tobytes(), content_type="image/png")
            new_bbox = json.dumps({"x": x, "y": y, "width": int(nw), "height": int(nh)})
            await conn.execute("UPDATE artwork_review_items SET bbox = $1::jsonb, crop_path = $2, updated_at = now() WHERE id = $3", new_bbox, crop_key, it["id"])
            print(f"  {str(it['id'])[:8]} {code[:28]:28s} ({x},{y}) {b['width']}x{b['height']} -> {nw}x{nh} crop={crop_key}")
        ok, buf = cv2.imencode(".png", img)
        storage_service.put_training_image(source_file, buf.tobytes(), content_type="image/png")
        print(f"  bron overschreven: {source_file}")
    await conn.close()
    print("KLAAR — 9 items geregenereerd")

asyncio.run(main())
