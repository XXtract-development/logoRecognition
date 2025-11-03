# Multi-stage Dockerfile with Security Scanning
# STORY-007: Docker with Security Scanning

# Stage 1: Builder
FROM python:3.11-slim AS builder

# Security: Run as non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Security Scanner
FROM aquasec/trivy:latest AS scanner

# Copy installed packages for scanning
COPY --from=builder /root/.local /root/.local

# Run security scan
RUN trivy fs --no-progress --severity HIGH,CRITICAL /root/.local

# Stage 3: Production
FROM python:3.11-slim

# Security: Install security updates
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set up directories with proper permissions
RUN mkdir -p /app /var/log/app /var/cache/app && \
    chown -R appuser:appuser /app /var/log/app /var/cache/app

# Copy Python packages from builder
COPY --from=builder --chown=appuser:appuser /root/.local /home/appuser/.local

# Set working directory
WORKDIR /app

# Copy application code
COPY --chown=appuser:appuser . .

# Switch to non-root user
USER appuser

# Add local bin to PATH
ENV PATH=/home/appuser/.local/bin:$PATH

# Security: Set Python to run in unbuffered mode
ENV PYTHONUNBUFFERED=1

# Security: Disable Python bytecode generation
ENV PYTHONDONTWRITEBYTECODE=1

# Security: Set secure environment variables
ENV SECURE_SSL_REDIRECT=True
ENV SESSION_COOKIE_SECURE=True
ENV CSRF_COOKIE_SECURE=True

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Expose port (informational)
EXPOSE 8000

# Run with limited resources
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--limit-concurrency", "1000", \
     "--limit-max-requests", "10000", \
     "--timeout-keep-alive", "5"]