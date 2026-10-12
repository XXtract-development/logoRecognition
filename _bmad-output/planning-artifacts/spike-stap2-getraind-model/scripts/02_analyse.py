#!/usr/bin/env python
"""Stap 2: splitsingen, baseline, Model A (logistische regressie), Model C (train-uitsneden als referenties).

Leest <scr>/spike/embeddings.npz (uit 01_embed.py). Schrijft <scr>/spike/resultaten.json, <scr>/spike/splits.json
(voor 03_finetune.py) en <scr>/spike/tabellen.md (per-soort-tabellen voor het rapport). Seed 20261012.
"""
import sys, json, hashlib, collections, itertools, math
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
from scipy.stats import binomtest

SCR = sys.argv[1]; SEED = 20261012; NEAR = 0.98; DREMPELS = (0.75, 0.80)
rng = np.random.default_rng(SEED)
d = np.load(f"{SCR}/spike/embeddings.npz")
tr_label = np.array(d["tr_label"]); tr_gtin = np.array(d["tr_gtin"]); tr_path = np.array(d["tr_path"]); E_tr = d["E_tr"]
ref_code = np.array(d["ref_code"]); ref_path = np.array(d["ref_path"]); E_ref = d["E_ref"]
ref_gtin = np.array([p.split("/")[1] if p.startswith("artwork-crops/") else "" for p in ref_path])
N = len(tr_label); print("uitsneden", N, "referenties", len(ref_code))

# ---- byte-gelijke bestanden (sha256) ----
def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()
h_tr = [sha(f"{SCR}/spike/train-uit/{p}") for p in tr_path]
h_ref = [sha(f"{SCR}/refs-alle/{i}.png") for i in d["ref_id"]]
grp = collections.defaultdict(list)
for i, h in enumerate(h_tr): grp[h].append(i)
dup_groups = [g for g in grp.values() if len(g) > 1]
dup_cross_gtin = [g for g in dup_groups if len(set(tr_gtin[g])) > 1]
label_conflicts = [sorted(set(tr_label[g])) for g in dup_groups if len(set(tr_label[g])) > 1]
tr_eq_ref = sum(1 for h in h_tr if h in set(h_ref))
hashes = dict(train_dup_groups=len(dup_groups), train_dup_groups_cross_gtin=len(dup_cross_gtin),
              label_conflict_groups=label_conflicts, train_bytes_equal_ref=tr_eq_ref,
              train_path_equal_ref=int(np.isin(tr_path, ref_path).sum()),
              train_cos999_ref=int((E_tr @ E_ref.T).max(1).__ge__(0.999).sum()))
print("hashes", hashes)

# ---- families: GTIN's verbonden via cosinus >= NEAR (train x train, train x ref, ref x ref) ----
parent = {}
def find(x):
    parent.setdefault(x, x)
    while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
    return x
def union(a, b): parent[find(a)] = find(b)
for g in set(tr_gtin) | set(ref_gtin) - {""}: find(g)
def connect(A, ga, B, gb, skip_diag):
    M = A @ B.T
    ii, jj = np.where(M >= NEAR)
    for i, j in zip(ii, jj):
        if ga[i] and gb[j] and ga[i] != gb[j]: union(ga[i], gb[j])
connect(E_tr, tr_gtin, E_tr, tr_gtin, True); connect(E_tr, tr_gtin, E_ref, ref_gtin, False); connect(E_ref, ref_gtin, E_ref, ref_gtin, True)
fam_of = {g: find(g) for g in parent}
tr_fam = np.array([fam_of[g] for g in tr_gtin]); ref_fam = np.array([fam_of[g] if g else "" for g in ref_gtin])
fams = sorted(set(tr_fam)); print("GTIN's", len(set(tr_gtin)), "families", len(fams))

# ---- splitsingen ----
test_E = ~np.isin(tr_gtin, list(set(ref_gtin) - {""}))
fam_perm = list(fams); rng.shuffle(fam_perm)
test_fams = set(fam_perm[: round(0.2 * len(fams))])
test_F = np.isin(tr_fam, list(test_fams))
splits = {"E": dict(test=test_E, ref_keep=np.ones(len(ref_code), bool)),
          "F": dict(test=test_F, ref_keep=~np.isin(ref_fam, list(test_fams)))}
assert not (set(tr_fam[test_F]) & set(ref_fam[splits["F"]["ref_keep"]])), "F: test-familie in baseline-refs"
assert not (set(tr_gtin[test_E]) & set(ref_gtin)), "E: test-GTIN in refs"

# ---- helpers ----
def wilson(k, n, z=1.96):
    if n == 0: return (0.0, 0.0)
    p = k / n; den = 1 + z * z / n; c = (p + z * z / (2 * n)) / den; hw = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0, c - hw), min(1, c + hw))
