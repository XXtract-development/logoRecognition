#!/usr/bin/env python3
"""
Story 12.3 — fine-tuning ITERATION 1 (feasibility-grade).

Trains a small projection head on FROZEN efficientnet_b0 features with a metric
loss (supervised contrastive), to test whether a learned head pulls real artwork
crops closer to their own clean reference. Iteration 1 = cheap probe; the verdict
is ONLY the REAL gold-crop metric on HELD-OUT classes (per review):

  - HELD-OUT real eval (verdict-grade): the gold-4 classes' real MinIO crops are
    NEVER in training. Measure top-1 (scale-invariant) crop->ref, raw effb0 vs
    +head. A meaningful rise = promising; flat = frozen features insufficient.
  - Held-out SYNTHETIC (sanity only, NOT verdict): augmented held-out logos.
    Expected to rise just because the head learns to undo the augmentation.

Positives = synthetic augmentations of the guide logos (iteration 1 shortcut;
iteration 2 should use the 8.7 synthesis pipeline for realism). Refs and clean
anchors pass through the head too (serving path = nearest clean reference).

Usage (container, frozen backbone -> CPU is fine):
  python3 spike_finetune_iter1.py --logos /tmp/gl_full --gold /tmp/gold-set-oogstrun.json --out /tmp/ft1.json
"""
from __future__ import annotations
import argparse, io, json, os, sys, time
from collections import defaultdict
from typing import Any, Dict, List

import numpy as np
import torch
import torch.nn as nn
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

GOLD4 = ["GREEN_DOT", "FOREST_STEWARDSHIP_COUNCIL_MIX", "EUROPEAN_V_LABEL_VEGAN", "EU_ORGANIC_FARMING"]
K_AUG = 6           # augmented positive views per training logo
N_HOLDOUT_SYN = 150 # extra classes held out for the synthetic sanity check
torch.manual_seed(0)


def augment(im: Image.Image, rng) -> Image.Image:
    im = im.convert("RGB"); w, h = im.size
    f = float(rng.uniform(0.18, 0.45))
    im = im.resize((max(8, int(w * f)), max(8, int(h * f)))).resize((w, h))
    im = im.filter(ImageFilter.GaussianBlur(radius=float(rng.uniform(0.3, 1.3))))
    im = im.rotate(float(rng.uniform(-8, 8)), expand=False, fillcolor=(255, 255, 255))
    b = io.BytesIO(); im.save(b, "JPEG", quality=int(rng.integers(40, 80)))
    return Image.open(io.BytesIO(b.getvalue())).convert("RGB")


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
    """Supervised contrastive loss over an L2-normalised batch."""
    sim = (z @ z.T) / temp
    n = z.shape[0]
    sim = sim - torch.eye(n, device=z.device) * 1e9          # mask self
    lab = labels.view(-1, 1)
    pos = (lab == lab.T).float() - torch.eye(n, device=z.device)
    logp = sim - torch.logsumexp(sim, dim=1, keepdim=True)
    denom = pos.sum(1).clamp(min=1)
    return -((pos * logp).sum(1) / denom).mean()


