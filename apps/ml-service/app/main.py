"""
Logo Recognition ML Service - Main Application
FastAPI application for logo detection, training, and inference.
"""

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app

from app.api import health, detection, training, models, artwork as artwork_api, pipeline as pipeline_api
from app.core.config import settings
from app.core.logging import setup_logging, logger
from app.ml.model_manager import model_manager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Application lifespan manager for startup and shutdown."""
    # Startup
    logger.info("Starting ML Service...")

    # Setup logging
    setup_logging()

    # Connect to database
    try:
        from app.services.database import db_service
        await db_service.connect()
        logger.info("Database connected successfully")
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        # Continue startup - database operations will fail gracefully

    # Connect to storage
    try:
        from app.services.storage import storage_service
        storage_service.connect()
        logger.info("Storage connected successfully")
    except Exception as e:
        logger.error(f"Failed to connect to storage: {e}")
        # Continue startup - storage operations will fail gracefully

    # Load ML models
    try:
        await model_manager.load_models()
        logger.info("ML models loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load ML models: {e}")
        # Continue startup even if models fail to load
        # They can be loaded on-demand

    # Build the reference keurmerk embedding index (Epic 8, Story 8.4).
    # One embedding per active reference variant, used to classify localised
    # crops via pgvector cosine. Non-fatal: if it fails, classification falls
    # back to the classifier route / UNKNOWN.
    try:
        from app.services.similarity import similarity_service
        summary = await similarity_service.rebuild_reference_embeddings()
        logger.info("Reference embedding index built", extra=summary)
    except Exception as e:
        logger.error(f"Failed to build reference embedding index: {e}")

    logger.info(f"ML Service started on {settings.HOST}:{settings.PORT}")

    yield

    # Shutdown
    logger.info("Shutting down ML Service...")
    await model_manager.unload_models()

    # Disconnect from services
    try:
        from app.services.database import db_service
        await db_service.disconnect()
    except Exception:
        pass

    logger.info("ML Service shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="Logo Recognition ML Service",
    description="Machine Learning service for logo detection, training, and inference",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics endpoint
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# Include API routers
app.include_router(health.router, tags=["Health"])
app.include_router(detection.router, prefix="/ml", tags=["Detection"])
app.include_router(training.router, prefix="/ml", tags=["Training"])
app.include_router(models.router, prefix="/ml", tags=["Models"])
app.include_router(artwork_api.router, prefix="/ml", tags=["Artwork"])
app.include_router(pipeline_api.router, prefix="/ml", tags=["Pipeline"])


@app.get("/")
async def root():
    """Root endpoint with service information."""
    return {
        "service": "Logo Recognition ML Service",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs" if settings.DEBUG else "disabled",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
