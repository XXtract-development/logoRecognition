"""
Health check endpoints for ML Service.
"""

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Response
from pydantic import BaseModel

from app.ml.model_manager import model_manager

router = APIRouter()


class HealthResponse(BaseModel):
    """Health check response model."""

    status: str
    timestamp: str
    version: str
    models_loaded: bool
    gpu_available: bool


class DetailedHealthResponse(BaseModel):
    """Detailed health check response."""

    status: str
    timestamp: str
    version: str
    components: Dict[str, Any]


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Basic health check endpoint.
    Returns service status and key metrics.
    """
    import torch

    return HealthResponse(
        status="healthy",
        timestamp=datetime.utcnow().isoformat(),
        version="1.0.0",
        models_loaded=model_manager.is_loaded,
        gpu_available=torch.cuda.is_available(),
    )


@router.get("/health/ready")
async def readiness_check(response: Response) -> Dict[str, Any]:
    """
    Kubernetes readiness probe.
    Returns 200 if service is ready to handle requests.
    """
    if not model_manager.is_loaded:
        response.status_code = 503
        return {
            "status": "not_ready",
            "reason": "Models not loaded",
        }

    return {
        "status": "ready",
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/health/live")
async def liveness_check() -> Dict[str, str]:
    """
    Kubernetes liveness probe.
    Returns 200 if service is alive.
    """
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/health/detailed", response_model=DetailedHealthResponse)
async def detailed_health_check() -> DetailedHealthResponse:
    """
    Detailed health check with component status.
    """
    import torch

    components = {
        "ml_models": {
            "status": "healthy" if model_manager.is_loaded else "degraded",
            "detection_model": model_manager.detection_model is not None,
            "embedding_model": model_manager.embedding_model is not None,
        },
        "gpu": {
            "available": torch.cuda.is_available(),
            "device_count": (
                torch.cuda.device_count() if torch.cuda.is_available() else 0
            ),
            "current_device": (
                torch.cuda.current_device() if torch.cuda.is_available() else None
            ),
        },
        "memory": {
            "gpu_allocated": (
                f"{torch.cuda.memory_allocated() / 1e9:.2f}GB"
                if torch.cuda.is_available()
                else "N/A"
            ),
            "gpu_cached": (
                f"{torch.cuda.memory_reserved() / 1e9:.2f}GB"
                if torch.cuda.is_available()
                else "N/A"
            ),
        },
    }

    overall_status = "healthy" if model_manager.is_loaded else "degraded"

    return DetailedHealthResponse(
        status=overall_status,
        timestamp=datetime.utcnow().isoformat(),
        version="1.0.0",
        components=components,
    )
