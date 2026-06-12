#!/usr/bin/env python3
"""
Story 12.3 iter2 — DISCRIMINATING PROBE: do real crops self-cluster by class in
RAW frozen effb0 space?

Every prior measurement scored a real crop against a GUIDE-LOGO reference, so a
0% class conflates two very different causes:
  (1) frozen-feature ceiling  — effb0 cannot separate the classes (fix: unfreeze
      backbone; expensive, GPU, overfit risk on 78 crops).
  (2) guide-reference domain gap — effb0 CAN separate, but the guide logo looks
      nothing like the real crop (fix: use real crops as references; cheap, no
      training — the 12.6 harvest feeds references, not training data).

This probe removes the guide reference entirely: leave-one-out k-NN AMONG the 78
real verdict crops, in raw frozen effb0 features (no head, no synthesis). For each
crop, is its nearest neighbour (among the other 77) the same class?

  self-cluster (high LOO acc, incl. RECYCLABLE) -> effb0 encodes the structure ->
      the GUIDE reference is the problem -> cheap fix (real-crop refs), NOT unfreeze.
  scatter (low LOO acc) -> frozen ceiling is real OR the class is an incoherent
      grab-bag of visually distinct symbols -> backbone training may not help.

Read-only. Usage (container):
  python3 spike_iter2_loo_probe.py --verdict /tmp/verdict-78.json --out /tmp/iter2-loo.json
"""
from __future__ import annotations
import argparse, asyncio, io, json, os, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def build_effb0_full():
    """Raw frozen effb0, FULL 1280-dim features (no truncation, no head)."""
    import torch
    import torch.nn as nn
    import torchvision.models as M
    from torchvision import transforms
    m = M.efficientnet_b0(weights=M.EfficientNet_B0_Weights.DEFAULT)
    m.classifier = nn.Identity(); m.eval()
    tf = transforms.Compose([transforms.Resize(256), transforms.CenterCrop(224), transforms.ToTensor(),
                             transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])

    @torch.no_grad()
    def feat(im: Image.Image) -> np.ndarray:
        return m(tf(im.convert("RGB")).unsqueeze(0)).cpu().numpy().flatten().astype(np.float32)
    return feat


async def run(verdict_path: str, out_path: Optional[str]) -> int:
    from app.services.storage import storage_service
    feat = build_effb0_full()

    verdict = json.load(open(verdict_path))
    labels: List[str] = []
    embs: List[np.ndarray] = []
    for row in verdict:
        try:
            data = storage_service.get_training_image(row["crop_path"])
            im = Image.open(io.BytesIO(data)).convert("RGB")
            embs.append(feat(im)); labels.append(row["label"])
        except Exception as exc:
            print("crop fail", row.get("crop_path"), str(exc)[:60], file=sys.stderr)
    n = len(embs)
    X = np.stack(embs).astype(np.float32)
    X /= (np.linalg.norm(X, axis=1, keepdims=True) + 1e-9)
    S = X @ X.T                       # 78x78 cosine
    np.fill_diagonal(S, -1.0)         # exclude self
    nn_idx = S.argmax(1)

    per_n: Dict[str, int] = defaultdict(int)
    per_ok: Dict[str, int] = defaultdict(int)
    nn_sim_correct: List[float] = []
    confusions: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for i in range(n):
        c = labels[i]; nn_c = labels[int(nn_idx[i])]
        per_n[c] += 1
        if nn_c == c:
            per_ok[c] += 1
            nn_sim_correct.append(float(S[i, int(nn_idx[i])]))
        else:
            confusions[c][nn_c] += 1

    # multi-crop classes only carry a meaningful LOO signal (n>=2)
    multi = {c: (per_ok[c], per_n[c]) for c in per_n if per_n[c] >= 2}
    micro = sum(per_ok[c] for c in multi) / max(1, sum(per_n[c] for c in multi))
    macro = float(np.mean([per_ok[c] / per_n[c] for c in multi])) if multi else 0.0

    out = {
        "note": "leave-one-out k-NN among real verdict crops, raw frozen effb0 1280-dim",
        "crops": n, "classes": len(per_n),
        "multiclass_n>=2": len(multi),
        "LOO_knn_micro_multiclass": round(micro, 4),
        "LOO_knn_macro_multiclass": round(macro, 4),
        "nn_sim_correct_median": round(float(np.median(nn_sim_correct)), 4) if nn_sim_correct else None,
        "per_class": {
            c: {"n": per_n[c], "loo_acc": round(per_ok[c] / per_n[c], 3),
                "top_confusion": (max(confusions[c].items(), key=lambda kv: kv[1])[0] if confusions[c] else None)}
            for c in sorted(per_n, key=lambda k: -per_n[k])
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
