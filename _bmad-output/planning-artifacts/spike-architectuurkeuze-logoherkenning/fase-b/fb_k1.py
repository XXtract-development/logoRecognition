"""K1a/K1b (taalmodel vindt én benoemt) en de proef op trainingsproducten.
Gebruik: OPENROUTER_KEY=... fb_k1.py <k1a|k1b> <run> [proef] [max]
Schrijft per etiket <FASEB>/ruw/<variant>/run<run>/<kaart>.json (proef: <FASEB>/proef/ruw/<variant>/...)."""
import asyncio, base64, hashlib, io, json, os, sys, time
from pathlib import Path
import httpx
from PIL import Image, ImageDraw, ImageFont
import fb_common as C

MODEL = {"k1a": "google/gemini-3.8-flash", "k1b": "anthropic/claude-sonnet-5.5"}
OMSCHRIJVING = {
    "BETER_LEVEN_1_STER": "Dutch 'Beter Leven' animal-welfare mark with exactly ONE star (2 or 3 stars: use \"ander\").",
    "EUROPEAN_V_LABEL_VEGAN": "European V-Label: a V with a leaf, with the word 'vegan'.",
    "EU_ORGANIC_FARMING": "EU organic logo: white stars forming a leaf on a green rectangle.",
    "FOREST_STEWARDSHIP_COUNCIL_MIX": "FSC tree-and-check logo with the word 'MIX' (FSC 100% or FSC Recycled: use \"ander\").",
    "GREEN_DOT": "Der Gruene Punkt / Green Dot: two interlocking arrows forming a circle.",
    "MARINE_STEWARDSHIP_COUNCIL_LABEL": "MSC blue ecolabel: a fish shape with a tick, 'MSC'.",
    "NUTRISCORE_A": "Nutri-Score bar with the letter A highlighted (enlarged).",
    "NUTRISCORE_B": "Nutri-Score bar with the letter B highlighted (enlarged).",
    "NUTRISCORE_C": "Nutri-Score bar with the letter C highlighted (enlarged). Highlighted D or E: use \"ander\".",
    "PREGNANCY_WARNING": "Alcohol warning pictogram: silhouette of a pregnant woman (often drinking) inside a circle with a diagonal strike-through. Not on the reference sheet.",
    "RAINFOREST_ALLIANCE_PEOPLE_NATURE": "Rainforest Alliance seal: a round seal with a frog and the text 'Rainforest Alliance' and 'people & nature'.",
    "RECYCLABLE_GENERAL_CLAIM": "Generic recycling symbol: a Moebius loop of three chasing arrows WITHOUT a material number or material name (numbered resin codes, sorting/bin pictograms, Triman and 'recycled content' seals: use \"ander\").",
    "VEGAN": "Generic vegan claim badge or stamp with the word 'VEGAN' that is neither the V-Label nor the Vegan Society sunflower. Not on the reference sheet.",
    "VEGAN_SOCIETY_VEGAN_LOGO": "The Vegan Society trademark: a sunflower-like flower with the word 'VEGAN'.",
    "WEIDEMELK": "Dutch 'Weidemelk' (meadow milk) logo: a round badge with a cow and the word 'WEIDEMELK' around it.",
}
INSTRUCTIE = (
    "You locate certification, recycling and nutrition marks on a product packaging label.\n"
    "Image 1 is a reference sheet with example marks, each captioned with its code. Image 2 is the label (or a section of it).\n"
    "Return only JSON {\"logos\":[{\"code\":\"<CODE>\",\"box_2d\":[ymin,xmin,ymax,xmax]}]} with coordinates normalized 0..1000 "
    "relative to IMAGE 2. Report every visible occurrence separately with a tight box around the complete mark.\n"
    "Allowed codes:\n" + "\n".join(f"- {c}: {OMSCHRIJVING[c]}" for c in C.TOP15) + "\n"
    "Use \"ander\" for any other certification, recycling, nutrition or claim mark, or leave it out. "
    "Only report marks that are visibly printed; never infer a mark from text, ingredient lists or declarations. "
    "Ignore brand logos, barcodes and ordinary text. A label without any of these marks returns {\"logos\":[]}. At most 40 entries."
)
SCHEMA = {"type": "object", "additionalProperties": False, "required": ["logos"], "properties": {"logos": {"type": "array", "items": {
    "type": "object", "additionalProperties": False, "required": ["code", "box_2d"], "properties": {
        "code": {"type": "string", "enum": C.TOP15 + ["ander"]}, "box_2d": {"type": "array", "items": {"type": "number"}}}}}}}
