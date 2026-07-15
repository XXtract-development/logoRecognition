"""Story 19.11 — het CLASSIFY-herkenningspad gebruikt een eigen, lagere keurmerk-
gate (default 0,2) i.p.v. de gedeelde 0,5-gate, zodat echte keurmerk-crops (kp
0,25–0,39) niet meer als UNKNOWN worden gedropt vóór de referentie-zoektocht.

Bewijs-gedreven (investigate classify-gate-blocks-recognition): RAINFOREST kp 0,392
/ refs 0,70; TRIMAN kp 0,335 / refs 0,71. Met de gedeelde 0,5-gate → UNKNOWN; met de
classify-gate 0,2 → herkend.

Geïsoleerde module-load met gestubde zware collaborators (model_manager, database,
keurmerk_gate) — geen echt model/DB. Zelfde aanpak als test_bootstrap_search_service.
"""

import importlib.util
import os
import sys
import types

_APP_PKG = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "app"))

import numpy as np
import pytest

_HERE = os.path.dirname(__file__)
_MODULE_PATH = os.path.abspath(
    os.path.join(_HERE, "..", "..", "app", "services", "classification.py")
)

# Instelbare gate-score die de gestubde keurmerk_probability teruggeeft.
_STATE = {"kp": 0.39, "matches": [{"t3777_code": "RAINFOREST_ALLIANCE_PEOPLE_NATURE", "similarity": 0.70}]}


def _install_collaborator_stubs():
    """(Her)installeer de gestubde collaborators in sys.modules. De lazy imports IN
    `_classify_via_embedding` resolven op CALL-tijd, dus dit moet vóór ELKE test
    gebeuren — andere test-modules overschrijven deze sys.modules-entries."""
    for name in ("app", "app.core", "app.services", "app.ml"):
        if name not in sys.modules:
            mod = types.ModuleType(name)
            mod.__path__ = [os.path.join(_APP_PKG, *name.split(".")[1:])]  # echte pkg-paden: stubs mogen imports van andere tests niet vergiftigen (12.23)
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


def _load_classification():
    # 12.23: snapshot vóór het laden — deze functie draait op MODULE-niveau
    # (collectie-tijd); zonder herstel overschaduwen de submodule-stubs
    # (app.services.database e.d.) de ECHTE modules voor alle later
    # gecollecteerde testbestanden (ImportError "unknown location"). De eigen
    # tests herinstalleren hun stubs per test via de autouse-fixture, dus
    # herstellen is veilig.
    _touched = ("app", "app.core", "app.services", "app.ml", "app.core.logging", "app.ml.model_manager", "app.services.database", "app.services.keurmerk_gate", "app.services.classification")
    _prev = {k: sys.modules.get(k) for k in _touched}
    _install_collaborator_stubs()
    spec = importlib.util.spec_from_file_location("app.services.classification", _MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules["app.services.classification"] = module
    spec.loader.exec_module(module)
    # _to_pil vermijdt PIL/cv2 in de test (de embedding is toch gestubd).
    module._to_pil = lambda crop: crop
    for _k, _v in _prev.items():
        if _v is not None:
            sys.modules[_k] = _v
        else:
            sys.modules.pop(_k, None)
    return module


cls = _load_classification()


@pytest.fixture(autouse=True)
def _reinstall_stubs():
    """Herstel MIJN collaborator-stubs vóór elke test (andere modules vervuilen sys.modules)."""
    _install_collaborator_stubs()
    cls._to_pil = lambda crop: crop
    _STATE["kp"] = 0.39
    _STATE["matches"] = [{"t3777_code": "RAINFOREST_ALLIANCE_PEOPLE_NATURE", "similarity": 0.70}]
    yield


def test_default_classify_gate_is_lower_than_shared_gate():
    # Story 19.11: de classify-gate is een EIGEN, lagere drempel dan de gedeelde 0,5,
    # zodat echte keurmerken (kp 0,25–0,39) niet meer gedropt worden. (Env-override
    # mag de exacte waarde veranderen; de invariant is "lager dan de gedeelde 0,5".)
    assert cls.CLASSIFY_GATE_THRESHOLD < 0.5


@pytest.mark.asyncio
async def test_real_keurmerk_crop_below_shared_gate_is_recognized():
    # RAINFOREST kp 0,39 (< de oude 0,5-gate) — met de classify-gate 0,2 NIET gedropt,
    # dus de referentie-zoektocht draait en de JUISTE code komt terug i.p.v. UNKNOWN.
    # (Of de match daarna "zeker" of "uncertain" heet, bepaalt een aparte drempel; de
    # gate-fix gaat over herkend-worden i.p.v. weggegooid-worden.)
    _STATE["kp"] = 0.39
    _STATE["matches"] = [{"t3777_code": "RAINFOREST_ALLIANCE_PEOPLE_NATURE", "similarity": 0.70}]
    res = await cls._classify_via_embedding(object(), cls.CLASSIFY_THRESHOLD_EMBEDDING)
    assert res is not None
    assert res["t3777_code"] == "RAINFOREST_ALLIANCE_PEOPLE_NATURE"
    assert res["t3777_code"] != cls.CLASSIFY_UNKNOWN_CODE


@pytest.mark.asyncio
async def test_confident_non_keurmerk_still_gated():
    # Een echt niet-keurmerk (kp 0,10 < 0,2) wordt nog steeds gedropt → UNKNOWN.
    _STATE["kp"] = 0.10
    res = await cls._classify_via_embedding(object(), cls.CLASSIFY_THRESHOLD_EMBEDDING)
    assert res is not None
    assert res["t3777_code"] == cls.CLASSIFY_UNKNOWN_CODE


@pytest.mark.asyncio
async def test_weak_wrong_match_stays_uncertain():
    # Voorbij de gate maar zwakke match (0,40 < 0,65) → uncertain (geen valse zekerheid).
    _STATE["kp"] = 0.744
    _STATE["matches"] = [{"t3777_code": "FAIRTRADE_COCOA", "similarity": 0.40}]
    res = await cls._classify_via_embedding(object(), cls.CLASSIFY_THRESHOLD_EMBEDDING)
    assert res is not None
    assert res["uncertain"] is True
