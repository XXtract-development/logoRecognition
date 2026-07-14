"""Story 12.12 — Nutri-Score vorm-oogst (ATDD).

Dekt AC1, AC2 (provisionele-code-kant), AC4, AC5 voor
``app.services.queue_harvest_nutriscore``:

  * AC1 — vorm-scoping: matcht kandidaat-regio's LETTER-ONAFHANKELIJK tegen de
    vaste Nutri-Score-pool (NUTRISCORE_A..E) met de ruime, kalibreerbare
    drempel ``NUTRISCORE_HARVEST_FLOOR`` (default 0.60); NOOIT tegen de volledige
    actieve-referentie-universe (dat zou de vorm-scoping tenietdoen) — het
    doorgegeven codes-argument aan ``find_similar_references_by_codes`` moet
    exact de 5-letter-pool zijn.
  * AC1/AC4d — de gate-voorfilter (``keurmerk_probability``) blijft ervóór.
  * AC2 — provisionele-code-toewijzing (grove HSV-kleur-gok) zet elke treffer
    op een plausibele letter of de ``NUTRISCORE``-placeholder; puur functioneel
    getest op ``_provisional_code`` met echte (kleine, synthetische) BGR-crops.
  * AC1/AC4 — cap/flood-guard: begrenst per provisionele-code-bucket
    (``NUTRISCORE_HARVEST_PER_CODE_CAP``).
  * AC5c — ``NUTRISCORE_HARVEST_DRY_RUN`` muteert niets (geen insert/upload/state).
  * AC4 (isolatie) — importeren/draaien van deze module raakt queue_harvest.py
    (Story 19.10) NIET aan: een aparte state-key, een apart env-namespace, geen
    gedeelde module-state. Getoetst door queue_harvest.py's eigen ATDD-suite
    ongewijzigd te laten (git-hard, zie epic-rapport) — deze suite bewijst
    alleen het NIEUWE gedrag in isolatie.

Mock-patroon identiek aan ``test_queue_harvest_19_10.py``: een verse module-
load met gestubde ``app.*``-pakketten + fake ``cv2``, ``run_batch`` async via
``asyncio.run``. ``_crop_bgr`` en ``_provisional_code`` worden per-test
gemonkeypatcht naar tag-lookups (net als 19.10) zodat de scoping/cap/dry-run-
tests niet van een echte cv2-HSV-conversie afhangen; ``_provisional_code``
zelf wordt in een APARTE sectie hieronder rechtstreeks (met echte cv2, geen
stub) getest op zijn kleur-heuristiek.
"""

import asyncio
import importlib.util
import json
import os
import sys
import types

import numpy as np
import pytest

_HERE = os.path.dirname(__file__)
_MODULE_PATH = os.path.abspath(
    os.path.join(_HERE, "..", "..", "app", "services", "queue_harvest_nutriscore.py")
)

STATE_KEY = "keurmerk-harvest/nutriscore-state.json"
ARTWORK_KEY = "artwork/111/converted-0.png"
NUTRISCORE_CODES = [
    "NUTRISCORE_A",
    "NUTRISCORE_B",
    "NUTRISCORE_C",
    "NUTRISCORE_D",
    "NUTRISCORE_E",
]


# --------------------------------------------------------------------------- #
# Verse module-load met gestubde app-pakketten + fake cv2 (patroon 19.10).
# --------------------------------------------------------------------------- #
def _fresh_module(monkeypatch):
    for name in ("app", "app.core", "app.services", "app.ml"):
        mod = types.ModuleType(name)
        mod.__path__ = []
        monkeypatch.setitem(sys.modules, name, mod)

    log_stub = types.ModuleType("app.core.logging")
    log_stub.logger = types.SimpleNamespace(
        info=lambda *a, **k: None,
        warning=lambda *a, **k: None,
        error=lambda *a, **k: None,
    )
    monkeypatch.setitem(sys.modules, "app.core.logging", log_stub)

    cv2_stub = types.ModuleType("cv2")
    cv2_stub.IMREAD_COLOR = 1
    cv2_stub.imdecode = lambda buf, flag: np.zeros((8, 8, 3), dtype=np.uint8)
    cv2_stub.imencode = lambda ext, crop: (True, np.frombuffer(b"png", np.uint8))
    monkeypatch.setitem(sys.modules, "cv2", cv2_stub)

    spec = importlib.util.spec_from_file_location(
        "app.services.queue_harvest_nutriscore", _MODULE_PATH
    )
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "app.services.queue_harvest_nutriscore", module)
    spec.loader.exec_module(module)
    return module


