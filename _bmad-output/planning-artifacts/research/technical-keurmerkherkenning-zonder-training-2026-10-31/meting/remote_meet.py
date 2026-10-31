# Leest alleen: per map de originele bestanden en (bij PDF) tekstlaag, ingesloten afbeeldingen, fonts en makers. Schrijft niets op schijf.
import json, os, re, subprocess, sys
ROOT = "/media/Xmedia"
CODE_RE = {
  "FSC_CODE": re.compile(r"FSC[®\s]*[-–]?\s*C\s?\d{6}"),
  "MSC_CODE": re.compile(r"MSC[-–\s]*C[-–\s]*\d{5}"),
  "EU_BIO_CODE": re.compile(r"\b[A-Z]{2}[-–](?:BIO|ÖKO|OKO|ORG|ECO|EKO|ØKO|OEKO|BIO)[-–]\d{2,3}\b"),
}
WORD_RE = {k: re.compile(v, re.I) for k, v in {
  "w_fsc": r"\bFSC\b", "w_msc": r"\bMSC\b", "w_nutriscore": r"nutri[\s-]?score", "w_vegan": r"\bvegan", "w_rainforest": r"rainforest alliance",
  "w_beterleven": r"beter\s+leven", "w_weidemelk": r"weidemelk", "w_zwanger": r"zwanger|pregnan|enceinte|schwanger", "w_biologisch": r"biologisch|organic|\bbio\b",
  "w_groenepunt": r"gr[uü]ne[rn]?\s+punkt|groene\s+punt|green\s+dot", "w_recycle": r"recycl"}.items()}
def run(cmd, timeout=60):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, errors="replace").stdout
    except Exception as ex:
        return "__ERR__ " + type(ex).__name__
for line in sys.stdin:
    doc = json.loads(line); out = {"kaart": doc["kaart"], "doc": doc["doc"], "files": []}
    for d in doc["dirs"]:
        p = ROOT + d
        try:
            names = sorted(os.listdir(p))
        except Exception as ex:
            out["files"].append({"dir": d, "error": type(ex).__name__}); continue
        for n in names:
            if "_converted-" in n or n.endswith("_thumbnail.png"):
                continue
            f = os.path.join(p, n); ext = n.rsplit(".", 1)[-1].lower() if "." in n else ""
            rec = {"name_ext": ext, "bytes": os.path.getsize(f)}
            if ext in ("pdf", "ai"):
                info = run(["pdfinfo", f], 30)
                rec["pdfinfo_ok"] = "Pages:" in info
                for key in ("Creator", "Producer", "Pages", "Page size"):
                    m = re.search(rf"^{key}:\s*(.*)$", info, re.M)
                    if m: rec[key.lower().replace(" ", "_")] = m.group(1).strip()[:80]
                txt = run(["pdftotext", "-q", f, "-"], 60)
                rec["text_chars"] = len(txt.strip()) if not txt.startswith("__ERR__") else -1
                for k, rx in CODE_RE.items():
                    rec[k] = sorted(set(m.group(0) for m in rx.finditer(txt)))[:5]
                for k, rx in WORD_RE.items():
                    rec[k] = bool(rx.search(txt))
                imgs = run(["pdfimages", "-list", f], 60).splitlines()[2:]
                rec["n_images"] = len(imgs)
                big = 0
                for il in imgs:
                    parts = il.split()
                    try:
                        w, h = int(parts[3]), int(parts[4])
                        if w * h >= 4_000_000: big += 1
                    except Exception:
                        pass
                rec["n_images_ge_4mp"] = big
                fonts = run(["pdffonts", f], 30).splitlines()[2:]
                rec["n_fonts"] = len(fonts)
            out["files"].append(rec)
    print(json.dumps(out), flush=True)
