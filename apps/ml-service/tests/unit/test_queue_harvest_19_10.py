"""Story 19.10 — Harvest-koppeling + scope-begrenzing (ATDD, RED + GREEN).

Deze suite legt het BEOOGDE gedrag van ``queue_harvest.run_batch`` vast VÓÓR de
implementatie. Twee soorten tests, expliciet gemarkeerd:

  * ``# === RED ===`` — nieuw gedrag (AC1, AC3). Deze MOETEN falen tegen de
    huidige ``queue_harvest.py`` (die kent geen ``HARVEST_TOP_N`` /
    ``HARVEST_EXCLUDE_CODES`` en scoopt op "élke code met >=1 actieve ref").
    Ze borgen dat de latere implementatie de scope daadwerkelijk begrenst.
  * ``# === GREEN ===`` — preservatie/regressie-guard (AC2, AC4, AC5d). Deze
    SLAGEN tegen de huidige code én moeten dat blijven na de fix: het
    OPEN-review-pad, de gate/FLOOR/cap-kleppen en ``HARVEST_DRY_RUN`` mogen
    NIET stilzwijgend breken.

----------------------------------------------------------------------------
VASTGELEGDE INTERFACE (de RED-tests pinnen dit contract; de dev vult het in)
----------------------------------------------------------------------------
De klasse-selectie (`topn`) van ``run_batch`` wordt:

    topn = ( top_N_op_volume  ∪  sub_k_klassen )  −  exclude_codes
           , beperkt tot codes met >=1 actieve echte ref (classificeerbaar)

Concreet:

1. ``HARVEST_TOP_N`` (env, int) — aantal top-volume-keurmerken waarop de harvest
   scoopt. In deze tests gelezen NA het zetten van de env (de module wordt vers
   geladen per test, dus zowel een module-level als een call-time ``os.environ``-
   lezing van de nieuwe vars werkt — zie ``_fresh_queue_harvest``).

2. ``HARVEST_EXCLUDE_CODES`` (env, komma-gescheiden t3777-codes, whitespace-
   getrimd, hoofdlettergevoelig) — flood-guard voor de staart-klassen.
   Default (env leeg/afwezig): ``RECYCLABLE_GENERAL_CLAIM,TRIMAN``. Een
   uitgesloten code verschijnt NOOIT in de output — óók niet als hij top-volume
   is én óók niet als hij sub-k is (exclude wint van beide).

3. Volume-ranking-bron: een MinIO-JSON-index onder key
   ``flywheel-index/keurmerk-etiket-index.json``, geladen via
   ``storage_service.get_training_image(key)``, die een dict ``code -> volume``
   (int) levert. Gekozen boven een api-endpoint omdat de harvester in de
   ml-service leeft (geen Prisma) en al een MinIO-state-file (`state.json`) op
   exact dit patroon leest. Ontbreekt de index, dan mag de selectie NIET
   terugvallen op "élke actieve code" (dat zou AC1 tenietdoen).

4. Sub-k: klassen met < k=3 actieve echte refs (aligned met 19.9 ``min_refs=3``)
   worden altijd meegenomen (ze profiteren het meest van harvesting). De
   klasse-selectie-query levert per actieve code zijn actieve-ref-count als
   kolom ``n`` (bv. ``SELECT t3777_code, COUNT(*) AS n ... GROUP BY t3777_code``).

De harvest-MECHANIEK (regio -> embed -> gate -> nearest-ref@FLOOR 0,85 -> cap ->
INSERT OPEN artwork_review_item) blijft ongewijzigd — 19.10 raakt UITSLUITEND de
`topn`-bepaling + de flood-guard.

Mock-patroon: identiek aan ``test_bootstrap_search_service.py`` /
``test_ivfflat_probes_19_14.py`` — het bronbestand wordt geïsoleerd geladen met
gestubde ``app.*``-pakketten en een fake ``cv2``; de zware lazy-imports die
``run_batch`` binnenhaalt (model_manager, classification, database, keurmerk_gate,
region_proposer, storage) worden in ``sys.modules`` gestubd. ``run_batch`` is
async en wordt via ``asyncio.run`` gedraaid.
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
    os.path.join(_HERE, "..", "..", "app", "services", "queue_harvest.py")
)

# Contract-constanten (zie module-docstring, punt 3).
VOLUME_INDEX_KEY = "flywheel-index/keurmerk-etiket-index.json"
STATE_KEY = "keurmerk-harvest/state.json"
ARTWORK_KEY = "artwork/111/converted-0.png"


# --------------------------------------------------------------------------- #
# Verse module-load met gestubde app-pakketten + fake cv2.
# Vers per test zodat module-level env-reads (FLOOR/BATCH/CAP/DRY_RUN en de
# nieuwe HARVEST_TOP_N/HARVEST_EXCLUDE_CODES) de door de test gezette env pakken.
# --------------------------------------------------------------------------- #
def _fresh_queue_harvest(monkeypatch):
    for name in ("app", "app.core", "app.services", "app.ml"):
        mod = types.ModuleType(name)
        mod.__path__ = []  # markeer als package
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
        "app.services.queue_harvest", _MODULE_PATH
    )
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "app.services.queue_harvest", module)
    spec.loader.exec_module(module)
    return module


# --------------------------------------------------------------------------- #
# Fakes voor de lazy collaborators.
# --------------------------------------------------------------------------- #
class _FakeStorage:
    """MinIO-stand-in: dict-backed store + geregistreerde puts en list-prefix."""

    def __init__(self, store, artwork_keys):
        self.store = dict(store)  # key -> bytes
        self.artwork_keys = list(artwork_keys)
        self.puts = []  # keys die geschreven zijn (volgorde)

    def connect(self):
        pass

    def list_training_images(self, prefix=""):
        return [k for k in self.artwork_keys if k.startswith(prefix)]

    def get_training_image(self, key):
        if key in self.store:
            return self.store[key]
        raise FileNotFoundError(key)  # STATE_KEY afwezig -> default offset 0

    def put_training_image(self, key, data, content_type="image/png"):
        self.store[key] = data
        self.puts.append(key)
        return key


class _FakeConn:
    """asyncpg-conn-stand-in: fetch levert de code/refcount-rows, execute logt."""

    def __init__(self, rows):
        self._rows = rows
        self.fetches = []  # (sql, args)
        self.executes = []  # (sql, args)

    async def fetch(self, sql, *args):
        self.fetches.append((sql, args))
        return self._rows

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
    def __init__(self, conn, find_fn):
        self.pool = _FakePool(conn)
        self._find = find_fn

    async def connect(self):
        pass

    async def find_similar_references(self, embedding, limit, threshold):
        return self._find(threshold)


class _FakeModelManager:
    is_loaded = True

    def __init__(self, state):
        self._state = state

    async def load_models(self):  # pragma: no cover - is_loaded=True
        pass

    async def generate_embedding(self, pil_img):
        # ``pil_img`` is de crop-tag (via de identity-``_to_pil``); onthoud hem
        # zodat gate + find_similar de bijbehorende scenario-metadata vinden.
        self._state["pending"] = pil_img
        return [0.0]


# --------------------------------------------------------------------------- #
# Harness: zet env, laadt de module vers, wired de fakes en draait run_batch.
# --------------------------------------------------------------------------- #
class _Harness:
    def __init__(self, monkeypatch):
        self.mp = monkeypatch

    def run(
        self,
        scenario,
        code_rows,
        volume,
        *,
        top_n=None,
        exclude=None,
        dry_run=False,
        per_code_cap=None,
        floor=None,
    ):
        """Draai één harvest-batch.

        scenario : lijst van dicts {tag, code, kp, sim} — één regio-crop per item.
        code_rows: lijst van dicts {t3777_code, n} — de actieve-code/refcount-rijen.
        volume   : dict code -> volume (de MinIO-volume-index).
        """
        mp = self.mp
        # --- env (per test; monkeypatch reverts) --------------------------- #
        for var in ("HARVEST_TOP_N", "HARVEST_EXCLUDE_CODES", "HARVEST_DRY_RUN",
                    "HARVEST_PER_CODE_CAP", "HARVEST_FLOOR"):
            mp.delenv(var, raising=False)
        if top_n is not None:
            mp.setenv("HARVEST_TOP_N", str(top_n))
        if exclude is not None:
            mp.setenv("HARVEST_EXCLUDE_CODES", exclude)
        if dry_run:
            mp.setenv("HARVEST_DRY_RUN", "1")
        if per_code_cap is not None:
            mp.setenv("HARVEST_PER_CODE_CAP", str(per_code_cap))
        if floor is not None:
            mp.setenv("HARVEST_FLOOR", str(floor))

        module = _fresh_queue_harvest(mp)

        # --- scenario-maps ------------------------------------------------- #
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
            return [{"t3777_code": meta["code"], "similarity": meta["sim"]}]

        conn = _FakeConn([dict(r) for r in code_rows])
        storage = _FakeStorage(
            {
                VOLUME_INDEX_KEY: json.dumps(volume).encode("utf-8"),
                ARTWORK_KEY: b"img-bytes",  # de fake cv2.imdecode negeert de inhoud
            },
            [ARTWORK_KEY],
        )
        db = _FakeDB(conn, find_fn)
        mm = _FakeModelManager(state)

        # --- lazy-import stubs -------------------------------------------- #
        mm_mod = types.ModuleType("app.ml.model_manager")
        mm_mod.model_manager = mm
        mp.setitem(sys.modules, "app.ml.model_manager", mm_mod)

        cls_mod = types.ModuleType("app.services.classification")
        cls_mod._to_pil = lambda crop: crop  # identity: crop IS de tag
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

        # crops zijn stringtags; _crop_bgr mapt box -> tag (nooit None).
        mp.setattr(module, "_crop_bgr", lambda img, b: tag_by_x[b[0]])

        result = asyncio.run(module.run_batch())
        return types.SimpleNamespace(
            result=result,
            storage=storage,
            conn=conn,
            module=module,
        )


@pytest.fixture()
def harness(monkeypatch):
    return _Harness(monkeypatch)


# Scenario-helper: één regio-crop dat door gate + FLOOR komt en op ``code`` matcht.
def _crop(tag, code, *, kp=None, sim=0.95):
    return {"tag": tag, "code": code, "kp": kp, "sim": sim}


# =========================================================================== #
# === RED === AC1: top-N volume-scoping + sub-k-prioritering.
# Faalt tegen de huidige code (topn = élke actieve code).
# =========================================================================== #
def test_ac1_scoopt_op_top_n_en_neemt_sub_k_mee_RED(harness):
    """AC1 (RED): met HARVEST_TOP_N=2 scoopt de selectie op de 2 hoogste
    volume-codes (A,B) PLUS de sub-k-klasse E (<3 actieve refs) — de codes C,D
    (rang 3/4, >=k refs) vallen buiten scope. De huidige code neemt élke actieve
    code mee en levert dus óók C,D → deze test faalt daartegen (RED)."""
    code_rows = [
        {"t3777_code": "A", "n": 5},
        {"t3777_code": "B", "n": 5},
        {"t3777_code": "C", "n": 5},
        {"t3777_code": "D", "n": 5},
        {"t3777_code": "E", "n": 1},  # sub-k (< 3)
    ]
    volume = {"A": 100, "B": 90, "C": 80, "D": 70, "E": 5}
    scenario = [
        _crop("tA", "A"), _crop("tB", "B"), _crop("tC", "C"),
        _crop("tD", "D"), _crop("tE", "E"),
    ]
    out = harness.run(scenario, code_rows, volume, top_n=2)
    per_code = out.result["per_code"]
    assert set(per_code) == {"A", "B", "E"}
    assert "C" not in per_code and "D" not in per_code


def test_ac1_top_n_nul_houdt_alleen_sub_k_over_RED(harness):
    """AC1 (RED, edge 'lege top-N'): met HARVEST_TOP_N=0 blijft er géén
    volume-scope over, maar de sub-k-klasse (E, <3 refs) wordt nog steeds
    meegenomen — bewijst dat sub-k-inclusie los staat van de top-N-grens én dat
    top-N de selectie écht begrenst. Huidige code levert alle 5 codes → RED."""
    code_rows = [
        {"t3777_code": "A", "n": 5},
        {"t3777_code": "B", "n": 5},
        {"t3777_code": "E", "n": 1},  # sub-k
    ]
    volume = {"A": 100, "B": 90, "E": 5}
    scenario = [_crop("tA", "A"), _crop("tB", "B"), _crop("tE", "E")]
    out = harness.run(scenario, code_rows, volume, top_n=0)
    assert set(out.result["per_code"]) == {"E"}


# =========================================================================== #
# === RED === AC3: RECYCLABLE/TRIMAN flood-guard via HARVEST_EXCLUDE_CODES.
# Faalt tegen de huidige code (kent geen exclusielijst).
# =========================================================================== #
def test_ac3_expliciete_exclude_weert_top_volume_en_sub_k_RED(harness):
    """AC3 (RED): expliciete HARVEST_EXCLUDE_CODES weert RECYCLABLE_GENERAL_CLAIM
    (top-volume, >=k refs) ÉN TRIMAN (sub-k) — exclude wint van zowel de top-N-
    als de sub-k-inclusie. Alleen FSC blijft over. De huidige code kent geen
    exclude en levert alle drie → RED. Dekt meteen de edge 'code in top-N én
    exclude' en 'code sub-k én exclude'."""
    code_rows = [
        {"t3777_code": "RECYCLABLE_GENERAL_CLAIM", "n": 26},  # >=k, top-volume
        {"t3777_code": "TRIMAN", "n": 1},                     # sub-k
        {"t3777_code": "FSC_MIX", "n": 5},
    ]
    volume = {"RECYCLABLE_GENERAL_CLAIM": 1000, "FSC_MIX": 100, "TRIMAN": 5}
    scenario = [
        _crop("tR", "RECYCLABLE_GENERAL_CLAIM"),
        _crop("tT", "TRIMAN"),
        _crop("tF", "FSC_MIX"),
    ]
    out = harness.run(
        scenario, code_rows, volume,
        top_n=5, exclude="RECYCLABLE_GENERAL_CLAIM,TRIMAN",
    )
    per_code = out.result["per_code"]
    assert "RECYCLABLE_GENERAL_CLAIM" not in per_code
    assert "TRIMAN" not in per_code
    assert set(per_code) == {"FSC_MIX"}


