"""Story 12.9 — unit-tests voor de NutriScore-labelcorrectie-logica.

Test de selectie-/actielogica (`build_action_plan`) en de per-ref write-helpers
(`_deactivate_ref`, `_relabel_ref`, `_reconcile_gold_set`) met een gemockte
DB-connectie — geen echte DB/ACC nodig. Patroon:
`test_restore_recyclable_refs_19_13.py` (Story 19.13). De end-to-end correctie
tegen ACC is een aparte, toestemming-gated stap (Task 7), buiten deze suite.
"""

import pytest

from scripts.correct_nutriscore_labels import (
    DEACTIVATE_IDS,
    OK_IDS,
    RELABEL_FIELD_TYPE,
    RELABEL_GS1_FIELD,
    RELABEL_ID,
    RELABEL_NEW_CODE,
    RELABEL_OLD_CODE,
    SEED_IDS,
    _deactivate_ref,
    _reconcile_gold_set,
    _relabel_ref,
    build_action_plan,
    run,
)

# De 18 deactiveer-ids letterlijk uit nutriscore-labelverdict-friso-2026-07-12.md
# (onafhankelijk overgetypt van de scriptconstanten, zodat een fout in het script
# door deze test wordt gevangen i.p.v. bevestigd).
EXPECTED_DEACTIVATE_IDS = {
    "c232a696-bf9a-4b66-84c9-c107faf028b8",  # A1
    "f132dc5c-eee5-4123-aff1-45d40f234f81",  # A2
    "ccb85dbf-8731-4d1e-a204-83a37c0816cb",  # A3
    "e4f1865a-3a30-4b91-9bc0-f81f35aaac9c",  # B1
    "07d1272f-9802-4ae4-ac0f-718aa91e193d",  # B2
    "3c1bcabb-74be-4d8b-a715-d49c97dbae37",  # B6
    "758d29be-58a4-4b98-b75a-c4e1be88ebe3",  # B7
    "77de4770-19ff-4507-ab27-90f573bfc757",  # B8
    "b557b321-73f6-4489-a049-1ed56be3ecfe",  # B10
    "1eb5a753-4f66-4683-a0b1-b75e8f91c952",  # C1
    "bd69e189-854e-450e-a79d-f5d96fbfc5f1",  # C2
    "ceb74937-879d-452f-b37a-e8b4b42be283",  # C4
    "2e155ab8-0544-4466-a547-df2c25a386a5",  # C5
    "4003ea2d-83bc-46d6-b501-504edca8d14b",  # C6
    "f94cb8ab-add7-4997-a2f0-c220f6f7f911",  # D2
    "bfe138fa-0427-4b59-8bed-d46615afa212",  # E1
    "05ad5bfc-b1c5-4780-bfea-992db3b8b426",  # E4
    "ce29c06f-50de-44e5-809f-ef8d4f1e885f",  # E10
}

EXPECTED_RELABEL_ID = "cf18877a-5c8d-4331-b98d-49a464243347"  # A13

# De "ok (marker was fout)"-crops + synthetische zaden — moeten NIET in de
# actieset zitten (AC3).
EXPECTED_UNTOUCHED_IDS = {
    "21b29118-322c-4df2-895d-730b93dfc84f",  # A4
    "336dc88d-818f-4c97-bfcc-a3c32fe4fec1",  # A5
    "37b86632-61de-4833-a1d8-c1c5f9b6a985",  # A6
    "d7bb6643-6e0d-4dbc-9300-d719473d1ad8",  # A7
    "8d90b6af-546e-42d9-8f9a-79d17a96f613",  # B3
    "d6232e76-24b3-4f78-b3f1-151cb7c9e0c3",  # B4
    "be490465-c784-4cd2-8655-d1091a1aca67",  # D1
    "fbe7d377-3cfb-41b7-b4b8-d3a3f50f87cf",  # E2
    "7bdeb9b8-2209-4b04-8657-781680992c81",  # A8 zaad
    "8c90082c-a77f-4687-8759-7e82595435e9",  # B5 zaad
    "4e80085e-d37f-4d41-9ad6-12c659e02ec5",  # C3 zaad
    "11733a34-dec3-4cc5-906c-1190d2da634d",  # D3 zaad
    "07b17cd0-2e1a-4487-bbfa-4cb23182e991",  # E3 zaad
}


