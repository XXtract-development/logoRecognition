#!/usr/bin/env python3
"""Offline: leest de kleur-lezer (nutriscore_reader) de letter uit de K4-aa-uitsneden van een bewaarde run?
SPEC-nutriscore-k4aa-letterlezer (bewijs voor CAP-2). Alleen etiketten met precies één bevestigde letter tellen.

  python3 scripts/nutriscore_crop_lezer_offline.py --answers <map met <id>.json> --truth <uitslag.json> \
      --images <toets/beelden> [--margin 0.15] [--min-ratio 1.18]
Heeft cv2 en numpy nodig (ml-service-omgeving). Laadt nutriscore_reader rechtstreeks, zonder de app.
"""
import argparse, collections, glob, importlib.util, json, logging, os, sys, types

READER = os.path.join(os.path.dirname(__file__), "..", "apps/ml-service/app/services/nutriscore_reader.py")


def load_reader():
    for n in ("app", "app.core", "app.core.logging"):
        sys.modules[n] = types.ModuleType(n)
    sys.modules["app.core.logging"].logger = logging.getLogger("lezer")
    spec = importlib.util.spec_from_file_location("nutriscore_reader", READER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.read_nutriscore


def crop(img, box, margin):
    H, W = img.shape[:2]
    mx, my = int(box["width"] * margin), int(box["height"] * margin)
    return img[max(0, box["y"] - my):min(H, box["y"] + box["height"] + my),
               max(0, box["x"] - mx):min(W, box["x"] + box["width"] + mx)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--answers", required=True)
    ap.add_argument("--truth", required=True)
    ap.add_argument("--images", required=True)
    ap.add_argument("--margin", type=float, default=0.15)
    ap.add_argument("--min-ratio", type=float, default=1.18)
    a = ap.parse_args()
    import cv2
    read = load_reader()
    truth = json.load(open(a.truth))
    c = collections.Counter()
    for f in sorted(glob.glob(os.path.join(a.answers, "*.json"))):
        eid = os.path.basename(f)[:-5]
        t = truth.get(eid) or {}
        letters = {x[-1] for x in (t.get("nutriscore") or []) if x[-1] in "ABCDE"}
        if t.get("status") != "bevestigd" or len(letters) != 1:
            continue
        want = next(iter(letters))
        dets = [d for d in ((json.load(open(f)).get("logoResults") or {}).get("detections") or [])
                if (d.get("t3777_code") or "").startswith("NUTRISCORE_")]
        if not dets:
            continue
        img = cv2.imread(os.path.join(a.images, eid + ".png"))
        for d in dets[:1]:  # één uitsnede per etiket
            got, _ = read(crop(img, d["bbox"], a.margin), full_page=False, min_ratio=a.min_ratio)
            c[(want, "geen" if got is None else ("goed" if got == want else "fout:" + got))] += 1
    tot = collections.Counter()
    for (want, res), n in sorted(c.items()):
        print(want, res, n)
        tot[res.split(":")[0]] += n
    print("totaal", dict(tot))


if __name__ == "__main__":
    main()