def mcnemar(a, b):  # a,b bool-arrays juist; exact tweezijdig
    n01 = int((a & ~b).sum()); n10 = int((~a & b).sum()); nd = n01 + n10
    p = 1.0 if nd == 0 else binomtest(min(n01, n10), nd, 0.5).pvalue
    # kleinst aantoonbaar verschil: kleinste |b-c| met p<0,05 bij nd discordante paren
    mdd = next((k for k in range(nd + 1) if (nd + k) % 2 == 0 and nd and binomtest((nd - k) // 2, nd, 0.5).pvalue < 0.05), None)
    return dict(n01=n01, n10=n10, discordant=nd, p=p, kleinst_aantoonbaar_verschil=mdd)
def cluster_boot(correct, fams_arr, base_correct=None, B=2000):
    uf = np.unique(fams_arr); idx = {f: np.where(fams_arr == f)[0] for f in uf}; r = np.random.default_rng(SEED)
    accs, diffs = [], []
    for _ in range(B):
        pick = r.choice(uf, len(uf), replace=True); ii = np.concatenate([idx[f] for f in pick])
        accs.append(correct[ii].mean())
        if base_correct is not None: diffs.append(correct[ii].mean() - base_correct[ii].mean())
    out = dict(boot_ci=[float(np.percentile(accs, 2.5)), float(np.percentile(accs, 97.5))])
    if base_correct is not None: out["boot_ci_verschil"] = [float(np.percentile(diffs, 2.5)), float(np.percentile(diffs, 97.5))]
    return out
def nn(Q, R, codes):
    S = Q @ R.T; j = S.argmax(1); return codes[j], S[np.arange(len(Q)), j]
def evalueer(pred, score, y, fam, labels_small, drempels, base_correct=None, n_onterecht_match=None):
    correct = pred == y; n = len(y)
    per = {}
    for lab in sorted(set(y)):
        m = y == lab; row = dict(n=int(m.sum()), juist=int(correct[m].sum()), klein=bool(lab in labels_small))
        for t in drempels:
            row[f"gevonden@{t}"] = int((correct & (score >= t))[m].sum()); row[f"onterecht@{t}"] = int((~correct & (score >= t))[m].sum())
        per[lab] = row
    big = ~np.isin(y, list(labels_small))
    tot = dict(n=n, juist=int(correct.sum()), pct=correct.mean(), wilson=wilson(int(correct.sum()), n),
               n_groot=int(big.sum()), juist_groot=int(correct[big].sum()),
               macro_recall=float(np.mean([v["juist"] / v["n"] for v in per.values()])))
    for t in drempels:
        tot[f"gevonden@{t}"] = int((correct & (score >= t)).sum()); tot[f"onterecht@{t}"] = int((~correct & (score >= t)).sum()); tot[f"onder@{t}"] = int((score < t).sum())
    tot.update(cluster_boot(correct, fam, base_correct))
    if base_correct is not None: tot["mcnemar"] = mcnemar(base_correct, correct)
    if n_onterecht_match is not None:  # drempel zodat #onterecht <= match, hoogste gevonden
        ts = np.sort(np.unique(score))[::-1]; best = None
        for t in ts:
            if (~correct & (score >= t)).sum() <= n_onterecht_match: best = (float(t), int((correct & (score >= t)).sum()))
        tot["bij_gelijk_onterecht"] = dict(onterecht_max=int(n_onterecht_match), drempel=best[0] if best else None, gevonden=best[1] if best else 0)
    return dict(totaal=tot, per_soort=per, correct=correct.tolist(), score=score.tolist(), pred=pred.tolist())

# ---- per splitsing ----
res = dict(hashes=hashes, families=len(fams), gtins=len(set(tr_gtin)), near_threshold=NEAR, seed=SEED, splits={})
for naam, sp in splits.items():
    te, trn = sp["test"], ~sp["test"]; keep = sp["ref_keep"]
    y_te, y_tr = tr_label[te], tr_label[trn]; fam_te = tr_fam[te]
    cnt_te = collections.Counter(y_te); cnt_tr = collections.Counter(y_tr)
    small = {l for l, c in cnt_te.items() if c < 3}
    train_only = sorted(set(y_tr) - set(y_te)); test_only = sorted(set(y_te) - set(y_tr))
    # lek-telling (E): test-uitsnede met cos>=NEAR tegen train of ref
    leak = ((E_tr[te] @ E_tr[trn].T).max(1) >= NEAR) | ((E_tr[te] @ E_ref[keep].T).max(1) >= NEAR)
    info = dict(n_train=int(trn.sum()), n_test=int(te.sum()), gtin_train=len(set(tr_gtin[trn])), gtin_test=len(set(tr_gtin[te])),
                fam_train=len(set(tr_fam[trn])), fam_test=len(set(fam_te)), refs_baseline=int(keep.sum()), refs_verwijderd=int((~keep).sum()),
                soorten_train_only=train_only, soorten_test_only=test_only, soorten_klein=sorted(small), lek_test=int(leak.sum()),
                per_soort={l: dict(train=cnt_tr.get(l, 0), test=cnt_te.get(l, 0), gtin_train=len(set(tr_gtin[trn & (tr_label == l)])), gtin_test=len(set(tr_gtin[te & (tr_label == l)]))) for l in sorted(set(tr_label))})
    out = dict(info=info, methoden={})
    # baseline
    p, s = nn(E_tr[te], E_ref[keep], ref_code[keep]); base = evalueer(p, s, y_te, fam_te, small, DREMPELS); out["methoden"]["baseline"] = base
    bc = np.array(base["correct"]); match = base["totaal"]["onterecht@0.8"]
    # baseline beperkt tot train-soorten
    kb = keep & np.isin(ref_code, list(set(y_tr)))
    p, s = nn(E_tr[te], E_ref[kb], ref_code[kb]); out["methoden"]["baseline_beperkt"] = evalueer(p, s, y_te, fam_te, small, DREMPELS, bc, match)
    # Model C
    Rc = np.vstack([E_ref[keep], E_tr[trn]]); Cc = np.concatenate([ref_code[keep], y_tr])
    p, s = nn(E_tr[te], Rc, Cc); out["methoden"]["model_C"] = evalueer(p, s, y_te, fam_te, small, DREMPELS, bc, match)
    # Model A: CV-drempel op train (familie-gegroepeerd), baseline leave-family-out op dezelfde uitsneden
    labs = sorted(set(y_tr)); fam_tr = tr_fam[trn]; X_tr = E_tr[trn]
    oof = np.zeros(trn.sum()); oofp = np.empty(trn.sum(), dtype=object)
    gkf = GroupKFold(n_splits=5)
    for a, b in gkf.split(X_tr, y_tr, fam_tr):
        if len(set(y_tr[a])) < 2: continue
        clf = LogisticRegression(C=10.0, class_weight="balanced", max_iter=5000).fit(X_tr[a], y_tr[a])
        pr = clf.predict_proba(X_tr[b]); oof[b] = pr.max(1); oofp[b] = clf.classes_[pr.argmax(1)]
    oof_wrong = oofp != y_tr
    lfo_wrong = np.zeros(trn.sum(), bool)
    for i in range(trn.sum()):
        k = keep & (ref_fam != fam_tr[i]); S = E_tr[trn][i] @ E_ref[k].T; j = S.argmax()
        lfo_wrong[i] = (ref_code[k][j] != y_tr[i]) & (S[j] >= 0.80)
    doel = lfo_wrong.mean()
    grid = np.round(np.arange(0.05, 1.0, 0.01), 2)
    tA = next((float(t) for t in grid if (oof_wrong & (oof >= t)).mean() <= doel), 0.99)
    clf = LogisticRegression(C=10.0, class_weight="balanced", max_iter=5000).fit(X_tr, y_tr)
    pr = clf.predict_proba(E_tr[te]); pA = clf.classes_[pr.argmax(1)]; sA = pr.max(1)
    mA = evalueer(pA, sA, y_te, fam_te, small, DREMPELS + (tA,), bc, match)
    mA["drempelkeuze"] = dict(doel_onterecht_baseline_lfo=float(doel), cv_onterecht_bij_drempel=float((oof_wrong & (oof >= tA)).mean()), drempel=tA, cv_top1=float((~oof_wrong).mean()))
    out["methoden"]["model_A"] = mA
    # lek-subset (E): zelfde metingen zonder lekkende test-uitsneden
    if leak.any() and (~leak).sum() > 0:
        sub = {}
        for m_naam, m in out["methoden"].items():
            c = np.array(m["correct"])[~leak]; sub[m_naam] = dict(n=int((~leak).sum()), juist=int(c.sum()), wilson=wilson(int(c.sum()), int((~leak).sum())))
        out["zonder_lek"] = sub
    res["splits"][naam] = out
    print(f"\n== splitsing {naam}: train {info['n_train']} test {info['n_test']} (fam {info['fam_train']}/{info['fam_test']}, refs {info['refs_baseline']}, lek {info['lek_test']})")
    for m_naam, m in out["methoden"].items():
        t = m["totaal"]; extra = f" McNemar p={t['mcnemar']['p']:.3g}" if "mcnemar" in t else ""
        print(f"  {m_naam:17s} top-1 {t['juist']}/{t['n']} = {t['pct']:.1%} Wilson {t['wilson'][0]:.1%}-{t['wilson'][1]:.1%} | @0.80 gevonden {t['gevonden@0.8']} onterecht {t['onterecht@0.8']}{extra}")
    print("  model_A drempel:", mA["drempelkeuze"], "→ @drempel gevonden", mA["totaal"][f"gevonden@{tA}"], "onterecht", mA["totaal"][f"onterecht@{tA}"])

json.dump(dict(test_E=test_E.tolist(), test_F=test_F.tolist(), ref_keep_F=splits["F"]["ref_keep"].tolist(), tr_fam=tr_fam.tolist(), seed=SEED),
          open(f"{SCR}/spike/splits.json", "w"))
json.dump(res, open(f"{SCR}/spike/resultaten.json", "w"), indent=1, default=float)
print("\ngeschreven resultaten.json, splits.json")
