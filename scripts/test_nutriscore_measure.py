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
    truth.write_text(json.dumps({"1": {"nutriscore": ["A"]}, "2": {"nutriscore": []}}))
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
