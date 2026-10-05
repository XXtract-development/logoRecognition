"""Strict lower helpers retain real failures and use request-bounded readers."""

import asyncio
import json
from unittest.mock import Mock

import numpy as np
import pytest


@pytest.fixture(autouse=True)
def isolated_model_path(monkeypatch, tmp_path):
    from app.core.config import settings

    monkeypatch.setattr(settings, "MODEL_PATH", str(tmp_path / "models"))


def test_real_ghs_backend_negative_requires_available_specialist(monkeypatch):
    from app.services import ghs_reference, ghs_specialist

    failure = RuntimeError("model missing")
    monkeypatch.setattr(ghs_specialist, "load_model", Mock(side_effect=failure))
    # A blank image yields no proposals, but is not a valid negative when the
    # required trained backend is unavailable.
    with pytest.raises(RuntimeError, match="model missing"):
        ghs_reference.detect_ghs(
            np.zeros((20, 20, 3), dtype=np.uint8), strict_runtime=True
        )


def test_real_ghs_photo_backend_failure_propagates_only_in_strict_mode(monkeypatch):
    from app.services import ghs_reference, ghs_specialist

    ghs_reference.references()  # Validate the actual official assets first.
    monkeypatch.setattr(ghs_specialist, "load_model", lambda: None)
    monkeypatch.setattr(ghs_reference, "regions", lambda *args, **kwargs: [])
    monkeypatch.setattr(
        ghs_reference,
        "_photo_recovery",
        Mock(side_effect=RuntimeError("recovery unavailable")),
    )
    image = np.zeros((20, 20, 3), dtype=np.uint8)
    assert ghs_reference.detect_ghs(image) == []
    with pytest.raises(RuntimeError, match="recovery unavailable"):
        ghs_reference.detect_ghs(image, strict_runtime=True)


def test_real_a2_loader_reads_both_artifacts_through_bounded_callback(monkeypatch):
    from app.services import nutriscore_a2, storage

    monkeypatch.setattr(nutriscore_a2, "_model", None)
    monkeypatch.setattr(nutriscore_a2, "_fail_until", 0)
    original = Mock(side_effect=AssertionError("global reader must not run"))
    monkeypatch.setattr(storage.storage_service, "get_training_image", original)

    def bounded_reader(key):
        if key.endswith(".json"):
            return json.dumps({"classes": ["A", "B", "C", "D", "E", "none"]}).encode()
        raise RuntimeError("bounded artifact read failed")

    reader = Mock(side_effect=bounded_reader)
    with pytest.raises(RuntimeError, match="bounded artifact read failed"):
        nutriscore_a2._load(load_bytes=reader)
    assert [call.args[0] for call in reader.call_args_list] == [
        nutriscore_a2._META_KEY_DEFAULT,
        nutriscore_a2._MODEL_KEY_DEFAULT,
    ]
    original.assert_not_called()


def test_existing_async_embedding_uses_same_sync_implementation(monkeypatch):
    from app.ml.model_manager import model_manager

    expected = np.ones(512, dtype=np.float32)
    delegate = Mock(return_value=expected)
    monkeypatch.setattr(model_manager, "generate_embedding_sync", delegate)
    image = object()
    assert asyncio.run(model_manager.generate_embedding(image)) is expected
    delegate.assert_called_once_with(image)


@pytest.mark.asyncio
async def test_actual_torch_embedding_body_runs_off_loop_and_keeps_loop_responsive(
    monkeypatch,
):
    import threading
    import torch
    from PIL import Image
    from app.api import artwork
    from app.ml.model_manager import ModelManager

    started = threading.Event()
    release = threading.Event()
    main_thread = threading.get_ident()
    seen_threads = []

    class BlockingBackbone(torch.nn.Module):
        def forward(self, inputs):
            seen_threads.append(threading.get_ident())
            started.set()
            if not release.wait(2):
                raise RuntimeError("test did not release backbone")
            return torch.ones((1, 512))

    manager = ModelManager()
    manager._device = "cpu"
    manager.embedding_model = BlockingBackbone()
    control = artwork.StrictRuntimeControl(None, 2000)
    token = artwork._STRICT_CONTROL.set(control)
    operation = asyncio.create_task(
        artwork.strict_blocking(
            manager.generate_embedding_sync,
            Image.new("RGB", (20, 20)),
            strict_runtime=True,
        )
    )
    try:
        for _ in range(100):
            if started.is_set():
                break
            await asyncio.sleep(0.005)
        assert started.is_set()
        assert not operation.done()
        assert seen_threads == [seen_threads[0]] and seen_threads[0] != main_thread
        # This assertion is reached while genuine preprocessing/inference body
        # is waiting in forward; event-loop work is still able to progress.
        await asyncio.sleep(0)
        release.set()
        embedding = await operation
        assert embedding.shape == (512,)
        assert np.all(embedding == 1)
    finally:
        release.set()
        await asyncio.gather(operation, return_exceptions=True)
        artwork._STRICT_CONTROL.reset(token)