def test_ac3_default_exclude_weert_recyclable_RED(harness):
    """AC3 (RED): zónder env valt de default-exclusielijst terug op
    RECYCLABLE_GENERAL_CLAIM,TRIMAN — RECYCLABLE verschijnt dus ook standaard
    niet, FSC wel. Huidige code (geen default-exclude) levert RECYCLABLE → RED."""
    code_rows = [
        {"t3777_code": "RECYCLABLE_GENERAL_CLAIM", "n": 26},
        {"t3777_code": "FSC_MIX", "n": 5},
    ]
    volume = {"RECYCLABLE_GENERAL_CLAIM": 1000, "FSC_MIX": 100}
    scenario = [
        _crop("tR", "RECYCLABLE_GENERAL_CLAIM"),
        _crop("tF", "FSC_MIX"),
    ]
    out = harness.run(scenario, code_rows, volume, top_n=5)  # exclude=default
    per_code = out.result["per_code"]
    assert "RECYCLABLE_GENERAL_CLAIM" not in per_code
    assert "FSC_MIX" in per_code


# =========================================================================== #
# === GREEN === AC2: geharveste crop -> OPEN artwork_review_item (19.8-pad).
# Slaagt tegen de huidige code; mag na de fix niet breken.
# =========================================================================== #
def test_ac2_crop_landt_als_open_review_item_geen_auto_promotie_GREEN(harness):
    """AC2 (GREEN): elke geharveste kandidaat wordt als OPEN artwork_review_item
    weggeschreven (status 'open', method 'embedding', reason = MARKER) — nooit
    als auto-gepromote referentie. Codes zijn sub-k zodat ze in élke selectie-
    strategie (huidig én nieuw) meegenomen worden."""
    code_rows = [{"t3777_code": "FSC_MIX", "n": 1}]  # sub-k -> altijd in scope
    volume = {"FSC_MIX": 100}
    scenario = [_crop("t1", "FSC_MIX"), _crop("t2", "FSC_MIX")]
    out = harness.run(scenario, code_rows, volume, top_n=5)

    assert out.result["inserted"] == 2
    assert out.result["per_code"] == {"FSC_MIX": 2}

    inserts = out.conn.executes
    assert len(inserts) == 2
    for sql, args in inserts:
        assert "artwork_review_items" in sql
        assert "'open'" in sql                       # OPEN-status is hard-coded
        assert "reference_logos" not in sql          # geen auto-promotie
        assert "embedding" in args                    # method
        assert out.module.MARKER in args              # reason-marker (19.8/12.6)

    # Crops geüpload + resume-state weggeschreven (append-semantiek).
    crop_keys = [k for k in out.storage.puts if k.startswith("artwork-crops/")]
    assert len(crop_keys) == 2
    assert STATE_KEY in out.storage.store
    written_state = json.loads(out.storage.store[STATE_KEY].decode("utf-8"))
    assert written_state["next_offset"] == 1  # 1 GTIN verwerkt


