"""SPEC-nutriscore-acc-test CAP-2/CAP-3. Run: python3 -m pytest scripts/test_nutriscore_measure.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import nutriscore_measure as m  # noqa: E402

SECRET = "nutriscore-test:SUPERSECRETVALUE"


def test_key_is_part_after_first_colon():
    assert m.parse_key(SECRET) == "SUPERSECRETVALUE"
    assert m.parse_key("naam:a:b") == "a:b"


# ---- CAP-3: scoring ----------------------------------------------------------
def test_score_fixed_set():
    truth = {"1": {"A"}, "2": {"A"}, "3": {"B"}, "4": set(), "5": set(), "6": {"A"}}
    ans = {"1": {"A"}, "2": set(), "3": {"A"}, "4": {"A"}, "5": set(), "6": None}  # 6 = geen antwoord
    r = m.score(truth, ans)
    a = r["letters"]["A"]
    assert (a["gevonden_n"], a["gevonden_d"]) == (1, 2)          # 6 telt niet mee
    assert (a["vals_n"], a["vals_d"]) == (2, 3)                  # meldingen op 1, 3, 4; fout: 3, 4
    assert a["gevonden_pct"] == 50.0 and round(a["vals_pct"], 1) == 66.7
    assert a["eis_gehaald"] is False
    assert r["zonder_antwoord"] == 1
    assert r["matrix"]["B"]["A"] == 1 and r["matrix"]["A"]["geen"] == 1


def test_no_reports_is_not_applicable_never_zero():
    r = m.score({"1": {"C"}}, {"1": set()})
    c = r["letters"]["C"]
    assert c["vals_pct"] is None and c["eis_gehaald"] is False
    assert c["gevonden_pct"] == 0.0


def test_requirement_met():
    truth = {str(i): {"E"} for i in range(10)}
    ans = {str(i): {"E"} for i in range(9)}
    ans["9"] = set()
    r = m.score(truth, ans)["letters"]["E"]
    assert r["gevonden_pct"] == 90.0 and r["vals_pct"] == 0.0 and r["eis_gehaald"] is True


def test_extract_letters_only_nutriscore():
    res = {"detections": [{"t3777_code": "NUTRISCORE_D"}, {"t3777_code": "GREEN_DOT"}, {"t3777_code": "NUTRISCORE_X"}]}
    assert m.extract_letters(res) == {"D"}


# ---- CAP-2: runner -------------------------------------------------------------
class Fake:
    def __init__(self, fail=()):
        self.posts = []
        self.fail = set(fail)

    def post(self, path, fields, image_path, key):
        eid = os.path.basename(image_path)[:-4]
        self.posts.append((eid, dict(fields)))
        return 202, {"scanId": "S" + eid}

    def get(self, path, key):
        eid = path.rsplit("/S", 1)[1]
        if eid in self.fail:
            return 200, {"status": "failed"}
        return 200, {"status": "done", "logoResults": {"detections": [{"t3777_code": "NUTRISCORE_A"}]}}


def _setup(tmp_path):
    img = tmp_path / "beelden"
    img.mkdir()
    for n in ("1", "2", "3-GREEN_DOT-4"):
        (img / f"{n}.png").write_bytes(b"x")
    truth = tmp_path / "uitslag.json"
    truth.write_text(json.dumps({"1": {"status": "bevestigd", "nutriscore": ["A"]},
                                 "2": {"status": "bevestigd", "nutriscore": []}}))
    return str(truth), str(img), str(tmp_path / "out")


def test_runner_sends_only_truth_ids_with_rescan_and_resumes(tmp_path, capsys):
    truth, img, out = _setup(tmp_path)
    f = Fake(fail=["2"])
    m.run(truth, img, out, SECRET, f.post, f.get, poll_s=0, max_wait_s=1)
    assert sorted(e for e, _ in f.posts) == ["1", "2"]            # nooit een -CODE-n variant
    assert all(fl.get("rescan") == "true" and "productId" not in fl for _, fl in f.posts)
    f2 = Fake()
    m.run(truth, img, out, SECRET, f2.post, f2.get, poll_s=0, max_wait_s=1)
    assert [e for e, _ in f2.posts] == ["2"]                      # alleen wat nog geen done-antwoord had
    blob = capsys.readouterr().out + "".join(
        open(os.path.join(dp, fn)).read() for dp, _, fns in os.walk(out) for fn in fns)
    assert "SUPERSECRETVALUE" not in blob


def test_failed_timeout_and_http_error_are_no_answer_not_no_nutriscore(tmp_path):
    truth, img, out = _setup(tmp_path)

    def post(path, fields, image_path, key):
        return (500, None) if image_path.endswith("2.png") else (202, {"scanId": "S1"})

    def get(path, key):
        return 200, {"status": "running"}  # nooit klaar -> time-out

    ans = m.run(truth, img, out, SECRET, post, get, poll_s=0, max_wait_s=0)
    assert ans == {"1": None, "2": None}


def test_done_scan_with_failed_logoresults_is_no_answer(tmp_path):
    truth, img, out = _setup(tmp_path)

    def get(path, key):
        return 200, {"status": "done", "logoResults": {"status": "failed", "detections": []}}

    ans = m.run(truth, img, out, SECRET, Fake().post, get, poll_s=0, max_wait_s=1)
    assert ans == {"1": None, "2": None}


def test_shrink_big_image_to_jpeg_under_limit(tmp_path):
    from PIL import Image
    big = tmp_path / "big.png"
    Image.frombytes("RGB", (1900, 1900), os.urandom(1900 * 1900 * 3)).save(big)  # ruis: ~10,8 MB
    assert os.path.getsize(big) > m.MAX_BYTES
    out = m.shrink(str(big), str(tmp_path / "out"))
    assert out.endswith(".jpg") and os.path.getsize(out) <= 10_000_000
    small = tmp_path / "s.png"
    small.write_bytes(b"x")
    assert m.shrink(str(small), str(tmp_path)) == str(small)


# ---- spec-nutriscore-acc-review-fixes (review A6-A9, A12-A14, A16, E5-E13, V2, V4) ----------
import threading  # noqa: E402
from http.server import BaseHTTPRequestHandler, HTTPServer  # noqa: E402

import pytest  # noqa: E402

RAW = "RAW:KEY:WITH:COLONS"


def test_logo_key_is_used_raw_even_with_colons(monkeypatch):
    monkeypatch.setenv("LOGO_KEY", RAW)
    assert m.get_key() == RAW


def test_keychain_value_is_parsed_as_name_colon_key(monkeypatch):
    monkeypatch.delenv("LOGO_KEY", raising=False)

    class R:
        returncode, stdout = 0, "nutriscore-test:k:1\n"
    monkeypatch.setattr(m.subprocess, "run", lambda *a, **k: R())
    assert m.get_key() == "k:1"


def test_extract_letters_is_null_safe_and_filters_methods():
    assert m.extract_letters({"detections": None}) == set()
    assert m.extract_letters({"detections": [{"t3777_code": None}]}) == set()
    res = {"detections": [{"t3777_code": "NUTRISCORE_A", "method": "embedding"},
                          {"t3777_code": "NUTRISCORE_B", "method": "nutriscore-a2"}]}
    assert m.extract_letters(res, methods={"nutriscore-a2", "nutriscore-head"}) == {"B"}


def test_load_truth_keeps_confirmed_and_normalises(tmp_path):
    p = tmp_path / "u.json"
    p.write_text(json.dumps({"1": {"status": "bevestigd", "nutriscore": ["a", "X"]},
                             "2": {"status": "concept", "nutriscore": ["B"]},
                             "3": {"status": "bevestigd", "nutriscore": None}}))
    assert m.load_truth(str(p)) == {"1": {"A"}, "3": set()}


def test_load_truth_requires_status_and_accepts_one_string_value(tmp_path, capsys):
    p = tmp_path / "u.json"
    p.write_text(json.dumps({"1": {"status": "bevestigd", "nutriscore": "NUTRISCORE_C"},
                             "2": {"nutriscore": ["A"]},  # zonder status: weggelaten
                             "3": {"status": "bevestigd", "nutriscore": ["Z", "b"]}}))  # Z: geteld, niet getoond
    assert m.load_truth(str(p), report_drops=True) == {"1": {"C"}, "3": {"B"}}
    err = capsys.readouterr().err
    assert "1 waarden buiten A-E" in err and "Z" not in err


def test_load_truth_reports_drops_only_when_asked(tmp_path, capsys):
    p = tmp_path / "u.json"
    p.write_text(json.dumps({"1": {"status": "bevestigd", "nutriscore": ["Q"]}}))
    m.load_truth(str(p))
    assert capsys.readouterr().err == ""


def test_run_returns_raw_results(tmp_path):
    truth, img, out = _setup(tmp_path)
    got = m.run(truth, img, out, SECRET, Fake().post, Fake().get, poll_s=0, max_wait_s=1)
    assert got["1"]["detections"][0]["t3777_code"] == "NUTRISCORE_A"


def test_corrupt_answer_file_is_resent_not_fatal(tmp_path):
    truth, img, out = _setup(tmp_path)
    os.makedirs(out)
    open(os.path.join(out, "1.json"), "w").write('{"status": "do')
    f = Fake()
    got = m.run(truth, img, out, SECRET, f.post, f.get, poll_s=0, max_wait_s=1)
    assert "1" in [e for e, _ in f.posts] and got["1"] is not None


def test_answer_write_is_atomic(tmp_path, monkeypatch):
    truth, img, out = _setup(tmp_path)

    def broken_dump(obj, fh, *a, **k):
        fh.write('{"status": "do')
        raise RuntimeError("disk vol")
    monkeypatch.setattr(m.json, "dump", broken_dump)
    got = m.run(truth, img, out, SECRET, Fake().post, Fake().get, poll_s=0, max_wait_s=1, workers=1)
    assert got["1"] is None                                      # de run loopt door
    assert not os.path.exists(os.path.join(out, "1.json"))       # geen half antwoordbestand
    assert not os.path.exists(os.path.join(out, "1.json.tmp"))
    assert _errors(out)["1"]["fase"] == "intern"


def test_unexpected_error_for_one_label_does_not_stop_the_pool(tmp_path, monkeypatch):
    truth, img, out = _setup(tmp_path)
    orig = m.shrink

    def boom(path, o):
        if path.endswith("1.png"):
            raise OSError("beeld onleesbaar")
        return orig(path, o)
    monkeypatch.setattr(m, "shrink", boom)
    f = Fake()
    got = m.run(truth, img, out, SECRET, f.post, f.get, poll_s=0, max_wait_s=1)
    assert got["1"] is None and got["2"] is not None
    assert _errors(out)["1"] == {"fase": "intern", "status": "OSError"}


def _errors(out):
    d = os.path.join(out, "_fouten")
    return {fn[:-5]: json.load(open(os.path.join(d, fn))) for fn in os.listdir(d)} if os.path.isdir(d) else {}


def test_missing_image_is_no_answer_and_recorded(tmp_path):
    truth, img, out = _setup(tmp_path)
    os.remove(os.path.join(img, "2.png"))
    got = m.run(truth, img, out, SECRET, Fake().post, Fake().get, poll_s=0, max_wait_s=1)
    assert got["2"] is None and got["1"] is not None
    assert _errors(out)["2"]["fase"] == "beeld"


@pytest.mark.parametrize("status", [429, 503])
def test_post_retry_is_answered_after_transient_status(tmp_path, status):
    truth, img, out = _setup(tmp_path)
    f = Fake()
    calls = {"n": 0}

    def post(path, fields, image_path, key):
        calls["n"] += 1
        return (status, None) if calls["n"] <= 2 else f.post(path, fields, image_path, key)
    got = m.run(truth, img, out, SECRET, post, f.get, poll_s=0, max_wait_s=1, retry_s=0, workers=1)
    assert got["1"] is not None and got["2"] is not None


def test_retry_after_header_is_honoured(tmp_path, monkeypatch):
    truth, img, out = _setup(tmp_path)
    slept = []
    monkeypatch.setattr(m.time, "sleep", lambda s: slept.append(s))
    f = Fake()
    calls = {"n": 0}

    def post(path, fields, image_path, key):
        calls["n"] += 1
        return (503, {"retry_after": "7"}) if calls["n"] == 1 else f.post(path, fields, image_path, key)
    m.run(truth, img, out, SECRET, post, f.get, poll_s=0, max_wait_s=1, retry_s=1, workers=1)
    assert 7.0 in slept


@pytest.mark.parametrize("status", [302, 503])
def test_persistent_failure_is_no_answer_with_status_recorded_never_the_key(tmp_path, status):
    truth, img, out = _setup(tmp_path)
    got = m.run(truth, img, out, SECRET, lambda *a: (status, None), Fake().get, poll_s=0, max_wait_s=1, retry_s=0)
    assert got == {"1": None, "2": None}
    errs = _errors(out)
    assert errs["1"] == {"fase": "versturen", "status": status}
    assert "SUPERSECRETVALUE" not in json.dumps(errs)


def test_refused_key_stops_the_whole_run(tmp_path):
    truth, img, out = _setup(tmp_path)
    posted = []

    def post(path, fields, image_path, key):
        posted.append(image_path)
        return 401, None
    with pytest.raises(SystemExit) as exc:
        m.run(truth, img, out, SECRET, post, Fake().get, poll_s=0, max_wait_s=1, workers=1, retry_s=0)
    assert "401" in str(exc.value) and "SUPERSECRETVALUE" not in str(exc.value)
    assert len(posted) == 1  # het tweede etiket wordt niet meer verstuurd


def test_done_without_usable_result_is_not_saved_and_is_resent(tmp_path):
    truth, img, out = _setup(tmp_path)

    def bad_get(path, key):
        return 200, {"status": "done", "logoResults": {"status": "failed", "detections": []}}
    got = m.run(truth, img, out, SECRET, Fake().post, bad_get, poll_s=0, max_wait_s=1)
    assert got == {"1": None, "2": None}
    assert not os.path.exists(os.path.join(out, "1.json"))
    assert _errors(out)["1"] == {"fase": "verwerken", "status": "failed"}
    f2 = Fake()
    m.run(truth, img, out, SECRET, f2.post, f2.get, poll_s=0, max_wait_s=1)
    assert sorted(e for e, _ in f2.posts) == ["1", "2"]


def _noise_png(path, side):
    from PIL import Image
    Image.frombytes("RGB", (side, side), os.urandom(side * side * 3)).save(path)


def test_unshrinkable_image_is_no_answer_and_recorded(tmp_path, monkeypatch):
    truth, img, out = _setup(tmp_path)
    _noise_png(os.path.join(img, "1.png"), 300)
    monkeypatch.setattr(m, "MAX_BYTES", 1000)
    f = Fake()
    got = m.run(truth, img, out, SECRET, f.post, f.get, poll_s=0, max_wait_s=1, retry_s=0)
    assert got["1"] is None
    assert "1" not in [e for e, _ in f.posts]
    assert _errors(out)["1"]["fase"] == "verkleinen"


def test_poll_503_is_retried_within_deadline(tmp_path):
    truth, img, out = _setup(tmp_path)
    f, seen = Fake(), set()

    def get(path, key):
        if path not in seen:
            seen.add(path)
            return 503, None
        return f.get(path, key)
    got = m.run(truth, img, out, SECRET, f.post, get, poll_s=0, max_wait_s=5)
    assert got["1"] is not None


def test_shrink_keeps_full_chroma_and_fits(tmp_path):
    from PIL import Image, JpegImagePlugin
    big = tmp_path / "big.png"
    Image.frombytes("RGB", (1900, 1900), os.urandom(1900 * 1900 * 3)).save(big)
    out = m.shrink(str(big), str(tmp_path / "out"))
    assert out.endswith(".jpg") and os.path.getsize(out) <= m.MAX_BYTES
    assert JpegImagePlugin.get_sampling(Image.open(out)) == 0  # 4:4:4, geen kleur-subsampling


def test_shrink_gives_up_when_even_low_quality_is_too_big(tmp_path, monkeypatch):
    from PIL import Image
    big = tmp_path / "big.png"
    Image.frombytes("RGB", (300, 300), os.urandom(300 * 300 * 3)).save(big)
    monkeypatch.setattr(m, "MAX_BYTES", 1000)
    assert m.shrink(str(big), str(tmp_path / "out")) is None


def test_no_redirects_so_the_key_never_reaches_another_host(monkeypatch):
    got = []

    class Target(BaseHTTPRequestHandler):
        def do_GET(self):
            got.append(self.headers.get("x-api-key"))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"{}")

        def log_message(self, *a):
            pass
    tgt = HTTPServer(("127.0.0.1", 0), Target)

    class Redir(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(302)
            self.send_header("Location", f"http://127.0.0.1:{tgt.server_port}/x")
            self.end_headers()

        def log_message(self, *a):
            pass
    src = HTTPServer(("127.0.0.1", 0), Redir)
    for s in (tgt, src):
        threading.Thread(target=s.serve_forever, daemon=True).start()
    try:
        monkeypatch.setattr(m, "BASE", f"http://127.0.0.1:{src.server_port}")
        st, _ = m.http_get("/y", "SUPERSECRETVALUE")
        assert st == 302 and got == []
    finally:
        tgt.shutdown()
        src.shutdown()


def _lr(model, *dets):
    return {"status": "ok", "modelVersion": model,
            "detections": [{"t3777_code": f"NUTRISCORE_{c}", "method": meth} for c, meth in dets]}


def test_report_has_methods_versions_reencoded_split_and_caveat():
    truth = {"1": {"A"}, "2": {"B"}, "3": set()}
    results = {"1": _lr("v1", ("A", "nutriscore-a2")), "2": _lr("v2", ("A", "embedding")), "3": None}
    txt = m.report(truth, results, herschaald={"2"})
    assert "nutriscore-a2: 1" in txt and "embedding: 1" in txt
    assert "Alleen nutriscore-a2/nutriscore-head" in txt and "Alleen embedding" in txt
    assert "Herschaald" in txt and "Origineel" in txt
    assert "v1: 1" in txt and "v2: 1" in txt and "meerdere modelversies" in txt
    assert "Voorbehoud" in txt


def _section(txt, title):
    start = txt.index(f"### {title}")
    end = txt.find("\n#", start + 1)
    return txt[start:end if end != -1 else len(txt)]


def test_report_concrete_rows_and_split_counts():
    truth = {"1": {"A"}, "2": {"B"}, "3": set()}
    results = {"1": _lr("v1", ("A", "nutriscore-a2")), "2": _lr("v2", ("A", "embedding")), "3": None}
    txt = m.report(truth, results, herschaald={"2"})
    assert "| A | 0% (0/1) |" in _section(txt, "Alleen embedding")
    assert "| A | 100% (1/1) |" in _section(txt, "Alleen nutriscore-a2/nutriscore-head")
    assert "### Origineel (2 etiketten)" in txt and "### Herschaald (1 etiketten)" in txt


def test_report_warns_on_mixed_reference_version_and_states_the_caveats():
    truth = {"1": {"A"}}
    a = dict(_lr("v1", ("A", "nutriscore-a2")), referenceVersion="ref-1,extra")
    b = dict(_lr("v1", ("A", "nutriscore-a2")), referenceVersion="ref-2")
    txt = m.report(truth, {"1": a}, herschaald=frozenset())
    assert "ref-1: 1" in txt and "Waarschuwing" not in txt
    txt = m.report({"1": {"A"}, "2": {"A"}}, {"1": a, "2": b}, herschaald=frozenset())
    assert "ref-1: 1" in txt and "ref-2: 1" in txt and "meerdere modelversies of referentieversies" in txt
    assert "ruwe `detections`" in txt and "MinIO" in txt


def test_main_counts_reencoded_label_under_herschaald(tmp_path, monkeypatch, capsys):
    img = tmp_path / "beelden"
    img.mkdir()
    _noise_png(str(img / "big.png"), 300)
    (img / "1.png").write_bytes(b"x")
    truth = tmp_path / "uitslag.json"
    truth.write_text(json.dumps({"big": {"status": "bevestigd", "nutriscore": ["A"]},
                                 "1": {"status": "bevestigd", "nutriscore": []}}))
    monkeypatch.setattr(m, "MAX_BYTES", 100_000)  # ruis-PNG boven, herschaalde JPEG eronder
    monkeypatch.setenv("LOGO_KEY", "SUPERSECRETVALUE")
    f = Fake()
    monkeypatch.setattr(m, "http_post", f.post)
    monkeypatch.setattr(m, "http_get", f.get)
    monkeypatch.setattr(sys, "argv", ["x", "--truth", str(truth), "--images", str(img), "--out", str(tmp_path / "out")])
    m.main()
    txt = capsys.readouterr().out
    assert "### Herschaald (1 etiketten)" in txt and "### Origineel (1 etiketten)" in txt
    assert "big" in [e for e, _ in f.posts]


def test_main_never_shows_the_key(tmp_path, monkeypatch, capsys):
    truth, img, out = _setup(tmp_path)
    key = "SUPERSECRETVALUE"
    monkeypatch.setenv("LOGO_KEY", key)
    polls = {}

    def post(path, fields, image_path, k):  # echoes the key back in the 202 body
        return 202, {"scanId": "S" + os.path.basename(image_path)[:-4], "echo": k}

    def get(path, k):  # echoes the key in the running and error bodies
        eid = path.rsplit("/S", 1)[1]
        polls[eid] = polls.get(eid, 0) + 1
        if eid == "2":
            return 500, {"echo": k}
        if polls[eid] == 1:
            return 200, {"status": "running", "echo": k}
        return 200, {"status": "done", "logoResults": {"detections": [{"t3777_code": "NUTRISCORE_A"}]}}
    monkeypatch.setattr(m, "http_post", post)
    monkeypatch.setattr(m, "http_get", get)
    monkeypatch.setattr(sys, "argv", ["x", "--truth", truth, "--images", img, "--out", out])
    m.main()
    cap = capsys.readouterr()
    blob = cap.out + cap.err + "".join(
        open(os.path.join(dp, fn), errors="ignore").read() for dp, _, fns in os.walk(out) for fn in fns)
    assert "gevonden" in cap.out and key not in blob
