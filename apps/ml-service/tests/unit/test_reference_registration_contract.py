"""Offline contract acceptance tests: no database, object storage or models."""
import asyncio
import importlib
import io
import json
import sys
import types
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import numpy as np
import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]

@pytest.fixture
def runtime(monkeypatch):
    package = types.ModuleType("app.services")
    package.__path__ = [str(ROOT / "apps/ml-service/app/services")]
    monkeypatch.setitem(sys.modules, "app.services", package)
    connection = Mock(fetch=AsyncMock(return_value=[]), fetchval=AsyncMock(side_effect=lambda sql, *args: True if "pg_try_advisory_xact_lock" in sql else None),
                      fetchrow=AsyncMock(return_value={"id": "new-id"}), execute=AsyncMock())
    connection.transaction = lambda: context()
    @asynccontextmanager
    async def context():
        yield connection
    db = Mock(get_connection=Mock(side_effect=context))
    model = Mock(generate_embedding=AsyncMock(return_value=np.array([0.2, 0.4])))
    output = io.BytesIO()
    image = Image.new("RGB", (8, 8))
    image.putpixel((4, 4), (255, 255, 255))
    image.save(output, format="PNG")
    storage = Mock(get_training_image=Mock(return_value=output.getvalue()))
    for name, attr, value in [("app.core.logging", "logger", Mock()),
                              ("app.services.database", "db_service", db),
                              ("app.ml.model_manager", "model_manager", model),
                              ("app.services.storage", "storage_service", storage)]:
        mod = types.ModuleType(name)
        setattr(mod, attr, value)
        monkeypatch.setitem(sys.modules, name, mod)
    # Pure artwork helper is unrelated to registration; avoid loading PDF runtime.
    art = types.ModuleType("app.services.artwork")
    art.DEFAULT_DPI, art.rasterize_pdf = 150, Mock()
    monkeypatch.setitem(sys.modules, "app.services.artwork", art)
    for name in ("app.services.similarity", "app.api.artwork"):
        monkeypatch.delitem(sys.modules, name, raising=False)
    similarity = importlib.import_module("app.services.similarity")
    artwork = importlib.import_module("app.api.artwork")
    yield similarity.similarity_service, artwork, connection, db, model, storage
    # Imports performed in fixture are not left behind to contaminate other tests.
    sys.modules.pop("app.services.similarity", None)
    sys.modules.pop("app.api.artwork", None)

CATEGORIES = [(f"NUTRISCORE_{letter}", "NutritionalScore", "nutritionalScore") for letter in "ABCDE"] + [
    ("VEGAN", "DietTypeCode", "dietTypeCode"),
    ("AISE_1", "EU_consumerUsageLabelCodeList", "enumerationValue"),
    ("FLAME", "GHSSymbolDescriptionCode", "gHSSymbolDescriptionCode"),
    ("UNKNOWN_VALID", "PackagingMarkedLabelAccreditationCode", "packagingMarkedLabelAccreditationCode")]

@pytest.mark.parametrize("code,field,gs1", CATEGORIES)
def test_new_reference_persists_canonical_pair(runtime, code, field, gs1):
    service, _, conn, _, model, _ = runtime
    result = asyncio.run(service.register_crop_as_reference("crop.png", f" {code.lower()} "))
    assert result["added"] is True
    query, *args = conn.fetchrow.call_args.args
    assert "field_type" in query and "gs1_field" in query
    assert args == [code, "review:crop.png", "crop.png", "review-confirmed", field, gs1]
    model.generate_embedding.assert_awaited_once()

@pytest.mark.parametrize("code", ["", "  ", None, 42, {}])
def test_invalid_direct_code_does_no_work(runtime, code):
    service, _, _, db, model, storage = runtime
    with pytest.raises(ValueError):
        asyncio.run(service.register_crop_as_reference("crop.png", code))
    db.get_connection.assert_not_called()
    model.generate_embedding.assert_not_called()
    storage.get_training_image.assert_not_called()

@pytest.mark.parametrize("metadata", [{"field_type": "DietTypeCode"}, {"gs1_field": "dietTypeCode"},
    {"field_type": "NutritionalScore", "gs1_field": "dietTypeCode"}, {"field_type": ""}, {"field_type": None}])
def test_invalid_endpoint_returns_422_without_work(runtime, metadata):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    _, artwork, _, db, _, storage = runtime
    app = FastAPI()
    app.include_router(artwork.router)
    response = TestClient(app).post("/artwork/register-reference", json={"crop_path": "x", "t3777_code": "NUTRISCORE_A", **metadata})
    assert response.status_code == 422
    db.get_connection.assert_not_called()
    storage.get_training_image.assert_not_called()

