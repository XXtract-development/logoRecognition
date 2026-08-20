"""Story 20.20 — de vingerafdruk van de referentiepool (code-review 20 aug 2026).

Een VOORLOPIG oordeel van de declaratie-oogst ("onder de drempel", "cross-code
afgewezen") telt alleen zolang de referentiepool van die code niet veranderd is.
Die vingerafdruk moet dus over dezelfde verzameling gaan als de match zelf.

De eerste opzet telde ``count(*)`` + ``max(created_at)`` over ``reference_logos``,
terwijl de match draait op ``reference_embeddings`` gejoind op actieve
``reference_logos``. Twee gaten:

  * een actieve referentierij ZONDER embedding telde mee zonder iets bij te
    dragen; kreeg hij er later één, dan veranderde de matchbare pool volledig
    terwijl de vingerafdruk gelijk bleef. Geen bedacht geval — RECYCLABLE had 26
    actieve referentierijen met nul embeddings.
  * een netto-nul-wisseling (één erbij, één eraf, met een oudere ``created_at``)
    liet aantal én jongste tijdstempel ongemoeid.

Deze suite legt de query van de vingerafdruk naast de query van de match, en
toetst het gedrag van de samenstelling.
"""

import re
from contextlib import asynccontextmanager

import numpy as np
import pytest

from app.core.config import settings
from app.services.database import DatabaseService


class _FakeConn:
    """Registreert fetch-aanroepen en geeft vaste rijen terug."""

    def __init__(self, rows):
        self._rows = rows
        self.fetches = []

    def transaction(self):
        class _Txn:
            async def __aenter__(self_inner):
                return None

            async def __aexit__(self_inner, *exc):
                return False

        return _Txn()

    async def execute(self, sql, *args):
        return "SELECT 1"

    async def fetch(self, sql, *args):
        self.fetches.append((sql, args))
        return self._rows


def _patch_connection(svc, conn):
    @asynccontextmanager
    async def _cm():
        yield conn

    svc.get_connection = _cm  # type: ignore[method-assign]


def _plat(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).strip().lower()


def _bron(sql: str) -> str:
    """Het FROM..WHERE-deel van een query, genormaliseerd."""
    plat = _plat(sql)
    start = plat.index("from ")
    eind = plat.index("group by") if "group by" in plat else plat.index("order by")
    return plat[start:eind].strip()


async def _match_sql() -> str:
    conn = _FakeConn([])
    svc = DatabaseService()
    _patch_connection(svc, conn)
    await svc.find_similar_references_by_codes(
        np.zeros(settings.EMBEDDING_DIM, dtype=np.float32),
        t3777_codes=["FSC"],
        limit=1,
        threshold=0.6,
    )
    return conn.fetches[-1][0]


async def _fingerprint_sql(rows=None) -> tuple:
    conn = _FakeConn(rows or [])
    svc = DatabaseService()
    _patch_connection(svc, conn)
    out = await svc.reference_pool_fingerprints(["FSC"])
    return conn.fetches[-1][0], out


@pytest.mark.asyncio
async def test_vingerafdruk_draait_op_dezelfde_bron_als_de_match():
    """De kern van de bevinding: dezelfde tabellen, dezelfde join, dezelfde filter.

    Zonder deze gelijkheid oordeelt de vingerafdruk over een ándere verzameling
    dan de match, en dan zegt "onveranderd" niets over de matchbare pool.
    """
    match = _bron(await _match_sql())
    fp_sql, _ = await _fingerprint_sql()
    fingerprint = _bron(fp_sql)

    for fragment in (
        "from reference_embeddings re",
        "join reference_logos rl on re.reference_logo_id = rl.id",
        "rl.active = true",
    ):
        assert fragment in match, f"de matchquery is veranderd: {fragment} ontbreekt"
        assert fragment in fingerprint, f"de vingerafdruk mist {fragment}"

    # En het tegenbewijs: de vingerafdruk telt niet langer kaal reference_logos.
    assert "from reference_logos" not in fingerprint


@pytest.mark.asyncio
async def test_vingerafdruk_vangt_een_netto_nul_wisseling():
    """Eén referentie erbij, één eraf: evenveel rijen, andere pool.

    Op ``count`` + ``max(created_at)`` bleef die beweging onzichtbaar zodra de
    nieuwe rij ouder was dan de zittende jongste — een teruggezette rij of een
    backfill met een historische tijdstempel.
    """
    fp_sql, voor = await _fingerprint_sql(
        [{"t3777_code": "FSC", "n": 3, "digest": "aaa111"}]
    )
    _, na = await _fingerprint_sql([{"t3777_code": "FSC", "n": 3, "digest": "bbb222"}])

    assert voor["FSC"].startswith("3|") and na["FSC"].startswith("3|")
    assert voor["FSC"] != na["FSC"]

    # Het digest moet ook echt uit de id's van de embeddings komen; anders kan
    # het de wisseling niet zien.
    plat = _plat(fp_sql)
    assert "md5(string_agg(re.id::text, ',' order by re.id))" in plat


@pytest.mark.asyncio
async def test_code_zonder_matchbare_referentie_krijgt_een_geldige_waarde():
    """Geen ontbrekende sleutel maar ``"0|"`` — vergelijkbaar, en dus bruikbaar.

    Dit is ook de nieuwe waarde voor een code die wél actieve referentierijen
    heeft maar geen enkele embedding: die pool is voor de match leeg.
    """
    _, out = await _fingerprint_sql([])
    assert out == {"FSC": "0|"}


@pytest.mark.asyncio
async def test_lege_codelijst_raakt_de_database_niet():
    conn = _FakeConn([])
    svc = DatabaseService()
    _patch_connection(svc, conn)
    assert await svc.reference_pool_fingerprints([]) == {}
    assert conn.fetches == []
