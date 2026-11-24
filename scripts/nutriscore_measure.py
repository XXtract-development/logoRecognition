#!/usr/bin/env python3
"""Meet Nutri-Score A-E op ACC (SPEC-nutriscore-acc-test). Stuurt de bevestigde etiketten naar het
logo-scan-endpoint en rapporteert per letter gevonden / vals. De sleutel komt uit LOGO_KEY (kaal) of
uit de Keychain (service LOGO_PIPELINE_KEYS_EXTRA, account acc; waarde naam:sleutel) en wordt nergens
getoond of bewaard.

  python3 scripts/nutriscore_measure.py --truth <toets/uitslag.json> --images <toets/beelden> --out <map buiten repo>
"""
import argparse
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

LETTERS = "ABCDE"
BASE = "https://logo-detection.acc.xxtract.com"
SCANS = "/api/v1/pipeline/logo-scans"
MAX_BYTES = 9_500_000  # endpoint-limiet is 10 MB
JPEG_QUALITIES = (95, 90, 85, 80, 75, 70, 65, 60)
RETRY_STATUS = (0, 429, 502, 503, 504)  # tijdelijk (0 = netwerkhapering): herhalen / blijven pollen
AUTH_STATUS = (401, 403)  # sleutel geweigerd: de hele run stopt
VARIANTEN = [("Alle methoden", None),
             ("Alleen nutriscore-a2/nutriscore-head", {"nutriscore-a2", "nutriscore-head"}),
             ("Alleen embedding", {"embedding"})]


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # 3xx is een fout: de sleutel gaat nooit naar een ander doel


_OPENER = urllib.request.build_opener(_NoRedirect)


def parse_key(raw):
    """'naam:sleutel' -> sleutel (alles na de eerste ':')."""
    return raw.split(":", 1)[1].strip() if ":" in raw else raw.strip()


def get_key():
    raw = os.environ.get("LOGO_KEY")
    if raw:
        return raw.strip()  # kale sleutel: mag zelf ':' bevatten
    r = subprocess.run(["security", "find-generic-password", "-a", "acc", "-s", "LOGO_PIPELINE_KEYS_EXTRA", "-w"],
                       capture_output=True, text=True)
    return parse_key(r.stdout.strip()) if r.returncode == 0 and r.stdout.strip() else None


def _letters(value):
    """Eén waarde of een lijst. 'C' en 'NUTRISCORE_C' tellen als C. Geeft (letters, aantal weggelaten waarden)."""
    items = [value] if isinstance(value, str) else (value or [])
    letters, dropped = set(), 0
    for item in items:
        s = str(item).strip().upper()
        if s.startswith("NUTRISCORE_"):
            s = s[len("NUTRISCORE_"):]
        if s in LETTERS:
            letters.add(s)
        else:
            dropped += 1
    return letters, dropped


def load_truth(path, report_drops=False):
    """id -> set(letters) voor de etiketten met status exact 'bevestigd'. Alleen het aantal weggelaten
    waarden wordt gemeld (op stderr), nooit de waarden zelf."""
    with open(path) as fh:
        raw = json.load(fh)
    truth, dropped = {}, 0
    for eid, v in raw.items():
        if v.get("status") != "bevestigd":
            continue
        truth[eid], n = _letters(v.get("nutriscore"))
        dropped += n
    if report_drops and dropped:
        print(f"load_truth: {dropped} waarden buiten A-E weggelaten", file=sys.stderr)
    return truth


def _nutri(result):
    for d in (result or {}).get("detections") or []:
        code = d.get("t3777_code") or ""
        if code.startswith("NUTRISCORE_") and code[-1] in LETTERS:
            yield d


def extract_letters(result, methods=None):
    """Gemelde Nutri-Score-letters; methods = None telt alle methoden."""
    return {d["t3777_code"][-1] for d in _nutri(result) if methods is None or d.get("method") in methods}


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


def _atomic(path, write):
    """Atomair: eerst een tmp-bestand, dan os.replace. Een onderbroken schrijfactie laat geen half bestand achter."""
    tmp = path + ".tmp"
    try:
        with open(tmp, "w") as fh:
            write(fh)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def _write_json(path, obj):
    _atomic(path, lambda fh: json.dump(obj, fh))


def _load_answer(path):
    """Een corrupt of onleesbaar antwoordbestand is afwezig (wordt opnieuw verstuurd)."""
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _fout(out, eid, fase, status=None):
    """Foutrecord per etiket: fase en statuscode of scanstatus. Nooit de sleutel."""
    d = os.path.join(out, "_fouten")
    os.makedirs(d, exist_ok=True)
    rec = {"fase": fase} if status is None else {"fase": fase, "status": status}
    _atomic(os.path.join(d, eid + ".json"), lambda fh: fh.write(json.dumps(rec)))


