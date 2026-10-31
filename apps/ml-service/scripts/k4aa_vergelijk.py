"""Local comparison and memory check for the K4-aa route (spec-logo-scan-k4aa CAP-8).

Not production code. Runs on the developer machine against the spike measurement set
(~/logo-meetset-20261018/ontwikkelmeting-20261028); writes only outside the repository
(<meetset>/k4aa-bouw/). The provider key comes from the environment only
(GHS_REVIEW_API_KEY or OPENROUTER_KEY) and is never printed or written.

  K4AA_SIGLIP_PATH=<dir> python scripts/k4aa_vergelijk.py poort     # (a) gate on spike K1a boxes
  K4AA_SIGLIP_PATH=<dir> python scripts/k4aa_vergelijk.py route     # (b) full route (paid calls)
  K4AA_SIGLIP_PATH=<dir> python scripts/k4aa_vergelijk.py geheugen  # RSS: B0 + SigLIP + 64 crops

(a) passes when every keep/drop decision equals ruw/k2a-op-k1a/run1, except at a cosine
tie (<= 1e-5) on the top-3 border. (b) passes when >= 90% of the reports match in both
directions (same code, IoU >= 0.5) against spike K4-aa run 1. Memory passes when
4 x RSS <= 7 GB.
"""

import asyncio
import hashlib
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ML = Path(__file__).resolve().parents[1]
REPO = ML.parents[1]
sys.path.insert(0, str(ML))
os.environ.setdefault("MODEL_PATH", "/tmp/k4aa-models")
Image.MAX_IMAGE_PIXELS = (
    None  # local measurement set only (spike fb_embed did the same)
)

BASE = Path.home() / "logo-meetset-20261018/ontwikkelmeting-20261028"
FASEB = BASE / "fase-b"
SNAP = FASEB / "momentopname"
OUT = BASE / "k4aa-bouw"
SPIKE = (
    REPO
    / "_bmad-output/planning-artifacts/spike-architectuurkeuze-logoherkenning/fase-b"
)
N = 20
TIE = 1e-5


def labels():
    return json.loads((BASE / "voorlopige-selectie.json").read_text())["etiketten"][:N]


def read_label(e):
    data = Path(e["bestand"]).read_bytes()
    if hashlib.sha256(data).hexdigest() != e["beeld_sha256"]:
        raise SystemExit(f"sha256 differs for {e['kaart']}")
    return data


def spike(kind, kaart):
    p = FASEB / "ruw" / kind / "run1" / f"{kaart}.json"
    return json.loads(p.read_text()) if p.exists() else None


def snapshot():
    """Spike snapshot of the 540 active references with their SigLIP 2 embeddings."""
    from app.symbol_contract import normalize_code

    refs = json.loads((SNAP / "actieve-refs.json").read_text())
    z = np.load(SNAP / "embeddings.npz")
    idx = {p: i for i, p in enumerate(z["pad"])}
    R = z["siglip"][[idx[r["path"]] for r in refs]].astype(np.float32)
    return R, [normalize_code(r["code"]) for r in refs]


def write(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1))
    print("written:", OUT / name)


def poort():
    from app.services import k4aa

    R, codes = snapshot()
    emb = k4aa.get_embedder()
    same = differ = ties = 0
    rows = []
    for e in labels():
        k1, k2 = spike("k1a", e["kaart"]), spike("k2a-op-k1a", e["kaart"])
        if not k1 or k1["status"] != "ok" or not k2 or k2["status"] != "ok":
            rows.append({"kaart": e["kaart"], "status": "spike niet ok"})
            continue
        im = k4aa._rgb(Image.open(e["bestand"]))
        W, H = im.size
        for m, p in zip(k1["meldingen"], k2["vakken"]):
            v = m["vak"]
            if m.get("code") not in k4aa.TOP15 or not v:
                continue
            spike_keep = m["code"] in list(dict.fromkeys(c for c, _ in p["top"]))[:3]
            if min(v[2], W) - max(v[0], 0) >= 1 and min(v[3], H) - max(v[1], 0) >= 1:
                crop = im.crop((max(0, round(v[0])), max(0, round(v[1])),
                                min(W, round(v[2])), min(H, round(v[3]))))  # fmt: skip
                top4 = k4aa.top_codes(emb.embed([crop]), R, codes, k=4)[0]
            else:
                top4 = []
            keep = m["code"] in [c for c, _ in top4[:3]]
            tie = len(top4) == 4 and abs(top4[2][1] - top4[3][1]) <= TIE
            if keep == spike_keep:
                same += 1
            elif tie:
                ties += 1
            else:
                differ += 1
            rows.append(
                {"kaart": e["kaart"], "code": m["code"], "orde": [m["venster"], m["volgorde"]],
                 "bouw": keep, "spike": spike_keep, "gelijkstand": tie, "top4": top4}
            )  # fmt: skip
    summary = {"gelijk": same, "verschil": differ, "verschil_bij_gelijkstand": ties,
               "geslaagd": differ == 0}  # fmt: skip
    write("poort.json", {"samenvatting": summary, "meldingen": rows})
    print(summary)
    return summary["geslaagd"]


