"""Story 19.13 — unit-tests voor de herstellogica van dode RECYCLABLE-refs.

Test de load/embed-uitkomsten (`_load_and_embed`) en de write-uitkomsten
(`_write_ref`) met fakes voor conn, storage en model — geen DB/MinIO nodig. De
end-to-end herstelrun tegen ACC (met echte crops + embeddings) is een aparte,
toestemming-gated stap (AC 3), reeds live geverifieerd.
"""

import io

import numpy as np
import pytest
from PIL import Image

from app.core.config import settings
from scripts.restore_recyclable_refs import _load_and_embed, _write_ref


class _FakeConn:
    def __init__(self, existing_embedding):
        self._existing = existing_embedding
        self.executed = []  # (sql, args)

    async def execute(self, sql, *args):
        self.executed.append((sql, args))
        return "OK"

    async def fetchval(self, sql, *args):
        return 1 if self._existing else None


class _FakeStorage:
    def __init__(self, raise_on_load=False):
        self._raise = raise_on_load

    def get_training_image(self, path):
        if self._raise:
            raise FileNotFoundError(f"crop weg: {path}")
        buf = io.BytesIO()
        Image.new("RGB", (8, 8), (10, 20, 30)).save(buf, "PNG")
        return buf.getvalue()


class _FakeModel:
    def __init__(self, emb=None, raise_on_embed=False):
        self._emb = emb
        self._raise = raise_on_embed

    async def generate_embedding(self, im):
        if self._raise:
            raise RuntimeError("model kapot")
        if self._emb is not None:
            return self._emb
        return np.ones(settings.EMBEDDING_DIM, dtype=np.float32)


def _row():
    return {
        "id": "ref-1",
        "storage_path": "artwork-crops/08005110518003/a8add68f659e.png",
        "variant_label": "real-crop:d1",
    }


# --- _load_and_embed -------------------------------------------------------- #
@pytest.mark.asyncio
async def test_load_and_embed_returns_embedding_on_success():
    emb = await _load_and_embed(_FakeModel(), _FakeStorage(), _row())
    assert isinstance(emb, np.ndarray)
    assert emb.shape == (settings.EMBEDDING_DIM,)


@pytest.mark.asyncio
async def test_load_and_embed_skips_unloadable_crop():
    out = await _load_and_embed(_FakeModel(), _FakeStorage(raise_on_load=True), _row())
    assert out == "skip-load"


@pytest.mark.asyncio
async def test_load_and_embed_skips_on_embedding_error():
    out = await _load_and_embed(_FakeModel(raise_on_embed=True), _FakeStorage(), _row())
    assert out == "skip-embed"


@pytest.mark.asyncio
async def test_load_and_embed_skips_wrong_shape_embedding():
    bad = np.ones(settings.EMBEDDING_DIM - 1, dtype=np.float32)  # verkeerde dimensie
    out = await _load_and_embed(_FakeModel(emb=bad), _FakeStorage(), _row())
    assert out == "skip-embed"


# --- _write_ref ------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_write_ref_inserts_vector_and_activates():
    conn = _FakeConn(existing_embedding=False)
    emb = np.arange(settings.EMBEDDING_DIM, dtype=np.float32)
    outcome = await _write_ref(conn, "ref-1", emb)
    assert outcome == "restored"
    sqls = [sql.lower() for sql, _ in conn.executed]
    assert any("for update" in s for s in sqls)  # lock tegen parallelle dubbelrun
    # De embedding wordt als vector-string meegegeven aan de INSERT.
    insert = next(
        (sql, args)
        for sql, args in conn.executed
        if "insert into reference_embeddings" in sql.lower()
    )
    assert insert[1][1] == str(emb.tolist())
    assert any("update reference_logos set active = true" in s for s in sqls)


@pytest.mark.asyncio
async def test_write_ref_is_idempotent_when_embedding_exists():
    conn = _FakeConn(existing_embedding=True)
    outcome = await _write_ref(
        conn, "ref-1", np.ones(settings.EMBEDDING_DIM, dtype=np.float32)
    )
    assert outcome == "skip-exists"
    sqls = " ".join(sql.lower() for sql, _ in conn.executed)
    assert "insert into reference_embeddings" not in sqls
    assert "update reference_logos set active = true" in sqls
