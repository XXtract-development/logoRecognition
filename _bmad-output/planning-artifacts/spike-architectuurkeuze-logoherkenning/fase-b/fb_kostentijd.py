"""CAP-4: kosten en tijd per variant uit de ruwe uitvoer. Schrijft <FASEB>/kostentijd.json en <FASEB>/kosten.json
(gemiddelde kosten per etiket per variant, invoer voor tel.py --kosten). Tijd per etiket = stap 1 + stap 2."""
import json, statistics, time
from datetime import datetime
import fb_common as C

def lees(v, r):
    return {p.stem: json.loads(p.read_text()) for p in (C.FASEB / "ruw" / v / f"run{r}").glob("*.json")}

def samenvatting(tijden, kosten, n, mislukt, rss=None):
    t = sorted(x for x in tijden if x is not None)
    q = lambda f: t[min(len(t) - 1, int(f * len(t)))] if t else None
    return {"etiketten": n, "mislukt": mislukt, "kosten_totaal": round(sum(kosten), 4), "kosten_per_etiket": round(sum(kosten) / n, 5) if n else None,
            "tijd_mediaan": round(statistics.median(t), 2) if t else None, "tijd_p90": q(0.9), "tijd_max": t[-1] if t else None,
            "boven_165s": sum(x > 165 for x in t), "piek_rss_mb": rss}

def main():
    out, per = {}, {}
    for r in (1, 2):
        k1 = {v: lees(v, r) for v in ("k1a", "k1b")}; vtf = lees("vtf", r)
        for v, d in k1.items():
            out[f"{v}/{r}"] = samenvatting([x["sec_etiket"] for x in d.values()], [x.get("kosten_openrouter") or 0 for x in d.values()], len(d), sum(x["status"] != "ok" for x in d.values()))
        out[f"vtf/{r}"] = samenvatting([x["sec_etiket"] for x in vtf.values()], [x["kosten_tarief"] or 0 for x in vtf.values()], len(vtf), sum(x["status"] != "ok" for x in vtf.values()))
        for v in ("k2a", "k2b", "k3b"):
            d = lees(v, r)
            out[f"{v}/{r}"] = samenvatting([vtf[k]["sec_etiket"] + x["sec_stap2"] for k, x in d.items() if x["status"] == "ok"],
                                           [vtf[k]["kosten_tarief"] or 0 for k in d], len(d), sum(x["status"] != "ok" for x in d.values()), max((x["piek_rss_mb"] for x in d.values()), default=None))
        for x in ("a", "b"):
            for y in ("a", "b"):
                d = lees(f"k2{y}-op-k1{x}", r); kk = k1[f"k1{x}"]
                out[f"k4-{x}{y}/{r}"] = samenvatting([kk[k]["sec_etiket"] + e["sec_stap2"] for k, e in d.items() if e["status"] == "ok"],
                                                     [kk[k].get("kosten_openrouter") or 0 for k in d], len(d), sum(e["status"] != "ok" for e in d.values()), max((e["piek_rss_mb"] for e in d.values()), default=None))
        d = lees("k3c", r)
        out[f"k3c/{r}"] = samenvatting([x.get("sec_etiket") for x in d.values()], [0 for _ in d], len(d), sum(x["status"] != "ok" for x in d.values()), max((x["piek_rss_mb"] for x in d.values()), default=None))
    b0 = [json.loads(p.read_text()) for p in (C.BASE / "nulmeting/ruw").glob("*.json")]
    ts = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").timestamp()
    out["b0/1"] = samenvatting([ts(x["klaar"]) - ts(x["gestart"]) for x in b0], [], len(b0), sum((x.get("get") or {}).get("body", {}).get("status") != "done" if isinstance((x.get("get") or {}).get("body"), dict) else True for x in b0))
    out["b0/1"]["kosten_per_etiket"] = None
    out["b0/1"]["let_op"] = "tijd = upload + wachtrij + scan via de ACC-API (incl. 5 s pollinterval); kosten niet per scan gemeten (schatting meetopzet §7: ±$0,01/etiket)"
    for key, s in out.items():
        per.setdefault(key.split("/")[0], []).append(s["kosten_per_etiket"])
    kosten = {v: max(x for x in xs if x is not None) if any(x is not None for x in xs) else None for v, xs in per.items()}
    kosten["b0"] = 0.01
    (C.FASEB / "kostentijd.json").write_text(json.dumps(out, indent=1)); (C.FASEB / "kosten.json").write_text(json.dumps(kosten, indent=1))
    for k, s in sorted(out.items()): print(k, s)

if __name__ == "__main__":
    main()
