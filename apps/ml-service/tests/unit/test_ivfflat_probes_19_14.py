"""Story 19.14 — ivfflat onder-fetch corrigeren.

Twee lagen:

1. Unit (altijd in CI): bewijst dat ``find_similar_references`` de query in een
   transactie draait, daarbinnen de ivfflat.probes-GUC zet (via set_config met
   is_local=true) vóór de fetch, én dat de fetch zélf binnen die transactie valt.
   Faalt op de oude code (geen transactie / geen probes-setting) → rood→groen.

2. Integratie (skipif zonder DB): reproduceert de echte under-fetch door een
   gevulde ``ivfflat``-index in de degenererende toestand (veel lists, weinig
   rijen) op te bouwen en te tonen dat probes=1 minder buren geeft dan de
   verhoogde probes. Vereist een pgvector-Postgres via ``TEST_DATABASE_URL``;
   raakt NOOIT ``reference_embeddings`` (eigen TEMP-tabel).
"""

import os
from contextlib import asynccontextmanager

import numpy as np
import pytest

from app.core.config import settings
from app.services.database import DatabaseService


# --------------------------------------------------------------------------- #
# 1. Unit — mechanisme (probes-GUC binnen een transactie, fetch óók binnen)
# --------------------------------------------------------------------------- #
class _FakeConn:
    """Registreert execute/fetch-aanroepen (sql + args) en de txn-context."""

    def __init__(self, rows):
        self._rows = rows
        self.calls = []  # lijst van (op, sql, args)
        self._in_txn = False
        self.probes_set_inside_txn = False
        self.fetch_inside_txn = False

    def transaction(self):
        outer = self

        class _Txn:
            async def __aenter__(self):
                outer._in_txn = True
                return None

            async def __aexit__(self, *exc):
                outer._in_txn = False
                return False

        return _Txn()

    async def execute(self, sql, *args):
        self.calls.append(("execute", sql, args))
        if "ivfflat.probes" in sql.lower() and self._in_txn:
            self.probes_set_inside_txn = True
        return "SELECT 1"

    async def fetch(self, sql, *args):
        self.calls.append(("fetch", sql, args))
        if self._in_txn:
            self.fetch_inside_txn = True
        return self._rows


def _patch_connection(svc, conn):
    @asynccontextmanager
    async def _cm():
        yield conn

    svc.get_connection = _cm  # type: ignore[method-assign]


@pytest.mark.asyncio
async def test_find_similar_references_sets_probes_within_transaction():
    rows = [
        {
            "reference_logo_id": "id-1",
            "t3777_code": "RECYCLABLE_GENERAL_CLAIM",
            "variant_label": "v1",
            "similarity": 0.9,
        }
    ]
    conn = _FakeConn(rows)
    svc = DatabaseService()
    _patch_connection(svc, conn)

    out = await svc.find_similar_references(
        np.zeros(settings.EMBEDDING_DIM, dtype=np.float32), limit=5, threshold=0.0
    )

    # Kern van 19.14: de probes-GUC MOET binnen een transactie gezet worden
    # (set_config/SET LOCAL is transactie-gescoped) én de fetch moet in
    # diezelfde transactie vallen — anders is de GUC bij de fetch al teruggedraaid.
    assert conn.probes_set_inside_txn, (
        "ivfflat.probes moet binnen een transactie gezet worden (Story 19.14)"
    )
    assert conn.fetch_inside_txn, (
        "de fetch moet binnen dezelfde transactie draaien als de probes-setting"
    )

    # ...en de probes-setting moet vóór de fetch komen.
    set_idx = next(
        i for i, (_op, sql, _a) in enumerate(conn.calls) if "ivfflat.probes" in sql.lower()
    )
    fetch_idx = next(i for i, (op, _sql, _a) in enumerate(conn.calls) if op == "fetch")
    assert set_idx < fetch_idx, "probes moet vóór de zoekquery gezet worden"

    # Resultaat wordt normaal doorgegeven.
    assert out and out[0]["t3777_code"] == "RECYCLABLE_GENERAL_CLAIM"


@pytest.mark.asyncio
async def test_probes_value_comes_from_config(monkeypatch):
    monkeypatch.setattr(settings, "REFERENCE_SEARCH_PROBES", 42, raising=True)
    conn = _FakeConn([])
    svc = DatabaseService()
    _patch_connection(svc, conn)

    await svc.find_similar_references(
        np.zeros(settings.EMBEDDING_DIM, dtype=np.float32), limit=5, threshold=0.0
    )

    # De waarde wordt als bind-parameter meegegeven (injectie-veilig), niet in de
    # SQL-tekst — assert exact op de parameter, niet op een substring.
    probes_call = next(
        (sql, args) for (_op, sql, args) in conn.calls if "ivfflat.probes" in sql.lower()
    )
    assert "42" in [str(a) for a in probes_call[1]], (
        "probes-waarde moet als bind-arg uit settings.REFERENCE_SEARCH_PROBES komen"
    )


# --------------------------------------------------------------------------- #
# 2. Integratie — echte degenererende ivfflat-index (DB-gated)
# --------------------------------------------------------------------------- #
_TEST_DB_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.mark.skipif(
    not _TEST_DB_URL,
    reason="Integratietest vereist een pgvector-Postgres via TEST_DATABASE_URL",
)
@pytest.mark.asyncio
async def test_degenerate_ivfflat_underfetches_and_probes_fix_restores_recall():
    import asyncpg

    conn = await asyncpg.connect(_TEST_DB_URL)
    dim = 8
    try:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        # TEMP-tabel: sessie-gescoped, geen pre-DROP nodig (raakt nooit een
        # echte tabel); cleanup in finally.
        await conn.execute(
            f"CREATE TEMP TABLE _s1914_probe (id serial primary key, embedding vector({dim}))"
        )
        # 300 rijen → met lists=100 ~3 rijen/cluster (degenererend).
        rng = np.random.default_rng(1914)
        for _ in range(300):
            vec = rng.standard_normal(dim).astype(np.float32)
            await conn.execute(
                "INSERT INTO _s1914_probe (embedding) VALUES ($1::vector)",
                str(vec.tolist()),
            )
        await conn.execute(
            "CREATE INDEX _s1914_idx ON _s1914_probe "
            "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
        )
        await conn.execute("ANALYZE _s1914_probe")
        q = str(rng.standard_normal(dim).astype(np.float32).tolist())
        query = "SELECT id FROM _s1914_probe ORDER BY embedding <=> $1::vector LIMIT 10"

        # Degenererend: probes=1 → onder-fetch.
        async with conn.transaction():
            await conn.execute("SET LOCAL enable_seqscan = off")  # forceer indexpad
            await conn.execute("SET LOCAL ivfflat.probes = 1")
            under = await conn.fetch(query, q)

        # Fix: verhoogde probes → volledige N.
        async with conn.transaction():
            await conn.execute("SET LOCAL enable_seqscan = off")
            await conn.execute(
                "SELECT set_config('ivfflat.probes', $1, true)",
                str(settings.REFERENCE_SEARCH_PROBES),
            )
            fixed = await conn.fetch(query, q)

        # Harde gate: de fix levert de volledige N. Reproductie: probes=1 geeft
        # er strikt minder (robuuster dan een absolute drempel).
        assert len(fixed) == 10, f"verwacht volledige N na fix, kreeg {len(fixed)}"
        assert len(under) < len(fixed), (
            f"verwacht under-fetch met probes=1, kreeg {len(under)} (>= {len(fixed)})"
        )
    finally:
        await conn.execute("DROP TABLE IF EXISTS _s1914_probe")
        await conn.close()
