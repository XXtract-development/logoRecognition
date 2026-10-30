"""Schrijft fase-b/bevroren.json (in deze map, wordt gecommit) met sha256 van alles wat vóór de eerste aanroep
op de meetset vastligt. Geen beelden, geen sleutels."""
import hashlib, json, time
from pathlib import Path
import fb_common as C

H = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
HIER = Path(__file__).parent; SPIKE = HIER.parent

def telscript():
    d = {"geschreven_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "bestanden": {str(p.relative_to(C.REPO)): H(p) for p in (HIER / "tel.py", HIER / "test_tel.py")}}
    (HIER / "bevroren-telscript.json").write_text(json.dumps(d, indent=1)); print("bevroren-telscript.json")

def main():
    from fb_k1 import INSTRUCTIE, SCHEMA, DEEL, referentieblad
    from fb_k3c import voorbeelden, DREMPEL, NMS, MAXK, OWL
    blad, codes = referentieblad(); snap = json.loads((C.FASEB / "momentopname/actieve-refs.json").read_text())
    import numpy as np; z = np.load(C.FASEB / "momentopname/embeddings.npz")
    d = {
        "geschreven_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "bestanden": {str(p.relative_to(C.REPO)): H(p) for p in [SPIKE / "SPEC.md", SPIKE / "meetopzet.md", C.ML / "services/artwork_proposals.py",
                      *sorted(x for x in HIER.glob("fb_*.py")), HIER / "fb_draai.sh"]},
        "waarheid": {"pad": str(C.BASE / "voorlopige-selectie.json"), "sha256": H(C.BASE / "voorlopige-selectie.json"),
                     "beelden": {e["kaart"]: e["beeld_sha256"] for e in C.selectie()["etiketten"]}},
        "k1": {"instructie_sha256": hashlib.sha256((INSTRUCTIE + "||" + DEEL).encode()).hexdigest(), "schema_sha256": hashlib.sha256(json.dumps(SCHEMA, sort_keys=True).encode()).hexdigest(),
               "referentieblad_sha256": hashlib.sha256(blad).hexdigest(), "referentieblad_codes": codes,
               "modellen": {"k1a": "google/gemini-3.8-flash (reasoning effort minimal)", "k1b": "anthropic/claude-sonnet-5.5"}, "venster_max_px": 1500, "jpeg_q": 85},
        "proeflijst_sha256": H(C.FASEB / "proef/proeflijst.tsv"),
        "momentopname": {"tijdstip": (C.FASEB / "momentopname/tijdstip.txt").read_text().strip(), "refs": len(snap),
                         "bestanden": dict(zip(z["pad"].tolist(), z["sha256"].tolist())), "embeddings_sha256": H(C.FASEB / "momentopname/embeddings.npz")},
        "drempels": {"k2a": 0.80, "k2b": 0.80, "k3b": 0.80, "k3c_naam": 0.80, "k3c_owl": DREMPEL, "k3c_nms": NMS, "k3c_max_per_venster": MAXK,
                     "b0": {"embedding": 0.80, "nutriscore-head": 0.80, "nutriscore-a2": 0.50}, "k4_top": 3},
        "k3c": {"model": OWL, "voorbeelden": {c: [p, H(C.FASEB / "momentopname/bestanden" / p)] for c, p in voorbeelden().items()}},
        "k3b_model_sha256": H(C.FASEB / "k3b-model.npz"),
        "modellen_lokaal": {"siglip": "google/siglip2-base-patch16-384", "dino": "timm vit_small_patch16_dinov3.lvd1689m", "owl": OWL},
    }
    (HIER / "bevroren.json").write_text(json.dumps(d, ensure_ascii=False, indent=1)); print("bevroren.json", len(d["bestanden"]), "bestanden")

if __name__ == "__main__":
    import sys
    telscript() if sys.argv[1:] == ["telscript"] else main()
