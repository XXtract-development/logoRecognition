"""Story 12.25 — ATDD (red-phase): A2-vangnet achter de familie-poort.

Architectuur (gevalideerd 2026-07-15): deterministische lezer eerst (12.22);
bij GEEN lezing én een embedding-buur in de NUTRISCORE_*-familie (poort:
blokkeert 197/199 andere keurmerken) wordt het A2-model geraadpleegd; alleen
een letter met confidence >= vloer (env NUTRISCORE_A2_MIN_CONF, default 0.5)
beslist — anders byte-identiek het bestaande pad (fail-open).

AC's:
  (a) poort open + A2-letter >= vloer  -> method "nutriscore-a2";
  (b) poort dicht (buur niet-NS)       -> A2 NIET geraadpleegd, legacy;
  (c) A2 onder de vloer                -> legacy (geen claim);
  (d) A2 zegt "none"                   -> legacy;
  (e) env-vloer verschuift het kantelpunt;
  (f) A2-exception                     -> fail-open legacy;
  (g) module: echte load uit storage (state_dict-bytes) + shape-contract +
      fail-open bij storage-fout.

Zelfde isolatie-conventies als test_nutriscore_reader_12_22.py (echte cv2 op
collectie-moment; stubs met echte pkg-paden; sys.modules netjes)."""

import importlib.util
import io
import json
import os
import sys
import types

_APP_PKG = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "app"))

import cv2
import numpy as np
import pytest

_REAL_CV2 = cv2
_HERE = os.path.dirname(__file__)
_A2_PATH = os.path.abspath(os.path.join(_HERE, "..", "..", "app", "services", "nutriscore_a2.py"))
_READER_PATH = os.path.abspath(os.path.join(_HERE, "..", "..", "app", "services", "nutriscore_reader.py"))
_CLASSIFICATION_PATH = os.path.abspath(os.path.join(_HERE, "..", "..", "app", "services", "classification.py"))


def _grijze_crop():
    """Effen grijze crop: de deterministische lezer leest hier NIETS (geen balk)
    — het no-read-pad dat de poort moet activeren."""
    return np.full((200, 200, 3), 128, np.uint8)


# ---------------------------------------------------------------------------
# Router-tests: geïsoleerde classification-load met stubs; ECHTE reader; A2 als
# bestuurbare stub met aanroep-spy.
# ---------------------------------------------------------------------------

_STATE = {
    "kp": 0.74,
    "matches": [{"t3777_code": "NUTRISCORE_A", "similarity": 0.62}],  # poort open, uncertain
    "a2": ("A", 0.9, {"bron": "stub"}),
    "a2_calls": 0,
    "a2_raise": False,
}


def _install_stubs():
    for name in ("app", "app.core", "app.services", "app.ml"):
        if name not in sys.modules:
            mod = types.ModuleType(name)
            mod.__path__ = [os.path.join(_APP_PKG, *name.split(".")[1:])]
            sys.modules[name] = mod
    lg = types.ModuleType("app.core.logging")
    lg.logger = types.SimpleNamespace(info=lambda *a, **k: None, warning=lambda *a, **k: None, error=lambda *a, **k: None)
    sys.modules["app.core.logging"] = lg

    mm = types.ModuleType("app.ml.model_manager")

    async def _gen_emb(_image):
        return np.ones(8, dtype=np.float32)

    mm.model_manager = types.SimpleNamespace(generate_embedding=_gen_emb)
    sys.modules["app.ml.model_manager"] = mm

    db = types.ModuleType("app.services.database")

    async def _find_similar(*a, **k):
        return list(_STATE["matches"])

    db.db_service = types.SimpleNamespace(find_similar_references=_find_similar)
    sys.modules["app.services.database"] = db

    gate = types.ModuleType("app.services.keurmerk_gate")
    gate.GATE_THRESHOLD = 0.5
    gate.keurmerk_probability = lambda _emb: _STATE["kp"]
    sys.modules["app.services.keurmerk_gate"] = gate

    a2 = types.ModuleType("app.services.nutriscore_a2")

    def _predict(_img):
        _STATE["a2_calls"] += 1
        if _STATE["a2_raise"]:
            raise RuntimeError("a2 kapot")
        return _STATE["a2"]

    def _min_conf():
        raw = os.environ.get("NUTRISCORE_A2_MIN_CONF")
        return float(raw) if raw else 0.5

    a2.predict_letter = _predict
    a2.min_conf = _min_conf
    sys.modules["app.services.nutriscore_a2"] = a2


