"""
Configuration settings for the application
"""
import os
from typing import Optional, List
from dataclasses import dataclass, field

def get_cors_origins() -> List[str]:
    """Get CORS origins from environment"""
    cors = os.getenv("CORS_ORIGINS", "*")
    return cors.split(",") if cors else ["*"]

@dataclass
class Settings:
    """Application settings"""

    # Redis settings
    REDIS_HOST: str = field(default_factory=lambda: os.getenv("REDIS_HOST", "localhost"))
    REDIS_PORT: int = field(default_factory=lambda: int(os.getenv("REDIS_PORT", "6379")))

    # MinIO settings
    MINIO_ENDPOINT: str = field(default_factory=lambda: os.getenv("MINIO_ENDPOINT", "localhost:9000"))
    MINIO_ACCESS_KEY: str = field(default_factory=lambda: os.getenv("MINIO_ACCESS_KEY", "minioadmin"))
    MINIO_SECRET_KEY: str = field(default_factory=lambda: os.getenv("MINIO_SECRET_KEY", "minioadmin"))
    MINIO_SECURE: bool = field(default_factory=lambda: os.getenv("MINIO_SECURE", "false").lower() == "true")
    MINIO_BUCKET: str = field(default_factory=lambda: os.getenv("MINIO_BUCKET", "optimized-images"))

    # Database settings
    DATABASE_URL: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "postgresql://user:password@localhost/logorecognition"))

    # Application settings
    SECRET_KEY: str = field(default_factory=lambda: os.getenv("SECRET_KEY", "your-secret-key-change-in-production"))
    API_PREFIX: str = field(default_factory=lambda: os.getenv("API_PREFIX", "/api/v1"))
    DEBUG: bool = field(default_factory=lambda: os.getenv("DEBUG", "false").lower() == "true")

    # Image optimization settings
    IMAGE_MAX_SIZE: int = field(default_factory=lambda: int(os.getenv("IMAGE_MAX_SIZE", "52428800")))  # 50MB
    IMAGE_OPTIMIZATION_WORKERS: int = field(default_factory=lambda: int(os.getenv("IMAGE_OPTIMIZATION_WORKERS", "4")))
    IMAGE_BATCH_SIZE: int = field(default_factory=lambda: int(os.getenv("IMAGE_BATCH_SIZE", "20")))
    IMAGE_SSIM_THRESHOLD: float = field(default_factory=lambda: float(os.getenv("IMAGE_SSIM_THRESHOLD", "0.95")))
    IMAGE_COMPRESSION_TARGET: float = field(default_factory=lambda: float(os.getenv("IMAGE_COMPRESSION_TARGET", "0.60")))

    # Celery settings
    CELERY_BROKER_URL: str = field(default_factory=lambda: os.getenv("CELERY_BROKER_URL", f"redis://localhost:6379/0"))
    CELERY_RESULT_BACKEND: str = field(default_factory=lambda: os.getenv("CELERY_RESULT_BACKEND", f"redis://localhost:6379/1"))

    # CORS settings
    CORS_ORIGINS: List[str] = field(default_factory=get_cors_origins)

    # JWT settings
    JWT_ALGORITHM: str = field(default_factory=lambda: "HS256")
    JWT_EXPIRATION_HOURS: int = field(default_factory=lambda: int(os.getenv("JWT_EXPIRATION_HOURS", "24")))

    # SMTP Configuration (US-INT-006)
    SMTP_HOST: str = field(default_factory=lambda: os.getenv("SMTP_HOST", "smtp.gmail.com"))
    SMTP_PORT: int = field(default_factory=lambda: int(os.getenv("SMTP_PORT", "587")))
    SMTP_USER: str = field(default_factory=lambda: os.getenv("SMTP_USER", ""))
    SMTP_PASSWORD: str = field(default_factory=lambda: os.getenv("SMTP_PASSWORD", ""))
    FROM_EMAIL: str = field(default_factory=lambda: os.getenv("FROM_EMAIL", "noreply@logorecognition.com"))

    # Frontend URL (US-INT-006)
    FRONTEND_URL: str = field(default_factory=lambda: os.getenv("FRONTEND_URL", "http://localhost:4001"))

    # Model versioning
    MODEL_VERSION: str = field(default_factory=lambda: os.getenv("MODEL_VERSION", "v1.0.0"))
    PREVIOUS_MODEL_VERSION: Optional[str] = field(default_factory=lambda: os.getenv("PREVIOUS_MODEL_VERSION", None))

    @property
    def REDIS_URL(self) -> str:
        """Generate Redis URL from host and port"""
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}"

# Create settings instance
settings = Settings()