class _FakeConn:
    """Fake asyncpg-connectie: `fetchrow`/`fetch`/`fetchval` geven vaste data
    terug, `execute` registreert elke aanroep zodat tests op UPDATE-afwezigheid
    kunnen assert'en."""

    def __init__(self, row=None, fetch_rows=None, fetchval_result=None):
        self._row = row
        self._fetch_rows = fetch_rows if fetch_rows is not None else []
        self._fetchval_result = fetchval_result
        self.executed = []  # (sql, args)

    async def fetchrow(self, sql, *args):
        return self._row

    async def fetch(self, sql, *args):
        return self._fetch_rows

    async def fetchval(self, sql, *args):
        return self._fetchval_result

    async def execute(self, sql, *args):
        self.executed.append((sql, args))
        return "UPDATE 1"


# --- build_action_plan — selectie-/actielogica (AC6a/AC6b) ------------------ #
def test_action_plan_contains_exactly_the_18_deactivate_ids():
    plan = build_action_plan()
    assert set(plan["deactivate"].values()) == EXPECTED_DEACTIVATE_IDS
    assert len(plan["deactivate"]) == 18
    assert set(DEACTIVATE_IDS.values()) == EXPECTED_DEACTIVATE_IDS


def test_action_plan_relabels_exactly_a13_to_e():
    plan = build_action_plan()
    assert plan["relabel"]["id"] == EXPECTED_RELABEL_ID == RELABEL_ID
    assert plan["relabel"]["old_code"] == "NUTRISCORE_A" == RELABEL_OLD_CODE
    assert plan["relabel"]["new_code"] == "NUTRISCORE_E" == RELABEL_NEW_CODE
    assert plan["relabel"]["field_type"] == "NutritionalScore" == RELABEL_FIELD_TYPE
    assert plan["relabel"]["gs1_field"] == "nutritionalScore" == RELABEL_GS1_FIELD


def test_ok_and_seed_ids_are_not_in_the_action_set():
    plan = build_action_plan()
    actioned_ids = set(plan["deactivate"].values()) | {plan["relabel"]["id"]}
    assert actioned_ids.isdisjoint(EXPECTED_UNTOUCHED_IDS)
    # Ook via de module-dicts zelf (documentatie-consistentie):
    assert actioned_ids.isdisjoint(set(OK_IDS.values()))
    assert actioned_ids.isdisjoint(set(SEED_IDS.values()))


def test_deactivate_and_relabel_sets_are_disjoint():
    plan = build_action_plan()
    assert plan["relabel"]["id"] not in plan["deactivate"].values()


# --- _deactivate_ref --------------------------------------------------------- #
@pytest.mark.asyncio
async def test_deactivate_ref_deactivates_active_row():
    conn = _FakeConn(
        row={"active": True, "t3777_code": "NUTRISCORE_A", "storage_path": "crops/a1.png"}
    )
    outcome, row = await _deactivate_ref(conn, "some-id")
    assert outcome == "deactivated"
    assert row["t3777_code"] == "NUTRISCORE_A"
    sqls = [sql.lower() for sql, _ in conn.executed]
    assert any("update reference_logos set active = false" in s for s in sqls)


@pytest.mark.asyncio
async def test_deactivate_ref_is_idempotent_when_already_inactive():
    conn = _FakeConn(
        row={"active": False, "t3777_code": "NUTRISCORE_A", "storage_path": "crops/a1.png"}
    )
    outcome, row = await _deactivate_ref(conn, "some-id")
    assert outcome == "skip-already"
    assert conn.executed == []  # geen enkele write


@pytest.mark.asyncio
async def test_deactivate_ref_treats_null_active_as_already_inactive():
    """`active` is NOT NULL in het schema (default true), maar mocht die
    aanname ooit breken dan moet NULL EXPLICIET als 'al niet actief' behandeld
    worden i.p.v. via een impliciete falsy-check (code review 2026-07-13)."""
    conn = _FakeConn(
        row={"active": None, "t3777_code": "NUTRISCORE_A", "storage_path": "crops/a1.png"}
    )
    outcome, row = await _deactivate_ref(conn, "some-id")
    assert outcome == "skip-already"
    assert conn.executed == []


@pytest.mark.asyncio
async def test_deactivate_ref_skips_missing_row():
    conn = _FakeConn(row=None)
    outcome, row = await _deactivate_ref(conn, "unknown-id")
    assert outcome == "skip-missing"
    assert row is None
    assert conn.executed == []


# --- _relabel_ref ------------------------------------------------------------ #
@pytest.mark.asyncio
async def test_relabel_ref_relabels_from_a_to_e():
    conn = _FakeConn(
        row={"t3777_code": "NUTRISCORE_A", "variant_label": "real-crop:a13", "storage_path": "crops/a13.png"},
        fetchval_result=None,  # geen variant_label-conflict onder NUTRISCORE_E
    )
    outcome, row = await _relabel_ref(
        conn, RELABEL_ID, "NUTRISCORE_A", "NUTRISCORE_E", "NutritionalScore", "nutritionalScore"
    )
    assert outcome == "relabeled"
    assert row["t3777_code"] == "NUTRISCORE_A"  # vóór-write staat
    sqls = [sql.lower() for sql, _ in conn.executed]
    assert any("update reference_logos set t3777_code" in s for s in sqls)
    update_call = next(
        (sql, args) for sql, args in conn.executed if "update reference_logos" in sql.lower()
    )
    assert update_call[1] == (RELABEL_ID, "NUTRISCORE_E", "NutritionalScore", "nutritionalScore")


