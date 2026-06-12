#!/usr/bin/env python3
"""
Story 12.3 — fine-tuning ITERATION 2 (realistic synthesis).

Identical to iteration 1 (frozen efficientnet_b0 + projection head + supervised
contrastive) EXCEPT the single variable under test: the training positives.

  iter1 (failed, 37%->23%): naive signal-degradation of guide logos
        (downscale/blur/JPEG/rotate) on a white background.
  iter2 (this):             8.7 COMPOSITING — the guide logo alpha-composited
        onto REAL cached artwork backgrounds (compose_synthetic), then cropped
        to the logo bbox + margin so the positive matches the tight, real-
        packaging framing of the verdict crops (transparent logo regions show
        actual packaging, not white).

Everything else is held constant to isolate the data effect: head architecture,
supcon loss/temp, LR, epochs, K positives/class, the clean-logo serving ref.

Verdict (per the iter2 plan): top-1 rank on the broadened 24-class / 78-crop
real verdict set (active=true training_data crops). Real crops NEVER train
(positives are synthetic composites of the guide logo) -> structurally leak-free.
Reports raw-effb0 (before) vs +head (after); the DELTA is the verdict. Absolute
"before" uses clean single-logo refs (one per code), so it can differ from the
pgvector 146-vector baseline (35.9% micro / 46.5% macro) — the delta is what counts.

Usage (container):
  python3 spike_finetune_iter2.py --verdict /tmp/verdict-78.json \
      --backgrounds 60 --kpos 6 --epochs 40 --out /tmp/iter2-train.json
"""
from __future__ import annotations
import argparse, asyncio, io, json, os, sys, time
from collections import defaultdict
from typing import Any, Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

CROP_MARGIN = 0.25  # match the production ARTWORK_CROP_MARGIN framing of real crops
torch.manual_seed(0)


# --------------------------------------------------------------------------- #
# Frozen backbone + head (BYTE-IDENTICAL to iter1)
# --------------------------------------------------------------------------- #
def build_effb0():
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


class Head(nn.Module):
    def __init__(self, din=1280, dout=512):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(din, 1024), nn.BatchNorm1d(1024), nn.ReLU(),
                                 nn.Linear(1024, dout))

    def forward(self, x):
        z = self.net(x)
        return z / (z.norm(dim=1, keepdim=True) + 1e-9)


def supcon(z, labels, temp=0.1):
    sim = (z @ z.T) / temp
    n = z.shape[0]
    sim = sim - torch.eye(n, device=z.device) * 1e9
    lab = labels.view(-1, 1)
    pos = (lab == lab.T).float() - torch.eye(n, device=z.device)
    logp = sim - torch.logsumexp(sim, dim=1, keepdim=True)
    denom = pos.sum(1).clamp(min=1)
    return -((pos * logp).sum(1) / denom).mean()


def l2(a):
    a = np.asarray(a, np.float32)
    return a / (np.linalg.norm(a, axis=-1, keepdims=True) + 1e-9)


# --------------------------------------------------------------------------- #
# iter2 positive generation: 8.7 compositing, cropped to bbox + margin
# --------------------------------------------------------------------------- #
def _bgr_to_pil(bgr: np.ndarray) -> Image.Image:
    return Image.fromarray(np.ascontiguousarray(bgr[:, :, ::-1].astype("uint8")))


def composite_positive(background: np.ndarray, reference: Dict[str, Any], seed: int) -> Optional[Image.Image]:
    """One realistic positive: composite the guide logo onto a real background,
    then crop to the logo bbox + CROP_MARGIN so it matches the verdict crops."""
    from app.services.synthesis import compose_synthetic
    out = compose_synthetic(background, reference, seed=seed)
    img = out["image"]  # full BGR background with the logo composited in
    bb = out["bbox"]
    h, w = img.shape[:2]
    mx = int(round(bb["width"] * CROP_MARGIN)); my = int(round(bb["height"] * CROP_MARGIN))
    x0 = max(0, bb["x"] - mx); y0 = max(0, bb["y"] - my)
    x1 = min(w, bb["x"] + bb["width"] + mx); y1 = min(h, bb["y"] + bb["height"] + my)
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    return _bgr_to_pil(img[y0:y1, x0:x1])


