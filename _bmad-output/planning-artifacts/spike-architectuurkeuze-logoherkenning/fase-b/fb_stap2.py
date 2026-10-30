"""Stap 2 lokaal (CPU): benoemt vakken uit VTF of K1 met SigLIP 2 / DINOv3 (cosinus top-1 tegen de 540 actieve
referenties) of met de K3b-classifier. Schrijft per etiket {status, vakken:[{vak, top:[[code,score],...]}]}.
Gebruik: fb_stap2.py <k2a|k2b|k3b> <bron: vtf|k1a|k1b> <run> [proef]
  bron vtf  → <FASEB>/ruw/<variant>/run<n>/            (K2a/K2b/K3b)
  bron k1x  → <FASEB>/ruw/<variant>-op-<k1x>/run<n>/   (invoer voor K4; vakken[i] hoort bij meldingen[i])
fb_stap2.py train-k3b  → traint en bewaart <FASEB>/k3b-model.npz (vóór het bevriezen)."""
import json, resource, sys, time
from pathlib import Path
import numpy as np
from PIL import Image
import fb_common as C
from fb_embed import Embedder

KIND = {"k2a": "siglip", "k2b": "dino", "k3b": "siglip"}
M = C.FASEB / "momentopname"

def refs():
    r = json.loads((M / "actieve-refs.json").read_text()); z = np.load(M / "embeddings.npz")
    idx = {p: i for i, p in enumerate(z["pad"])}
    return r, z, [idx[x["path"]] for x in r]

def train_k3b():
    import csv
    from sklearn.linear_model import LogisticRegression
    r, z, ri = refs(); idx = {p: i for i, p in enumerate(z["pad"])}; sha = z["sha256"]
    rows = [(idx[x["path"]], x["code"]) for x in r] + [(idx[t[2]], t[1]) for t in csv.reader(open(M / "training-data-actief.tsv"), delimiter="\t")]
    seen, X, y = set(), [], []
    for i, lab in rows:
        if (sha[i], lab) in seen: continue
        seen.add((sha[i], lab)); X.append(z["siglip"][i]); y.append(lab)
    clf = LogisticRegression(C=100.0, class_weight="balanced", max_iter=3000).fit(np.array(X), np.array(y))
    np.savez(C.FASEB / "k3b-model.npz", coef=clf.coef_, intercept=clf.intercept_, classes=clf.classes_)
    print("k3b getraind:", len(X), "voorbeelden,", len(clf.classes_), "soorten")

def top_cos(E, R, codes, k=5):
    out = []
    for v in E:
        s = R @ v; best = {}
        for j in np.argsort(-s):
            best.setdefault(codes[j], float(s[j]))
            if len(best) >= k: break
        out.append([[c, round(sc, 5)] for c, sc in best.items()])
    return out

def top_k3b(E, mdl, k=5):
    lg = E @ mdl["coef"].T + mdl["intercept"]; p = np.exp(lg - lg.max(1, keepdims=True)); p /= p.sum(1, keepdims=True)
    return [[[str(mdl["classes"][j]), round(float(row[j]), 5)] for j in np.argsort(-row)[:k]] for row in p]

def bron_vakken(bron, run, kaart, proef):
    base = C.FASEB / ("proef/ruw" if proef else "ruw")
    p = base / bron / f"run{run}" / f"{kaart}.json"
    if not p.exists(): return None, None
    d = json.loads(p.read_text())
    if d["status"] != "ok": return d, None
    return d, (d["vakken"] if bron == "vtf" else [m["vak"] for m in d["meldingen"]])

def main():
    if sys.argv[1] == "train-k3b": return train_k3b()
    variant, bron, run = sys.argv[1], sys.argv[2], int(sys.argv[3]); proef = "proef" in sys.argv[4:]
    naam = variant if bron == "vtf" else f"{variant}-op-{bron}"
    uit = (C.FASEB / ("proef/ruw" if proef else "ruw")) / naam / f"run{run}"; uit.mkdir(parents=True, exist_ok=True)
    emb = Embedder(KIND[variant]); r, z, ri = refs(); R = z[KIND[variant]][ri]; codes = [x["code"] for x in r]
    mdl = dict(np.load(C.FASEB / "k3b-model.npz", allow_pickle=True)) if variant == "k3b" else None
    if proef:
        ets = [{"kaart": d.split("\t")[0], "bestand": str(C.FASEB / "proef/gecombineerd" / (d.split("\t")[0] + ".png"))}
               for d in (C.FASEB / "proef/proeflijst.tsv").read_text().splitlines()[1:]]
    else:
        ets = C.selectie()["etiketten"]
    for n, e in enumerate(ets, 1):
        out = uit / f"{e['kaart']}.json"
        if out.exists(): continue
        d, vakken = bron_vakken(bron, run, e["kaart"], proef)
        rec = {"kaart": e["kaart"], "variant": naam, "bron": f"{bron}/run{run}", "status": "mislukt", "vakken": []}
        if vakken is not None:
            t0 = time.time(); im = Image.open(e["bestand"]); im.load(); W, H = im.size
            geldig = [i for i, v in enumerate(vakken) if v and min(v[2], W) - max(v[0], 0) >= 1 and min(v[3], H) - max(v[1], 0) >= 1]
            crops = [im.crop((max(0, round(vakken[i][0])), max(0, round(vakken[i][1])), min(W, round(vakken[i][2])), min(H, round(vakken[i][3])))) for i in geldig]
            E = emb(crops) if crops else np.zeros((0, R.shape[1]), np.float32)
            tops = top_k3b(E, mdl) if mdl is not None else top_cos(E, R, codes)
            per = dict(zip(geldig, tops))
            rec["vakken"] = [{"vak": v, "top": per.get(i, [])} for i, v in enumerate(vakken)]
            rec.update({"status": "ok", "sec_stap2": round(time.time() - t0, 3)})
        rec["piek_rss_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**20)
        out.write_text(json.dumps(rec, ensure_ascii=False))
        if n % 20 == 0: print(naam, run, n, flush=True)
    print(naam, run, "klaar", flush=True)

if __name__ == "__main__":
    main()