class _FakeStorage:
    def __init__(self, store, artwork_keys):
        self.store = dict(store)
        self.artwork_keys = list(artwork_keys)
        self.puts = []

    def connect(self):
        pass

    def list_training_images(self, prefix=""):
        return [k for k in self.artwork_keys if k.startswith(prefix)]

    def get_training_image(self, key):
        if key in self.store:
            return self.store[key]
        raise FileNotFoundError(key)

    def put_training_image(self, key, data, content_type="image/png"):
        self.store[key] = data
        self.puts.append(key)
        return key


class _FakeConn:
    def __init__(self):
        self.executes = []

    async def execute(self, sql, *args):
        self.executes.append((sql, args))
        return "INSERT 0 1"


class _AcquireCtx:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *exc):
        return False


class _FakePool:
    def __init__(self, conn):
        self._conn = conn

    def acquire(self):
        return _AcquireCtx(self._conn)


class _FakeDB:
    """Records the codes-argument of every call — proves the pool-scoping (AC1)."""

    def __init__(self, conn, find_fn):
        self.pool = _FakePool(conn)
        self._find = find_fn
        self.scoped_calls = []  # (t3777_codes, threshold) per call

    async def connect(self):
        pass

    async def find_similar_references_by_codes(self, embedding, t3777_codes, limit, threshold):
        self.scoped_calls.append((list(t3777_codes), threshold))
        return self._find(threshold)


class _FakeModelManager:
    is_loaded = True

    def __init__(self, state):
        self._state = state

    async def load_models(self):  # pragma: no cover
        pass

    async def generate_embedding(self, pil_img):
        self._state["pending"] = pil_img
        return [0.0]


class _Harness:
    def __init__(self, monkeypatch):
        self.mp = monkeypatch

    def run(
        self,
        scenario,
        *,
        floor=None,
        per_code_cap=None,
        dry_run=False,
        provisional_map=None,
    ):
        """Draai één Nutri-Score-vorm-oogst-batch.

        scenario: lijst van dicts {tag, kp, sim, matched_code} — één regio-crop
                  per item. ``matched_code`` is de door de (gestubde) pool-
                  match teruggegeven letter — betekenisloos voor de scoping
                  zelf (die is letter-onafhankelijk), enkel gebruikt om aan te
                  tonen dat élke letter binnenkomt.
        provisional_map: optionele dict tag -> provisionele-code, monkeypatcht
                  ``_provisional_code`` (default: alles "NUTRISCORE").
        """
        mp = self.mp
        for var in (
            "NUTRISCORE_HARVEST_FLOOR",
            "NUTRISCORE_HARVEST_PER_CODE_CAP",
            "NUTRISCORE_HARVEST_DRY_RUN",
        ):
            mp.delenv(var, raising=False)
        if floor is not None:
            mp.setenv("NUTRISCORE_HARVEST_FLOOR", str(floor))
        if per_code_cap is not None:
            mp.setenv("NUTRISCORE_HARVEST_PER_CODE_CAP", str(per_code_cap))
        if dry_run:
            mp.setenv("NUTRISCORE_HARVEST_DRY_RUN", "1")

        module = _fresh_module(mp)

        state = {"pending": None}
        crop_meta = {}
        tag_by_x = {}
        boxes = []
        for idx, entry in enumerate(scenario):
            x = idx * 10
            boxes.append((x, 0, 8, 8))
            tag_by_x[x] = entry["tag"]
            crop_meta[entry["tag"]] = entry

        def find_fn(threshold):
            meta = crop_meta[state["pending"]]
            if meta["sim"] < threshold:
                return []
            return [{"t3777_code": meta.get("matched_code", "NUTRISCORE_A"), "similarity": meta["sim"]}]

        conn = _FakeConn()
        storage = _FakeStorage(
            {ARTWORK_KEY: b"img-bytes"},
            [ARTWORK_KEY],
        )
        db = _FakeDB(conn, find_fn)
        mm = _FakeModelManager(state)

        mm_mod = types.ModuleType("app.ml.model_manager")
        mm_mod.model_manager = mm
        mp.setitem(sys.modules, "app.ml.model_manager", mm_mod)

        cls_mod = types.ModuleType("app.services.classification")
        cls_mod._to_pil = lambda crop: crop
        mp.setitem(sys.modules, "app.services.classification", cls_mod)

        db_mod = types.ModuleType("app.services.database")
        db_mod.db_service = db
        mp.setitem(sys.modules, "app.services.database", db_mod)

        gate_mod = types.ModuleType("app.services.keurmerk_gate")
        gate_mod.GATE_THRESHOLD = 0.5
        gate_mod.keurmerk_probability = lambda emb: crop_meta[state["pending"]]["kp"]
        mp.setitem(sys.modules, "app.services.keurmerk_gate", gate_mod)

        rp_mod = types.ModuleType("app.services.region_proposer")
        rp_mod.propose_regions = lambda img: (list(boxes), {})
        mp.setitem(sys.modules, "app.services.region_proposer", rp_mod)

        st_mod = types.ModuleType("app.services.storage")
        st_mod.storage_service = storage
        mp.setitem(sys.modules, "app.services.storage", st_mod)

        mp.setattr(module, "_crop_bgr", lambda img, b: tag_by_x[b[0]])
        pmap = provisional_map or {}
        mp.setattr(module, "_provisional_code", lambda crop: pmap.get(crop, "NUTRISCORE"))

        result = asyncio.run(module.run_batch())
        return types.SimpleNamespace(result=result, storage=storage, conn=conn, db=db, module=module)