async def run(verdict_path: str, n_bg: int, kpos: int, epochs: int, out_path: Optional[str]) -> int:
    from app.services.storage import storage_service
    from app.services.synthesis import _load_references_by_class, _load_backgrounds

    feat = build_effb0()

    # ---- references (clean guide logo per code) + backgrounds (8.7 loaders) --
    refs_by_class = await _load_references_by_class()
    backgrounds = await _load_backgrounds(limit=n_bg)
    if not backgrounds:
        print("FATAL: no backgrounds in storage (artwork/ prefix)", file=sys.stderr); return 1
    codes = sorted(refs_by_class)
    print(f"reference codes={len(codes)} backgrounds={len(backgrounds)}", file=sys.stderr)

    # clean serving reference = variant 0 per code, as a PIL image
    import cv2  # noqa: F401
    clean_ref: Dict[str, Image.Image] = {}
    for c in codes:
        img = refs_by_class[c][0]["image"]  # BGR or BGRA
        clean_ref[c] = _bgr_to_pil(img[:, :, :3])
    ref_feat = {c: feat(clean_ref[c]) for c in codes}

    # ---- training positives: K composites per code (cropped to logo) --------
    rng = np.random.default_rng(2)
    Xtr: List[np.ndarray] = []; Ytr: List[int] = []
    cidx = {c: i for i, c in enumerate(codes)}
    t0 = time.perf_counter()
    made = skipped = 0
    for c in codes:
        # clean ref is also a positive view (serving anchor passes through head)
        Xtr.append(ref_feat[c]); Ytr.append(cidx[c])
        variants = refs_by_class[c]
        for k in range(kpos):
            ref = variants[k % len(variants)]
            bg = backgrounds[int(rng.integers(len(backgrounds)))]["image"]
            seed = int(rng.integers(1_000_000))
            pos = composite_positive(bg, {"t3777_code": c, "image": ref["image"]}, seed)
            if pos is None:
                skipped += 1; continue
            Xtr.append(feat(pos)); Ytr.append(cidx[c]); made += 1
    Xtr = np.stack(Xtr).astype(np.float32); Ytr = np.array(Ytr)
    print(f"positives made={made} skipped={skipped} in {time.perf_counter()-t0:.0f}s; train={Xtr.shape}", file=sys.stderr)

    # ---- verdict: real held-out crops (NEVER trained) -----------------------
    verdict = json.load(open(verdict_path))
    real: Dict[str, List[np.ndarray]] = defaultdict(list)
    miss = 0
    for row in verdict:
        try:
            data = storage_service.get_training_image(row["crop_path"])
            im = Image.open(io.BytesIO(data)).convert("RGB")
            real[row["label"]].append(feat(im))
        except Exception as exc:
            miss += 1
            print("verdict-crop fail", row.get("crop_path"), str(exc)[:60], file=sys.stderr)
    n_real = sum(len(v) for v in real.values())
    print(f"verdict crops loaded: {n_real} over {len(real)} classes (miss={miss})", file=sys.stderr)

    # ---- eval: top-1 of queries vs clean refs (micro + macro) ---------------
    ref_codes = codes
    def eval_top1(qdict, transform):
        R = transform(np.stack([ref_feat[c] for c in ref_codes]))
        per_ok: Dict[str, int] = defaultdict(int); per_n: Dict[str, int] = defaultdict(int)
        for c, qs in qdict.items():
            Q = transform(np.stack(qs))
            nn_idx = (Q @ R.T).argmax(1)
            for j in nn_idx:
                per_n[c] += 1; per_ok[c] += int(ref_codes[int(j)] == c)
        tot = sum(per_n.values()); ok = sum(per_ok.values())
        micro = ok / max(1, tot)
        macro = float(np.mean([per_ok[c] / per_n[c] for c in per_n])) if per_n else 0.0
        per_class = {c: round(per_ok[c] / per_n[c], 3) for c in sorted(per_n, key=lambda k: -per_n[k])}
        return {"micro": round(micro, 4), "macro": round(macro, 4), "per_class": per_class}

    raw = lambda a: l2(a)
    before = eval_top1(real, raw)

    # ---- train the head (identical to iter1) --------------------------------
    head = Head(Xtr.shape[1], 512)
    opt = torch.optim.Adam(head.parameters(), lr=1e-3, weight_decay=1e-4)
    Xt = torch.tensor(Xtr); Yt = torch.tensor(Ytr)
    ncls = len(codes)
    head.train()
    for ep in range(epochs):
        B = min(48, ncls)
        sel = torch.randperm(ncls)[:B]
        idx = torch.cat([torch.where(Yt == int(c))[0] for c in sel])
        z = head(Xt[idx]); loss = supcon(z, Yt[idx])
        opt.zero_grad(); loss.backward(); opt.step()
        if ep % 10 == 0:
            print(f"  ep{ep} loss={loss.item():.3f}", file=sys.stderr)
    head.eval()

    @torch.no_grad()
    def headfn(a):
        return head(torch.tensor(np.asarray(a, np.float32))).cpu().numpy()

    after = eval_top1(real, headfn)

    out = {
        "iteration": 2, "note": "realistic 8.7-compositing positives; verdict = real held-out crops",
        "train_codes": len(codes), "positives_made": made, "kpos": kpos,
        "backgrounds": len(backgrounds), "epochs": epochs,
        "verdict": {"crops": n_real, "classes": len(real)},
        "VERDICT_real_top1": {
            "before_effb0": {"micro": before["micro"], "macro": before["macro"]},
            "after_head":   {"micro": after["micro"],  "macro": after["macro"]},
            "delta_micro": round(after["micro"] - before["micro"], 4),
            "delta_macro": round(after["macro"] - before["macro"], 4),
        },
        "per_class_before": before["per_class"],
        "per_class_after": after["per_class"],
    }
    print(json.dumps(out, indent=2))
    if out_path:
        json.dump(out, open(out_path, "w"), indent=2)
        print(f"\nWrote {out_path}", file=sys.stderr)
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verdict", required=True)
    ap.add_argument("--backgrounds", type=int, default=60)
    ap.add_argument("--kpos", type=int, default=6)
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    sys.exit(asyncio.run(run(args.verdict, args.backgrounds, args.kpos, args.epochs, args.out)))


if __name__ == "__main__":
    main()
