"""K3c: OWLv2 beeld-gestuurd zoeken (15 voorbeeldbeelden) op de K1-vensters (≤1500 px), lokaal CPU; kandidaten
(sigmoid ≥ 0,2, NMS IoU 0,3 per venster, max 50 per venster) worden benoemd door SigLIP 2 zoals K2a.
Gebruik: fb_k3c.py <run> [proef] [max]  → <FASEB>/ruw/k3c/run<n>/<kaart>.json"""
import json, resource, sys, time
import cv2, numpy as np, torch
from PIL import Image
from torchvision.ops import nms
from transformers import Owlv2ForObjectDetection, Owlv2Processor
import fb_common as C
from fb_embed import Embedder, rgb
from fb_stap2 import refs, top_cos

OWL = "google/owlv2-base-patch16-ensemble"; DREMPEL, NMS, MAXK = 0.2, 0.3, 50
torch.set_grad_enabled(False)

def voorbeelden():
    r = json.loads((C.FASEB / "momentopname/actieve-refs.json").read_text())
    gids = {x["code"]: x["path"] for x in sorted(r, key=lambda x: x["id"]) if x["source"] in ("gs1-packaging-label-guide", "synthetic-nutriscore-bootstrap")}
    rc = {x["code"]: x["path"] for x in sorted(r, key=lambda x: x["id"], reverse=True) if x["source"] == "review-confirmed"}  # laagste id wint
    return {c: gids.get(c) or rc[c] for c in C.TOP15}

class Owl:
    def __init__(self):
        self.p = Owlv2Processor.from_pretrained(OWL); self.m = Owlv2ForObjectDetection.from_pretrained(OWL).eval()
        vb = voorbeelden(); self.codes = list(vb); self.paden = vb; q = []
        for c in self.codes:
            fm = self.m.image_embedder(pixel_values=self.p(images=rgb(Image.open(C.FASEB / "momentopname/bestanden" / vb[c])), return_tensors="pt").pixel_values)[0]
            b, h, w, d = fm.shape; qe, _, _ = self.m.embed_image_query(fm.reshape(b, h * w, d), fm); q.append(qe.reshape(-1, qe.shape[-1])[0])
        self.Q = torch.stack(q)[None]

    def zoek(self, pil):
        W, H = pil.size; S = max(W, H)
        fm = self.m.image_embedder(pixel_values=self.p(images=pil, return_tensors="pt").pixel_values)[0]
        b, h, w, d = fm.shape; f = fm.reshape(b, h * w, d)
        logits, _ = self.m.class_predictor(image_feats=f, query_embeds=self.Q)
        boxes = self.m.box_predictor(f, fm)[0]
        sc, qi = torch.sigmoid(logits[0]).max(-1)
        keep = (sc >= DREMPEL).nonzero().flatten()
        if len(keep) == 0: return []
        cx, cy, bw, bh = boxes[keep].unbind(-1)
        xy = torch.stack([(cx - bw / 2) * S, (cy - bh / 2) * S, (cx + bw / 2) * S, (cy + bh / 2) * S], -1).clamp(min=0)
        xy[:, 0::2] = xy[:, 0::2].clamp(max=W); xy[:, 1::2] = xy[:, 1::2].clamp(max=H)
        k = nms(xy, sc[keep], NMS)[:MAXK]
        return [(xy[j].tolist(), float(sc[keep][j]), self.codes[int(qi[keep][j])]) for j in k]

def main():
    run = int(sys.argv[1]); proef = "proef" in sys.argv[2:]
    n = int(sys.argv[-1]) if sys.argv[-1].isdigit() and len(sys.argv) > 2 else None
    mod = C.load_proposals(); owl = Owl(); emb = Embedder("siglip"); r, z, ri = refs(); R = z["siglip"][ri]; codes = [x["code"] for x in r]
    if proef:
        ets = [{"kaart": d.split("\t")[0], "bestand": str(C.FASEB / "proef/gecombineerd" / (d.split("\t")[0] + ".png"))}
               for d in (C.FASEB / "proef/proeflijst.tsv").read_text().splitlines()[1:]]
    else:
        ets = C.selectie()["etiketten"]
    uit = (C.FASEB / ("proef/ruw" if proef else "ruw")) / "k3c" / f"run{run}"; uit.mkdir(parents=True, exist_ok=True)
    for i, e in enumerate(ets[:n], 1):
        out = uit / f"{e['kaart']}.json"
        if out.exists(): continue
        rec = {"kaart": e["kaart"], "variant": "k3c", "status": "mislukt", "vakken": [], "voorbeelden": owl.paden}
        try:
            t0 = time.time(); img, sha = C.lees_beeld(e["bestand"], e.get("beeld_sha256")); rec["bron_sha256"] = sha
            kand = []
            for (x0, y0, x1, y1) in C.vensters(mod, img):
                win = img[y0:y1, x0:x1]; hh, ww = win.shape[:2]; f = min(1.0, 1500 / max(hh, ww))
                small = cv2.resize(win, (max(1, round(ww * f)), max(1, round(hh * f))), interpolation=cv2.INTER_AREA) if f < 1 else win
                for (bx, s, qc) in owl.zoek(Image.fromarray(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))):
                    kand.append(([x0 + bx[0] / f, y0 + bx[1] / f, x0 + bx[2] / f, y0 + bx[3] / f], s, qc))
            t1 = time.time()
            pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)); H, W = img.shape[:2]
            geldig = [k for k in kand if min(k[0][2], W) - max(k[0][0], 0) >= 1 and min(k[0][3], H) - max(k[0][1], 0) >= 1]
            crops = [pil.crop((round(k[0][0]), round(k[0][1]), round(k[0][2]), round(k[0][3]))) for k in geldig]
            tops = top_cos(emb(crops), R, codes) if crops else []
            rec["vakken"] = [{"vak": k[0], "owl_score": round(k[1], 4), "owl_voorbeeld": k[2], "top": t} for k, t in zip(geldig, tops)]
            rec.update({"status": "ok", "sec_stap1": round(t1 - t0, 2), "sec_stap2": round(time.time() - t1, 2), "sec_etiket": round(time.time() - t0, 2)})
        except Exception as ex:
            rec["fout"] = f"{type(ex).__name__}: {str(ex)[:200]}"
        rec["piek_rss_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**20)
        out.write_text(json.dumps(rec, ensure_ascii=False))
        print(i, e["kaart"], rec["status"], len(rec["vakken"]), rec.get("sec_etiket"), flush=True)

if __name__ == "__main__":
    main()
