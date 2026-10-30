"""VTF: stap 1 van b6a0857 (visual_proposals, heel etiket + tegels, VISUAL_PROPOSAL_MAX_CALLS=6) via OpenRouter.
Gebruik: OPENROUTER_KEY=... fb_vtf.py <run> [proef] [max]  → <FASEB>/ruw/vtf/run<n>/<kaart>.json"""
import asyncio, json, os, sys, time
import fb_common as C

MODEL = "anthropic/claude-sonnet-5.5"
os.environ["VISUAL_PROPOSAL_MAX_CALLS"] = "6"

def etiketten(proef):
    if proef:
        return [{"kaart": d.split("\t")[0], "bestand": str(C.FASEB / "proef/gecombineerd" / (d.split("\t")[0] + ".png"))}
                for d in (C.FASEB / "proef/proeflijst.tsv").read_text().splitlines()[1:]]
    return C.selectie()["etiketten"]

async def etiket(mod, codes, e, uit):
    out = uit / f"{e['kaart']}.json"
    if out.exists(): return e["kaart"], "al gedaan"
    img, sha = C.lees_beeld(e["bestand"], e.get("beeld_sha256"))
    rec = {"kaart": e["kaart"], "variant": "vtf", "model": MODEL, "bron_sha256": sha, "w": img.shape[1], "h": img.shape[0],
           "max_calls": mod.max_calls(), "pogingen": [], "status": "mislukt", "vakken": []}
    t_eerste = time.time()
    for poging in range(3):  # maximaal 2 herhalingen
        t0 = time.time()
        try:
            boxes, stats = await mod.visual_proposals(img, codes, lambda: 165 - (time.time() - t0), 0.0)
            rec["pogingen"].append({"ok": True, "sec": round(time.time() - t0, 2), "stats": stats})
            rec["vakken"] = [[b["bbox"]["x"], b["bbox"]["y"], b["bbox"]["x"] + b["bbox"]["width"], b["bbox"]["y"] + b["bbox"]["height"]] for b in boxes]
            rec["status"] = "ok"; break
        except Exception as ex:
            rec["pogingen"].append({"ok": False, "sec": round(time.time() - t0, 2), "fout": f"{type(ex).__name__}: {str(ex)[:160]}"})
    st = [p["stats"] for p in rec["pogingen"] if p.get("stats")]
    tin = sum((s.get("tokens_in") or 0) for s in st); tout = sum((s.get("tokens_out") or 0) for s in st)
    rec.update({"sec_etiket": round(time.time() - t_eerste, 2), "tokens_in": tin, "tokens_out": tout, "kosten_tarief": C.kosten(MODEL, tin, tout)})
    out.write_text(json.dumps(rec, ensure_ascii=False, indent=1))
    return e["kaart"], f"{rec['status']} {len(rec['vakken'])} vakken {rec['sec_etiket']}s ${rec['kosten_tarief']:.4f}"

async def main():
    run = int(sys.argv[1]); proef = "proef" in sys.argv[2:]
    n = int(sys.argv[-1]) if sys.argv[-1].isdigit() and len(sys.argv) > 2 else None
    mod = C.load_proposals(MODEL)
    codes = sorted({r["code"] for r in json.loads((C.FASEB / "momentopname/actieve-refs.json").read_text())})
    uit = (C.FASEB / "proef/ruw/vtf" if proef else C.FASEB / "ruw/vtf") / f"run{run}"; uit.mkdir(parents=True, exist_ok=True)
    lab = asyncio.Semaphore(2)
    async def een(e):
        async with lab: return await etiket(mod, codes, e, uit)
    for i, fut in enumerate(asyncio.as_completed([een(e) for e in etiketten(proef)[:n]]), 1):
        k, s = await fut; print(i, k, s, flush=True)

if __name__ == "__main__":
    asyncio.run(main())
