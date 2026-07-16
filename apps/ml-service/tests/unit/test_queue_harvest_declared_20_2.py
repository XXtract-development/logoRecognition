"""Story 20.2 — Generieke declaratie-gedreven oogst (ATDD).

Generalisatie van het bewezen 12.15-patroon voor de categorie-3-uitrol (en elk
volgend spoor): de kandidaat-bron is een code->GTIN-lijst-map in MinIO (uit de
20.1-meting), NIET de mismatch-events (die bestaan pas nadat een veld ooit
herkend is — het 20.2-gat waardoor de 17.1-bootstrap "run leeg" gaf).

Dekt:
  * AC1 — label = de gedeclareerde code van het (code, gtin)-paar; de
    similarity-pool is STRIKT gescoped op die ene code (eigen refs: gids-zaad
    en/of echte crops).
  * AC2 — een GTIN die MEERDERE codes declareert (bv. alcohol: zwangerschap +
    niet-rijden + 18+) levert per code een eigen kandidaat op dezelfde pagina;
    de idempotentie-dedup is per code gescoped (reason-marker bevat de code).
  * AC3 — geen fabricatie: geen regio >= floor -> paar overgeslagen; bij
    meerdere regio's wint alleen de beste (hoogste similarity).
  * AC4 — per-code-cap (flood-guard), idempotentie via review_item_exists,
    DRY_RUN muteert niets maar telt wel kandidaten; env-code-filter begrenst
    de scope; ontbrekende/misvormde map -> 0 kandidaten, geen crash.

Mock-patroon: identiek aan test_queue_harvest_nutriscore_declared_12_15.py
(verse module-load met gestubde app-pakketten + fake cv2).
"""

import asyncio
import importlib.util
import json
import os
import sys
import types

import numpy as np
import pytest

_APP_PKG = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "app"))
_HERE = os.path.dirname(__file__)
_MODULE_PATH = os.path.abspath(
    os.path.join(_HERE, "..", "..", "app", "services", "queue_harvest_declared.py")
)


def _fresh_module(monkeypatch):
    for name in ("app", "app.core", "app.services", "app.ml"):
        mod = types.ModuleType(name)
        mod.__path__ = [os.path.join(_APP_PKG, *name.split(".")[1:])]
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
        "app.services.queue_harvest_declared", _MODULE_PATH
    )
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "app.services.queue_harvest_declared", module)
    spec.loader.exec_module(module)
    return module


class _FakeStorage:
    def __init__(self, store, artwork_keys, shared):
        self.store = dict(store)
        self.artwork_keys = list(artwork_keys)
        self.puts = []
        self.shared = shared

    def connect(self):
        pass

    def list_training_images(self, prefix=""):
        return [k for k in self.artwork_keys if k.startswith(prefix)]

    def get_training_image(self, key):
        self.shared["current_src"] = key
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
    def __init__(self, conn, find_fn, existing=None):
        self.pool = _FakePool(conn)
        self._find = find_fn
        self.scoped_calls = []
        self._existing = set(existing or [])
        self.exists_calls = []

    async def connect(self):
        pass

    async def find_similar_references_by_codes(self, embedding, t3777_codes, limit, threshold):
        self.scoped_calls.append((list(t3777_codes), threshold))
        return self._find(threshold)

    async def review_item_exists(self, gtin, reason, source_file):
        self.exists_calls.append((gtin, reason, source_file))
        return (gtin, reason, source_file) in self._existing


class _FakeModelManager:
    is_loaded = True

    async def load_models(self):  # pragma: no cover
        pass

    async def generate_embedding(self, pil_img):
        return [0.0]


