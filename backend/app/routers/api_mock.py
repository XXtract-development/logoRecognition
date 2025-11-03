"""
Mock API Router for missing endpoints
Provides mock responses for all expected endpoints to prevent 404 errors
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel
import random

router = APIRouter()

# Mock data models
class Logo(BaseModel):
    file_id: str
    filename: str
    url: str
    upload_date: datetime
    annotations: Optional[List[Dict]] = []

class TrainingJob(BaseModel):
    job_id: str
    status: str
    started_at: datetime
    progress: int

class CategoryValue(BaseModel):
    code: str
    label: str

class Category(BaseModel):
    code: str
    label: str
    values: List[CategoryValue]

class ReadinessItem(BaseModel):
    id: str
    category: Dict[str, str]
    value: Dict[str, str]
    currentCount: int
    minimumRequired: int
    readinessPercentage: float
    annotationsNeeded: int
    status: str
    lastUpdated: datetime
    augmentedSamples: int
    naturalSamples: int

# Mock endpoints
@router.get("/api/v1/logos")
async def get_logos() -> List[Logo]:
    """Mock endpoint for getting logos list"""
    return [
        Logo(
            file_id="mock-1",
            filename="logo1.jpg",
            url="/images/logo1.jpg",
            upload_date=datetime.now(),
            annotations=[]
        )
    ]

@router.post("/api/v1/logos/upload")
async def upload_logo(file: Optional[str] = None):
    """Mock endpoint for logo upload"""
    file_id = f"mock-{random.randint(1000, 9999)}"
    return {
        "status": "success",
        "results": [
            {
                "file_id": file_id,
                "filename": "uploaded.jpg",
                "url": f"/images/{file_id}.jpg",
                "message": "Upload successful (mock)"
            }
        ]
    }

@router.get("/api/v1/logos/{file_id}/image")
async def get_logo_image(file_id: str):
    """Mock endpoint for getting logo image - returns actual image"""
    from fastapi.responses import Response
    # Create a simple 1x1 pixel transparent PNG
    png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\xf8\xd7V\x00\x00\x00\x00IEND\xaeB`\x82'
    return Response(content=png_data, media_type="image/png")

@router.get("/api/v1/logos/{file_id}/annotations")
async def get_annotations(file_id: str):
    """Mock endpoint for getting annotations"""
    return []

@router.post("/api/v1/logos/{file_id}/annotations")
async def create_annotation(file_id: str, annotation: Dict[str, Any]):
    """Mock endpoint for creating annotation"""
    return {
        "id": f"ann-{random.randint(1000, 9999)}",
        "file_id": file_id,
        "created_at": datetime.now()
    }

@router.get("/api/v1/training/dataset")
async def get_training_dataset():
    """Mock endpoint for training dataset"""
    return {
        "total_images": 100,
        "total_annotations": 450,
        "categories": ["brand", "recycling"],
        "ready_for_training": True
    }

@router.get("/api/v1/training/jobs")
async def get_training_jobs():
    """Mock endpoint for training jobs - returns empty list to avoid confusion"""
    return {
        "total": 0,
        "limit": 20,
        "offset": 0,
        "jobs": []
    }

@router.post("/api/v1/training/start")
async def start_training(config: Optional[Dict[str, Any]] = None):
    """Mock endpoint for starting training"""
    return {
        "job_id": f"job-{random.randint(1000, 9999)}",
        "status": "started",
        "message": "Training started (mock)"
    }

@router.get("/api/v1/training/status/{job_id}")
async def get_training_status(job_id: str):
    """Mock endpoint for training status"""
    return {
        "job_id": job_id,
        "status": "running",
        "progress": random.randint(0, 100),
        "eta_seconds": 300
    }

@router.get("/api/v1/training/dataset/export")
async def export_dataset():
    """Mock endpoint for dataset export"""
    return {
        "export_url": "/exports/dataset.zip",
        "size_bytes": 1024000,
        "created_at": datetime.now()
    }

@router.get("/api/categories")
async def get_categories() -> List[Category]:
    """Mock endpoint for categories"""
    return [
        Category(
            code="brand",
            label="Brand",
            values=[
                CategoryValue(code="nike", label="Nike"),
                CategoryValue(code="adidas", label="Adidas"),
                CategoryValue(code="puma", label="Puma")
            ]
        ),
        Category(
            code="recycling",
            label="Recycling",
            values=[
                CategoryValue(code="pet", label="PET"),
                CategoryValue(code="hdpe", label="HDPE"),
                CategoryValue(code="pp", label="PP")
            ]
        )
    ]

@router.get("/api/training/readiness")
async def get_training_readiness(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    sort: Optional[str] = Query("category"),
    order: Optional[str] = Query("asc"),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100)
):
    """Mock endpoint for training readiness"""
    items = [
        ReadinessItem(
            id="1",
            category={"code": "brand", "label": "Brand"},
            value={"code": "nike", "label": "Nike"},
            currentCount=15,
            minimumRequired=10,
            readinessPercentage=100.0,
            annotationsNeeded=0,
            status="ready",
            lastUpdated=datetime.now(),
            augmentedSamples=750,
            naturalSamples=15
        ),
        ReadinessItem(
            id="2",
            category={"code": "brand", "label": "Brand"},
            value={"code": "adidas", "label": "Adidas"},
            currentCount=8,
            minimumRequired=10,
            readinessPercentage=80.0,
            annotationsNeeded=2,
            status="almost_ready",
            lastUpdated=datetime.now(),
            augmentedSamples=400,
            naturalSamples=8
        ),
        ReadinessItem(
            id="3",
            category={"code": "recycling", "label": "Recycling"},
            value={"code": "pet", "label": "PET"},
            currentCount=3,
            minimumRequired=10,
            readinessPercentage=30.0,
            annotationsNeeded=7,
            status="needs_work",
            lastUpdated=datetime.now(),
            augmentedSamples=150,
            naturalSamples=3
        )
    ]

    # Apply filters if provided
    if category:
        items = [i for i in items if i.category["code"] == category]
    if status:
        items = [i for i in items if i.status == status]

    return {
        "data": items,
        "total": len(items),
        "page": page,
        "pageSize": pageSize
    }

@router.get("/api/annotation-metrics/sufficiency/{category}/{value}")
async def get_annotation_sufficiency(
    category: str,
    value: str,
    includeAugmented: bool = Query(True)
):
    """Mock endpoint for annotation sufficiency metrics"""
    base_count = random.randint(5, 15)
    augmented_count = base_count * 50 if includeAugmented else 0

    return {
        "category": category,
        "value": value,
        "natural_samples": base_count,
        "augmented_samples": augmented_count,
        "total_samples": base_count + augmented_count,
        "minimum_required": 10,
        "is_sufficient": base_count >= 10,
        "sufficiency_percentage": min(100, (base_count / 10) * 100),
        "annotations_needed": max(0, 10 - base_count)
    }

# WebSocket mock
@router.websocket("/ws/upload")
async def websocket_upload(websocket):
    """Mock WebSocket endpoint for upload progress"""
    await websocket.accept()
    await websocket.send_json({"status": "connected"})
    # Keep connection open but don't actually handle uploads
    try:
        while True:
            await websocket.receive_text()
    except:
        pass

@router.websocket("/ws")
async def websocket_general(websocket):
    """Mock general WebSocket endpoint"""
    await websocket.accept()
    await websocket.send_json({"status": "connected", "type": "general"})
    try:
        while True:
            await websocket.receive_text()
    except:
        pass