@pytest.mark.parametrize("code", ["", "  ", None, 42, {}])
def test_invalid_endpoint_code_returns_422(runtime, code):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    _, artwork, _, db, _, _ = runtime
    app = FastAPI()
    app.include_router(artwork.router)
    response = TestClient(app).post("/artwork/register-reference", json={"crop_path": "x", "t3777_code": code})
    assert response.status_code == 422
    db.get_connection.assert_not_called()

@pytest.mark.parametrize("rows", [[{"id": "inactive", "t3777_code": " nutriscore_a ", "active": False}],
    [{"id": "a", "t3777_code": "NUTRISCORE_A"}, {"id": "b", "t3777_code": "NUTRISCORE_A"}]])
def test_same_path_repairs_only_metadata_without_embedding(runtime, rows):
    service, _, conn, _, model, storage = runtime
    conn.fetch.return_value = rows
    result = asyncio.run(service.register_crop_as_reference("crop.png", "NUTRISCORE_A"))
    assert result["added"] is False
    assert conn.execute.await_count == len(rows)
    for call in conn.execute.call_args_list:
        query, *args = call.args
        assert "field_type" in query and "gs1_field" in query
        assert "active =" not in query and "source =" not in query and "t3777_code =" not in query
        assert args[:2] == ["NutritionalScore", "nutritionalScore"]
    lookup = conn.fetch.call_args.args[0]
    assert "AND active" not in lookup
    storage.get_training_image.assert_called_once_with('crop.png')
    model.generate_embedding.assert_not_called()
    conn.fetchrow.assert_not_called()

@pytest.mark.parametrize("rows", [[{"id": "a", "t3777_code": "VEGAN"}],
    [{"id": "a", "t3777_code": "NUTRISCORE_A"}, {"id": "b", "t3777_code": "VEGAN"}]])
def test_conflicting_same_path_never_writes(runtime, rows):
    service, _, conn, _, model, storage = runtime
    conn.fetch.return_value = rows
    result = asyncio.run(service.register_crop_as_reference("crop.png", "NUTRISCORE_A"))
    assert result == {"added": False, "reason": "conflicting-reference-code"}
    conn.execute.assert_not_called()
    model.generate_embedding.assert_not_called()
    storage.get_training_image.assert_called_once_with('crop.png')

def test_new_near_duplicate_guard_remains(runtime):
    service, _, conn, _, model, _ = runtime
    conn.fetchval.side_effect = lambda sql, *args: True if "pg_try_advisory_xact_lock" in sql else 0.999
    result = asyncio.run(service.register_crop_as_reference("crop.png", "NUTRISCORE_A"))
    assert result["added"] is False and result["reason"].startswith("near-duplicate")
    conn.fetchrow.assert_not_called()

@pytest.mark.parametrize("metadata", [{"field_type": "DietTypeCode"}, {"gs1_field": "dietTypeCode"}])
def test_direct_metadata_rejected_before_work(runtime, metadata):
    service, _, _, db, _, storage = runtime
    with pytest.raises(ValueError):
        asyncio.run(service.register_crop_as_reference("crop.png", "NUTRISCORE_A", **metadata))
    db.get_connection.assert_not_called()
    storage.get_training_image.assert_not_called()

def test_shared_mapping_python_parity_and_runtime_file():
    mapping_path = ROOT / 'apps/api/src/services/reference-code-mapping.json'
    data = json.loads(mapping_path.read_text())
    from app.services.reference_category import resolve_reference_category
    for field, group in data['categories'].items():
        for code in group['codes']:
            assert resolve_reference_category(f' {code.lower()} ') == (code, field, group['gs1Field'])
    docker = (ROOT / 'apps/ml-service/Dockerfile').read_text()
    assert 'apps/api/src/services/reference-code-mapping.json /app/reference-code-mapping.json' in docker