class _Harness:
    def __init__(self, monkeypatch):
        self.mp = monkeypatch

    def run(
        self,
        pages,
        codes_map,
        *,
        floor=None,
        codes=None,
        per_code_cap=None,
        dry_run=False,
        existing=None,
        batch=None,
        map_override=None,
    ):
        """Draai één generieke declaratie-oogst-batch.

        pages: lijst van dicts {gtin, regions}; regio-metadata per (src, x).
        codes_map: {code: [gtins]} — de kandidaat-map (20.1-meting).
        """
        mp = self.mp
        for var in (
            "DECLARED_HARVEST_FLOOR",
            "DECLARED_HARVEST_CODES",
            "DECLARED_HARVEST_PER_CODE_CAP",
            "DECLARED_HARVEST_DRY_RUN",
            "DECLARED_HARVEST_BATCH",
            "DECLARED_HARVEST_MAX_SECONDS",
        ):
            mp.delenv(var, raising=False)
        if floor is not None:
            mp.setenv("DECLARED_HARVEST_FLOOR", str(floor))
        if codes is not None:
            mp.setenv("DECLARED_HARVEST_CODES", codes)
        if per_code_cap is not None:
            mp.setenv("DECLARED_HARVEST_PER_CODE_CAP", str(per_code_cap))
        if dry_run:
            mp.setenv("DECLARED_HARVEST_DRY_RUN", "1")
        if batch is not None:
            mp.setenv("DECLARED_HARVEST_BATCH", str(batch))

        module = _fresh_module(mp)

        if map_override is not None:
            map_bytes = map_override
        else:
            map_bytes = json.dumps({"codes": codes_map}).encode("utf-8")

        shared = {"current_src": None}
        region_meta = {}
        store = {module.DECLARED_MAP_KEY: map_bytes}
        artwork_keys = []
        boxes_by_src = {}
        for g in pages:
            src = f"artwork/{g['gtin']}/converted-0.png"
            store[src] = f"img-{g['gtin']}".encode("utf-8")
            artwork_keys.append(src)
            boxes = []
            for idx, r in enumerate(g.get("regions", [])):
                x = idx * 10
                boxes.append((x, 0, 8, 8))
                region_meta[(src, x)] = r
            boxes_by_src[src] = boxes

        storage = _FakeStorage(store, artwork_keys, shared)
        conn = _FakeConn()

        def find_fn(threshold):
            meta = region_meta[(shared["current_src"], shared["current_x"])]
            if meta["sim"] < threshold:
                return []
            return [{"t3777_code": meta.get("matched_code", "X"), "similarity": meta["sim"]}]

        db = _FakeDB(conn, find_fn, existing=existing)
        mm = _FakeModelManager()

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
        gate_mod.keurmerk_probability = lambda emb: region_meta[
            (shared["current_src"], shared["current_x"])
        ]["kp"]
        mp.setitem(sys.modules, "app.services.keurmerk_gate", gate_mod)

        rp_mod = types.ModuleType("app.services.region_proposer")
        rp_mod.propose_regions = lambda img: (boxes_by_src[shared["current_src"]], {})
        mp.setitem(sys.modules, "app.services.region_proposer", rp_mod)

        st_mod = types.ModuleType("app.services.storage")
        st_mod.storage_service = storage
        mp.setitem(sys.modules, "app.services.storage", st_mod)

        def _crop_bgr(img, b):
            shared["current_x"] = b[0]
            return "crop"

        mp.setattr(module, "_crop_bgr", _crop_bgr)

        result = asyncio.run(module.run_batch())
        return types.SimpleNamespace(
            result=result, storage=storage, conn=conn, db=db, module=module
        )


@pytest.fixture()
def harness(monkeypatch):
    return _Harness(monkeypatch)


def _region(*, kp=None, sim=0.95, matched_code="X"):
    return {"kp": kp, "sim": sim, "matched_code": matched_code}


def _page(gtin, *regions):
    return {"gtin": gtin, "regions": list(regions)}


def _inserted_codes(conn):
    return [args[1] for _sql, args in conn.executes]


# =========================================================================== #
# AC1 — label = gedeclareerde code van het paar; pool strikt op die code.
# =========================================================================== #
def test_ac1_label_is_de_gedeclareerde_code_en_pool_is_per_code_gescoped(harness):
    h = harness.run(
        [_page("111", _region(sim=0.9))],
        {"AISE_1": ["111"]},
    )
    assert h.result["inserted"] == 1
    assert _inserted_codes(h.conn) == ["AISE_1"]
    # de similarity-zoektocht is op EXACT die ene code gescoped
    assert all(codes == ["AISE_1"] for codes, _thr in h.db.scoped_calls)