@pytest.mark.asyncio
async def test_relabel_ref_is_idempotent_when_already_relabeled():
    conn = _FakeConn(row={"t3777_code": "NUTRISCORE_E", "variant_label": "real-crop:a13", "storage_path": "crops/a13.png"})
    outcome, row = await _relabel_ref(
        conn, RELABEL_ID, "NUTRISCORE_A", "NUTRISCORE_E", "NutritionalScore", "nutritionalScore"
    )
    assert outcome == "skip-already"
    assert conn.executed == []  # geen dubbele write


@pytest.mark.asyncio
async def test_relabel_ref_skips_missing_row():
    conn = _FakeConn(row=None)
    outcome, row = await _relabel_ref(
        conn, "unknown-id", "NUTRISCORE_A", "NUTRISCORE_E", "NutritionalScore", "nutritionalScore"
    )
    assert outcome == "skip-missing"
    assert conn.executed == []


@pytest.mark.asyncio
async def test_relabel_ref_refuses_write_on_unexpected_current_code(monkeypatch):
    """Als de huidige code noch `old_code` noch `new_code` is (gedreven/handmatig
    gewijzigd/onvolledige eerdere run), NIET blind overschrijven — dat zou een
    verkeerde ref herlabelen (code review 2026-07-13, was ontbrekend)."""
    conn = _FakeConn(
        row={"t3777_code": "NUTRISCORE_B", "variant_label": "real-crop:a13", "storage_path": "crops/a13.png"}
    )
    outcome, row = await _relabel_ref(
        conn, RELABEL_ID, "NUTRISCORE_A", "NUTRISCORE_E", "NutritionalScore", "nutritionalScore"
    )
    assert outcome == "skip-unexpected-code"
    assert conn.executed == []  # geen write op een onverwachte staat


@pytest.mark.asyncio
async def test_relabel_ref_refuses_write_on_variant_label_conflict():
    """`reference_logos` heeft `@@unique([t3777Code, variantLabel])` — bestaat
    er al een ANDERE rij met dezelfde variant_label onder de nieuwe code, dan
    moet dat vooraf gedetecteerd worden i.p.v. een ongehandelde unique-violation
    te laten optreden (code review 2026-07-13, was ontbrekend)."""
    conn = _FakeConn(
        row={"t3777_code": "NUTRISCORE_A", "variant_label": "real-crop:d1", "storage_path": "crops/a13.png"},
        fetchval_result=1,  # conflict: bestaande NUTRISCORE_E-rij met dit label
    )
    outcome, row = await _relabel_ref(
        conn, RELABEL_ID, "NUTRISCORE_A", "NUTRISCORE_E", "NutritionalScore", "nutritionalScore"
    )
    assert outcome == "skip-conflict"
    sqls = [sql.lower() for sql, _ in conn.executed]
    assert not any("update reference_logos set t3777_code" in s for s in sqls)


# --- _reconcile_gold_set ------------------------------------------------------ #
@pytest.mark.asyncio
async def test_reconcile_gold_set_retracts_matching_echt_record():
    conn = _FakeConn(fetch_rows=[{"id": "gold-1"}])
    retracted = await _reconcile_gold_set(conn, "NUTRISCORE_A", "crops/a1.png")
    assert retracted == 1
    sqls = [sql.lower() for sql, _ in conn.executed]
    assert any("update gold_set_records set replaced_by_id = id" in s for s in sqls)


@pytest.mark.asyncio
async def test_reconcile_gold_set_noop_when_no_match():
    conn = _FakeConn(fetch_rows=[])
    retracted = await _reconcile_gold_set(conn, "NUTRISCORE_A", "crops/a1.png")
    assert retracted == 0
    assert conn.executed == []


@pytest.mark.asyncio
async def test_reconcile_gold_set_noop_when_storage_path_missing():
    conn = _FakeConn(fetch_rows=[{"id": "gold-1"}])
    retracted = await _reconcile_gold_set(conn, "NUTRISCORE_A", None)
    assert retracted == 0
    assert conn.executed == []  # geen enkele query/write bij ontbrekende crop_path


