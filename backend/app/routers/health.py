"""
Health Check Router
Provides comprehensive health monitoring for the application
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List, Optional
from datetime import datetime
import asyncio
import os
from pydantic import BaseModel
import asyncpg
import redis
import httpx
import socket

router = APIRouter(prefix="/health", tags=["health"])

class EndpointHealth(BaseModel):
    """Model for individual endpoint health status"""
    endpoint: str
    method: str
    status: str
    response_time_ms: Optional[float] = None
    error: Optional[str] = None

class ServiceHealth(BaseModel):
    """Model for external service health status"""
    service: str
    status: str
    latency_ms: Optional[float] = None
    error: Optional[str] = None

class HealthResponse(BaseModel):
    """Complete health check response"""
    status: str
    timestamp: datetime
    version: str
    services: Dict[str, ServiceHealth]
    endpoints: List[EndpointHealth]
    system: Dict[str, Any]

async def check_postgres() -> ServiceHealth:
    """Check PostgreSQL connectivity"""
    start = datetime.now()
    try:
        conn = await asyncpg.connect(
            host=os.getenv("DB_HOST", "localhost"),
            port=int(os.getenv("DB_PORT", 5432)),
            user=os.getenv("DB_USER", "logo_user"),
            password=os.getenv("DB_PASSWORD", "secure_password_123"),
            database=os.getenv("DB_NAME", "logo_recognition"),
            timeout=5
        )
        await conn.fetchval("SELECT 1")
        await conn.close()
        latency = (datetime.now() - start).total_seconds() * 1000
        return ServiceHealth(
            service="postgresql",
            status="healthy",
            latency_ms=round(latency, 2)
        )
    except Exception as e:
        return ServiceHealth(
            service="postgresql",
            status="unhealthy",
            error=str(e)
        )

async def check_redis() -> ServiceHealth:
    """Check Redis connectivity"""
    start = datetime.now()
    try:
        r = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            decode_responses=True,
            socket_connect_timeout=5
        )
        r.ping()
        latency = (datetime.now() - start).total_seconds() * 1000
        return ServiceHealth(
            service="redis",
            status="healthy",
            latency_ms=round(latency, 2)
        )
    except Exception as e:
        return ServiceHealth(
            service="redis",
            status="degraded",  # Redis is optional
            error=str(e)
        )

async def check_minio() -> ServiceHealth:
    """Check MinIO connectivity"""
    start = datetime.now()
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                f"http://{os.getenv('MINIO_HOST', 'localhost')}:9000/minio/health/live"
            )
            response.raise_for_status()
            latency = (datetime.now() - start).total_seconds() * 1000
            return ServiceHealth(
                service="minio",
                status="healthy",
                latency_ms=round(latency, 2)
            )
    except Exception as e:
        return ServiceHealth(
            service="minio",
            status="degraded",
            error=str(e)
        )

async def check_endpoints() -> List[EndpointHealth]:
    """Check critical API endpoints"""
    endpoints_to_check = [
        ("GET", "/"),
        ("GET", "/api/v1/logos"),
        ("GET", "/api/v1/training/dataset"),
        ("GET", "/api/v1/training/jobs"),
        ("GET", "/api/training/readiness"),
        ("GET", "/api/categories"),
        ("GET", "/api/annotation-metrics/sufficiency/test/test"),
    ]

    results = []
    async with httpx.AsyncClient(timeout=5) as client:
        for method, endpoint in endpoints_to_check:
            start = datetime.now()
            try:
                if method == "GET":
                    response = await client.get(f"http://localhost:8000{endpoint}")
                    latency = (datetime.now() - start).total_seconds() * 1000

                    # Special handling for health endpoints
                    if endpoint == "/" or response.status_code < 500:
                        status = "healthy"
                    else:
                        status = "unhealthy"

                    results.append(EndpointHealth(
                        endpoint=endpoint,
                        method=method,
                        status=status,
                        response_time_ms=round(latency, 2)
                    ))
            except Exception as e:
                results.append(EndpointHealth(
                    endpoint=endpoint,
                    method=method,
                    status="unhealthy",
                    error=str(e)
                ))

    return results

@router.get("/", response_model=HealthResponse)
async def health_check():
    """
    Comprehensive health check endpoint
    Returns the health status of all services and critical endpoints
    """
    # Check all services in parallel
    postgres_task = asyncio.create_task(check_postgres())
    redis_task = asyncio.create_task(check_redis())
    minio_task = asyncio.create_task(check_minio())
    endpoints_task = asyncio.create_task(check_endpoints())

    # Wait for all checks to complete
    postgres_health = await postgres_task
    redis_health = await redis_task
    minio_health = await minio_task
    endpoint_results = await endpoints_task

    # Determine overall status
    critical_services = [postgres_health]
    if any(s.status == "unhealthy" for s in critical_services):
        overall_status = "unhealthy"
    elif redis_health.status == "unhealthy" or minio_health.status == "unhealthy":
        overall_status = "degraded"
    elif any(e.status == "unhealthy" for e in endpoint_results if e.endpoint in ["/", "/api/v1/logos"]):
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    # Get system info
    system_info = {
        "hostname": socket.gethostname(),
        "python_version": os.sys.version,
        "process_id": os.getpid(),
        "environment": os.getenv("ENVIRONMENT", "development")
    }

    return HealthResponse(
        status=overall_status,
        timestamp=datetime.now(),
        version="1.0.0",
        services={
            "postgresql": postgres_health,
            "redis": redis_health,
            "minio": minio_health
        },
        endpoints=endpoint_results,
        system=system_info
    )

@router.get("/live")
async def liveness():
    """
    Simple liveness probe for Kubernetes
    Returns 200 if the application is running
    """
    return {"status": "alive", "timestamp": datetime.now()}

@router.get("/ready")
async def readiness():
    """
    Readiness probe for Kubernetes
    Returns 200 if the application is ready to serve requests
    """
    # Quick check of critical services
    try:
        postgres_health = await check_postgres()
        if postgres_health.status == "unhealthy":
            raise HTTPException(status_code=503, detail="Database not ready")
        return {"status": "ready", "timestamp": datetime.now()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service not ready: {str(e)}")

@router.get("/startup")
async def startup_check():
    """
    Startup probe for application initialization
    Checks if all required services are available
    """
    results = {
        "timestamp": datetime.now(),
        "checks": {}
    }

    # Check each service
    checks = [
        ("database", check_postgres()),
        ("cache", check_redis()),
        ("storage", check_minio())
    ]

    for name, check_coro in checks:
        service = await check_coro
        results["checks"][name] = {
            "status": service.status,
            "latency_ms": service.latency_ms,
            "error": service.error
        }

    # Determine if startup is successful
    if results["checks"]["database"]["status"] == "unhealthy":
        raise HTTPException(status_code=503, detail="Startup failed: Database unavailable")

    results["status"] = "started"
    return results