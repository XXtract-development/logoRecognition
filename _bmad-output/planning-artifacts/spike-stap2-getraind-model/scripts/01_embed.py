#!/usr/bin/env python
"""Stap 1: bevroren ACC-embeddings berekenen voor alle trainingsuitsneden en actieve referenties.

Spiegelt apps/ml-service/app/ml/model_manager.py (acc@31ff627): efficientnet_b0 DEFAULT, classifier=Identity,
convert("RGB") zonder alpha-compositie, Resize(256)/CenterCrop(224)/ImageNet-norm, eerste 512 van 1280 dims.
Daarna L2-normalisatie (cosinus = inproduct). Schrijft embeddings.npz in de scratchpad (klantbeelden blijven daar).

Gebruik: 01_embed.py <scratchpad-map>
  verwacht: <scr>/training-data-actief.tsv, <scr>/actieve-refs.json, <scr>/refs-alle/<id>.png,
            <scr>/spike/train-uit/artwork-crops/<gtin>/<bestand>.png
  schrijft: <scr>/spike/embeddings.npz
"""
import csv, json, os, sys, re
import numpy as np, torch, torchvision
from torchvision import transforms
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
SCR = sys.argv[1]
GEDEACTIVEERD = {"f1a85af9-c845-49a9-8ce3-90457da6e759"}  # wit vlak, 12-10-2026 gedeactiveerd

torch.manual_seed(20261012)
m = torchvision.models.efficientnet_b0(weights=torchvision.models.EfficientNet_B0_Weights.DEFAULT)
m.classifier = torch.nn.Identity(); m.eval()
tf = transforms.Compose([transforms.Resize(256), transforms.CenterCrop(224), transforms.ToTensor(),
                         transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])

def embed_paths(paths, batch=32):
    out = []
    for i in range(0, len(paths), batch):
        xs = torch.stack([tf(Image.open(p).convert("RGB")) for p in paths[i:i + batch]])
        with torch.no_grad():
            v = m(xs).numpy()[:, :512]
        out.append(v / np.linalg.norm(v, axis=1, keepdims=True))
        print(f"  {min(i + batch, len(paths))}/{len(paths)}", end="\r", flush=True)
    print()
    return np.concatenate(out).astype(np.float32)

# trainingsuitsneden: ontdubbel op pad (13 dubbele rijen, gelijk label — gecontroleerd)
rows = list(csv.reader(open(f"{SCR}/training-data-actief.tsv"), delimiter="\t"))
seen, tr = {}, []
for r in rows:
    if r[2] in seen:
        assert seen[r[2]] == r[1], f"conflicterend label op {r[2]}"
        continue
    seen[r[2]] = r[1]
    gtin = re.match(r"artwork-crops/(\d+)/", r[2]).group(1)
    tr.append((r[0], r[1], r[2], gtin))
tr_paths = [f"{SCR}/spike/train-uit/{t[2]}" for t in tr]
missing = [p for p in tr_paths if not os.path.exists(p)]
assert not missing, f"{len(missing)} ontbrekende uitsneden"
print("trainingsuitsneden:", len(tr))
E_tr = embed_paths(tr_paths)

refs = [r for r in json.load(open(f"{SCR}/actieve-refs.json")) if r["id"] not in GEDEACTIVEERD]
print("referenties:", len(refs))
E_ref = embed_paths([f"{SCR}/refs-alle/{r['id']}.png" for r in refs])

np.savez(f"{SCR}/spike/embeddings.npz",
         tr_id=[t[0] for t in tr], tr_label=[t[1] for t in tr], tr_path=[t[2] for t in tr], tr_gtin=[t[3] for t in tr], E_tr=E_tr,
         ref_id=[r["id"] for r in refs], ref_code=[r["code"] for r in refs], ref_source=[r["source"] for r in refs],
         ref_path=[r["path"] for r in refs], E_ref=E_ref)
print("geschreven:", f"{SCR}/spike/embeddings.npz")