# =========================================================================== #
# === GREEN === AC4: vangnet/kleppen ongemoeid (gate, FLOOR, per-code-cap).
# =========================================================================== #
def test_ac4a_gate_weert_crop_onder_gate_threshold_GREEN(harness):
    """AC4 (GREEN): een crop met keurmerk_probability < GATE_THRESHOLD (0,5) wordt
    vóór de nearest-ref-stap geweerd; een crop die de gate haalt komt door."""
    code_rows = [
        {"t3777_code": "GATED", "n": 1},
        {"t3777_code": "PASS", "n": 1},
    ]
    volume = {"GATED": 100, "PASS": 100}
    scenario = [
        _crop("tg", "GATED", kp=0.05),   # onder de gate -> geweerd
        _crop("tp", "PASS", kp=None),    # gate laat door
    ]
    out = harness.run(scenario, code_rows, volume, top_n=5)
    per_code = out.result["per_code"]
    assert "GATED" not in per_code
    assert per_code == {"PASS": 1}


def test_ac4b_floor_weert_crop_onder_085_GREEN(harness):
    """AC4 (GREEN): de nearest-ref-FLOOR staat op 0,85. Een crop met similarity
    net ONDER 0,85 levert geen match (find_similar_references met threshold=FLOOR
    -> leeg) en wordt geskipt; net BOVEN 0,85 komt hij door. De 0,84/0,86-grens
    pint de FLOOR op ~0,85 (i.p.v. 'een willekeurige drempel tussen 0,5 en 0,95')
    zodat een stille FLOOR-verlaging deze test rood maakt."""
    code_rows = [
        {"t3777_code": "LOW", "n": 1},
        {"t3777_code": "HIGH", "n": 1},
    ]
    volume = {"LOW": 100, "HIGH": 100}
    scenario = [
        _crop("tl", "LOW", sim=0.84),    # net onder FLOOR 0,85 -> geen match
        _crop("th", "HIGH", sim=0.86),   # net boven FLOOR 0,85 -> match
    ]
    out = harness.run(scenario, code_rows, volume, top_n=5)
    per_code = out.result["per_code"]
    assert "LOW" not in per_code
    assert per_code == {"HIGH": 1}