def _clear_fout(out, eid):
    p = os.path.join(out, "_fouten", eid + ".json")
    if os.path.exists(p):
        os.remove(p)


def _usable(lr):
    """Een scan die 'done' is maar intern mislukte of oversloeg is geen antwoord."""
    return lr if isinstance(lr, dict) and lr.get("status") in ("ok", "partial", None) else None


def shrink(path, out):
    """Groter dan de limiet: JPEG zonder kleur-subsampling, kwaliteit stapsgewijs omlaag tot 60.
    Eigen cachemap (_jpeg444), zodat een oudere codering nooit wordt hergebruikt.
    Geeft het verkleinde pad, of None als het ook dan niet past (dan niet versturen)."""
    if os.path.getsize(path) <= MAX_BYTES:
        return path
    from PIL import Image
    dst = os.path.join(out, "_jpeg444", os.path.basename(path)[:-4] + ".jpg")
    if os.path.exists(dst) and os.path.getsize(dst) <= MAX_BYTES:
        return dst
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    img = Image.open(path).convert("RGB")
    tmp = dst + ".tmp"
    try:
        for q in JPEG_QUALITIES:
            img.save(tmp, "JPEG", quality=q, subsampling=0)
            if os.path.getsize(tmp) <= MAX_BYTES:
                os.replace(tmp, dst)
                return dst
        return None
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def _auth_check(st, stop):
    if st in AUTH_STATUS:
        stop.set()
        raise SystemExit(f"Sleutel geweigerd (HTTP {st})")


def _retry_wait(body, retry_s):
    """Retry-After van de server (503 BUSY) wint als die langer is; nooit de sleutel."""
    ra = body.get("retry_after") if isinstance(body, dict) else None
    try:
        return max(retry_s, float(ra))
    except (TypeError, ValueError):
        return retry_s


def _post_retry(post, image, key, retry_s, stop):
    for attempt in range(4):  # 1 poging + max 3 herhalingen
        st, body = post(SCANS, {"rescan": "true"}, image, key)
        _auth_check(st, stop)
        if st not in RETRY_STATUS or attempt == 3:
            return st, body
        time.sleep(_retry_wait(body, retry_s))


def run(truth_path, images, out, key, post, get, poll_s=3, max_wait_s=300, workers=2, retry_s=2):
    """Stuurt elk bevestigd etiket en geeft per id de ruwe logoResults (of None = geen antwoord).
    Een onverwachte fout per etiket wordt vastgelegd en de rest loopt door; een geweigerde sleutel stopt alles."""
    os.makedirs(out, exist_ok=True)
    ids = list(load_truth(truth_path))
    stop = threading.Event()

    def label(eid):
        p = os.path.join(out, eid + ".json")
        prev = _load_answer(p)
        if isinstance(prev, dict) and prev.get("status") == "done":
            lr = _usable(prev.get("logoResults"))
            if lr is not None:
                return eid, lr
        img = os.path.join(images, eid + ".png")
        if not os.path.exists(img):
            _fout(out, eid, "beeld")
            return eid, None
        send = shrink(img, out)
        if send is None:
            _fout(out, eid, "verkleinen")
            return eid, None
        st, body = _post_retry(post, send, key, retry_s, stop)
        if st != 202 or not isinstance(body, dict) or "scanId" not in body:
            _fout(out, eid, "versturen", st)
            return eid, None
        deadline = time.time() + max_wait_s
        while True:
            st, r = get(f"{SCANS}/{body['scanId']}", key)
            _auth_check(st, stop)
            if st == 200 and isinstance(r, dict) and r.get("status") == "done":
                lr = _usable(r.get("logoResults"))
                if lr is None:  # done maar geen bruikbare uitslag: niet bewaren, zodat een volgende run opnieuw stuurt
                    scan_lr = r.get("logoResults")
                    _fout(out, eid, "verwerken", scan_lr.get("status") if isinstance(scan_lr, dict) else None)
                    return eid, None
                _write_json(p, r)
                _clear_fout(out, eid)
                return eid, lr
            if st == 200 and isinstance(r, dict) and r.get("status") in ("failed", "superseded"):
                _fout(out, eid, "verwerken", r.get("status"))
                return eid, None
            if st != 200 and st not in RETRY_STATUS:
                _fout(out, eid, "wachten", st)
                return eid, None
            if time.time() >= deadline:
                _fout(out, eid, "wachten", st)
                return eid, None
            time.sleep(poll_s)

    def one(eid):
        if stop.is_set():
            return eid, None
        try:
            return label(eid)
        except Exception as exc:  # per etiket; SystemExit (geweigerde sleutel) gaat door
            try:
                _fout(out, eid, "intern", type(exc).__name__)
            except Exception:
                pass
            return eid, None

    with ThreadPoolExecutor(workers) as ex:
        return dict(ex.map(one, ids))


