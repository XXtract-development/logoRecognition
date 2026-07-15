"""Story 12.22 — ATDD (red-phase): Nutri-Score-familie-head.

AC5-acceptatietests, geschreven VÓÓR de implementatie (RED → GREEN):
  (a) synthetische balk-fixtures per letter × beide drukvarianten × rotaties
      → juiste letter;
  (b) balk zonder uitvergroot vakje → geen lezing;
  (c) monochrome/kleurloze crop → geen lezing;
  (d) router in classify_crop: Nutri-Score-crop → nutriscore-head-resultaat;
      niet-Nutri-Score-crop → legacy embedding-pad (byte-identiek);
  (e) ratio-vloer-env (NUTRISCORE_READER_MIN_RATIO) verschuift het kantelpunt;
  (f) reader-exception → fail-open naar het legacy-resultaat.

Fixtures zijn synthetisch getekend (cv2) met de op ACC gemeten drukvariant-hues
(spike 12.21b) — geen binaire fixtures in git. Router-tests volgen het
geïsoleerde-module-load-patroon van test_classify_gate_19_11.py.
"""

import importlib.util
import os
import sys
import time
import types

import cv2
import numpy as np
import pytest

_HERE = os.path.dirname(__file__)
_READER_PATH = os.path.abspath(
    os.path.join(_HERE, "..", "..", "app", "services", "nutriscore_reader.py")
)
_CLASSIFICATION_PATH = os.path.abspath(
    os.path.join(_HERE, "..", "..", "app", "services", "classification.py")
)

# De ECHTE cv2, gebonden op COLLECTIE-moment (vóór enige test draait). Andere
# test-bestanden in deze suite stubben sys.modules["cv2"] en zetten dat nooit
# terug; cv2 kan bovendien niet in-proces geherimporteerd worden (native-init).
# De loaders hieronder injecteren deze referentie tijdens het laden van de
# reader-module en herstellen daarna de aangetroffen sys.modules-toestand.
_REAL_CV2 = cv2

# Op ACC gemeten drukvariant-hues (OpenCV H 0-180; spike 12.21b).
VARIANT_1 = {"A": 57, "B": 45, "C": 25, "D": 10, "E": 2}
VARIANT_2 = {"A": 75, "B": 42, "C": 24, "D": 16, "E": 5}


def _hsv_bgr(h, s=210, v=200):
    px = np.uint8([[[h, s, v]]])
    b, g, r = cv2.cvtColor(px, cv2.COLOR_HSV2BGR)[0, 0]
    return int(b), int(g), int(r)


def make_band(enlarged=None, hues=VARIANT_1, ratio=1.4, monochrome=False):
    """Teken een synthetisch Nutri-Score-logo: 5 vakjes naast elkaar op wit,
    het `enlarged`-vakje hoger/vrijstaand (witte ring), mét het witte
    letter-glyph in elk vakje — zoals het echte logo (het glyph is ook de
    discriminator t.o.v. massieve staafdiagrammen, review-M1)."""
    img = np.full((160, 320, 3), 255, np.uint8)
    slot_w, box_h = 44, 60
    y0 = (160 - box_h) // 2
    x = 30
    for L in "ABCDE":
        color = (120, 120, 120) if monochrome else _hsv_bgr(hues[L])
        if L == enlarged:
            hh = int(round(box_h * ratio))
            yy = y0 - (hh - box_h) // 2
            # 5px inzet = witte ring rond het uitvergrote vakje
            cv2.rectangle(img, (x + 5, yy), (x + slot_w - 5, yy + hh), color, -1)
            cv2.putText(img, L, (x + 12, yy + hh - 14), cv2.FONT_HERSHEY_SIMPLEX,
                        1.0, (255, 255, 255), 3)
        else:
            cv2.rectangle(img, (x + 1, y0), (x + slot_w - 1, y0 + box_h), color, -1)
            cv2.putText(img, L, (x + 12, y0 + box_h - 18), cv2.FONT_HERSHEY_SIMPLEX,
                        0.8, (255, 255, 255), 2)
        x += slot_w
    return img


def _load_reader():
    """Laad de reader-module. RED-phase: bestaat nog niet → expliciete fail.

    Suite-vervuilings-verdediging: bind de ÉCHTE cv2 (collectie-referentie)
    tijdens het laden en herstel daarna alléén de cv2-entry. De app-stubs
    (app/app.core/app.core.logging) blijven staan — dat is de bestaande
    suite-conventie (elk testbestand herinstalleert zijn eigen stubs
    defensief, zie test_classify_gate_19_11.py).
    """
    if not os.path.exists(_READER_PATH):
        pytest.fail(
            "RED-phase: app/services/nutriscore_reader.py bestaat nog niet (AC1)"
        )
    prev_cv2 = sys.modules.get("cv2")
    sys.modules["cv2"] = _REAL_CV2
    if "app.core.logging" not in sys.modules:
        for name in ("app", "app.core"):
            if name not in sys.modules:
                mod = types.ModuleType(name)
                mod.__path__ = []
                sys.modules[name] = mod
        log_stub = types.ModuleType("app.core.logging")
        log_stub.logger = types.SimpleNamespace(
            info=lambda *a, **k: None, warning=lambda *a, **k: None, error=lambda *a, **k: None,
        )
        sys.modules["app.core.logging"] = log_stub
    try:
        spec = importlib.util.spec_from_file_location(
            "app.services.nutriscore_reader", _READER_PATH
        )
        module = importlib.util.module_from_spec(spec)
        sys.modules["app.services.nutriscore_reader"] = module
        spec.loader.exec_module(module)
    finally:
        if prev_cv2 is not None:
            sys.modules["cv2"] = prev_cv2
        else:
            sys.modules.pop("cv2", None)
    return module