@pytest.fixture()
def harness(monkeypatch):
    return _Harness(monkeypatch)


def _crop(tag, *, kp=None, sim=0.95, matched_code="NUTRISCORE_A"):
    return {"tag": tag, "kp": kp, "sim": sim, "matched_code": matched_code}


# =========================================================================== #
# AC1 — vorm-scoping: pool-argument is exact de 5-letter-pool (letter-
# onafhankelijk), NOOIT de volledige actieve-referentie-universe.
# =========================================================================== #
def test_ac1_matcht_tegen_de_vaste_5_letter_pool_niet_tegen_alles(harness):
    scenario = [_crop("t1", matched_code="NUTRISCORE_C")]
    out = harness.run(scenario)
    assert out.db.scoped_calls, "find_similar_references_by_codes werd niet aangeroepen"
    codes, threshold = out.db.scoped_calls[0]
    assert set(codes) == set(NUTRISCORE_CODES)
    assert threshold == pytest.approx(0.60)  # default NUTRISCORE_HARVEST_FLOOR


def test_ac1_default_floor_is_060(harness):
    """De diagnose (nutriscore-corpus-vindbaarheid) gebruikte exact 0,60 — de
    default moet daarmee in lock-step blijven (stille drift zou de C/D-schatting
    ongeldig maken)."""
    out = harness.run([_crop("t1")])
    assert out.module.FLOOR == pytest.approx(0.60)


def test_ac1_kalibreerbare_floor_via_env(harness):
    """Een crop net ONDER de gekalibreerde drempel wordt geweerd, net erboven
    komt door — bewijst dat NUTRISCORE_HARVEST_FLOOR daadwerkelijk stuurt."""
    scenario = [_crop("below", sim=0.54), _crop("above", sim=0.56)]
    out = harness.run(scenario, floor=0.55)
    assert out.result["candidates"] == 1
    assert out.result["inserted"] == 1


