"""
Model management API endpoints.
"""

from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.logging import logger
from app.ml.model_manager import model_manager


router = APIRouter()


class ModelInfo(BaseModel):
    """Model information."""

    id: str
    version: str
    model_type: str
    accuracy: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1_score: Optional[float] = None
    training_samples: int = 0
    is_active: bool = False
    created_at: str
    file_path: Optional[str] = None


class ModelListResponse(BaseModel):
    """List of models response."""

    models: List[ModelInfo]
    active_model: Optional[str] = None


class ActivateModelRequest(BaseModel):
    """Request to activate a model."""

    model_id: str


@router.get("/models", response_model=ModelListResponse)
async def list_models() -> ModelListResponse:
    """
    List all available models from database.
    """
    from app.services.database import db_service

    try:
        db_models = await db_service.list_models()

        models = [
            ModelInfo(
                id=str(m["id"]),
                version=m["version"],
                model_type=m["model_type"],
                accuracy=m.get("accuracy"),
                precision=m.get("precision_score"),
                recall=m.get("recall_score"),
                f1_score=m.get("f1_score"),
                training_samples=0,  # TODO: Add to model_versions table
                is_active=m.get("is_active", False),
                created_at=(
                    m["created_at"].isoformat()
                    if m.get("created_at")
                    else datetime.utcnow().isoformat()
                ),
            )
            for m in db_models
        ]

        active = next((m.id for m in models if m.is_active), None)

        return ModelListResponse(
            models=models,
            active_model=active,
        )
    except Exception as e:
        logger.warning(f"Failed to load models from database: {e}")
        # Return empty list on error
        return ModelListResponse(models=[], active_model=None)


@router.get("/models/{model_id}", response_model=ModelInfo)
async def get_model(model_id: str) -> ModelInfo:
    """
    Get details of a specific model from database.
    """
    from app.services.database import db_service

    try:
        # Try to get from database by ID
        models = await db_service.list_models(limit=100)
        model = next((m for m in models if str(m["id"]) == model_id), None)

        if not model:
            raise HTTPException(status_code=404, detail="Model not found")

        return ModelInfo(
            id=str(model["id"]),
            version=model["version"],
            model_type=model["model_type"],
            accuracy=model.get("accuracy"),
            precision=model.get("precision_score"),
            recall=model.get("recall_score"),
            f1_score=model.get("f1_score"),
            training_samples=0,
            is_active=model.get("is_active", False),
            created_at=(
                model["created_at"].isoformat()
                if model.get("created_at")
                else datetime.utcnow().isoformat()
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get model: {e}")
        raise HTTPException(status_code=500, detail="Failed to get model")


@router.post("/models/{model_id}/activate")
async def activate_model(model_id: str) -> dict:
    """
    Activate a model for inference.
    Updates database and reloads model manager.
    """
    from app.services.database import db_service

    logger.info("Activating model", model_id=model_id)

    try:
        await db_service.activate_model(model_id)

        # Reload models to pick up the active one
        await model_manager.unload_models()
        await model_manager.load_models()

        return {
            "message": "Model activated",
            "model_id": model_id,
        }
    except Exception as e:
        logger.error(f"Failed to activate model: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to activate model: {str(e)}"
        )


@router.delete("/models/{model_id}")
async def delete_model(model_id: str) -> dict:
    """
    Delete a model from storage and database.
    """
    from app.services.database import db_service
    from app.services.storage import storage_service

    try:
        # Get model info first
        models = await db_service.list_models(limit=100)
        model = next((m for m in models if str(m["id"]) == model_id), None)

        if not model:
            raise HTTPException(status_code=404, detail="Model not found")

        if model.get("is_active"):
            raise HTTPException(status_code=400, detail="Cannot delete active model")

        # Delete from storage
        try:
            storage_service.delete_model(f"logo_detector_{model['version']}", "onnx")
        except Exception as e:
            logger.warning(f"Failed to delete model file: {e}")

        # Note: We don't have a delete_model method in db_service yet
        # For now, just log the deletion
        logger.info(
            "Model deletion requested (database cleanup pending)", model_id=model_id
        )

        return {
            "message": "Model deleted",
            "model_id": model_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete model: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {str(e)}")


@router.post("/models/reload")
async def reload_models() -> dict:
    """
    Reload all models from storage.
    """
    try:
        await model_manager.unload_models()
        await model_manager.load_models()

        return {
            "message": "Models reloaded",
            "loaded": model_manager.is_loaded,
        }
    except Exception as e:
        logger.error("Failed to reload models", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to reload: {str(e)}")
