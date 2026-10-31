# Logo Recognition ML Service - Dockerfile
# Multi-stage build for optimized production image

# ============================================
# Stage 1: Builder
# ============================================
FROM python:3.11-slim as builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY apps/ml-service/requirements.txt .

# Create virtual environment and install dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# K4-aa scan route: SigLIP 2 image tower + preprocessing, pinned revision, baked into
# the image outside /app/models so a scan never downloads (HF_HUB_OFFLINE=1 below).
RUN python -c "from transformers import SiglipImageProcessor, SiglipVisionModel; \
r = 'f775b65a79762255128c981547af89addcfe0f88'; n = 'google/siglip2-base-patch16-384'; \
SiglipVisionModel.from_pretrained(n, revision=r).save_pretrained('/opt/siglip2-vision'); \
SiglipImageProcessor.from_pretrained(n, revision=r).save_pretrained('/opt/siglip2-vision')" && \
    HF_HUB_OFFLINE=1 python -c "import torch; from PIL import Image; \
from transformers import SiglipImageProcessor, SiglipVisionModel; p = '/opt/siglip2-vision'; \
m = SiglipVisionModel.from_pretrained(p).eval(); x = SiglipImageProcessor.from_pretrained(p)(images=[Image.new('RGB', (64, 64))], return_tensors='pt'); \
s = tuple(m(**x).pooler_output.shape); assert s == (1, 768), s" && \
    chmod -R a+rX /opt/siglip2-vision && rm -rf /root/.cache/huggingface

# ============================================
# Stage 2: Runtime
# ============================================
FROM python:3.11-slim as runtime

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /opt/siglip2-vision /opt/siglip2-vision
ENV PATH="/opt/venv/bin:$PATH"

# Create non-root user for security
RUN groupadd -r mlservice && useradd -r -g mlservice mlservice

# Create directories
RUN mkdir -p /app/models /app/logs /app/temp && \
    chown -R mlservice:mlservice /app

# Copy application code
COPY --chown=mlservice:mlservice apps/ml-service/app/ /app/app/

COPY --chown=mlservice:mlservice apps/api/src/services/reference-code-mapping.json /app/reference-code-mapping.json

# Switch to non-root user
USER mlservice

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8001 \
    HOST=0.0.0.0 \
    MODEL_PATH=/app/models \
    TORCH_HOME=/app/models/torch \
    HF_HUB_OFFLINE=1 \
    K4AA_SIGLIP_PATH=/opt/siglip2-vision

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -sf -o /dev/null http://localhost:${PORT:-8001}/health || exit 1

# Run the application
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}
