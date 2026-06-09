#!/usr/bin/env python3
"""
Story 12.3 STAP-0 — off-the-shelf backbone comparison + variant-family ceiling.
Runs INSIDE the ML container (torch + timm + transformers + torchvision; HF/torch
caches must point at a writable dir — set HF_HOME/TORCH_HOME=/tmp/...).

Answers the two unproven assumptions the plan rests on (review blockers #3/#4):
  - Is the 50.7% collision FIXABLE by a stronger embedding? -> compare backbones.
  - How big is the REAL ceiling (visually near-identical variant families)?
    -> split each code's nearest cross-code collision into SAME-family vs CROSS-family.
    SAME-family collisions are the genuine ceiling; CROSS-family = embedding weakness.

For each backbone: embed all guide logos; report
  A. inter-code collision @0.75 (overall, + same-family vs cross-family split)
  B. distorted-crop -> reference accept@0.75 + top-1 (sampled, the recognition axis)

Usage: HF_HOME=/tmp/hf TORCH_HOME=/tmp/torch python3 spike_stap0_backbones.py \
         --logos /tmp/gl_full --backbones effb0,convnext_tiny,dinov2,clip --bsample 400 --out /tmp/stap0.json
"""
from __future__ import annotations
import argparse, io, json, os, sys, time
from typing import Any, Dict, List, Callable

import numpy as np
import torch
from PIL import Image, ImageFilter

GATE = 0.75
GENERIC = {"CERTIFIED", "CERTIFICATION", "LABEL", "MARK", "LOGO", "EU", "EUROPEAN",
           "PRODUCT", "QUALITY", "ORGANIC", "THE", "OF", "AND", "FOR", "GENERAL",
           "CLAIM", "FExdRATION", "INTERNATIONAL", "NATIONAL", "STANDARD"}
GOLD = {"GREEN_DOT", "FOREST_STEWARDSHIP_COUNCIL_MIX", "EUROPEAN_V_LABEL_VEGAN", "EU_ORGANIC_FARMING"}


def words(code: str) -> set:
    return {w for w in code.split("_") if w and w not in GENERIC}


def same_family(a: str, b: str) -> bool:
    """Heuristic: two codes are the same visual family if one name contains the
    other's stem or they share >=2 significant words (FSC MIX/100/RECYCLED, kosher
    families, BETER_LEVEN_1/2/3_STER, V_LABEL vegan/vegetarian, ...)."""
    if a == b:
        return True
    wa, wb = words(a), words(b)
    if len(wa & wb) >= 2:
        return True
    # prefix/stem containment on the first 2 significant words
    sa, sb = "_".join(list(wa)[:2]), "_".join(list(wb)[:2])
    return bool(sa and (sa in b or sb in a))


# --------------------------------------------------------------------------- #
# backbone builders -> each returns embed(PIL)->np.float32 (L2-normalised)
# --------------------------------------------------------------------------- #
def build_torchvision(name: str) -> Callable:
    import torchvision.models as M
    from torchvision import transforms
    ctor, wts, cut = {
        "effb0": (M.efficientnet_b0, M.EfficientNet_B0_Weights.DEFAULT, "eff"),
        "effv2s": (M.efficientnet_v2_s, M.EfficientNet_V2_S_Weights.DEFAULT, "eff"),
        "convnext_tiny": (M.convnext_tiny, M.ConvNeXt_Tiny_Weights.DEFAULT, "convnext"),
    }[name]
    model = ctor(weights=wts)
    if cut == "eff":
        model.classifier = torch.nn.Identity()
    else:  # convnext: classifier = [LayerNorm2d, Flatten, Linear]
        model.classifier[2] = torch.nn.Identity()
    model.eval()
    tf = transforms.Compose([transforms.Resize(256), transforms.CenterCrop(224),
                             transforms.ToTensor(),
                             transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])

    def embed(im: Image.Image) -> np.ndarray:
        with torch.no_grad():
            v = model(tf(im.convert("RGB")).unsqueeze(0)).cpu().numpy().flatten()
        return v
    return embed


def build_dinov2() -> Callable:
    import timm
    model = timm.create_model("vit_small_patch14_dinov2.lvd142m", pretrained=True, num_classes=0)
    model.eval()
    cfg = timm.data.resolve_data_config({}, model=model)
    tf = timm.data.create_transform(**cfg)

    def embed(im: Image.Image) -> np.ndarray:
        with torch.no_grad():
            v = model(tf(im.convert("RGB")).unsqueeze(0)).cpu().numpy().flatten()
        return v
    return embed