DEEL = " Image 2 is one section of a larger label; include marks cut off at the section edge."

def referentieblad():
    refs = json.loads((C.FASEB / "momentopname/actieve-refs.json").read_text())
    gids = {r["code"]: r["path"] for r in sorted(refs, key=lambda r: r["id"])
            if r["source"] in ("gs1-packaging-label-guide", "synthetic-nutriscore-bootstrap") and r["code"] in C.TOP15}
    codes = [c for c in C.TOP15 if c in gids]
    cw, ch, cols = 360, 260, 4; rows = -(-len(codes) // cols)
    blad = Image.new("RGB", (cols * cw, rows * (ch + 34)), "white"); d = ImageDraw.Draw(blad)
    try: font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
    except OSError: font = ImageFont.load_default()
    for i, c in enumerate(codes):
        im = Image.open(C.FASEB / "momentopname/bestanden" / gids[c]).convert("RGBA")
        bg = Image.new("RGB", im.size, "white"); bg.paste(im, mask=im.split()[3])
        f = min((cw - 40) / bg.width, (ch - 20) / bg.height); bg = bg.resize((max(1, round(bg.width * f)), max(1, round(bg.height * f))), Image.LANCZOS)
        x, y = (i % cols) * cw, (i // cols) * (ch + 34)
        blad.paste(bg, (x + (cw - bg.width) // 2, y + 10)); d.text((x + 10, y + ch + 8), c, fill="black", font=font)
    buf = io.BytesIO(); blad.save(buf, "PNG"); return buf.getvalue(), codes

def parse(content, x0, y0, w, h):
    s = content.find("{")
    obj, _ = json.JSONDecoder().raw_decode(content, s)
    out = []
    for i, it in enumerate(obj["logos"]):
        code = it.get("code") if isinstance(it, dict) else None
        box = it.get("box_2d") if isinstance(it, dict) else None
        vak = None
        if isinstance(box, list) and len(box) == 4 and all(isinstance(v, (int, float)) for v in box):
            ymin, xmin, ymax, xmax = (min(1000, max(0, v)) for v in box)
            if ymin < ymax and xmin < xmax:
                vak = [x0 + xmin * w / 1000, y0 + ymin * h / 1000, x0 + xmax * w / 1000, y0 + ymax * h / 1000]
        out.append({"code": code, "vak": vak, "volgorde": i})
    return out

async def aanroep(client, model, blad_b64, img_b64, deel, sem):
    body = {"model": model, "temperature": 0, "max_tokens": 4096, "response_format": {"type": "json_schema", "json_schema": {"name": "logos", "strict": True, "schema": SCHEMA}},
            "usage": {"include": True},
            "messages": [{"role": "system", "content": INSTRUCTIE + (DEEL if deel else "")},
                         {"role": "user", "content": [
                             {"type": "image_url", "image_url": {"url": "data:image/png;base64," + blad_b64, "detail": "high"}},
                             {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + img_b64, "detail": "high"}}]}]}
    if model.startswith("google/"):
        body["reasoning"] = {"effort": "minimal"}
    fout = None
    for poging in range(3):  # maximaal 2 herhalingen
        async with sem:
            t0 = time.time()
            try:
                r = await client.post(C.OPENROUTER + "/chat/completions", json=body,
                                      headers={"Authorization": "Bearer " + os.environ["OPENROUTER_KEY"]})
                if r.status_code == 429 or r.status_code >= 500:
                    fout = f"http_{r.status_code}"; await asyncio.sleep(5 * (poging + 1)); continue
                r.raise_for_status(); env = r.json()
                ch = env["choices"][0]
                if ch.get("finish_reason") not in ("stop", "STOP"):
                    fout = f"finish_{ch.get('finish_reason')}"; continue
                try:
                    s0 = ch["message"]["content"]; json.JSONDecoder().raw_decode(s0, s0.find("{"))[0]["logos"]
                except Exception as ex:
                    fout = f"onleesbaar: {type(ex).__name__}"; continue
                return {"ok": True, "pogingen": poging + 1, "sec": round(time.time() - t0, 2), "content": ch["message"]["content"],
                        "usage": env.get("usage"), "provider": env.get("provider"), "model": env.get("model")}
            except (httpx.TimeoutException, httpx.TransportError) as e:
                fout = type(e).__name__; continue
            except Exception as e:
                return {"ok": False, "pogingen": poging + 1, "fout": f"{type(e).__name__}: {str(e)[:200]}"}
    return {"ok": False, "pogingen": 3, "fout": fout}

async def etiket(client, mod, variant, model, e, blad_b64, blad_sha, uitmap, sem):
    out = uitmap / f"{e['kaart']}.json"
    if out.exists(): return e["kaart"], "al gedaan"
    img, sha = C.lees_beeld(e["bestand"], e.get("beeld_sha256"))
    H, W = img.shape[:2]; vs = C.vensters(mod, img)
    t0 = time.time()
    enc = [C.jpeg_b64(img[y0:y1, x0:x1]) for (x0, y0, x1, y1) in vs]
    calls = await asyncio.gather(*[aanroep(client, model, blad_b64, b64, i > 0, sem) for i, (b64, _, _) in enumerate(enc)])
    rec = {"kaart": e["kaart"], "variant": variant, "model": model, "bron_sha256": sha, "w": W, "h": H, "referentieblad_sha256": blad_sha,
           "vensters": vs, "aanroepen": [], "meldingen": [], "status": "ok"}
    tin = tout = 0; kost = 0.0
    for i, ((x0, y0, x1, y1), c, (_, ew, eh)) in enumerate(zip(vs, calls, enc)):
        c = dict(c); c["venster"] = i; c["verstuurd_px"] = [ew, eh]
        if c["ok"]:
            try:
                for m in parse(c["content"], x0, y0, x1 - x0, y1 - y0):
                    m["venster"] = i; rec["meldingen"].append(m)
            except Exception as ex:
                c["ok"] = False; c["fout"] = f"parse: {type(ex).__name__}: {str(ex)[:120]}"
        u = c.get("usage") or {}
        tin += u.get("prompt_tokens") or 0; tout += u.get("completion_tokens") or 0; kost += u.get("cost") or 0
        rec["aanroepen"].append(c)
    if not all(c["ok"] for c in rec["aanroepen"]):
        rec["status"] = "mislukt"; rec["meldingen"] = []
    rec.update({"sec_etiket": round(time.time() - t0, 2), "tokens_in": tin, "tokens_out": tout, "kosten_openrouter": round(kost, 6),
                "kosten_tarief": C.kosten(model, tin, tout)})
    out.write_text(json.dumps(rec, ensure_ascii=False, indent=1))
    return e["kaart"], f"{rec['status']} {len(rec['meldingen'])} meldingen {rec['sec_etiket']}s ${rec['kosten_openrouter']:.4f}"

async def main():
    variant, run = sys.argv[1], int(sys.argv[2]); proef = "proef" in sys.argv[3:]
    n = int(sys.argv[-1]) if sys.argv[-1].isdigit() and len(sys.argv) > 3 else None
    mod = C.load_proposals(); blad, codes = referentieblad(); blad_b64 = base64.b64encode(blad).decode(); blad_sha = hashlib.sha256(blad).hexdigest()
    if proef:
        ets = [{"kaart": d.split("\t")[0], "bestand": str(C.FASEB / "proef/gecombineerd" / (d.split("\t")[0] + ".png"))}
               for d in (C.FASEB / "proef/proeflijst.tsv").read_text().splitlines()[1:]]
        uit = C.FASEB / "proef/ruw" / variant / f"run{run}"
    else:
        ets = C.selectie()["etiketten"]; uit = C.FASEB / "ruw" / variant / f"run{run}"
    uit.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(12); lab = asyncio.Semaphore(2)
    async with httpx.AsyncClient(timeout=httpx.Timeout(150)) as client:
        async def een(e):
            async with lab:
                return await etiket(client, mod, variant, MODEL[variant], e, blad_b64, blad_sha, uit, sem)
        for i, fut in enumerate(asyncio.as_completed([een(e) for e in ets[:n]]), 1):
            k, s = await fut; print(i, k, s, flush=True)

if __name__ == "__main__":
    asyncio.run(main())