@pytest.mark.asyncio
async def test_reconcile_gold_set_noop_when_storage_path_empty_string():
    """Een lege string is net zo 'geen crop_path' als None — anders zou een
    lege-string-match tegen `crop_path = ''` geprobeerd worden."""
    conn = _FakeConn(fetch_rows=[{"id": "gold-1"}])
    retracted = await _reconcile_gold_set(conn, "NUTRISCORE_A", "")
    assert retracted == 0
    assert conn.executed == []


# --- DRY_RUN (AC5) ------------------------------------------------------------ #
@pytest.mark.asyncio
async def test_dry_run_never_calls_the_write_helpers(monkeypatch):
    """DRY-RUN (geen --apply) muteert niets: de write-paden (_deactivate_ref /
    _relabel_ref, de enige plekken met een UPDATE) worden in dry-run NOOIT
    aangeroepen — laat ze falen als ze toch aangeroepen worden."""
    import scripts.correct_nutriscore_labels as mod

    async def _boom(*args, **kwargs):
        raise AssertionError("write-helper aangeroepen tijdens DRY-RUN")

    monkeypatch.setattr(mod, "_deactivate_ref", _boom)
    monkeypatch.setattr(mod, "_relabel_ref", _boom)

    exit_code = await run(apply=False)
    assert exit_code == 0


@pytest.mark.asyncio
async def test_dry_run_does_not_import_database_service(monkeypatch):
    """DRY-RUN doet geen enkele DB-call: `app.services.database` wordt niet
    geïmporteerd/aangeroepen in de apply=False-tak."""
    import builtins

    real_import = builtins.__import__

    def _tracking_import(name, *args, **kwargs):
        if name == "app.services.database":
            raise AssertionError("app.services.database geïmporteerd tijdens DRY-RUN")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _tracking_import)
    exit_code = await run(apply=False)
    assert exit_code == 0


# --- Idempotentie op run-niveau (AC5 — tweede pass = geen actie) ------------- #
@pytest.mark.asyncio
async def test_second_pass_on_already_corrected_state_is_a_noop():
    """Een tweede `--apply`-pass op een reeds-gecorrigeerde staat (active=false,
    t3777_code al NUTRISCORE_E) doet geen enkele write — idempotentie op
    helper-niveau, dat is wat `run()` per ref aanroept."""
    already_deactivated = _FakeConn(
        row={"active": False, "t3777_code": "NUTRISCORE_A", "storage_path": "crops/a1.png"}
    )
    outcome, _ = await _deactivate_ref(already_deactivated, "some-id")
    assert outcome == "skip-already"
    assert already_deactivated.executed == []

    already_relabeled = _FakeConn(
        row={"t3777_code": "NUTRISCORE_E", "variant_label": "real-crop:a13", "storage_path": "crops/a13.png"}
    )
    outcome, _ = await _relabel_ref(
        already_relabeled,
        RELABEL_ID,
        "NUTRISCORE_A",
        "NUTRISCORE_E",
        "NutritionalScore",
        "nutritionalScore",
    )
    assert outcome == "skip-already"
    assert already_relabeled.executed == []


# --- run(apply=True) glue: falsafe op verkeerde omgeving --------------------- #
class _AllMissingFakeConn:
    """Simuleert een omgeving waar GEEN van de 19 ids bestaat (bv. verkeerde
    DB/omgeving) — `fetchrow` geeft altijd None terug, ongeacht het id."""

    def __init__(self):
        self.executed = []

    async def fetchrow(self, sql, *args):
        return None

    async def fetch(self, sql, *args):
        return []

    async def fetchval(self, sql, *args):
        return None

    async def execute(self, sql, *args):
        self.executed.append((sql, args))
        return "UPDATE 0"

    def transaction(self):
        return _NoopTransaction()


class _NoopTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeDbService:
    def __init__(self, conn):
        self._conn = conn

    def get_connection(self):
        return _ConnCtx(self._conn)


class _ConnCtx:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.mark.asyncio
async def test_apply_returns_nonzero_when_all_ids_are_missing(monkeypatch):
    """Als GEEN van de 19 ids gevonden wordt (verkeerde DB/omgeving), mag `run`
    dat NOOIT als succes (exit 0) rapporteren aan een geautomatiseerde
    aanroeper — dat zou een silent no-op verhullen als 'gelukt' (code review
    2026-07-13, was ontbrekend: `run()` gaf altijd 0 terug)."""
    import sys
    import types

    fake_conn = _AllMissingFakeConn()
    fake_db_module = types.ModuleType("app.services.database")
    fake_db_module.db_service = _FakeDbService(fake_conn)
    monkeypatch.setitem(sys.modules, "app.services.database", fake_db_module)

    exit_code = await run(apply=True)
    assert exit_code == 1
