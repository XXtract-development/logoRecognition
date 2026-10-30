"""Embeddings van de referentie-momentopname en de trainingsuitsneden. Gebruik: fb_embed_momentopname.py <momentopname-map>"""
import csv, hashlib, json, sys, time
from pathlib import Path
import numpy as np
from PIL import Image
from fb_embed import Embedder
S = Path(sys.argv[1]); B = S / "bestanden"
refs = json.load(open(S / "actieve-refs.json"))
tr = list(csv.reader(open(S / "training-data-actief.tsv"), delimiter="\t"))
paden = sorted({r["path"] for r in refs} | {r[2] for r in tr})
sha = {p: hashlib.sha256((B / p).read_bytes()).hexdigest() for p in paden}
res = {"pad": paden, "sha256": [sha[p] for p in paden]}
for kind in ("siglip", "dino"):
    t0 = time.time(); e = Embedder(kind); res[kind] = e([Image.open(B / p) for p in paden]); print(kind, res[kind].shape, round(time.time() - t0), "s", flush=True)
np.savez(S / "embeddings.npz", **res)