def _load_reader_module():
    prev = sys.modules.get("cv2")
    sys.modules["cv2"] = _REAL_CV2
    try:
        spec = importlib.util.spec_from_file_location("app.services.nutriscore_reader", _READER_PATH)
        module = importlib.util.module_from_spec(spec)
        sys.modules["app.services.nutriscore_reader"] = module
        spec.loader.exec_module(module)
    finally:
        if prev is not None:
            sys.modules["cv2"] = prev
        else:
            sys.modules.pop("cv2", None)
    return module


def _load_classification():
    _install_stubs()
    _load_reader_module()
    spec = importlib.util.spec_from_file_location("app.services.classification", _CLASSIFICATION_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules["app.services.classification"] = module
    spec.loader.exec_module(module)
    module._to_pil = lambda crop: crop
    return module


@pytest.fixture(autouse=True)
def _reset():
    _STATE["kp"] = 0.74
    _STATE["matches"] = [{"t3777_code": "NUTRISCORE_A", "similarity": 0.62}]
    _STATE["a2"] = ("A", 0.9, {"bron": "stub"})
    _STATE["a2_calls"] = 0
    _STATE["a2_raise"] = False
    yield


@pytest.mark.asyncio
async def test_ac_a_poort_open_a2_beslist():
    cls = _load_classification()
    res = await cls.classify_crop(_grijze_crop())
    assert res["t3777_code"] == "NUTRISCORE_A", res
    assert res["method"] == "nutriscore-a2", res
    assert res["uncertain"] is False
    assert res["confidence"] == 0.9
    assert _STATE["a2_calls"] == 1


@pytest.mark.asyncio
async def test_ac_b_poort_dicht_a2_niet_geraadpleegd():
    _STATE["matches"] = [{"t3777_code": "EU_ORGANIC_FARMING", "similarity": 0.9}]
    cls = _load_classification()
    res = await cls.classify_crop(_grijze_crop())
    assert res["t3777_code"] == "EU_ORGANIC_FARMING"
    assert res["method"] == "embedding"
    assert _STATE["a2_calls"] == 0


@pytest.mark.asyncio
async def test_ac_c_onder_de_vloer_geen_claim():
    _STATE["a2"] = ("A", 0.42, {})
    cls = _load_classification()
    res = await cls.classify_crop(_grijze_crop())
    # legacy: uncertain embedding-resultaat blijft het antwoord (0,62 < drempel)
    assert res["method"] != "nutriscore-a2"
    assert _STATE["a2_calls"] == 1


@pytest.mark.asyncio
async def test_ac_d_a2_none_valt_terug_op_legacy():
    _STATE["a2"] = (None, 0.97, {"pred": "none"})
    cls = _load_classification()
    res = await cls.classify_crop(_grijze_crop())
    assert res["method"] != "nutriscore-a2"


@pytest.mark.asyncio
async def test_ac_e_env_vloer_verschuift_kantelpunt(monkeypatch):
    _STATE["a2"] = ("C", 0.55, {})
    cls = _load_classification()
    res = await cls.classify_crop(_grijze_crop())
    assert res["method"] == "nutriscore-a2"  # 0,55 >= default 0,5
    monkeypatch.setenv("NUTRISCORE_A2_MIN_CONF", "0.7")
    res2 = await cls.classify_crop(_grijze_crop())
    assert res2["method"] != "nutriscore-a2"  # 0,55 < 0,7


@pytest.mark.asyncio
async def test_ac_f_a2_exception_fail_open():
    _STATE["a2_raise"] = True
    cls = _load_classification()
    res = await cls.classify_crop(_grijze_crop())
    assert res["method"] != "nutriscore-a2"
    assert res["t3777_code"] in ("NUTRISCORE_A", "UNKNOWN")  # legacy-resultaat


@pytest.mark.asyncio
async def test_ac_a2_wint_niet_van_de_deterministische_lezer(monkeypatch):
    # Leesbaar logo -> nutriscore-head beslist; A2 wordt NIET geraadpleegd.
    reader = _load_reader_module()  # fixturebouwer hergebruiken
    # bouw een leesbare balk zoals in test_nutriscore_reader_12_22
    img = np.full((160, 320, 3), 255, np.uint8)
    hues = {"A": 57, "B": 45, "C": 25, "D": 10, "E": 2}
    def bgr(h):
        px = np.uint8([[[h, 210, 200]]])
        b, g, r = _REAL_CV2.cvtColor(px, _REAL_CV2.COLOR_HSV2BGR)[0, 0]
        return int(b), int(g), int(r)
    x = 30
    for L in "ABCDE":
        if L == "D":
            hh = 84; yy = 50 - (hh - 60) // 2
            _REAL_CV2.rectangle(img, (x + 5, yy), (x + 39, yy + hh), bgr(hues[L]), -1)
            _REAL_CV2.putText(img, L, (x + 12, yy + hh - 14), _REAL_CV2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 3)
        else:
            _REAL_CV2.rectangle(img, (x + 1, 50), (x + 43, 110), bgr(hues[L]), -1)
            _REAL_CV2.putText(img, L, (x + 12, 92), _REAL_CV2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        x += 44
    cls = _load_classification()
    res = await cls.classify_crop(img)
    assert res["method"] == "nutriscore-head"
    assert _STATE["a2_calls"] == 0


# ---------------------------------------------------------------------------
# (g) module-tests: echte nutriscore_a2.py met gestubde storage
# ---------------------------------------------------------------------------

from contextlib import contextmanager


@contextmanager
def _echte_cv2_actief():
    """Houd de ECHTE cv2 in sys.modules voor de hele duur (transformers'
    import-keten doet find_spec("cv2") — dat crasht op suite-stubs zonder
    __spec__; en de a2-module importeert cv2/torchvision lazy op predict-tijd,
    dus alleen-tijdens-exec injecteren is niet genoeg)."""
    prev = sys.modules.get("cv2")
    sys.modules["cv2"] = _REAL_CV2
    try:
        yield
    finally:
        if prev is not None:
            sys.modules["cv2"] = prev
        else:
            sys.modules.pop("cv2", None)


def _make_state_dict_bytes():
    """Bouw een ECHT (random-init) state_dict voor de A2-architectuur."""
    import torch
    import torch.nn as nn
    from torchvision import models
    m = models.mobilenet_v3_small()
    m.classifier[-1] = nn.Linear(m.classifier[-1].in_features, 6)
    buf = io.BytesIO()
    torch.save(m.state_dict(), buf)
    return buf.getvalue()


def _load_a2_module(storage_objects, monkeypatch=None):
    """Laad de echte a2-module met een storage-stub. Met `monkeypatch` worden de
    sys.modules-mutaties (storage + a2) na de test netjes teruggedraaid
    (review-L5: geen blijvende kapotte-storage-stub voor latere tests)."""
    if not os.path.exists(_A2_PATH):
        pytest.fail("RED-phase: app/services/nutriscore_a2.py bestaat nog niet")
    _install_stubs()
    st = types.ModuleType("app.services.storage")

    def _get(key):
        if key in storage_objects:
            return storage_objects[key]
        raise FileNotFoundError(key)

    st.storage_service = types.SimpleNamespace(get_training_image=_get, connect=lambda: None)
    if monkeypatch is not None:
        monkeypatch.setitem(sys.modules, "app.services.storage", st)
    else:
        sys.modules["app.services.storage"] = st
    prev = sys.modules.get("cv2")
    sys.modules["cv2"] = _REAL_CV2
    try:
        spec = importlib.util.spec_from_file_location("app.services.nutriscore_a2", _A2_PATH)
        module = importlib.util.module_from_spec(spec)
        if monkeypatch is not None:
            monkeypatch.setitem(sys.modules, "app.services.nutriscore_a2", module)
        else:
            sys.modules["app.services.nutriscore_a2"] = module
        spec.loader.exec_module(module)
    finally:
        if prev is not None:
            sys.modules["cv2"] = prev
        else:
            sys.modules.pop("cv2", None)
    return module


def test_ac_g_module_laadt_en_voldoet_aan_contract(monkeypatch):
    with _echte_cv2_actief():
        meta = json.dumps({"classes": ["A", "B", "C", "D", "E", "none"]}).encode()
        objects = {
            "models/nutriscore-a2/v1/a2_mobilenetv3s.pt": _make_state_dict_bytes(),
            "models/nutriscore-a2/v1/a2_meta.json": meta,
        }
        a2 = _load_a2_module(objects, monkeypatch)
        letter, conf, info = a2.predict_letter(_grijze_crop())
        assert letter is None or letter in "ABCDE"
        assert 0.0 <= conf <= 1.0
        assert isinstance(info, dict)


def test_ac_g_module_fail_open_bij_storage_fout(monkeypatch):
    with _echte_cv2_actief():
        a2 = _load_a2_module({}, monkeypatch)  # niets in storage
        with pytest.raises(Exception):
            a2.predict_letter(_grijze_crop())


# ---------------------------------------------------------------------------
# Adversarial-review-regressietests (M1 / L5-gaten)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_review_m1_confident_embedding_wordt_niet_overschreven():
    # Sinds 12.3 zijn echte-crop-refs letter-onderscheidend voor herhaal-gevallen:
    # een CONFIDENT NUTRISCORE_*-match blijft het antwoord; A2 wordt niet geraadpleegd.
    _STATE["matches"] = [{"t3777_code": "NUTRISCORE_B", "similarity": 0.95}]
    cls = _load_classification()
    res = await cls.classify_crop(_grijze_crop())
    assert res["t3777_code"] == "NUTRISCORE_B"
    assert res["method"] == "embedding"
    assert _STATE["a2_calls"] == 0


@pytest.mark.asyncio
async def test_review_l5_expliciete_drempel_maakt_a2_resultaat_uncertain():
    _STATE["a2"] = ("A", 0.9, {})
    cls = _load_classification()
    res = await cls.classify_crop(_grijze_crop(), confidence_threshold=0.95)
    assert res["method"] == "nutriscore-a2"
    assert res["uncertain"] is True


@pytest.mark.asyncio
async def test_review_l5_pil_crop_raadpleegt_a2_niet():
    # PIL/niet-uint8-crops gaan langs de lezer (12.22-guard) -> ns_head_no_read
    # blijft False -> poort dicht, ongeacht de embedding-buur.
    from PIL import Image
    _STATE["matches"] = [{"t3777_code": "NUTRISCORE_A", "similarity": 0.62}]
    cls = _load_classification()
    pil = Image.new("RGB", (100, 100), (128, 128, 128))
    res = await cls.classify_crop(pil)
    assert res["method"] != "nutriscore-a2"
    assert _STATE["a2_calls"] == 0


def test_review_l5_min_conf_clamp_in_de_echte_module(monkeypatch):
    with _echte_cv2_actief():
        meta = json.dumps({"classes": ["A", "B", "C", "D", "E", "none"]}).encode()
        objects = {
            "models/nutriscore-a2/v1/a2_mobilenetv3s.pt": _make_state_dict_bytes(),
            "models/nutriscore-a2/v1/a2_meta.json": meta,
        }
        a2 = _load_a2_module(objects, monkeypatch)
        monkeypatch.setenv("NUTRISCORE_A2_MIN_CONF", "0")
        assert a2.min_conf() == 0.2  # geclamped: typo-vloer 0 mag nooit alles doorlaten
        monkeypatch.setenv("NUTRISCORE_A2_MIN_CONF", "0.7")
        assert a2.min_conf() == 0.7
