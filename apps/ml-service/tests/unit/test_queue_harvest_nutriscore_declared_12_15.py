"""Story 12.15 — Declaratie-gedreven Nutri-Score-oogst (ATDD).

Dekt AC1-AC4 voor ``app.services.queue_harvest_nutriscore_declared``:

  * AC1 — het label komt uit de gedeclareerde-letter-map (NIET uit een
    kleur-gok): een gedetecteerd Nutri-Score-vakje wordt geregistreerd als
    ``NUTRISCORE_<gedeclareerde-letter>``, waarbij de letter uit de map komt
    (``build-nutriscore-declared-map.ts``-output), niet uit de vorm-match-
    ``matched_code`` (die alleen de POOL-scoping bewijst, letter-onafhankelijk,
    identiek aan 12.12).
  * AC2 — C/D-prioriteit: de default-scope is "C,D"; binnen een tijd-/batch-
    begrensde run komen C/D-GTINs vóór A/B/E-GTINs (als die laatste expliciet
    in scope zijn gebracht via ``NUTRISCORE_DECLARED_HARVEST_LETTERS``).
  * AC3 — geen fabricatie: een GTIN waarvan GEEN enkele regio de confidence-
    drempel haalt wordt volledig overgeslagen (geen crop geforceerd onder de
    gedeclareerde letter); bij MEERDERE matchende regio's wordt alleen de
    BESTE (hoogste similarity) als kandidaat gehouden (nooit meerdere
    review-items per GTIN uit dezelfde batch).
  * AC4 — idempotentie (geen dubbele refs per storage_path/GTIN via
    ``review_item_exists``), per-letter-cap (flood-guard), en DRY_RUN
    muteert niets maar meet wel de kandidaten (patroon 12.12).

Mock-patroon (patroon ``test_queue_harvest_nutriscore_12_12.py``): een verse
module-load met gestubde ``app.*``-pakketten + fake ``cv2``, ``run_batch``
async via ``asyncio.run``. Elke GTIN krijgt zijn eigen fake artwork-pagina;
``_crop_bgr``/de gate/de pool-match worden via een gedeeld "huidige bron"-
statusobject naar per-(src, box-x)-metadata gerouteerd, zodat zowel
single-GTIN-multi-regio-scenario's (AC3 best-of) als multi-GTIN-scenario's
(AC2 prioriteit, AC4 cap/idempotentie) met dezelfde harness getest kunnen
worden.
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
    os.path.join(
        _HERE, "..", "..", "app", "services", "queue_harvest_nutriscore_declared.py"
    )
)

STATE_KEY = "keurmerk-harvest/nutriscore-declared-state.json"
DECLARED_MAP_KEY = "flywheel-index/nutriscore-declared-map.json"
NUTRISCORE_CODES = [
    "NUTRISCORE_A",
    "NUTRISCORE_B",
    "NUTRISCORE_C",
    "NUTRISCORE_D",
    "NUTRISCORE_E",
]


# --------------------------------------------------------------------------- #
# Verse module-load met gestubde app-pakketten + fake cv2 (patroon 19.10/12.12).
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
        "app.services.queue_harvest_nutriscore_declared", _MODULE_PATH
    )
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(
        sys.modules, "app.services.queue_harvest_nutriscore_declared", module
    )
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
    """Records scoped pool-match calls + review_item_exists calls (AC1/AC4)."""

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

    async def review_item_exists(self, gtin, t3777_code, source_file):
        self.exists_calls.append((gtin, t3777_code, source_file))
        return (gtin, t3777_code, source_file) in self._existing


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
        gtins,
        *,
        floor=None,
        letters=None,
        per_code_cap=None,
        dry_run=False,
        existing=None,
        batch=None,
        max_seconds=None,
        declared_map_override=None,
    ):
        """Draai één declaratie-gedreven Nutri-Score-oogst-batch.

        gtins: lijst van dicts {gtin, letter, regions}. ``regions`` is een lijst
               van dicts {kp, sim, matched_code} — één regio-box per item op
               x=idx*10 binnen die GTIN's (fake) artwork-pagina.
        """
        mp = self.mp
        for var in (
            "NUTRISCORE_DECLARED_HARVEST_FLOOR",
            "NUTRISCORE_DECLARED_HARVEST_LETTERS",
            "NUTRISCORE_DECLARED_HARVEST_PER_CODE_CAP",
            "NUTRISCORE_DECLARED_HARVEST_DRY_RUN",
            "NUTRISCORE_DECLARED_HARVEST_BATCH",
            "NUTRISCORE_DECLARED_HARVEST_MAX_SECONDS",
        ):
            mp.delenv(var, raising=False)
        if floor is not None:
            mp.setenv("NUTRISCORE_DECLARED_HARVEST_FLOOR", str(floor))
        if letters is not None:
            mp.setenv("NUTRISCORE_DECLARED_HARVEST_LETTERS", letters)
        if per_code_cap is not None:
            mp.setenv("NUTRISCORE_DECLARED_HARVEST_PER_CODE_CAP", str(per_code_cap))
        if dry_run:
            mp.setenv("NUTRISCORE_DECLARED_HARVEST_DRY_RUN", "1")
        if batch is not None:
            mp.setenv("NUTRISCORE_DECLARED_HARVEST_BATCH", str(batch))
        if max_seconds is not None:
            mp.setenv("NUTRISCORE_DECLARED_HARVEST_MAX_SECONDS", str(max_seconds))

        module = _fresh_module(mp)

        declared_entries = {g["gtin"]: g["letter"] for g in gtins}
        if declared_map_override is not None:
            map_bytes = declared_map_override
        else:
            map_bytes = json.dumps({"entries": declared_entries}).encode("utf-8")

        shared = {"current_src": None}
        region_meta = {}
        store = {module.DECLARED_MAP_KEY: map_bytes}
        artwork_keys = []
        boxes_by_src = {}
        for g in gtins:
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
            return [
                {
                    "t3777_code": meta.get("matched_code", "NUTRISCORE_A"),
                    "similarity": meta["sim"],
                }
            ]

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


def _region(*, kp=None, sim=0.95, matched_code="NUTRISCORE_A"):
    return {"kp": kp, "sim": sim, "matched_code": matched_code}


def _gtin(gtin, letter, *regions):
    return {"gtin": gtin, "letter": letter, "regions": list(regions)}


# =========================================================================== #
# AC1 — het label komt uit de gedeclareerde-letter-map, NIET uit een kleur-gok.
# =========================================================================== #
def test_ac1_label_komt_uit_de_gedeclareerde_letter_niet_uit_matched_code(harness):
    """De vorm-match retourneert matched_code=NUTRISCORE_A (de dichtstbijzijnde
    pool-buur), maar de GTIN declareert C — het geregistreerde t3777_code MOET
    NUTRISCORE_C zijn (de gedeclareerde letter), nooit de match-code."""
    scenario = [_gtin("111", "C", _region(matched_code="NUTRISCORE_A", sim=0.9))]
    out = harness.run(scenario)
    assert out.result["inserted"] == 1
    assert out.result["per_code"] == {"NUTRISCORE_C": 1}
    codes_inserted = {args[1] for _, args in out.conn.executes}
    assert codes_inserted == {"NUTRISCORE_C"}


def test_ac1_pool_match_blijft_letter_onafhankelijk_ongewijzigd(harness):
    """De pool-scoping (welke codes de vorm-match doorzoekt) is ONGEWIJZIGD
    t.o.v. 12.12: exact de 5-letter-pool, nooit de volledige referentie-universe."""
    scenario = [_gtin("111", "D", _region())]
    out = harness.run(scenario)
    assert out.db.scoped_calls
    codes, threshold = out.db.scoped_calls[0]
    assert set(codes) == set(NUTRISCORE_CODES)
    assert threshold == pytest.approx(0.60)


def test_ac1_review_item_reason_marker_en_method(harness):
    scenario = [_gtin("111", "C", _region())]
    out = harness.run(scenario)
    sql, args = out.conn.executes[0]
    assert out.module.MARKER in args
    assert "12.15" in out.module.MARKER
    assert "embedding-declared" in args
    assert "'open'" in sql


def test_ac1_gate_voorfilter_blijft_ervoor(harness):
    scenario = [_gtin("111", "C", _region(kp=0.05))]
    out = harness.run(scenario)
    assert out.result["candidates"] == 0
    assert len(out.db.scoped_calls) == 0  # geweerde regio triggert nooit een pool-match-call


def test_ac1_declaratie_map_ontbreekt_of_corrupt_geeft_0_kandidaten_geen_crash(
    harness,
):
    """Fail-safe: geen crash. Een onleesbare map -> lege declared_map -> geen
    enkele GTIN valt binnen de letter-scope -> total_gtins=0 -> het vroege
    "complete"-pad (net als een leeg GTIN-universum), NOOIT een crash."""
    out = harness.run([_gtin("111", "C", _region())], declared_map_override=b"not-json")
    assert out.result["status"] == "complete"
    assert out.result["total_gtins"] == 0
    assert out.conn.executes == []


# =========================================================================== #
# AC2 — C/D-prioriteit: default-scope "C,D"; binnen begrenzing komen C/D vóór
# A/B/E als die laatste expliciet meegenomen zijn.
# =========================================================================== #
def test_ac2_default_scope_is_c_en_d(harness):
    """Zonder expliciete NUTRISCORE_DECLARED_HARVEST_LETTERS worden alleen C/D
    geoogst — A/B/E worden NIET meegenomen (story-scope, AC2)."""
    scenario = [
        _gtin("g_a", "A", _region()),
        _gtin("g_c", "C", _region()),
        _gtin("g_d", "D", _region()),
        _gtin("g_e", "E", _region()),
    ]
    out = harness.run(scenario)
    assert out.result["per_code"] == {"NUTRISCORE_C": 1, "NUTRISCORE_D": 1}


def test_ac2_letters_env_kan_verbreed_worden_naar_abe(harness):
    scenario = [
        _gtin("g_a", "A", _region()),
        _gtin("g_b", "B", _region()),
        _gtin("g_c", "C", _region()),
    ]
    out = harness.run(scenario, letters="A,B,C,D,E")
    assert out.result["per_code"] == {
        "NUTRISCORE_A": 1,
        "NUTRISCORE_B": 1,
        "NUTRISCORE_C": 1,
    }


def test_ac2_c_d_gtins_worden_eerst_verwerkt_binnen_batchbegrenzing(harness):
    """Met een batch-grootte van 1 (en scope A-E) wordt binnen die ene batch
    een C/D-GTIN verwerkt, ook als er alfabetisch eerdere A/B-GTINs zijn."""
    scenario = [
        _gtin("aaa", "A", _region()),
        _gtin("bbb", "B", _region()),
        _gtin("zzz", "C", _region()),
    ]
    out = harness.run(scenario, letters="A,B,C,D,E", batch=1)
    assert out.result["inserted"] == 1
    assert out.result["per_code"] == {"NUTRISCORE_C": 1}


# =========================================================================== #
# AC3 — geen fabricatie: onder de drempel -> GTIN overgeslagen; bij meerdere
# matchende regio's wordt alleen de BESTE gehouden.
# =========================================================================== #
def test_ac3_geen_enkele_regio_haalt_de_drempel_gtin_wordt_overgeslagen(harness):
    scenario = [_gtin("111", "C", _region(sim=0.30), _region(sim=0.40))]
    out = harness.run(scenario, floor=0.60)
    assert out.result["candidates"] == 0
    assert out.result["inserted"] == 0
    assert out.result["skipped_below_floor"] == 1
    assert out.conn.executes == []


def test_ac3_meerdere_matchende_regios_alleen_de_beste_wordt_kandidaat(harness):
    """Twee regio's op dezelfde GTIN halen allebei de drempel — er komt maar
    ÉÉN kandidaat door (de hoogste similarity), nooit twee review-items voor
    dezelfde GTIN uit één batch."""
    scenario = [_gtin("111", "D", _region(sim=0.62), _region(sim=0.91))]
    out = harness.run(scenario, floor=0.60)
    assert out.result["candidates"] == 1
    assert out.result["inserted"] == 1
    inserted_confidence = out.conn.executes[0][1][4]
    assert inserted_confidence == pytest.approx(0.91)


def test_ac3_kalibreerbare_floor_via_env(harness):
    scenario = [_gtin("below", "C", _region(sim=0.54)), _gtin("above", "D", _region(sim=0.56))]
    out = harness.run(scenario, floor=0.55)
    assert out.result["candidates"] == 1
    assert out.result["inserted"] == 1
    assert out.result["skipped_below_floor"] == 1


# =========================================================================== #
# AC4 — idempotentie, per-letter-cap, DRY_RUN.
# =========================================================================== #
def test_ac4_idempotentie_bestaand_review_item_wordt_overgeslagen(harness):
    src = "artwork/111/converted-0.png"
    scenario = [_gtin("111", "C", _region())]
    out = harness.run(scenario, existing={("111", "NUTRISCORE_C", src)})
    assert out.result["candidates"] == 0
    assert out.result["inserted"] == 0
    assert out.result["skipped_duplicate"] == 1
    assert out.conn.executes == []


def test_ac4_idempotentie_check_draait_ook_read_only_in_dry_run(harness):
    """De idempotentie-check is een READ (geen write) en telt dus ook mee in
    DRY_RUN, zodat de kandidatentelling de echte run al voorspelt (patroon
    12.12 test_ac5c_dry_run_meet_wel_de_kandidaten)."""
    src = "artwork/111/converted-0.png"
    scenario = [_gtin("111", "C", _region()), _gtin("222", "D", _region())]
    out = harness.run(
        scenario, existing={("111", "NUTRISCORE_C", src)}, dry_run=True
    )
    assert out.result["dry_run"] is True
    assert out.result["skipped_duplicate"] == 1
    assert out.result["candidates"] == 1
    assert out.result["inserted"] == 0


def test_ac4_per_bucket_cap_gehandhaafd(harness):
    scenario = [_gtin(f"g{i}", "C", _region()) for i in range(5)]
    out = harness.run(scenario, per_code_cap=2)
    assert out.result["per_code"] == {"NUTRISCORE_C": 2}
    assert out.result["candidates"] == 2


def test_ac4_cap_is_per_letter_niet_globaal(harness):
    scenario = [_gtin(f"c{i}", "C", _region()) for i in range(3)] + [
        _gtin(f"d{i}", "D", _region()) for i in range(3)
    ]
    out = harness.run(scenario, per_code_cap=2)
    assert out.result["per_code"] == {"NUTRISCORE_C": 2, "NUTRISCORE_D": 2}


def test_ac4_dry_run_muteert_niets(harness):
    scenario = [_gtin("111", "C", _region()), _gtin("222", "D", _region())]
    out = harness.run(scenario, dry_run=True)
    assert out.result["dry_run"] is True
    assert out.result["inserted"] == 0
    assert out.result["per_code"] == {"NUTRISCORE_C": 1, "NUTRISCORE_D": 1}
    assert out.conn.executes == []
    assert not [k for k in out.storage.puts if k.startswith("artwork-crops/")]
    assert STATE_KEY not in out.storage.store


def test_ac4_idempotent_batch_state_voorkomt_dubbel_verwerken_zelfde_run(harness):
    """De offset-state (patroon 19.10/12.12) voorkomt dat een VOLGENDE batch
    dezelfde GTINs herverwerkt — ``to_offset``/``remaining`` geeft de
    voortgang door."""
    scenario = [_gtin(f"c{i}", "C", _region()) for i in range(3)]
    out = harness.run(scenario, batch=3)
    assert out.result["to_offset"] == 3
    assert out.result["remaining"] == 0
    state = json.loads(out.storage.store[STATE_KEY].decode("utf-8"))
    assert state["next_offset"] == 3