def _box(d):
    b = d["bbox"]
    return [b["x"], b["y"], b["x"] + b["width"], b["y"] + b["height"]]


def _matched(a, b, iou):
    """Share of ``a`` with a same-code partner in ``b`` at IoU >= 0.5."""
    hit = sum(
        any(x["code"] == y["code"] and iou(x["vak"], y["vak"]) >= 0.5 for y in b)
        for x in a
    )
    return hit, len(a)


def route():
    sys.path.insert(0, str(SPIKE))
    import tel

    from app.core.config import settings
    from app.services import k4aa

    key = os.environ.get("GHS_REVIEW_API_KEY") or os.environ.get("OPENROUTER_KEY")
    if not key:
        raise SystemExit(
            "GHS_REVIEW_API_KEY or OPENROUTER_KEY must be set (environment only)"
        )
    settings.GHS_REVIEW_BASE_URL = k4aa.OPENROUTER
    settings.GHS_REVIEW_API_KEY = type(settings.GHS_REVIEW_API_KEY)(key)
    R, codes = snapshot()

    async def snapshot_matrix(_run):
        return R, codes, 0

    k4aa._reference_matrix = (
        snapshot_matrix  # the spike snapshot votes, not the database
    )
    rows, ours_all, theirs_all = [], 0, 0
    hit_ours = hit_theirs = 0
    costs = []
    for e in labels():
        theirs = tel.lees_k4(spike("k1a", e["kaart"]), spike("k2a-op-k1a", e["kaart"]))
        theirs = (
            [m for m in tel.samenvoegen(theirs["meldingen"]) if m["vak"]]
            if theirs["ok"]
            else None
        )
        t0 = time.monotonic()
        deadline = t0 + 165
        try:
            out = asyncio.run(
                k4aa.scan(read_label(e), lambda: deadline - time.monotonic())
            )
        except k4aa.K4aaError as exc:
            rows.append({"kaart": e["kaart"], "fout": exc.klasse})
            continue
        ours = [{"code": d["t3777_code"], "vak": _box(d)} for d in out["detections"]]
        row = {"kaart": e["kaart"], "sec": round(time.monotonic() - t0, 2), "stats": out["stats"],
               "bouw": ours, "spike": theirs}  # fmt: skip
        if theirs is not None:
            a, n = _matched(ours, theirs, tel.iou)
            b, m = _matched(theirs, ours, tel.iou)
            hit_ours, ours_all, hit_theirs, theirs_all = (
                hit_ours + a,
                ours_all + n,
                hit_theirs + b,
                theirs_all + m,
            )
        costs.append(out["stats"]["cost_usd"])
        rows.append(row)
    known = [c for c in costs if c is not None]
    summary = {
        "bouw_in_spike": [hit_ours, ours_all],
        "spike_in_bouw": [hit_theirs, theirs_all],
        "kosten_usd_totaal": round(sum(known), 6) if known else None,
        "kosten_onbekend": len(costs) - len(known),
        "geslaagd": ours_all > 0 and theirs_all > 0
        and hit_ours / ours_all >= 0.9 and hit_theirs / theirs_all >= 0.9,
        "mislukt": [r["kaart"] for r in rows if "fout" in r],
    }  # fmt: skip
    write("route.json", {"samenvatting": summary, "etiketten": rows})
    print(summary)
    return summary["geslaagd"]


def geheugen():
    import psutil

    from app.ml.model_manager import model_manager
    from app.services import k4aa

    proc = psutil.Process()
    mb = {"start": proc.memory_info().rss / 2**20}
    asyncio.run(model_manager.load_models())  # B0 as the ml-service lifespan loads it
    mb["na_b0"] = proc.memory_info().rss / 2**20
    emb = k4aa.get_embedder()
    mb["na_siglip"] = proc.memory_info().rss / 2**20
    im = k4aa._rgb(Image.open(labels()[0]["bestand"]))
    rng = np.random.default_rng(0)
    crops = []
    for _ in range(64):  # 64 crops, the per-scan maximum
        w, h = int(rng.integers(60, 600)), int(rng.integers(60, 600))
        x, y = int(rng.integers(0, max(1, im.width - w))), int(
            rng.integers(0, max(1, im.height - h))
        )
        crops.append(im.crop((x, y, x + w, y + h)))
    for b in range(0, 64, k4aa.EMBED_BATCH):
        emb.embed(crops[b : b + k4aa.EMBED_BATCH])
    mb["na_scan_64"] = proc.memory_info().rss / 2**20
    import resource

    mb["piek"] = (
        resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**20
    )  # macOS: bytes
    mb = {k: round(v) for k, v in mb.items()}
    summary = {"rss_mb": mb, "vier_werkers_gb": round(4 * mb["na_scan_64"] / 1024, 2),
               "norm_gb": 7, "geslaagd": 4 * mb["na_scan_64"] / 1024 <= 7}  # fmt: skip
    write("geheugen.json", summary)
    print(summary)
    return summary["geslaagd"]


if __name__ == "__main__":
    steps = {"poort": poort, "route": route, "geheugen": geheugen}
    wanted = sys.argv[1:] or ["poort", "geheugen"]
    results = {name: steps[name]() for name in wanted}
    sys.exit(0 if all(results.values()) else 1)