# ---------------------------------------------------------------------------
# (a) juiste letter per variant en oriëntatie
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("letter", list("ABCDE"))
@pytest.mark.parametrize("hues", [VARIANT_1, VARIANT_2], ids=["variant1", "variant2"])
def test_ac5a_leest_de_juiste_letter(letter, hues):
    reader = _load_reader()
    got, info = reader.read_nutriscore(make_band(enlarged=letter, hues=hues))
    assert got == letter, f"verwacht {letter}, kreeg {got} ({info})"


@pytest.mark.parametrize(
    "rot", [cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180], ids=["rot90", "rot180"]
)
def test_ac5a_orientatie_robuust(rot):
    reader = _load_reader()
    img = cv2.rotate(make_band(enlarged="D"), rot)
    got, info = reader.read_nutriscore(img)
    assert got == "D", f"verwacht D, kreeg {got} ({info})"


# ---------------------------------------------------------------------------
# (b) geen uitvergroot vakje → geen lezing (nooit gokken)
# ---------------------------------------------------------------------------

def test_ac5b_balk_zonder_uitvergroot_vakje_geeft_geen_lezing():
    reader = _load_reader()
    got, info = reader.read_nutriscore(make_band(enlarged=None))
    assert got is None
    assert "reason" in info


# ---------------------------------------------------------------------------
# (c) monochrome druk → geen lezing (kleur-loze variant is A2-vangnet-terrein)
# ---------------------------------------------------------------------------

def test_ac5c_monochrome_crop_geeft_geen_lezing():
    reader = _load_reader()
    got, _info = reader.read_nutriscore(make_band(enlarged="B", monochrome=True))
    assert got is None


# ---------------------------------------------------------------------------
# (e) ratio-vloer: default 1,12 leest een 1,15-ratio; env-vloer 1,18 niet
# ---------------------------------------------------------------------------

def test_ac5e_ratio_vloer_env_verschuift_het_kantelpunt(monkeypatch):
    reader = _load_reader()
    borderline = make_band(enlarged="C", ratio=1.15)
    got_default, info = reader.read_nutriscore(borderline)
    assert got_default == "C", f"default vloer (1,12) hoort 1,15 te lezen ({info})"
    monkeypatch.setenv("NUTRISCORE_READER_MIN_RATIO", "1.18")
    got_strict, _ = reader.read_nutriscore(borderline)
    assert got_strict is None, "kruischeck-vloer 1,18 hoort een 1,15-ratio te weigeren"


# ---------------------------------------------------------------------------
# (d)+(f) router in classify_crop — geïsoleerde module-load met stubs
# (patroon test_classify_gate_19_11.py); de ECHTE reader draait mee.
# ---------------------------------------------------------------------------

_STATE = {
    "kp": 0.74,
    "matches": [{"t3777_code": "EU_ORGANIC_FARMING", "similarity": 0.90}],
}


def _install_collaborator_stubs():
    for name in ("app", "app.core", "app.services", "app.ml"):
        if name not in sys.modules:
            mod = types.ModuleType(name)
            mod.__path__ = []
            sys.modules[name] = mod
    logging_stub = types.ModuleType("app.core.logging")
    logging_stub.logger = types.SimpleNamespace(
        info=lambda *a, **k: None, warning=lambda *a, **k: None, error=lambda *a, **k: None,
    )
    sys.modules["app.core.logging"] = logging_stub

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


