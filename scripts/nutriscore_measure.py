#!/usr/bin/env python3
"""Meet Nutri-Score A-E op ACC (SPEC-nutriscore-acc-test). Stuurt de bevestigde etiketten naar het
logo-scan-endpoint en rapporteert per letter gevonden / vals. De sleutel komt uit de Keychain
(service LOGO_PIPELINE_KEYS_EXTRA, account acc) of uit LOGO_KEY en wordt nergens getoond of bewaard.

  python3 scripts/nutriscore_measure.py --truth <toets/uitslag.json> --images <toets/beelden> --out <map buiten repo>
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor

LETTERS = "ABCDE"
BASE = "https://logo-detection.acc.xxtract.com"
SCANS = "/api/v1/pipeline/logo-scans"


def parse_key(raw):
    """'naam:sleutel' -> sleutel (alles na de eerste ':')."""
    return raw.split(":", 1)[1].strip() if ":" in raw else raw.strip()


def get_key():
    raw = os.environ.get("LOGO_KEY")
    if not raw:
        r = subprocess.run(["security", "find-generic-password", "-a", "acc", "-s", "LOGO_PIPELINE_KEYS_EXTRA", "-w"],
                           capture_output=True, text=True)
        raw = r.stdout.strip() if r.returncode == 0 else ""
    return parse_key(raw) if raw else None


def extract_letters(result):
    return {d["t3777_code"][-1] for d in (result or {}).get("detections", [])
            if d.get("t3777_code", "").startswith("NUTRISCORE_") and d["t3777_code"][-1] in LETTERS}


def score(truth, answers):
    """truth: id -> set(letters); answers: id -> set(letters) | None (geen antwoord)."""
    ids = [i for i in truth if answers.get(i) is not None]
    res = {"letters": {}, "zonder_antwoord": len(truth) - len(ids),
           "matrix": {l: {} for l in LETTERS}}
    for i in ids:
        for t in truth[i]:
            for g in (answers[i] or {"geen"}):
                res["matrix"][t][g] = res["matrix"][t].get(g, 0) + 1
    for L in LETTERS:
        pos = [i for i in ids if L in truth[i]]
        rep = [i for i in ids if L in answers[i]]
        tp = sum(1 for i in pos if L in answers[i])
        fp = len(rep) - sum(1 for i in rep if L in truth[i])
        g = 100.0 * tp / len(pos) if pos else None
        v = 100.0 * fp / len(rep) if rep else None
        res["letters"][L] = {"gevonden_n": tp, "gevonden_d": len(pos), "gevonden_pct": g,
                             "vals_n": fp, "vals_d": len(rep), "vals_pct": v,
                             "eis_gehaald": g is not None and v is not None and g >= 80 and v <= 10}
    return res


def _answer_path(out, eid):
    return os.path.join(out, eid + ".json")


def _usable(lr):
    """Een scan die 'done' is maar intern mislukte of oversloeg is geen antwoord."""
    return lr if isinstance(lr, dict) and lr.get("status") in ("ok", "partial", None) else None


def run(truth_path, images, out, key, post, get, poll_s=3, max_wait_s=300, workers=2):
    os.makedirs(out, exist_ok=True)
    ids = list(json.load(open(truth_path)))

    def one(eid):
        p = _answer_path(out, eid)
        if os.path.exists(p):
            prev = json.load(open(p))
            if prev.get("status") == "done":
                return eid, _usable(prev.get("logoResults"))
        st, body = post(SCANS, {"rescan": "true"}, os.path.join(images, eid + ".png"), key)
        if st != 202 or not isinstance(body, dict) or "scanId" not in body:
            return eid, None
        deadline = time.time() + max_wait_s
        while True:
            st, r = get(f"{SCANS}/{body['scanId']}", key)
            if st == 200 and isinstance(r, dict) and r.get("status") == "done":
                json.dump(r, open(p, "w"))
                return eid, _usable(r.get("logoResults"))
            if st != 200 or (isinstance(r, dict) and r.get("status") in ("failed", "superseded")):
                return eid, None
            if time.time() >= deadline:
                return eid, None
            time.sleep(poll_s)

    with ThreadPoolExecutor(workers) as ex:
        got = dict(ex.map(one, ids))
    return {e: (None if r is None else extract_letters(r)) for e, r in got.items()}


def _http(method, path, key, data=None, headers=None):
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"x-api-key": key, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:
        return 0, None


def http_post(path, fields, image_path, key):
    b = uuid.uuid4().hex
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()]
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\n'
                 'Content-Type: image/png\r\n\r\n'.encode() + open(image_path, "rb").read() + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return _http("POST", path, key, b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={b}"})


def http_get(path, key):
    return _http("GET", path, key)


def report(r):
    out = ["| letter | gevonden | vals (aandeel foute meldingen) | eis |", "|---|---|---|---|"]
    for L, x in r["letters"].items():
        g = "n.v.t." if x["gevonden_pct"] is None else f'{x["gevonden_pct"]:.0f}% ({x["gevonden_n"]}/{x["gevonden_d"]})'
        v = "n.v.t." if x["vals_pct"] is None else f'{x["vals_pct"]:.0f}% ({x["vals_n"]}/{x["vals_d"]})'
        out.append(f'| {L} | {g} | {v} | {"gehaald" if x["eis_gehaald"] else "niet gehaald"} |')
    out.append(f'\nZonder antwoord: {r["zonder_antwoord"]}. Matrix (waarheid -> gemeld): {json.dumps(r["matrix"])}')
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--truth", required=True)
    ap.add_argument("--images", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    key = get_key()
    if not key:
        sys.exit("Geen sleutel (Keychain LOGO_PIPELINE_KEYS_EXTRA/acc of LOGO_KEY).")
    ans = run(a.truth, a.images, a.out, key, http_post, http_get)
    truth = {k: set(v.get("nutriscore") or []) for k, v in json.load(open(a.truth)).items()}
    print(report(score(truth, ans)))


if __name__ == "__main__":
    main()
