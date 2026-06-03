"""Holdout Trainer Tests — ATDD RED PHASE (Epic 7, Stories 7.1 & 7.2).

Failing acceptance tests, generated BEFORE implementation (TDD red phase).
Elke test is geskipt met ``@pytest.mark.skip``; verwijder de marker per test
zodra de bijbehorende story geimplementeerd is.

Contract (Story 7.1 — FR41, NFR3, ML-service kant):
  * ``db_service.get_training_images(batch_id)`` sluit holdout-records uit
    op QUERY-niveau (niet via post-filtering in Python).
  * ``db_service.get_holdout_images()`` levert uitsluitend holdout-records.
  * ``TrainerService`` weigert te starten wanneer de holdout-set leeg is of
    onder het geconfigureerde minimum zakt.
  * Augmentatie raakt holdout-records nooit.

Contract (Story 7.2 — FR42):
  * Na training evalueert de trainer het beste model op de vaste holdout-set
    en registreert ``holdout_metrics`` (accuracy/precision/recall/f1 +
    holdout_size + holdout_hash) bij de modelversie.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'ml-service'))


# ---------------------------------------------------------------------------
# Story 7.1 — Holdout-uitsluiting in de trainer (P0)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_training_images_excludes_holdout_on_query_level():
    """Holdout-records mogen de trainingsselectie nooit bereiken (NFR3)."""
    from app.services.database import db_service

    with patch.object(db_service, "_execute_query", new=AsyncMock()) as mock_query:
        await db_service.get_training_images("batch-123")

        # De uitsluiting gebeurt in de query zelf — niet via Python-filtering.
        executed_sql = str(mock_query.call_args)
        assert "holdout" in executed_sql.lower()


@pytest.mark.asyncio
async def test_get_holdout_images_returns_only_holdout_records():
    """Er bestaat een aparte, expliciete holdout-selectie voor evaluatie."""
    from app.services.database import db_service

    images = await db_service.get_holdout_images()
    assert all(img.get("holdout") is True for img in images)


@pytest.mark.asyncio
async def test_training_refuses_to_start_with_empty_holdout_set():
    """Trainen zonder stabiel meetpunt is betekenisloos: hard weigeren."""
    from app.services.trainer import trainer_service, HoldoutSetTooSmallError

    with patch(
        "app.services.database.db_service.count_holdout_images",
        new=AsyncMock(return_value=0),
    ):
        with pytest.raises(HoldoutSetTooSmallError):
            await trainer_service.start_training(batch_id="batch-123", config=MagicMock())


@pytest.mark.asyncio
async def test_augmentation_never_touches_holdout_records():
    """Augmentatie-duplicatie mag uitsluitend op niet-holdout data plaatsvinden."""
    from app.services.trainer import trainer_service

    holdout_image = {"id": "img-holdout", "holdout": True, "label": "EU_ORGANIC_FARMING"}
    train_image = {"id": "img-train", "holdout": False, "label": "EU_ORGANIC_FARMING"}

    augmented = trainer_service.build_augmented_dataset([train_image, holdout_image])

    augmented_ids = [img["id"] for img in augmented]
    assert "img-holdout" not in augmented_ids
    assert "img-train" in augmented_ids


# ---------------------------------------------------------------------------
# Story 7.2 — Holdout-evaluatie en registratie (P0)
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="ATDD red phase — implementeer Story 7.2 en verwijder deze marker")
@pytest.mark.asyncio
async def test_completed_training_registers_holdout_metrics():
    """Elke modelversie krijgt holdout-metrics, onderscheiden van train/val."""
    from app.services.trainer import trainer_service

    with patch(
        "app.services.database.db_service.create_model_version", new=AsyncMock()
    ) as mock_create:
        await trainer_service.evaluate_and_register(model=MagicMock(), job_id="job-1")

        _, kwargs = mock_create.call_args
        metrics = kwargs.get("metrics") or {}
        holdout = metrics.get("holdout")
        assert holdout is not None, "holdout-metrics ontbreken bij modelregistratie"
        for key in ("accuracy", "precision", "recall", "f1"):
            assert key in holdout
        assert holdout["holdout_size"] > 0
        assert str(holdout["holdout_hash"]).startswith("sha256:")


@pytest.mark.skip(reason="ATDD red phase — implementeer Story 7.2 en verwijder deze marker")
@pytest.mark.asyncio
async def test_holdout_hash_is_stable_for_same_holdout_set():
    """Zelfde holdout-set ⇒ zelfde hash: het bewijs dat vergelijkingen eerlijk zijn."""
    from app.services.trainer import compute_holdout_hash

    ids = ["img-1", "img-2", "img-3"]
    assert compute_holdout_hash(ids) == compute_holdout_hash(list(reversed(ids)))
    assert compute_holdout_hash(ids) != compute_holdout_hash(ids + ["img-4"])
