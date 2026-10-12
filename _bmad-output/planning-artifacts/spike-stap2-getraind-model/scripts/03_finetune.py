#!/usr/bin/env python
"""Stap 3 (Model B): lichte fine-tune van EfficientNet-B0 (laatste blokken + kop) op de train-uitsneden van splitsing F.

CPU-only, gebalanceerde sampling, lichte augmentatie. Drempel via één vaste familie-gegroepeerde validatiesplit
(10% van de train-families, seed 20261012) met dezelfde regel als Model A: laagste drempel waarbij het
onterecht-percentage op validatie <= het doel (baseline leave-family-out @0,80 uit 02_analyse.py).
Leest <scr>/spike/embeddings.npz, splits.json, resultaten.json. Schrijft <scr>/spike/model_B.json.
"""
import sys, json, time, math, collections
import numpy as np, torch, torchvision
from torch import nn
from torchvision import transforms
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
SCR = sys.argv[1]; SEED = 20261012; EPOCHS = int(sys.argv[2]) if len(sys.argv) > 2 else 12; MAX_MIN = 60
torch.manual_seed(SEED); np.random.seed(SEED); torch.set_num_threads(max(1, torch.get_num_threads()))
d = np.load(f"{SCR}/spike/embeddings.npz"); sp = json.load(open(f"{SCR}/spike/splits.json")); res = json.load(open(f"{SCR}/spike/resultaten.json"))
paths = [f"{SCR}/spike/train-uit/{p}" for p in d["tr_path"]]; labels = np.array(d["tr_label"]); fam = np.array(sp["tr_fam"])
test = np.array(sp["test_F"]); train_all = ~test
# validatiesplit: 10% van de train-families
rng = np.random.default_rng(SEED); fams = sorted(set(fam[train_all])); rng.shuffle(fams); val_f = set(fams[: round(0.1 * len(fams))])
val = train_all & np.isin(fam, list(val_f)); trn = train_all & ~val
classes = sorted(set(labels[trn])); cidx = {c: i for i, c in enumerate(classes)}
print(f"train {trn.sum()} val {val.sum()} test {test.sum()} klassen {len(classes)}")

norm = transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
tf_train = transforms.Compose([transforms.RandomResizedCrop(224, scale=(0.7, 1.0), ratio=(0.8, 1.25)), transforms.RandomRotation(10, fill=255),
                               transforms.ColorJitter(0.3, 0.3, 0.3, 0.05), transforms.ToTensor(), norm])
tf_eval = transforms.Compose([transforms.Resize(256), transforms.CenterCrop(224), transforms.ToTensor(), norm])

class DS(torch.utils.data.Dataset):
    def __init__(self, idx, tf): self.idx = idx; self.tf = tf; self.ims = {i: Image.open(paths[i]).convert("RGB") for i in idx}
    def __len__(self): return len(self.idx)
    def __getitem__(self, k): i = self.idx[k]; return self.tf(self.ims[i]), cidx.get(labels[i], -1)

tr_idx = np.where(trn)[0]; cnt = collections.Counter(labels[tr_idx]); w = torch.tensor([1.0 / cnt[labels[i]] for i in tr_idx])
sampler = torch.utils.data.WeightedRandomSampler(w, num_samples=len(tr_idx), replacement=True, generator=torch.Generator().manual_seed(SEED))
dl_tr = torch.utils.data.DataLoader(DS(tr_idx, tf_train), batch_size=32, sampler=sampler, num_workers=0)

m = torchvision.models.efficientnet_b0(weights=torchvision.models.EfficientNet_B0_Weights.DEFAULT)
for p in m.parameters(): p.requires_grad = False
for blk in (m.features[7], m.features[8]):
    for p in blk.parameters(): p.requires_grad = True
m.classifier = nn.Sequential(nn.Dropout(0.2), nn.Linear(1280, len(classes)))
opt = torch.optim.AdamW([p for p in m.parameters() if p.requires_grad], lr=1e-3, weight_decay=1e-4)
sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, EPOCHS); lossf = nn.CrossEntropyLoss(label_smoothing=0.05)

def predict(idx):
    m.eval(); out = []
    with torch.no_grad():
        for i in range(0, len(idx), 64):
            xs = torch.stack([tf_eval(Image.open(paths[j]).convert("RGB")) for j in idx[i:i + 64]]); out.append(torch.softmax(m(xs), 1).numpy())
    pr = np.concatenate(out); return np.array(classes)[pr.argmax(1)], pr.max(1)

t0 = time.time(); log = []
for ep in range(EPOCHS):
    m.train(); tot = 0.0; n = 0
    for xs, ys in dl_tr:
        opt.zero_grad(); loss = lossf(m(xs), ys); loss.backward(); opt.step(); tot += loss.item() * len(ys); n += len(ys)
    sched.step(); pv, sv = predict(np.where(val)[0]); acc = (pv == labels[val]).mean()
    log.append(dict(epoch=ep + 1, loss=tot / n, val_top1=float(acc), min=(time.time() - t0) / 60)); print(log[-1], flush=True)
    if (time.time() - t0) / 60 > MAX_MIN: print("tijdslimiet bereikt"); break

# drempel op validatie, zelfde regel en doel als Model A
doel = res["splits"]["F"]["methoden"]["model_A"]["drempelkeuze"]["doel_onterecht_baseline_lfo"]
pv, sv = predict(np.where(val)[0]); wrong_v = pv != labels[val]
grid = np.round(np.arange(0.05, 1.0, 0.01), 2); tB = next((float(t) for t in grid if (wrong_v & (sv >= t)).mean() <= doel), 0.99)
pt, st = predict(np.where(test)[0]); y = labels[test]; correct = pt == y
out = dict(epochs_gedraaid=len(log), minuten=(time.time() - t0) / 60, klassen=len(classes), n_train=int(trn.sum()), n_val=int(val.sum()), n_test=int(test.sum()),
           drempelkeuze=dict(doel=doel, drempel=tB, val_onterecht_bij_drempel=float((wrong_v & (sv >= tB)).mean()), val_top1=float((~wrong_v).mean())),
           log=log, pred=pt.tolist(), score=st.tolist(), correct=correct.tolist(), y=y.tolist())
for t in (0.75, 0.80, tB):
    out[f"gevonden@{t}"] = int((correct & (st >= t)).sum()); out[f"onterecht@{t}"] = int((~correct & (st >= t)).sum())
print(f"Model B test top-1 {correct.sum()}/{len(y)} = {correct.mean():.1%}; drempel {tB}: gevonden {out[f'gevonden@{tB}']} onterecht {out[f'onterecht@{tB}']}")
json.dump(out, open(f"{SCR}/spike/model_B.json", "w"), indent=1)
