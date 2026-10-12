"""A weak deterministic letter may only be confirmed by trained agreement."""

import functools
import importlib
from unittest.mock import AsyncMock, Mock

import numpy as np
import pytest


@pytest.fixture
def corroboration(monkeypatch, tmp_path):
    from app.core.config import settings

    monkeypatch.setattr(settings, "MODEL_PATH", str(tmp_path / "models"))
    # Suite isolation can restore sys.modules while leaving parent-package
    # attributes stale. Patch the same current modules that lazy runtime imports
    # resolve, and keep asserting the actual bounded callback's identity.
    artwork = importlib.import_module("app.api.artwork")
    classification = importlib.import_module("app.services.classification")
    ghs_reference = importlib.import_module("app.services.ghs_reference")
    nutriscore_reader = importlib.import_module("app.services.nutriscore_reader")
    nutriscore_a2 = importlib.import_module("app.services.nutriscore_a2")

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
@pytest.mark.parametrize("strict,threshold", [(False, 0.99), (True, 0.85)])
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


# --- spec-logo-scan-robustness AC-5.3 (besluit productowner 12-10-2026: weinig valse
# meldingen gaat vóór zoveel mogelijk vinden). De scanpijplijn stuurt geen drempel
# meer mee; voor de Nutri-Score-familie geldt in strikte runtime dan toch de vaste
# lat 0,99, zodat het gedrag identiek is aan vóór de PR.


@pytest.mark.asyncio
@pytest.mark.parametrize("letter,score", [("A", 0.9999), ("B", 0.989), (None, 0.9999)])
async def test_ac_5_3_pipeline_head_without_corroboration_stays_uncertain(
    corroboration, letter, score
):
    classification, predict, _, _ = corroboration
    predict.return_value = (letter, score, {})
    result = await classification.classify_crop(
        np.zeros((20, 20, 3), dtype=np.uint8), strict_runtime=True
    )
    assert result == {
        "t3777_code": "NUTRISCORE_B",
        "confidence": 0.869,
        "method": "nutriscore-head",
        "uncertain": True,
    }
    predict.assert_called_once()


@pytest.mark.asyncio
async def test_ac_5_3_pipeline_head_with_corroboration_is_confirmed(corroboration):
    classification, predict, _, _ = corroboration
    result = await classification.classify_crop(
        np.zeros((20, 20, 3), dtype=np.uint8), strict_runtime=True
    )
    assert result["t3777_code"] == "NUTRISCORE_B"
    assert result["method"] == "nutriscore-a2"
    assert result["confidence"] == 0.999698877
    assert result["uncertain"] is False


@pytest.mark.asyncio
async def test_ac_5_3_pipeline_embedding_letter_below_bar_stays_uncertain(
    corroboration, monkeypatch
):
    """Geen balk gelezen; de embedding zegt NUTRISCORE_C met 0,90. Vóór de PR (0,99)
    was dat onzeker en opende het A2-vangnet; dat blijft zo."""
    classification, predict, embedding, _ = corroboration
    reader = importlib.import_module("app.services.nutriscore_reader")
    monkeypatch.setattr(reader, "read_nutriscore", lambda crop: (None, {}))
    embedding.side_effect = None
    embedding.return_value = {
        "t3777_code": "NUTRISCORE_C",
        "confidence": 0.9,
        "method": "embedding",
    }
    predict.return_value = (None, 0.0, {})
    classifier = AsyncMock(return_value=None)
    monkeypatch.setattr(classification, "_classify_via_classifier", classifier)
    result = await classification.classify_crop(
        np.zeros((20, 20, 3), dtype=np.uint8), strict_runtime=True
    )
    assert result["t3777_code"] == "NUTRISCORE_C"
    assert result["uncertain"] is True
    predict.assert_called_once()


@pytest.mark.asyncio
async def test_ac_5_3_non_nutriscore_embedding_keeps_per_method_threshold(
    corroboration, monkeypatch
):
    """De rest van R3 blijft: een ander keurmerk op 0,90 is niet onzeker."""
    classification, predict, embedding, _ = corroboration
    reader = importlib.import_module("app.services.nutriscore_reader")
    monkeypatch.setattr(reader, "read_nutriscore", lambda crop: (None, {}))
    embedding.side_effect = None
    embedding.return_value = {
        "t3777_code": "EU_ORGANIC_FARMING",
        "confidence": 0.9,
        "method": "embedding",
    }
    result = await classification.classify_crop(
        np.zeros((20, 20, 3), dtype=np.uint8), strict_runtime=True
    )
    assert result == {
        "t3777_code": "EU_ORGANIC_FARMING",
        "confidence": 0.9,
        "method": "embedding",
    }
    predict.assert_not_called()


@pytest.mark.asyncio
async def test_ac_5_3_classifier_nutriscore_below_bar_stays_uncertain(
    corroboration, monkeypatch
):
    """Reserveclassifier: een Nutri-Score-letter onder 0,99 is onzeker en wint niet
    van het onzekere embedding-resultaat (zoals vóór de PR)."""
    classification, predict, embedding, _ = corroboration
    reader = importlib.import_module("app.services.nutriscore_reader")
    monkeypatch.setattr(reader, "read_nutriscore", lambda crop: (None, {}))
    embedding.side_effect = None
    embedding.return_value = {
        "t3777_code": "EU_ORGANIC_FARMING",
        "confidence": 0.6,
        "method": "embedding",
        "uncertain": True,
    }
    classifier = AsyncMock(
        return_value={
            "t3777_code": "NUTRISCORE_B",
            "confidence": 0.9,
            "method": "classifier",
        }
    )
    monkeypatch.setattr(classification, "_classify_via_classifier", classifier)
    result = await classification.classify_crop(
        np.zeros((20, 20, 3), dtype=np.uint8), strict_runtime=True
    )
    assert result["uncertain"] is True
    assert result["t3777_code"] == "EU_ORGANIC_FARMING"
    predict.assert_not_called()
