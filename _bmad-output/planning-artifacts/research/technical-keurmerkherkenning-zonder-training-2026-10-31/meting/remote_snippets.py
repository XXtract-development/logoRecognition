# Tweede meting (alleen lezen): ruimere patronen, met context, om de 0 treffers bij negatieven te toetsen.
import json, os, re, subprocess, sys
ROOT = "/media/Xmedia"
PAT = re.compile(r"(FSC|MSC|BIO|ÖKO|OKO|ORG|C\s?\d{6}|\d{5})", re.I)
WIDE = {"fsc": re.compile(r"FSC", re.I), "msc": re.compile(r"\bMSC\b", re.I), "c6": re.compile(r"\bC\s?\d{6}\b"), "mscc": re.compile(r"C[-–\s]?\d{5}\b"),
        "eubio": re.compile(r"\b[A-Z]{2}\s?[-–]\s?[A-ZÖØ]{2,4}\s?[-–]\s?\d{2,3}\b")}
for line in sys.stdin:
    doc = json.loads(line); out = {"doc": doc["doc"], "hits": {}}
    for d in doc["dirs"]:
        p = ROOT + d
        try: names = os.listdir(p)
        except Exception: continue
        for n in names:
            if not n.lower().endswith((".pdf", ".ai")) or "_converted-" in n: continue
            try: txt = subprocess.run(["pdftotext", "-q", os.path.join(p, n), "-"], capture_output=True, text=True, timeout=60, errors="replace").stdout
            except Exception: continue
            flat = " ".join(txt.split())
            for k, rx in WIDE.items():
                for m in list(rx.finditer(flat))[:3]:
                    out["hits"].setdefault(k, []).append(flat[max(0, m.start()-25):m.end()+25])
    print(json.dumps(out, ensure_ascii=False), flush=True)