# =========================================================================== #
# AC2 — multi-code-GTIN: één kandidaat per gedeclareerde code, dedup per code.
# =========================================================================== #
def test_ac2_gtin_met_meerdere_gedeclareerde_codes_levert_per_code_een_kandidaat(harness):
    h = harness.run(
        [_page("222", _region(sim=0.9))],
        {"PREGNANCY_WARNING": ["222"], "DO_NOT_DRINK_AND_DRIVE_WARNING": ["222"]},
    )
    assert h.result["inserted"] == 2
    assert sorted(_inserted_codes(h.conn)) == [
        "DO_NOT_DRINK_AND_DRIVE_WARNING",
        "PREGNANCY_WARNING",
    ]


def test_ac2_dedup_is_per_code_gescoped_via_de_reason_marker(harness):
    """Een bestaand review-item van DEZE oogst voor code A op de pagina blokkeert
    NIET de kandidaat voor code B op dezelfde pagina."""
    module_probe = None
    existing = {("222", "declared-harvest:PREGNANCY_WARNING", "artwork/222/converted-0.png")}
    h = harness.run(
        [_page("222", _region(sim=0.9))],
        {"PREGNANCY_WARNING": ["222"], "DO_NOT_DRINK_AND_DRIVE_WARNING": ["222"]},
        existing=existing,
    )
    assert h.result["inserted"] == 1
    assert _inserted_codes(h.conn) == ["DO_NOT_DRINK_AND_DRIVE_WARNING"]
    assert h.result["skipped_duplicate"] == 1


# =========================================================================== #
# AC3 — geen fabricatie: floor + best-of-regio.
# =========================================================================== #
def test_ac3_geen_regio_boven_de_floor_dan_geen_kandidaat(harness):
    h = harness.run(
        [_page("333", _region(sim=0.3), _region(sim=0.4))],
        {"AISE_5": ["333"]},
        floor=0.6,
    )
    assert h.result["inserted"] == 0
    assert h.result["skipped_below_floor"] == 1
    assert h.conn.executes == []


def test_ac3_beste_regio_wint(harness):
    h = harness.run(
        [_page("333", _region(sim=0.7), _region(sim=0.95), _region(sim=0.8))],
        {"AISE_5": ["333"]},
        floor=0.6,
    )
    assert h.result["inserted"] == 1
    # de opgeslagen confidence is de hoogste similarity
    assert h.conn.executes[0][1][4] == pytest.approx(0.95)


# =========================================================================== #
# AC4 — cap, env-filter, dry-run, map-fail-safe.
# =========================================================================== #
def test_ac4_per_code_cap_begrenst_en_telt_apart(harness):
    h = harness.run(
        [_page(f"44{i}", _region(sim=0.9)) for i in range(3)],
        {"AISE_1": ["440", "441", "442"]},
        per_code_cap=2,
    )
    assert h.result["inserted"] == 2
    assert h.result["skipped_cap"] == 1


def test_ac4_env_code_filter_begrenst_de_scope(harness):
    h = harness.run(
        [_page("551", _region(sim=0.9)), _page("552", _region(sim=0.9))],
        {"AISE_1": ["551"], "AISE_2": ["552"]},
        codes="AISE_2",
    )
    assert _inserted_codes(h.conn) == ["AISE_2"]


def test_ac4_dry_run_meet_kandidaten_maar_muteert_niets(harness):
    h = harness.run(
        [_page("661", _region(sim=0.9))],
        {"AISE_1": ["661"]},
        dry_run=True,
    )
    assert h.result["dry_run"] is True
    assert h.result["candidates"] == 1
    assert h.result["inserted"] == 0
    assert h.conn.executes == []
    # geen crop-upload en geen state-write
    assert [k for k in h.storage.puts] == []


def test_ac4_misvormde_map_geeft_nul_kandidaten_geen_crash(harness):
    h = harness.run(
        [_page("771", _region(sim=0.9))],
        {},
        map_override=b"geen json {",
    )
    assert h.result["inserted"] == 0
    assert h.conn.executes == []