def test_ac1_letter_onafhankelijk_elke_letter_telt_mee(harness):
    """Kandidaten die tegen VERSCHILLENDE letters van de pool matchen (A t/m E)
    komen allemaal door — de scoping onderscheidt geen letter, alleen de vorm."""
    scenario = [
        _crop("tA", matched_code="NUTRISCORE_A"),
        _crop("tB", matched_code="NUTRISCORE_B"),
        _crop("tC", matched_code="NUTRISCORE_C"),
        _crop("tD", matched_code="NUTRISCORE_D"),
        _crop("tE", matched_code="NUTRISCORE_E"),
    ]
    out = harness.run(scenario)
    assert out.result["candidates"] == 5
    assert out.result["inserted"] == 5


def test_ac4d_gate_voorfilter_blijft_ervoor(harness):
    """De keurmerk-gate weert een crop vóór de pool-match — ongewijzigd."""
    scenario = [_crop("gated", kp=0.05), _crop("pass", kp=None)]
    out = harness.run(scenario)
    assert out.result["candidates"] == 1
    # De geweerde crop triggerde nooit een pool-match-call.
    assert len(out.db.scoped_calls) == 1


# =========================================================================== #
# AC1/AC2 — provisionele-code-insert (review-item draagt de provisionele code,
# geen auto-promotie tot referentie — dat gebeurt pas bij menselijke accept).
# =========================================================================== #
def test_ac2_provisionele_code_landt_als_open_review_item(harness):
    scenario = [_crop("green"), _crop("yellow")]
    out = harness.run(scenario, provisional_map={"green": "NUTRISCORE_A", "yellow": "NUTRISCORE_C"})

    assert out.result["inserted"] == 2
    assert out.result["per_code"] == {"NUTRISCORE_A": 1, "NUTRISCORE_C": 1}

    inserts = out.conn.executes
    assert len(inserts) == 2
    codes_inserted = {args[1] for _, args in inserts}
    assert codes_inserted == {"NUTRISCORE_A", "NUTRISCORE_C"}
    for sql, args in inserts:
        assert "artwork_review_items" in sql
        assert "'open'" in sql
        assert "reference_logos" not in sql  # geen auto-promotie
        assert out.module.MARKER in args


def test_ac2_onduidelijke_kleur_valt_terug_op_placeholder(harness):
    scenario = [_crop("ambigu")]
    out = harness.run(scenario, provisional_map={})  # geen entry -> default "NUTRISCORE"
    assert out.result["per_code"] == {"NUTRISCORE": 1}


# =========================================================================== #
# AC1/AC4 — cap/flood-guard per provisionele-code-bucket.
# =========================================================================== #
def test_ac4_per_bucket_cap_gehandhaafd(harness):
    scenario = [_crop(f"g{i}") for i in range(5)]
    out = harness.run(
        scenario,
        per_code_cap=2,
        provisional_map={f"g{i}": "NUTRISCORE_A" for i in range(5)},
    )
    assert out.result["per_code"] == {"NUTRISCORE_A": 2}
    assert out.result["candidates"] == 2


def test_ac4_cap_is_per_bucket_niet_globaal(harness):
    """Twee buckets met elk hun eigen cap-budget — de cap begrenst PER
    provisionele-code, niet de hele run in totaal."""
    scenario = [_crop(f"a{i}") for i in range(3)] + [_crop(f"b{i}") for i in range(3)]
    pmap = {f"a{i}": "NUTRISCORE_A" for i in range(3)}
    pmap.update({f"b{i}": "NUTRISCORE_B" for i in range(3)})
    out = harness.run(scenario, per_code_cap=2, provisional_map=pmap)
    assert out.result["per_code"] == {"NUTRISCORE_A": 2, "NUTRISCORE_B": 2}


# =========================================================================== #
# AC5c — DRY_RUN muteert niets.
# =========================================================================== #
def test_ac5c_dry_run_muteert_niets(harness):
    scenario = [_crop("t1"), _crop("t2")]
    out = harness.run(scenario, dry_run=True, provisional_map={"t1": "NUTRISCORE_D", "t2": "NUTRISCORE_D"})

    assert out.result["dry_run"] is True
    assert out.result["inserted"] == 0
    assert out.result["per_code"] == {"NUTRISCORE_D": 2}
    assert out.conn.executes == []
    assert not [k for k in out.storage.puts if k.startswith("artwork-crops/")]
    assert STATE_KEY not in out.storage.store