def l2(a):
    a = np.asarray(a, np.float32)
    return a / (np.linalg.norm(a, axis=-1, keepdims=True) + 1e-9)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--logos", required=True)
    ap.add_argument("--gold", required=True)
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--out")
    args = ap.parse_args()

    from app.services.storage import storage_service
    feat = build_effb0()
    man = json.load(open(os.path.join(args.logos, "manifest.json")))

    # one clean logo per code (variant 0)
    clean: Dict[str, Image.Image] = {}
    for e in man["entries"]:
        if e["code"] not in clean:
            try:
                clean[e["code"]] = Image.open(os.path.join(args.logos, e["file"])).convert("RGB")
            except Exception:
                pass
    codes = sorted(clean)
    rng = np.random.default_rng(1)

    # class split: gold-4 + N_HOLDOUT_SYN held out of TRAINING
    held_syn = [c for c in codes if c not in GOLD4]
    rng.shuffle(held_syn)
    holdout = set(GOLD4) | set(held_syn[:N_HOLDOUT_SYN])
    train_codes = [c for c in codes if c not in holdout]
    print(f"codes={len(codes)} train={len(train_codes)} holdout_syn={N_HOLDOUT_SYN} gold4_holdout={GOLD4}", file=sys.stderr)

    # ---- precompute frozen features --------------------------------------
    t0 = time.perf_counter()
    ref_feat = {c: feat(clean[c]) for c in codes}                     # clean refs (all codes)
    # training set: clean + K augmented views per training code
    Xtr: List[np.ndarray] = []; Ytr: List[int] = []
    cidx = {c: i for i, c in enumerate(train_codes)}
    for c in train_codes:
        Xtr.append(ref_feat[c]); Ytr.append(cidx[c])
        for _ in range(K_AUG):
            Xtr.append(feat(augment(clean[c], rng))); Ytr.append(cidx[c])
    Xtr = np.stack(Xtr).astype(np.float32); Ytr = np.array(Ytr)
    print(f"features done in {time.perf_counter()-t0:.0f}s; train tensors={Xtr.shape}", file=sys.stderr)

    # ---- held-out synthetic queries (sanity) -----------------------------
    syn_codes = held_syn[:N_HOLDOUT_SYN]
    syn_q = {c: feat(augment(clean[c], rng)) for c in syn_codes}

    # ---- held-out REAL gold crops (VERDICT) ------------------------------
    gold = json.load(open(args.gold))
    real = defaultdict(list)   # code -> [feature,...] for ECHT crops
    for r in gold["records"]:
        if r["label"] != "ECHT":
            continue
        try:
            data = storage_service.get_training_image(r["cropPath"])
            im = Image.open(io.BytesIO(data)).convert("RGB")
            real[r["t3777Code"]].append(feat(im))
        except Exception as exc:
            print("real-crop fetch fail", r.get("cropPath"), str(exc)[:60], file=sys.stderr)
    n_real = sum(len(v) for v in real.values())
    print(f"real ECHT crops: {n_real} over {list(real)}", file=sys.stderr)

    # ---- eval helper: top-1 of queries vs ALL refs -----------------------
    ref_codes = codes
    def eval_top1(qdict, transform) -> float:
        R = transform(np.stack([ref_feat[c] for c in ref_codes]))   # (C,d) normalised
        ok = tot = 0
        for c, qs in qdict.items():
            qs = qs if isinstance(qs, list) else [qs]
            Q = transform(np.stack(qs))                             # (n,d)
            nn_idx = (Q @ R.T).argmax(1)
            for j in nn_idx:
                tot += 1; ok += int(ref_codes[int(j)] == c)
        return ok / max(1, tot)

    raw = lambda a: l2(a)                                            # before: raw effb0 features
    real_before = eval_top1(real, raw)
    syn_before = eval_top1(syn_q, raw)

    # ---- train the head ---------------------------------------------------
    head = Head(Xtr.shape[1], 512)
    opt = torch.optim.Adam(head.parameters(), lr=1e-3, weight_decay=1e-4)
    Xt = torch.tensor(Xtr); Yt = torch.tensor(Ytr)
    ncls = len(train_codes); per = K_AUG + 1
    head.train()
    for ep in range(args.epochs):
        # batch = sample B classes, all their views (so positives exist in-batch)
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

    real_after = eval_top1(real, headfn)
    syn_after = eval_top1(syn_q, headfn)

    out = {
        "iteration": 1, "note": "feasibility-grade; verdict = REAL held-out gold crops only",
        "train_codes": len(train_codes), "k_aug": K_AUG, "epochs": args.epochs,
        "real_gold_crops": {"n": n_real, "classes": list(real)},
        "VERDICT_real_top1": {"before_effb0": round(real_before, 3), "after_head": round(real_after, 3),
                              "delta": round(real_after - real_before, 3)},
        "SANITY_heldout_synthetic_top1": {"before": round(syn_before, 3), "after": round(syn_after, 3),
                                          "delta": round(syn_after - syn_before, 3),
                                          "warning": "circular (measures undoing the augmentation); NOT a verdict"},
    }
    print(json.dumps(out, indent=2))
    if args.out:
        json.dump(out, open(args.out, "w"), indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