def test_ac4c_per_code_cap_gehandhaafd_GREEN(harness):
    """AC4 (GREEN): de per-code-cap begrenst het aantal kandidaten per code per
    run — 5 matchende crops op één code met cap=2 leveren precies 2 kandidaten."""
    code_rows = [{"t3777_code": "CAP", "n": 1}]
    volume = {"CAP": 100}
    scenario = [_crop(f"c{i}", "CAP") for i in range(5)]
    out = harness.run(scenario, code_rows, volume, top_n=5, per_code_cap=2)
    assert out.result["per_code"] == {"CAP": 2}
    assert out.result["candidates"] == 2


# =========================================================================== #
# === GREEN === AC5d: HARVEST_DRY_RUN muteert niets.
# =========================================================================== #
def test_ac5d_dry_run_muteert_niets_GREEN(harness):
    """AC5d (GREEN): met HARVEST_DRY_RUN=1 wordt normaal geharvest/geclassificeerd,
    maar géén crop geüpload, géén review-item geïnsert en géén resume-state
    geschreven — read-only vertrekpunt."""
    code_rows = [{"t3777_code": "FSC_MIX", "n": 1}]
    volume = {"FSC_MIX": 100}
    scenario = [_crop("t1", "FSC_MIX"), _crop("t2", "FSC_MIX")]
    out = harness.run(scenario, code_rows, volume, top_n=5, dry_run=True)

    assert out.result["dry_run"] is True
    assert out.result["inserted"] == 0
    # Kandidaten worden wél berekend (dat is de read-only meting), maar niets
    # wordt gemuteerd.
    assert out.result["per_code"] == {"FSC_MIX": 2}
    assert out.conn.executes == []  # geen INSERTs
    assert not [k for k in out.storage.puts if k.startswith("artwork-crops/")]
    assert STATE_KEY not in out.storage.store  # geen state-write