def _load_classification_with_real_reader():
    """Classification geïsoleerd laden; de ÉCHTE reader-module wordt onder haar
    app-naam geregistreerd zodat de router-integratie 'm kan importeren."""
    _install_collaborator_stubs()
    _load_reader()  # RED-phase: faalt hier al met een duidelijke reden (AC1)
    spec = importlib.util.spec_from_file_location(
        "app.services.classification", _CLASSIFICATION_PATH
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["app.services.classification"] = module
    spec.loader.exec_module(module)
    module._to_pil = lambda crop: crop
    return module


@pytest.mark.asyncio
async def test_ac5d_router_nutriscore_crop_gaat_via_de_head():
    cls = _load_classification_with_real_reader()
    res = await cls.classify_crop(make_band(enlarged="D"))
    assert res["t3777_code"] == "NUTRISCORE_D", res
    assert res["method"] == "nutriscore-head", res
    assert res["uncertain"] is False
    assert 0.80 <= res["confidence"] <= 0.99


@pytest.mark.asyncio
async def test_ac5d_router_niet_nutriscore_crop_valt_door_naar_legacy():
    cls = _load_classification_with_real_reader()
    # effen grijze crop: geen balk → reader leest niets → legacy embedding-pad
    gray = np.full((120, 120, 3), 128, np.uint8)
    res = await cls.classify_crop(gray)
    assert res["t3777_code"] == "EU_ORGANIC_FARMING", res
    assert res["method"] != "nutriscore-head"


# ---------------------------------------------------------------------------
# Adversarial-review-bevindingen (H1/M1/M2/L1/L2/L6) — regressietests
# ---------------------------------------------------------------------------

def test_review_l6_orientatie_270_graden():
    reader = _load_reader()
    img = cv2.rotate(make_band(enlarged="C"), cv2.ROTATE_90_COUNTERCLOCKWISE)
    got, info = reader.read_nutriscore(img)
    assert got == "C", f"verwacht C, kreeg {got} ({info})"


def test_review_m1_staafdiagram_bodem_uitgelijnd_wordt_geweigerd():
    # Vijf bodem-uitgelijnde staven in het NS-palet met één hogere staaf: het
    # 'uitvergrote' element steekt maar aan ÉÉN kant uit → geen logo, weiger.
    reader = _load_reader()
    img = np.full((200, 320, 3), 255, np.uint8)
    x, bottom = 30, 170
    for L, hh in zip("ABCDE", [100, 100, 140, 100, 100]):
        cv2.rectangle(img, (x + 1, bottom - hh), (x + 43, bottom), _hsv_bgr(VARIANT_1[L]), -1)
        x += 44
    got, info = reader.read_nutriscore(img)
    assert got is None, f"staafdiagram gelezen als {got} ({info})"


def test_review_m1_oplopende_staven_worden_geweigerd():
    # Oplopende reeks (geen uitvergroot vakje, alleen trend) → weiger
    # (uniformiteits- én centreringscheck).
    reader = _load_reader()
    img = np.full((200, 320, 3), 255, np.uint8)
    x, bottom = 30, 170
    for L, hh in zip("ABCDE", [80, 95, 110, 125, 140]):
        cv2.rectangle(img, (x + 1, bottom - hh), (x + 43, bottom), _hsv_bgr(VARIANT_1[L]), -1)
        x += 44
    got, info = reader.read_nutriscore(img)
    assert got is None, f"oplopende staven gelezen als {got} ({info})"


def test_review_h1_sliver_bbox_goedkoop_geweigerd():
    reader = _load_reader()
    tiny = np.full((6, 4000, 3), 200, np.uint8)
    got, info = reader.read_nutriscore(tiny)
    assert got is None and "klein" in info["reason"]
    sliver = np.full((20, 4000, 3), 200, np.uint8)
    t0 = time.perf_counter()
    got2, info2 = reader.read_nutriscore(sliver)
    took = time.perf_counter() - t0
    assert got2 is None and "verhouding" in info2["reason"]
    assert took < 0.5, f"sliver-guard hoort vóór het rekenwerk te zitten ({took:.2f}s)"


def test_review_l1_env_vloer_geclamped_op_minimum(monkeypatch):
    # Een typo-vloer van 0 mag meetruis (ratio ~1.0) nooit als letter doorlaten.
    reader = _load_reader()
    monkeypatch.setenv("NUTRISCORE_READER_MIN_RATIO", "0")
    got, _info = reader.read_nutriscore(make_band(enlarged=None))
    assert got is None


@pytest.mark.asyncio
async def test_review_m2_expliciete_drempel_wint_ook_van_de_head():
    # Docstring-contract: "confidence_threshold always wins when provided" —
    # onder een expliciete drempel is óók een head-resultaat uncertain.
    cls = _load_classification_with_real_reader()
    res = await cls.classify_crop(make_band(enlarged="D"), confidence_threshold=0.995)
    assert res["method"] == "nutriscore-head"
    assert res["uncertain"] is True


@pytest.mark.asyncio
async def test_review_l2_bgra_crop_gaat_stil_langs_de_head_naar_legacy():
    cls = _load_classification_with_real_reader()
    band = make_band(enlarged="D")
    bgra = np.dstack([band, np.full(band.shape[:2], 255, np.uint8)])
    res = await cls.classify_crop(bgra)
    assert res["method"] != "nutriscore-head"
    assert res["t3777_code"] == "EU_ORGANIC_FARMING"


@pytest.mark.asyncio
async def test_ac5f_reader_exception_valt_open_naar_legacy(monkeypatch):
    cls = _load_classification_with_real_reader()

    def _boom(*a, **k):
        raise RuntimeError("reader kapot")

    monkeypatch.setattr(
        sys.modules["app.services.nutriscore_reader"], "read_nutriscore", _boom
    )
    res = await cls.classify_crop(make_band(enlarged="D"))
    # fail-open: nooit een crash de route in; het legacy-resultaat telt
    assert res["t3777_code"] == "EU_ORGANIC_FARMING", res