def test_ac5c_dry_run_meet_wel_de_kandidaten(harness):
    """DRY_RUN is een read-only METING (AC6) — het aantal kandidaten en de
    grove verdeling worden nog steeds berekend, alleen niet weggeschreven."""
    scenario = [_crop("t1"), _crop("t2"), _crop("t3")]
    out = harness.run(
        scenario,
        dry_run=True,
        provisional_map={"t1": "NUTRISCORE_C", "t2": "NUTRISCORE_D", "t3": "NUTRISCORE_D"},
    )
    assert out.result["candidates"] == 3
    assert out.result["per_code"] == {"NUTRISCORE_C": 1, "NUTRISCORE_D": 2}


# =========================================================================== #
# AC2 — provisionele-kleur-heuristiek (`_provisional_code`), rechtstreeks met
# echte (kleine, synthetische) BGR-patches — GEEN cv2-stub, échte kleur-conversie.
# =========================================================================== #
def _solid_bgr(b, g, r, size=16):
    patch = np.zeros((size, size, 3), dtype=np.uint8)
    patch[:, :] = (b, g, r)
    return patch


@pytest.fixture()
def color_module(monkeypatch):
    """Laad de module vers zónder een cv2-stub, zodat ``_provisional_code``
    de ECHTE opencv-HSV-conversie gebruikt (installed dependency van ml-service).

    Andere ATDD-suites in deze map (bv. ``test_bootstrap_search_service.py``)
    zetten een fake ``cv2`` direct in ``sys.modules`` (zonder monkeypatch), wat
    NOOIT wordt teruggedraaid en dus de rest van de pytest-sessie kan
    besmetten. Defensief: verwijder een eventueel gecachete ``cv2`` en forceer
    een verse, echte import via ``monkeypatch`` (die zelf WEL netjes terugdraait
    ná deze test) zodat deze kleur-heuristiek-tests altijd de échte opencv
    gebruiken, ongeacht test-volgorde/eerder gestubde sessies."""
    for name in ("app", "app.core"):
        mod = types.ModuleType(name)
        mod.__path__ = []
        monkeypatch.setitem(sys.modules, name, mod)
    log_stub = types.ModuleType("app.core.logging")
    log_stub.logger = types.SimpleNamespace(info=lambda *a, **k: None, warning=lambda *a, **k: None, error=lambda *a, **k: None)
    monkeypatch.setitem(sys.modules, "app.core.logging", log_stub)

    monkeypatch.delitem(sys.modules, "cv2", raising=False)
    import importlib as _importlib

    real_cv2 = _importlib.import_module("cv2")
    monkeypatch.setitem(sys.modules, "cv2", real_cv2)

    spec = importlib.util.spec_from_file_location(
        "app.services.queue_harvest_nutriscore_color", _MODULE_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_provisional_code_rood_naar_E(color_module):
    assert color_module._provisional_code(_solid_bgr(20, 20, 210)) == "NUTRISCORE_E"


def test_provisional_code_oranje_naar_D(color_module):
    assert color_module._provisional_code(_solid_bgr(20, 120, 230)) == "NUTRISCORE_D"


def test_provisional_code_geel_naar_C(color_module):
    assert color_module._provisional_code(_solid_bgr(20, 210, 220)) == "NUTRISCORE_C"


def test_provisional_code_lichtgroen_naar_B(color_module):
    assert color_module._provisional_code(_solid_bgr(60, 200, 150)) == "NUTRISCORE_B"


def test_provisional_code_donkergroen_naar_A(color_module):
    assert color_module._provisional_code(_solid_bgr(60, 140, 20)) == "NUTRISCORE_A"


def test_provisional_code_laag_verzadigd_valt_terug_op_placeholder(color_module):
    """Een grijs/wit/zwart-achtige regio heeft geen duidelijke dominante tint —
    de heuristiek gokt dan NIET, maar valt terug op de NUTRISCORE-placeholder."""
    assert color_module._provisional_code(_solid_bgr(120, 120, 120)) == "NUTRISCORE"