def build_clip() -> Callable:
    from transformers import CLIPModel, CLIPProcessor
    model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
    proc = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    model.eval()

    def embed(im: Image.Image) -> np.ndarray:
        with torch.no_grad():
            inp = proc(images=im.convert("RGB"), return_tensors="pt")
            v = model.get_image_features(**inp).cpu().numpy().flatten()
        return v
    return embed


def get_embedder(name: str) -> Callable:
    if name in ("effb0", "effv2s", "convnext_tiny"):
        return build_torchvision(name)
    if name == "dinov2":
        return build_dinov2()
    if name == "clip":
        return build_clip()
    raise ValueError(name)


def _augment(im: Image.Image, rng) -> Image.Image:
    im = im.convert("RGB"); w, h = im.size
    f = float(rng.uniform(0.18, 0.4))
    im = im.resize((max(8, int(w * f)), max(8, int(h * f)))).resize((w, h))
    im = im.filter(ImageFilter.GaussianBlur(radius=float(rng.uniform(0.4, 1.2))))
    im = im.rotate(float(rng.uniform(-6, 6)), expand=False, fillcolor=(255, 255, 255))
    b = io.BytesIO(); im.save(b, "JPEG", quality=int(rng.integers(45, 75)))
    return Image.open(io.BytesIO(b.getvalue())).convert("RGB")


def measure(name: str, logos_dir: str, bsample: int) -> Dict[str, Any]:
    embed = get_embedder(name)
    man = json.load(open(os.path.join(logos_dir, "manifest.json")))
    codes: List[str] = []; embs: List[np.ndarray] = []; clean = {}
    t0 = time.perf_counter()
    for e in man["entries"]:
        try:
            im = Image.open(os.path.join(logos_dir, e["file"])).convert("RGB")
        except Exception:
            continue
        v = embed(im).astype(np.float32); v /= (np.linalg.norm(v) + 1e-9)
        codes.append(e["code"]); embs.append(v); clean.setdefault(e["code"], im)
    E = np.stack(embs); N = len(codes); carr = np.array(codes)
    uniq = sorted(set(codes)); first = {}
    for i, c in enumerate(codes):
        first.setdefault(c, i)

    # A. collision + family split (per code, via its variant-0 row)
    S = E @ E.T; np.fill_diagonal(S, -1.0)
    collide = same_fam = cross_fam = 0
    for c in uniq:
        i = first[c]; mask = carr != c
        if not mask.any():
            continue
        j = int(np.where(mask)[0][int(S[i][mask].argmax())])
        if float(S[i][j]) >= GATE:
            collide += 1
            if same_family(c, codes[j]):
                same_fam += 1
            else:
                cross_fam += 1
    C = len(uniq)

    # B. distorted-crop -> reference (sampled)
    rng = np.random.default_rng(7)
    ref_idx = [first[c] for c in uniq]; R = E[ref_idx]; rc = list(uniq)
    sample = uniq[:bsample]
    self_cos = []; top1 = 0; acc = 0; gold = {}
    for c in sample:
        q = embed(_augment(clean[c], rng)).astype(np.float32); q /= (np.linalg.norm(q) + 1e-9)
        sims = R @ q; j = int(sims.argmax())
        self_cos.append(float(R[rc.index(c)] @ q))
        if rc[j] == c:
            top1 += 1
            if float(sims[j]) >= GATE:
                acc += 1
        if c in GOLD:
            gold[c] = round(float(R[rc.index(c)] @ q), 3)
    sc = np.array(self_cos)
    return {
        "backbone": name, "dim": int(E.shape[1]), "logos": N, "codes": C,
        "embed_s": round(time.perf_counter() - t0, 1),
        "A_collision_frac": round(collide / C, 3),
        "A_same_family_ceiling_frac": round(same_fam / C, 3),
        "A_cross_family_fixable_frac": round(cross_fam / C, 3),
        "B_sampled_codes": len(sample),
        "B_self_cosine_p50": round(float(np.percentile(sc, 50)), 3),
        "B_top1": round(top1 / len(sample), 3),
        "B_accept_0.75": round(acc / len(sample), 3),
        "B_gold4_self": gold,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--logos", required=True)
    ap.add_argument("--backbones", default="effb0,convnext_tiny,dinov2,clip")
    ap.add_argument("--bsample", type=int, default=400)
    ap.add_argument("--out")
    args = ap.parse_args()
    results = []
    for name in args.backbones.split(","):
        name = name.strip()
        try:
            r = measure(name, args.logos, args.bsample)
            print(json.dumps(r), flush=True)
            results.append(r)
        except Exception as exc:
            print(json.dumps({"backbone": name, "error": str(exc)[:200]}), flush=True)
    out = {"gate": GATE, "results": results}
    print(json.dumps(out, indent=2))
    if args.out:
        json.dump(out, open(args.out, "w"), indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