@pytest.mark.parametrize('code,field,gs1', CATEGORIES)
def test_live_writer_persists_pair(runtime, code, field, gs1):
    service, _, conn, _, model, storage = runtime
    spec = importlib.util.spec_from_file_location('realref_live_contract', ROOT / 'apps/ml-service/scripts/realref_live.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert asyncio.run(mod._add_ref(conn, model, storage, f' {code.lower()} ', 'crop.png', 'variant'))
    query, *args = conn.fetchrow.call_args.args
    assert 'field_type' in query and 'gs1_field' in query
    assert args == [code, 'real-crop:variant', 'crop.png', mod.TAG, field, gs1]

def test_live_writer_invalid_code_before_work(runtime):
    _, _, conn, _, model, storage = runtime
    spec = importlib.util.spec_from_file_location('realref_live_contract', ROOT / 'apps/ml-service/scripts/realref_live.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    with pytest.raises(ValueError):
        asyncio.run(mod._add_ref(conn, model, storage, 42, 'crop.png', 'v'))
    storage.get_training_image.assert_not_called()
    model.generate_embedding.assert_not_called()
    conn.fetchrow.assert_not_called()

def test_runtime_layout_resolves_bundled_mapping(tmp_path):
    import shutil
    services = tmp_path / 'app/services'
    services.mkdir(parents=True)
    shutil.copy(ROOT / 'apps/ml-service/app/services/reference_category.py', services / 'reference_category.py')
    shutil.copy(ROOT / 'apps/api/src/services/reference-code-mapping.json', tmp_path / 'reference-code-mapping.json')
    spec = importlib.util.spec_from_file_location('isolated_reference_category', services / 'reference_category.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.MAPPING_PATH == tmp_path / 'reference-code-mapping.json'
    assert module.resolve_reference_category('nutriscore_a') == ('NUTRISCORE_A', 'NutritionalScore', 'nutritionalScore')

def test_duplicate_variant_guard_remains(runtime):
    service, _, conn, _, _, _ = runtime
    conn.fetchrow.side_effect = Exception('unique constraint violation')
    result = asyncio.run(service.register_crop_as_reference('crop.png', 'NUTRISCORE_A'))
    assert result == {'added': False, 'reason': 'duplicate-variant-label'}
    conn.execute.assert_not_called()

def test_load_failure_is_explicit_fail_closed(runtime):
    service, _, conn, _, model, storage = runtime
    storage.get_training_image.side_effect = OSError('missing crop')
    with pytest.raises(ValueError, match='Referentie-inhoud'):
        asyncio.run(service.register_crop_as_reference('crop.png', 'NUTRISCORE_A'))
    model.generate_embedding.assert_not_called()
    conn.fetchrow.assert_not_called()

def test_endpoint_accepts_explicit_resolved_fields(runtime):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    _, artwork, conn, _, model, _ = runtime
    app = FastAPI()
    app.include_router(artwork.router)
    response = TestClient(app).post('/artwork/register-reference', json={
        'crop_path': 'x', 't3777_code': ' nutriscore_a ',
        'field_type': 'NutritionalScore', 'gs1_field': 'nutritionalScore',
    })
    assert response.status_code == 200 and response.json()['added'] is True
    assert conn.fetchrow.call_args.args[-2:] == ('NutritionalScore', 'nutritionalScore')

def test_inflight_same_path_returns_no_work(runtime):
    service, _, conn, _, model, storage = runtime
    conn.fetchval.side_effect = None
    conn.fetchval.return_value = False
    result = asyncio.run(service.register_crop_as_reference('crop.png', 'NUTRISCORE_A'))
    assert result == {'added': False, 'reason': 'registration-in-progress'}
    conn.fetch.assert_not_called()
    conn.fetchrow.assert_not_called()
    conn.execute.assert_not_called()
    storage.get_training_image.assert_called_once_with('crop.png')
    model.generate_embedding.assert_not_called()


def test_same_path_concurrency_and_embedding_failure_rollback(runtime):
    service, _, _, db, model, _ = runtime
    async def scenario():
        locks, committed = set(), []
        entered, release = asyncio.Event(), asyncio.Event()
        @asynccontextmanager
        async def connection():
            pending, held = [], []
            conn = Mock()
            @asynccontextmanager
            async def transaction():
                try:
                    yield
                    committed.extend(pending)
                finally:
                    for key in held: locks.remove(key)
            async def fetchval(sql, *args):
                if 'pg_try_advisory_xact_lock' in sql:
                    key = args[0]
                    if key in locks: return False
                    locks.add(key); held.append(key)
                    return True
                return None
            async def fetchrow(sql, *args):
                assert held, 'insert must retain the same transaction path lock'
                pending.append(('logo', args[2], args[0]))
                return {'id': args[2]}
            async def execute(sql, *args):
                assert held, 'embedding must retain transaction lock'
                if args[0] == 'failure.png': raise RuntimeError('embedding failure')
                pending.append(('embedding', args[0]))
            conn.transaction = transaction
            conn.fetchval = AsyncMock(side_effect=fetchval)
            conn.fetch = AsyncMock(return_value=[])
            conn.fetchrow = AsyncMock(side_effect=fetchrow)
            conn.execute = AsyncMock(side_effect=execute)
            yield conn
        async def embedding(image):
            if not entered.is_set():
                entered.set(); await release.wait()
            return np.array([0.2, 0.4])
        db.get_connection.side_effect = connection
        model.generate_embedding.side_effect = embedding
        first = asyncio.create_task(service.register_crop_as_reference('same.png', 'NUTRISCORE_A'))
        await entered.wait()
        conflict = await service.register_crop_as_reference('same.png', 'VEGAN')
        assert conflict == {'added': False, 'reason': 'registration-in-progress'}
        assert (await service.register_crop_as_reference('different.png', 'VEGAN'))['added']
        release.set()
        assert (await first)['added']
        assert [r for r in committed if r[0] == 'logo' and r[1] == 'same.png'] == [('logo', 'same.png', 'NUTRISCORE_A')]
        with pytest.raises(RuntimeError, match='embedding failure'):
            await service.register_crop_as_reference('failure.png', 'VEGAN')
        assert not any('failure.png' in record for record in committed)
        assert not locks
    asyncio.run(scenario())


def test_development_mount_uses_canonical_mapping():
    compose = (ROOT / 'docker-compose.full.yml').read_text()
    assert './apps/api/src/services/reference-code-mapping.json:/app/reference-code-mapping.json:ro' in compose


@pytest.mark.parametrize("code", ["GHS00", "GHS10", "NO_PICTOGRAM"])
def test_ghs_invalid_positive_reference_does_no_io(runtime, code):
    service, _, _, db, model, storage = runtime
    with pytest.raises(ValueError):
        asyncio.run(service.register_crop_as_reference("crop.png", code))
    db.get_connection.assert_not_called()
    model.generate_embedding.assert_not_called()
    storage.get_training_image.assert_not_called()


def test_ghs_alias_registration_metadata(runtime):
    service, _, conn, _, _, _ = runtime
    result = asyncio.run(service.register_crop_as_reference("crop.png", " ghs02 "))
    assert result["added"]
    assert conn.fetchrow.call_args.args[1:] == (
        "FLAME",
        "review:crop.png",
        "crop.png",
        "review-confirmed",
        "GHSSymbolDescriptionCode",
        "gHSSymbolDescriptionCode",
    )


@pytest.mark.parametrize("code", ["GHS00", "GHS10", "NO_PICTOGRAM"])
def test_invalid_ghs_reference_endpoint_422_no_io(runtime, code):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    _, art, _, db, _, storage = runtime
    app = FastAPI()
    app.include_router(art.router)
    response = TestClient(app).post(
        "/artwork/register-reference", json={"crop_path": "x", "t3777_code": code}
    )
    assert response.status_code == 422
    db.get_connection.assert_not_called()
    storage.get_training_image.assert_not_called()


@pytest.mark.parametrize("invalid", ["blank", "frame", "corrupt", "missing"])
def test_content_rejected_before_database_mutation(runtime, invalid):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from PIL import ImageDraw
    _, artwork, conn, db, model, storage = runtime
    output = io.BytesIO()
    image = Image.new('RGB', (200, 200), 'white')
    if invalid == 'frame':
        ImageDraw.Draw(image).rectangle((1, 1, 198, 198), outline='black')
    image.save(output, 'PNG')
    storage.get_training_image.return_value = b'corrupt' if invalid == 'corrupt' else output.getvalue()
    if invalid == 'missing':
        storage.get_training_image.side_effect = FileNotFoundError('missing')
    app = FastAPI()
    app.include_router(artwork.router)
    result = TestClient(app).post('/artwork/register-reference', json={'crop_path': 'blank.png', 't3777_code': 'NUTRISCORE_A'})
    assert result.status_code == 422
    db.get_connection.assert_not_called()
    conn.execute.assert_not_called()
    conn.fetchrow.assert_not_called()
    model.generate_embedding.assert_not_called()


def test_live_writer_blank_has_no_database_or_model_effect(runtime):
    _, _, conn, _, model, storage = runtime
    output = io.BytesIO()
    Image.new('RGB', (32, 32), 'white').save(output, 'PNG')
    storage.get_training_image.return_value = output.getvalue()
    spec = importlib.util.spec_from_file_location('realref_live_content_contract', ROOT / 'apps/ml-service/scripts/realref_live.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert not asyncio.run(module._add_ref(conn, model, storage, 'NUTRISCORE_A', 'blank.png', 'variant'))
    conn.fetchrow.assert_not_called()
    conn.execute.assert_not_called()
    model.generate_embedding.assert_not_called()
