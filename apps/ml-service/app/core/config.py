"""
Configuration settings for ML Service.
Uses pydantic-settings for environment variable management.
"""

from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8000"]

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/logo_recognition"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # MinIO / S3
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "logo-recognition"
    MINIO_USE_SSL: bool = False

    # ML Model Configuration
    MODEL_PATH: str = "/app/models"
    TORCH_HOME: str = "/app/models/torch"
    ONNX_MODEL_PATH: str = "/app/models/efficientdet.onnx"

    # Detection settings
    CONFIDENCE_THRESHOLD: float = 0.99
    NMS_THRESHOLD: float = 0.5
    MAX_DETECTIONS: int = 100

    # Embedding settings
    EMBEDDING_DIM: int = 512
    EMBEDDING_MODEL: str = "efficientnet_b0"

    # Reference nearest-neighbour search (Story 19.14): the ivfflat index on
    # reference_embeddings was created WITH (lists=100) on a few-hundred-row
    # table. With the default ivfflat.probes=1 the search scans a single
    # near-empty cluster and returns the nearest row *within that one cluster* —
    # the wrong top-1, not the true nearest neighbour (the flywheel callers use
    # limit=1, so this is a correctness bug, not merely a count shortfall).
    # Setting probes >= the index's ``lists`` makes the scan cover every cluster
    # and restores exact top-1. Keep this >= the index lists (currently 100): if
    # lists is ever raised on a REINDEX, raise this too or the under-recall
    # returns. Applied via set_config(..., is_local=true) inside a transaction in
    # find_similar_references. Must be >= 1 (Postgres rejects probes < 1), hence
    # the ge=1 guard — a 0/negative override would otherwise abort every search.
    REFERENCE_SEARCH_PROBES: int = Field(default=100, ge=1)

    # Training settings
    TRAINING_BATCH_SIZE: int = 16
    TRAINING_EPOCHS: int = 100
    TRAINING_LEARNING_RATE: float = 0.001
    AUGMENTATION_FACTOR: int = 50

    # Feature flags
    ENABLE_GPU: bool = False
    ENABLE_CACHING: bool = True
    CACHE_TTL: int = 3600  # 1 hour

    @property
    def device(self) -> str:
        """Get the compute device (cuda or cpu)."""
        if self.ENABLE_GPU:
            try:
                import torch

                if torch.cuda.is_available():
                    return "cuda"
            except ImportError:
                pass
        return "cpu"


# Global settings instance
settings = Settings()
