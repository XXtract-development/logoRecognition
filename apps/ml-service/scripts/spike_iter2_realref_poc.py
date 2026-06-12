#!/usr/bin/env python3
"""
Story 12.3 — POC: do REAL-CROP references beat GUIDE-LOGO references, on a fair
leave-one-GTIN-out split? (measurement only — NO production DB/storage mutation.)

The LOO probe (12-3-loo-probe-resultaten.md) showed real crops self-cluster in
effb0 (87% LOO) while scoring 36% against guide logos -> the fix is real-crop
references, not fine-tuning. This POC validates that with the PRODUCTION embedding
path (model_manager.generate_embedding, 512-dim) and a strict leave-one-GTIN-out
split (a query crop's whole GTIN is held out of the references), removing the
near-duplicate inflation that flattered the LOO number.

Three conditions, same query set (crops of the 12 classes with >=2 GTINs):
  A. guide-only        : query vs guide logos (1/code)         -> reproduces baseline
  B. realcrop-only     : query vs real crops from OTHER GTINs  -> pure real-ref effect
  C. realcrop + guide  : query vs (other-GTIN real crops + guide logos) -> production-like

Top-1 = nearest reference's class. Reports micro/macro for each condition.

Read-only. Usage (container):
  python3 spike_iter2_realref_poc.py --verdict /tmp/verdict-78.json --out /tmp/iter2-realref.json
"""
from __future__ import annotations
import argparse, asyncio, io, json, os, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def _gtin_of(crop_path: str) -> str:
    # artwork-crops/{gtin}/{file}.png
    parts = crop_path.split("/")
    return parts[1] if len(parts) > 1 else crop_path


def _l2(a: np.ndarray) -> np.ndarray:
    return a / (np.linalg.norm(a, axis=-1, keepdims=True) + 1e-9)


async def run(verdict_path: str, out_path: Optional[str]) -> int:
    from app.ml.model_manager import model_manager
    from app.services.storage import storage_service
    from app.services.synthesis import _load_references_by_class

    if not model_manager.is_loaded:
        await model_manager.load_models()

    def _bgr_to_pil(bgr: np.ndarray) -> Image.Image:
        return Image.fromarray(np.ascontiguousarray(bgr[:, :, ::-1].astype("uint8")))

    async def embed_pil(im: Image.Image) -> np.ndarray:
        e = await model_manager.generate_embedding(im)
        return np.asarray(e, dtype=np.float32)

    # ---- guide-logo references (1 per code), production embedding -----------
    refs_by_class = await _load_references_by_class()
    guide_codes = sorted(refs_by_class)
    guide_emb: Dict[str, np.ndarray] = {}
    for c in guide_codes:
        img = refs_by_class[c][0]["image"]
        guide_emb[c] = await embed_pil(_bgr_to_pil(img[:, :, :3]))

    # ---- real verdict crops: embed + tag with (label, gtin) -----------------
    verdict = json.load(open(verdict_path))
    crops: List[Dict[str, Any]] = []
    for row in verdict:
        try:
            data = storage_service.get_training_image(row["crop_path"])
            im = Image.open(io.BytesIO(data)).convert("RGB")
            crops.append({"label": row["label"], "gtin": _gtin_of(row["crop_path"]),
                          "emb": await embed_pil(im)})
        except Exception as exc:
            print("crop fail", row.get("crop_path"), str(exc)[:60], file=sys.stderr)

    # classes scorable under GTIN-holdout = those with >=2 distinct GTINs
    gtins_per_class: Dict[str, set] = defaultdict(set)
    for x in crops:
        gtins_per_class[x["label"]].add(x["gtin"])
    eval_classes = {c for c, gs in gtins_per_class.items() if len(gs) >= 2}

    # stacked guide refs
    G_codes = guide_codes
    G = _l2(np.stack([guide_emb[c] for c in G_codes]))

    def nearest_class(q: np.ndarray, ref_mat: np.ndarray, ref_codes: List[str]) -> Optional[str]:
        if ref_mat.shape[0] == 0:
            return None
        sims = _l2(q[None, :]) @ ref_mat.T
        return ref_codes[int(sims.argmax())]

    cond_ok: Dict[str, Dict[str, int]] = {k: defaultdict(int) for k in ("A_guide", "B_real", "C_both")}
    cond_n: Dict[str, int] = defaultdict(int)
    per_class_ok: Dict[str, Dict[str, int]] = {k: defaultdict(int) for k in ("A_guide", "B_real", "C_both")}
    per_class_n: Dict[str, int] = defaultdict(int)

    for q in crops:
        c = q["label"]
        if c not in eval_classes:
            continue
        per_class_n[c] += 1
        # leave-one-GTIN-out real refs: every crop whose GTIN differs from q's
        real_refs = [(x["label"], x["emb"]) for x in crops if x["gtin"] != q["gtin"]]
        R_codes = [lc for lc, _ in real_refs]
        R = _l2(np.stack([e for _, e in real_refs])) if real_refs else np.empty((0, q["emb"].shape[0]), np.float32)

        a = nearest_class(q["emb"], G, G_codes)
        b = nearest_class(q["emb"], R, R_codes)
        both_codes = R_codes + G_codes
        both_mat = np.concatenate([R, G], axis=0) if R.shape[0] else G
        d = nearest_class(q["emb"], both_mat, both_codes)

        for key, pred in (("A_guide", a), ("B_real", b), ("C_both", d)):
            cond_n[key] += 1
            if pred == c:
                cond_ok[key][c] += 1
                per_class_ok[key][c] += 1

    def summarize(key: str) -> Dict[str, Any]:
        tot = sum(per_class_n.values())
        ok = sum(per_class_ok[key].values())
        micro = ok / max(1, tot)
        macro = float(np.mean([per_class_ok[key][c] / per_class_n[c] for c in per_class_n])) if per_class_n else 0.0
        return {"micro": round(micro, 4), "macro": round(macro, 4)}

    out = {
        "note": "leave-one-GTIN-out; production embedding (512-dim); 12 classes >=2 GTINs",
        "eval_classes": sorted(eval_classes),
        "eval_crops": sum(per_class_n.values()),
        "conditions": {
            "A_guide_only": summarize("A_guide"),
            "B_realcrop_only": summarize("B_real"),
            "C_realcrop_plus_guide": summarize("C_both"),
        },
        "per_class": {
            c: {
                "n": per_class_n[c],
                "guide": round(per_class_ok["A_guide"][c] / per_class_n[c], 3),
                "real": round(per_class_ok["B_real"][c] / per_class_n[c], 3),
                "both": round(per_class_ok["C_both"][c] / per_class_n[c], 3),
            }
            for c in sorted(per_class_n, key=lambda k: -per_class_n[k])
        },
    }
    print(json.dumps(out, indent=2))
    if out_path:
        json.dump(out, open(out_path, "w"), indent=2)
        print(f"\nWrote {out_path}", file=sys.stderr)
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verdict", required=True)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    sys.exit(asyncio.run(run(args.verdict, args.out)))


if __name__ == "__main__":
    main()