def _http(method, path, key, data=None, headers=None):
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"x-api-key": key, **(headers or {})})
    try:
        with _OPENER.open(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, {"retry_after": e.headers.get("Retry-After")}
    except Exception:
        return 0, None


def http_post(path, fields, image_path, key):
    b = uuid.uuid4().hex
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()]
    ct = "image/jpeg" if image_path.endswith(".jpg") else "image/png"
    with open(image_path, "rb") as fh:
        data = fh.read()
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="x"\r\n'
                 f'Content-Type: {ct}\r\n\r\n'.encode() + data + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return _http("POST", path, key, b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={b}"})


def http_get(path, key):
    return _http("GET", path, key)


def _tabel(r):
    out = ["| letter | gevonden | vals (aandeel foute meldingen) | eis |", "|---|---|---|---|"]
    for L, x in r["letters"].items():
        g = "n.v.t." if x["gevonden_pct"] is None else f'{x["gevonden_pct"]:.0f}% ({x["gevonden_n"]}/{x["gevonden_d"]})'
        v = "n.v.t." if x["vals_pct"] is None else f'{x["vals_pct"]:.0f}% ({x["vals_n"]}/{x["vals_d"]})'
        out.append(f'| {L} | {g} | {v} | {"gehaald" if x["eis_gehaald"] else "niet gehaald"} |')
    out.append(f'\nZonder antwoord: {r["zonder_antwoord"]}. Matrix (waarheid -> gemeld): {json.dumps(r["matrix"])}')
    return "\n".join(out)


def _base_ref(ref):
    """Basis van de referentieversie: het deel vóór de eerste ','."""
    return str(ref).split(",", 1)[0] if ref else "onbekend"


def report(truth, results, herschaald=frozenset()):
    ids = list(truth)
    answers = {i: results.get(i) for i in ids}
    out = ["## Uitslag per letter"]
    for naam, methods in VARIANTEN:
        per = {i: (None if a is None else extract_letters(a, methods)) for i, a in answers.items()}
        out += [f"### {naam}", _tabel(score(truth, per))]
    out.append("## Origineel en herschaald (alle methoden)")
    for naam, deel in (("Origineel", [i for i in ids if i not in herschaald]),
                       ("Herschaald", [i for i in ids if i in herschaald])):
        sub = {i: truth[i] for i in deel}
        per = {i: (None if answers[i] is None else extract_letters(answers[i])) for i in deel}
        out += [f"### {naam} ({len(deel)} etiketten)", _tabel(score(sub, per))]
    methoden = Counter(d.get("method") or "onbekend" for a in answers.values() if a for d in _nutri(a))
    versies = Counter(a.get("modelVersion") or "onbekend" for a in answers.values() if a)
    refs = Counter(_base_ref(a.get("referenceVersion")) for a in answers.values() if a)
    out.append("## Herkomst van de Nutri-Score-detecties")
    out += [f"- {k}: {v}" for k, v in methoden.items()] or ["- geen Nutri-Score-detecties"]
    out.append("## Modelversies (antwoorden)")
    out += [f"- {k}: {v}" for k, v in versies.items()] or ["- geen antwoorden"]
    out.append("## Referentieversies (basis, antwoorden)")
    out += [f"- {k}: {v}" for k, v in refs.items()] or ["- geen antwoorden"]
    if len(versies) > 1 or len(refs) > 1:
        out.append("> Waarschuwing: meerdere modelversies of referentieversies in deze meting; de scores mengen versies.")
    out.append("> Voorbehoud: de scores gebruiken de ruwe `detections` (ook onder drempel en bij twijfel), "
               "niet de `items` met `uitkomststand` die afnemers zien.")
    out.append("> Voorbehoud: een gewichtswijziging in MinIO is in modelversie en referentieversie niet zichtbaar.")
    out.append("> Voorbehoud: de referentiebeelden van de oude route kunnen uit dezelfde etiketten komen. "
               "Trainingsoverlap is niet gemeten; de scores kunnen daardoor te gunstig zijn.")
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
    truth = load_truth(a.truth, report_drops=True)
    results = run(a.truth, a.images, a.out, key, http_post, http_get)
    herschaald = {i for i in truth
                  if os.path.exists(os.path.join(a.images, i + ".png"))
                  and os.path.getsize(os.path.join(a.images, i + ".png")) > MAX_BYTES}
    print(report(truth, results, herschaald))


if __name__ == "__main__":
    main()
