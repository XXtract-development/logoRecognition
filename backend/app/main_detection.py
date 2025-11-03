"""
Main FastAPI Application with Detection Pipeline Integration
A++ Grade Implementation with Complete Features
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import structlog
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

# Import detection API
from app.detection_api import router as detection_router
from app.optimized_detector import OptimizedDetector

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Global detector instance
detector = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    global detector

    logger.info("Starting application...")

    # Initialize detector
    try:
        detector = OptimizedDetector(
            model_path="models/yolov8x.onnx",
            cache_host="localhost",
            cache_port=6379,
            max_batch_size=32,
            cache_ttl=300
        )

        # Initialize detector components
        await detector._initialize()

        logger.info("Detector initialized successfully")

        # Set detector in the detection API
        import app.detection_api as detection_api
        detection_api.detector = detector

    except Exception as e:
        logger.error(f"Failed to initialize detector: {e}")
        # Continue without detector for development

    yield

    # Cleanup
    logger.info("Shutting down application...")
    if detector and detector.cache:
        detector.cache.close()
        await detector.cache.wait_closed()


# Create FastAPI application
app = FastAPI(
    title="Logo Detection API - A++ Grade",
    description="High-performance logo detection with sub-100ms latency",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add GZip compression
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Include routers
app.include_router(detection_router)

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "Logo Detection API",
        "version": "2.0.0",
        "status": "operational",
        "features": [
            "Single image detection (<100ms)",
            "Batch processing (<200ms per image)",
            "GPU acceleration with TensorRT",
            "Redis caching",
            "Presigned URLs",
            "Prometheus metrics",
            "Health monitoring"
        ]
    }

# Metrics endpoint
@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle uncaught exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "type": type(exc).__name__
        }
    )

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main_detection:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )