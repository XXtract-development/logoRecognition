"""Story 20.20 — de declaratie-oogst weer aan de gang, en goedkoop houden (ATDD).

De 20.2-suite bewaakt floor/dedup/cap/cross-code/keyline; de 20.11-suite het
geheugen. Deze suite dekt uitsluitend wat 20.20 toevoegt aan de oogst zelf:

  * AC4 — de oogst ONTHOUDT wat hij nakeek, met onderscheid blijvend/voorlopig,
    de vingerafdruk van de referentiepool voor het voorlopige deel, het in bulk
    ophalen van die vastlegging, en het wegfilteren van een hele paginagroep
    VOOR de dure analyse (decoderen + `propose_regions`).
  * AC5 — de vastlegging is een eigen tabel; is die er niet of is hij onleesbaar,
    dan STOPT de run met een melding in plaats van 8,5 uur stil opnieuw te
    beginnen. En: de teller gaat terug zodra de parenlijst in de KAART verandert.
  * AC8 — een tweede oogst wordt geweigerd zolang er één loopt; een run die het
    slot niet krijgt stopt met een melding en wacht niet.

AC7 (de vastgelegde aandrijving) staat in de api-suite: die draait vanuit de
repository en kan `_bmad-output/` lezen, terwijl deze suite in een container
draait waarin alleen `app/` en `tests/` gekoppeld zijn.

AC9 (geen regressie op `_cross_code_rejected` / `_is_keyline`) wordt bewust NIET
hier herhaald: die twee blijven bij naam bewaakt door de 20.7/20.9-toetsen in de
20.2-suite. Dubbel toetsen zou de bewaking verplaatsen in plaats van versterken.

Mock-patroon: identiek aan test_queue_harvest_declared_20_2.py (verse module-load
met gestubde app-pakketten + fake cv2).
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


# ---------------------------------------------------------------------------
# Dubbels
# ---------------------------------------------------------------------------


class _FakeStorage:
    def __init__(self, store, artwork_keys, shared):
        self.store = dict(store)
        self.artwork_keys = list(artwork_keys)
        self.puts = []
        self.gets = []
        self.shared = shared

    def connect(self):
        pass

    def list_training_images(self, prefix=""):
        return [k for k in self.artwork_keys if k.startswith(prefix)]

    def get_training_image(self, key):
        self.gets.append(key)
        if key.startswith("artwork/"):
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
    """Databasedubbel mét de 20.20-vastlegging.

    `checks_raise` laat de bulk-ophaal falen — dat is het "tabel ontbreekt of is
    onleesbaar"-geval uit AC5.
    """

    def __init__(
        self,
        conn,
        find_fn,
        *,
        existing=None,
        open_fn=None,
        checks=None,
        fingerprints=None,
        checks_raise=False,
    ):
        self.pool = _FakePool(conn)
        self._find = find_fn
        self._open_fn = open_fn
        self._existing = set(existing or [])
        self._checks = dict(checks or {})
        self._fingerprints = dict(fingerprints or {})
        self._checks_raise = checks_raise
        self.exists_calls = []
        self.fetch_checks_calls = []
        self.fingerprint_calls = []
        self.recorded = []

    async def connect(self):
        pass

    async def find_similar_references_by_codes(
        self, embedding, t3777_codes, limit, threshold
    ):
        return self._find(threshold)

    async def find_similar_references(self, embedding, limit=5, threshold=0.75):
        return list(self._open_fn(embedding)) if self._open_fn else []

    async def review_item_exists(self, gtin, reason, source_file):
        self.exists_calls.append((gtin, reason, source_file))
        return (gtin, reason, source_file) in self._existing

    # --- 20.20 -------------------------------------------------------------

    async def fetch_declared_harvest_checks(self, pairs):
        if self._checks_raise:
            raise RuntimeError('relation "declared_harvest_checks" does not exist')
        self.fetch_checks_calls.append(list(pairs))
        keys = set(tuple(p) for p in pairs)
        return {k: v for k, v in self._checks.items() if k in keys}

    async def reference_pool_fingerprints(self, codes):
        if self._checks_raise:
            raise RuntimeError('relation "reference_logos" is niet leesbaar')
        self.fingerprint_calls.append(sorted(codes))
        return {c: self._fingerprints.get(c, "0|") for c in codes}

    async def record_declared_harvest_checks(self, rows):
        self.recorded.extend([tuple(r) for r in rows])
        return len(rows)


class _FakeModelManager:
    is_loaded = True

    def __init__(self, shared):
        self.shared = shared

    async def load_models(self):  # pragma: no cover
        pass

    async def generate_embedding(self, pil_img):
        return [float(self.shared.get("current_x", 0))]


class _Harness:
    def __init__(self, monkeypatch):
        self.mp = monkeypatch

    def run(
        self,
        pages,
        codes_map,
        *,
        floor=None,
        per_code_cap=None,
        dry_run=False,
        existing=None,
        checks=None,
        fingerprints=None,
        checks_raise=False,
        state=None,
        lock_max_age=None,
        max_seconds=None,
    ):
        mp = self.mp
        for var in (
            "DECLARED_HARVEST_FLOOR",
            "DECLARED_HARVEST_CODES",
            "DECLARED_HARVEST_PER_CODE_CAP",
            "DECLARED_HARVEST_DRY_RUN",
            "DECLARED_HARVEST_BATCH",
            "DECLARED_HARVEST_MAX_SECONDS",
            "DECLARED_HARVEST_KEYLINE_MAX_BPP",
            "DECLARED_HARVEST_LOCK_MAX_AGE_SECONDS",
        ):
            mp.delenv(var, raising=False)
        if floor is not None:
            mp.setenv("DECLARED_HARVEST_FLOOR", str(floor))
        if per_code_cap is not None:
            mp.setenv("DECLARED_HARVEST_PER_CODE_CAP", str(per_code_cap))
        if dry_run:
            mp.setenv("DECLARED_HARVEST_DRY_RUN", "1")
        if lock_max_age is not None:
            mp.setenv("DECLARED_HARVEST_LOCK_MAX_AGE_SECONDS", str(lock_max_age))
        if max_seconds is not None:
            mp.setenv("DECLARED_HARVEST_MAX_SECONDS", str(max_seconds))

        module = _fresh_module(mp)

        shared = {"current_src": None}
        region_meta = {}
        store = {
            module.DECLARED_MAP_KEY: json.dumps({"codes": codes_map}).encode("utf-8")
        }
        if state is not None:
            store[module.STATE_KEY] = json.dumps(state).encode("utf-8")
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
            return [
                {"t3777_code": meta.get("matched_code", "X"), "similarity": meta["sim"]}
            ]

        def open_fn(embedding):
            x = int(round(float(embedding[0])))
            meta = region_meta.get((shared["current_src"], x))
            return meta.get("open_matches", []) if meta else []

        db = _FakeDB(
            conn,
            find_fn,
            existing=existing,
            open_fn=open_fn,
            checks=checks,
            fingerprints=fingerprints,
            checks_raise=checks_raise,
        )
        mm = _FakeModelManager(shared)

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

        propose_calls = []

        def _propose(img):
            propose_calls.append(shared["current_src"])
            return boxes_by_src[shared["current_src"]], {}

        rp_mod = types.ModuleType("app.services.region_proposer")
        rp_mod.propose_regions = _propose
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
            result=result,
            storage=storage,
            conn=conn,
            db=db,
            module=module,
            propose_calls=propose_calls,
        )


@pytest.fixture()
def harness(monkeypatch):
    return _Harness(monkeypatch)


@pytest.fixture()
def module(monkeypatch):
    return _fresh_module(monkeypatch)


def _region(*, kp=None, sim=0.95, matched_code="X", open_matches=None):
    return {
        "kp": kp,
        "sim": sim,
        "matched_code": matched_code,
        "open_matches": open_matches or [],
    }


def _page(gtin, *regions):
    return {"gtin": gtin, "regions": list(regions)}


def _src(gtin):
    return f"artwork/{gtin}/converted-0.png"


# ===========================================================================
# AC4 — blijvend, voorlopig, nooit
# ===========================================================================


def test_ac4_uitkomsten_zijn_blijvend_voorlopig_of_nergens(module):
    """De drie soorten uitkomst uit de spec-tabel, en ze verschillen echt.

    Kandidaat en keyline zijn eigenschappen die niet meer veranderen; onder de
    drempel en cross-code zijn oordelen tegen de referentiepool van dát moment.
    """
    assert module._is_permanent(module.OUTCOME_CANDIDATE) is True
    assert module._is_permanent(module.OUTCOME_KEYLINE) is True
    assert module._is_permanent(module.OUTCOME_BELOW_FLOOR) is False
    assert module._is_permanent(module.OUTCOME_CROSS_CODE) is False


def test_ac4_cap_is_geen_uitkomst_die_vastgelegd_wordt(module):
    """"Cap bereikt" is een runbudget, geen oordeel — het mag nergens in staan."""
    alle = module.PERMANENT_OUTCOMES | module.PROVISIONAL_OUTCOMES
    assert not any("cap" in o for o in alle)


def test_ac4_voorlopig_oordeel_vervalt_zodra_de_referentiepool_verandert(module):
    """De vingerafdruk is de hele reden dat 'voorlopig' bestaat.

    Gelijk => het oordeel telt nog. Anders => opnieuw bekijken, want een menselijk
    akkoord kan er intussen een referentie bij gezet hebben.
    """
    voorlopig = {
        "outcome": module.OUTCOME_BELOW_FLOOR,
        "permanent": False,
        "fingerprint": "3|2026-08-01T00:00:00Z",
    }
    assert module._already_checked(voorlopig, "3|2026-08-01T00:00:00Z") is True
    assert module._already_checked(voorlopig, "4|2026-08-19T00:00:00Z") is False
    # Geen vastlegging => nooit overslaan.
    assert module._already_checked(None, "3|2026-08-01T00:00:00Z") is False


def test_ac4_blijvend_oordeel_overleeft_een_veranderde_referentiepool(module):
    """Een aangemaakte kandidaat staat al in de wachtrij — opnieuw is een duplicaat."""
    blijvend = {
        "outcome": module.OUTCOME_CANDIDATE,
        "permanent": True,
        "fingerprint": None,
    }
    assert module._already_checked(blijvend, "99|2026-12-31T00:00:00Z") is True


def test_ac4_hele_paginagroep_wordt_overgeslagen_voor_de_dure_analyse(harness):
    """De kern van de 8,5 uur: de pagina wordt PER GROEP geladen en gelokaliseerd.

    Zijn alle paren van een pagina al nagekeken, dan mag die pagina niet eens
    gedecodeerd worden. `propose_regions` en de artwork-download bewijzen dat.
    """
    codes_map = {"A": ["111"], "B": ["111"], "C": ["222"]}
    checks = {
        ("A", "111", _src("111")): {
            "outcome": "candidate",
            "permanent": True,
            "fingerprint": None,
        },
        ("B", "111", _src("111")): {
            "outcome": "below_floor",
            "permanent": False,
            "fingerprint": "2|2026-08-01T00:00:00Z",
        },
    }
    out = harness.run(
        [_page("111", _region()), _page("222", _region())],
        codes_map,
        checks=checks,
        fingerprints={"B": "2|2026-08-01T00:00:00Z"},
    )

    assert _src("111") not in out.propose_calls, "de al-nagekeken pagina is tóch geladen"
    assert _src("111") not in out.storage.gets, "de al-nagekeken pagina is tóch gedownload"
    assert _src("222") in out.propose_calls
    assert out.result["skipped_already_checked"] == 2


def test_ac4_al_nagekeken_groepen_blokkeren_de_teller_niet_bij_een_tijdbox(harness):
    """Waarom de HELE groep weg moet en niet alleen elk paar erin.

    De tijdbox breekt de paginalus af VOORDAT een groep aan de beurt komt. Blijft
    een volledig-nagekeken groep dan in de lijst staan, dan zijn zijn paren niet
    afgehandeld, schuift de offset niet op, en doet de volgende run exact
    hetzelfde werk opnieuw — de livelock die story 20.11 met `page_order`
    wegnam, langs de achterdeur terug.
    """
    codes_map = {"A": ["111"], "B": ["222"]}
    checks = {
        ("A", "111", _src("111")): {
            "outcome": "candidate",
            "permanent": True,
            "fingerprint": None,
        }
    }
    out = harness.run(
        [_page("111", _region()), _page("222", _region())],
        codes_map,
        checks=checks,
        max_seconds=0,  # de tijdbox is al verstreken bij de eerste pagina
    )

    assert out.result["status"] == "timebox"
    assert out.propose_calls == []
    assert out.result["to_offset"] == 1, (
        "de al-nagekeken groep hield de teller vast — volgende run doet hetzelfde werk"
    )


def test_ac4_een_groep_met_een_onbekeken_paar_wordt_wel_geladen(harness):
    """Overslaan mag alleen als ELK paar van de groep al is nagekeken."""
    codes_map = {"A": ["111"], "B": ["111"]}
    checks = {
        ("A", "111", _src("111")): {
            "outcome": "candidate",
            "permanent": True,
            "fingerprint": None,
        }
    }
    out = harness.run([_page("111", _region())], codes_map, checks=checks)

    assert _src("111") in out.propose_calls
    assert out.result["skipped_already_checked"] == 1
    assert out.result["candidates"] == 1  # het paar (B, 111) is wél geoogst


def test_ac4_vastlegging_wordt_in_bulk_opgehaald_niet_per_paar(harness):
    """Anders vervangt de story dure beeldanalyse door duizenden losse opzoekingen."""
    codes_map = {"A": ["111", "222", "333"], "B": ["111", "222", "333"]}
    out = harness.run(
        [_page(g, _region()) for g in ("111", "222", "333")],
        codes_map,
    )
    assert len(out.db.fetch_checks_calls) == 1
    assert len(out.db.fetch_checks_calls[0]) == 6
    assert len(out.db.fingerprint_calls) == 1


def test_ac4_uitkomsten_worden_vastgelegd_met_de_juiste_soort(harness):
    """Elke nagekeken uitkomst landt in de vastlegging, met de juiste houdbaarheid."""
    codes_map = {"A": ["111"], "B": ["222"], "C": ["333"]}
    out = harness.run(
        [
            _page("111", _region(sim=0.95)),  # kandidaat
            _page("222", _region(sim=0.10)),  # onder de drempel
            _page(
                "333",
                _region(sim=0.70, open_matches=[{"t3777_code": "Z", "similarity": 0.95}]),
            ),  # cross-code
        ],
        codes_map,
        fingerprints={
            "A": "1|2026-08-01T00:00:00Z",
            "B": "2|2026-08-01T00:00:00Z",
            "C": "3|2026-08-01T00:00:00Z",
        },
    )
    door_paar = {(c, g, s): (o, p, f) for c, g, s, o, p, f in out.db.recorded}

    assert door_paar[("A", "111", _src("111"))] == ("candidate", True, None)
    assert door_paar[("B", "222", _src("222"))] == (
        "below_floor",
        False,
        "2|2026-08-01T00:00:00Z",
    )
    assert door_paar[("C", "333", _src("333"))] == (
        "cross_code",
        False,
        "3|2026-08-01T00:00:00Z",
    )


def test_ac4_cap_bereikt_wordt_nergens_vastgelegd(harness):
    """Vastleggen zou het paar voorgoed uitsluiten omdat er die nacht toevallig
    genoeg andere waren."""
    codes_map = {"A": ["111", "222"]}
    out = harness.run(
        [_page("111", _region()), _page("222", _region())],
        codes_map,
        per_code_cap=1,
    )
    assert out.result["skipped_cap"] == 1
    vastgelegde_gtins = {g for _c, g, _s, _o, _p, _f in out.db.recorded}
    assert vastgelegde_gtins == {"111"}, "het cap-paar is tóch vastgelegd"


def test_ac4_een_bestaand_review_item_telt_als_blijvend_nagekeken(harness):
    """`review_item_exists` blijft staan (statusblind, ook afgewezen items), maar
    de uitkomst wordt nu ook vastgelegd — anders wordt de pagina elke ronde
    opnieuw geladen voor een paar dat allang een item heeft."""
    codes_map = {"A": ["111"]}
    out = harness.run(
        [_page("111", _region())],
        codes_map,
        existing={("111", "declared-harvest:A", _src("111"))},
    )
    assert out.result["skipped_duplicate"] == 1
    assert out.db.recorded == [("A", "111", _src("111"), "candidate", True, None)]


def test_ac4_droogloop_legt_niets_vast(harness):
    """Een droogloop mag de vastlegging niet muteren — anders voorspelt hij de
    echte run niet meer maar verandert hij hem."""
    codes_map = {"A": ["111"]}
    out = harness.run([_page("111", _region())], codes_map, dry_run=True)
    assert out.result["candidates"] == 1
    assert out.db.recorded == []


# ===========================================================================
# AC5 — eigen tabel, stoppen bij ontbreken, en de teller
# ===========================================================================


def test_ac5_run_stopt_als_de_vastlegging_niet_leesbaar_is(harness):
    """Fail-safe terugvallen op 'niets onthouden' is precies het dure geval, en
    dan onzichtbaar. Dus: stoppen met een melding, geen werk doen."""
    codes_map = {"A": ["111"]}
    out = harness.run([_page("111", _region())], codes_map, checks_raise=True)

    assert out.result["status"] == "checks_unavailable"
    assert out.propose_calls == []
    assert out.conn.executes == []
    assert out.result["candidates"] == 0


def test_ac5_teller_gaat_terug_zodra_de_parenlijst_in_de_kaart_verandert(module):
    """Vastgesteld op de paren in de KAART, niet op de door artwork gefilterde
    paren: die tweede hangt af van wat er die nacht in de opslag staat."""
    assert module._counter_reset_needed({"map_pairs": 1521}, 1349) is True
    assert module._counter_reset_needed({"map_pairs": 1349}, 1349) is False
    # Nog nooit vastgelegd: niet uit zichzelf terugzetten (dat is een
    # permission-gated handeling uit deel B).
    assert module._counter_reset_needed({}, 1349) is False


def test_ac5_teller_gaat_daadwerkelijk_terug_bij_een_gewijzigde_kaart(harness):
    """De offset mag niet blijven staan als hij naar een andere parenlijst wijst."""
    codes_map = {"A": ["111"]}
    out = harness.run(
        [_page("111", _region())],
        codes_map,
        state={"next_offset": 900, "map_pairs": 1521},
    )
    assert out.result["from_offset"] == 0
    assert out.result["candidates"] == 1


def test_ac5_de_ml_service_schrijft_het_voortgangsbestand(module):
    """Eigenaarschap vastgelegd: de oogst schrijft de teller, de bouwer niet."""
    assert module.STATE_KEY == "keurmerk-harvest/declared-harvest-state.json"
    assert "ml-service" in module.STATE_OWNER


# ===========================================================================
# AC8 — twee oogsters lopen elkaar niet in de weg
# ===========================================================================


def test_ac8_tweede_oogst_wordt_geweigerd_zolang_er_een_loopt(harness):
    """Ze delen 8 GiB in dezelfde container; een tweede start is een OOM-recept."""
    codes_map = {"A": ["111"]}
    out = harness.run(
        [_page("111", _region())],
        codes_map,
        state={
            "next_offset": 0,
            "in_progress": True,
            "run_started_at": __import__("time").strftime(
                "%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()
            ),
        },
    )
    assert out.result["status"] == "locked"
    assert out.propose_calls == [], "de geweigerde run deed tóch werk"
    assert out.conn.executes == []


def test_ac8_een_geweigerde_run_wacht_niet(module):
    """Het slot is een weigering, geen wachtrij — de melding is het eindpunt."""
    now = 1_000_000.0
    vers = {"in_progress": True, "run_started_at": "2026-08-19T12:00:00Z"}
    # Vers genoeg => vast; ruim over de maximale leeftijd => een achtergebleven
    # marker van een hard afgebroken run, die mag niet eeuwig blokkeren.
    assert module._lock_held(vers, now, max_age=0.0) is True
    assert module._lock_held({"next_offset": 3}, now, max_age=3600.0) is False


def test_ac8_achtergebleven_marker_van_een_gesneuvelde_run_blokkeert_niet_eeuwig(module):
    """SIGKILL kent geen handler; zonder verval zou één OOM de oogst voorgoed stoppen."""
    import calendar
    import time

    gestart = "2026-08-19T00:00:00Z"
    epoch = calendar.timegm(time.strptime(gestart, "%Y-%m-%dT%H:%M:%SZ"))
    state = {"in_progress": True, "run_started_at": gestart}

    assert module._lock_held(state, epoch + 60, max_age=3600.0) is True
    assert module._lock_held(state, epoch + 7200, max_age=3600.0) is False
