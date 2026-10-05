"""A weak deterministic letter may only be confirmed by trained agreement."""

import functools
from unittest.mock import AsyncMock, Mock

import numpy as np
import pytest


@pytest.fixture
def corroboration(monkeypatch, tmp_path):
    from app.core.config import settings

    monkeypatch.setattr(settings, "MODEL_PATH", str(tmp_path / "models"))
    from app.api import artwork
    from app.services import (
        classification,
        ghs_reference,
        nutriscore_reader,
        nutriscore_a2,
    )

    monkeypatch.setattr(ghs_reference, "classify_ghs", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        nutriscore_reader, "read_nutriscore", lambda crop: ("B", {"ratio": 1.24})
    )

    async def blocking(function, *args, **kwargs):
        return function(*args, **kwargs)

    monkeypatch.setattr(artwork, "strict_blocking", blocking)
    predict = Mock(
        return_value=("B", 0.999698877, {"pred": "B", "probs": {"B": 0.999698877}})
    )
    monkeypatch.setattr(nutriscore_a2, "predict_letter", predict)
    embedding = AsyncMock(
        side_effect=AssertionError("head route should not use embeddings")
    )
    monkeypatch.setattr(classification, "_classify_via_embedding", embedding)
    return classification, predict, embedding, artwork


@pytest.mark.asyncio
async def test_strict_trained_same_letter_confirms_with_actual_score_and_bounded_reader(
    corroboration,
):
    classification, predict, embedding, artwork = corroboration
    crop = np.zeros((20, 20, 3), dtype=np.uint8)
    result = await classification.classify_crop(
        crop, confidence_threshold=0.99, strict_runtime=True
    )
    assert result["t3777_code"] == "NUTRISCORE_B"
    assert result["confidence"] == 0.999698877
    assert result["method"] == "nutriscore-a2"
    assert result["uncertain"] is False
    assert result["evidence"]["head_letter"] == "B"
    assert result["evidence"]["head_score"] == 0.869
    assert result["evidence"]["trained_model"]["pred"] == "B"
    callback = predict.call_args.kwargs["load_bytes"]
    assert isinstance(callback, functools.partial)
    assert callback.func is artwork._training_image_bytes
    assert callback.keywords == {"strict_runtime": True}
    embedding.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("letter,score", [("A", 0.9999), ("B", 0.989), (None, 0.9999)])
async def test_disagreement_weak_or_abstaining_model_cannot_confirm_head(
    corroboration, letter, score
):
    classification, predict, _, _ = corroboration
    predict.return_value = (letter, score, {})
    result = await classification.classify_crop(
        np.zeros((20, 20, 3), dtype=np.uint8),
        confidence_threshold=0.99,
        strict_runtime=True,
    )
    assert result == {
        "t3777_code": "NUTRISCORE_B",
        "confidence": 0.869,
        "method": "nutriscore-head",
        "uncertain": True,
    }


@pytest.mark.asyncio
async def test_a2_operational_failure_propagates_instead_of_uncertain_success(
    corroboration,
):
    classification, predict, _, _ = corroboration
    predict.side_effect = RuntimeError("bounded artifact unavailable")
    with pytest.raises(RuntimeError, match="unavailable"):
        await classification.classify_crop(
            np.zeros((20, 20, 3), dtype=np.uint8),
            confidence_threshold=0.99,
            strict_runtime=True,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "strict,threshold", [(False, 0.99), (True, None), (True, 0.85)]
)
async def test_existing_or_sufficient_head_never_invokes_a2(
    corroboration, strict, threshold
):
    classification, predict, _, _ = corroboration
    result = await classification.classify_crop(
        np.zeros((20, 20, 3), dtype=np.uint8),
        confidence_threshold=threshold,
        strict_runtime=strict,
    )
    assert result["method"] == "nutriscore-head"
    assert result["confidence"] == 0.869
    predict.assert_not_called()
