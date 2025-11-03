#!/usr/bin/env python
"""
Development server without database dependency
"""
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from datetime import datetime
import json
import os
import base64
from pathlib import Path

app = FastAPI(title="Logo Recognition API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock data
mock_datasets = [
    {
        "id": "1",
        "name": "Default Dataset",
        "description": "Initial logo dataset",
        "created_at": datetime.now().isoformat(),
        "logo_count": 5,
        "status": "active"
    }
]

mock_jobs = [
    {
        "id": "1",
        "type": "training",
        "status": "completed",
        "progress": 100,
        "created_at": datetime.now().isoformat(),
        "dataset_id": "1"
    }
]

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "logo-recognition-api"}

@app.get("/dataset")
async def get_datasets():
    return mock_datasets

@app.get("/jobs")
async def get_jobs():
    return mock_jobs

@app.get("/api/v1/training/dataset")
async def get_training_datasets():
    return mock_datasets

@app.get("/api/v1/training/jobs")
async def get_training_jobs():
    return mock_jobs

@app.get("/api/v1/dataset")
async def get_dataset_v1():
    """Get dataset summary for training dashboard"""
    # Count uploaded files/annotations from any previous uploads
    import os
    from pathlib import Path

    upload_dir = Path("uploads")
    total_images = 0
    if upload_dir.exists():
        # Count directories (each represents an uploaded file)
        total_images = len([d for d in upload_dir.iterdir() if d.is_dir()])

    return {
        "totalImages": max(1, total_images),  # At least 1 for demo
        "validatedImages": max(1, total_images),
        "totalBoxes": 0,  # Would come from saved annotations
        "completedBoxes": 0,
        "status": "ready"
    }

@app.post("/upload")
async def upload_logo(file: UploadFile = File(...)):
    """Handle logo upload"""
    return {
        "message": "Logo uploaded successfully",
        "filename": file.filename,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/v1/logos/upload")
async def upload_logo_v1(file: UploadFile = File(...)):
    """Handle logo upload API v1"""
    import uuid
    file_id = str(uuid.uuid4())

    # Create uploads directory if it doesn't exist
    upload_dir = Path("uploads") / file_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Save the actual file
    file_path = upload_dir / file.filename
    with open(file_path, "wb") as f:
        contents = await file.read()
        f.write(contents)

    # Create file info
    file_info = {
        "file_id": file_id,
        "filename": file.filename,
        "url": f"/uploads/{file_id}/{file.filename}",
        "timestamp": datetime.now().isoformat(),
        "api_version": "v1"
    }

    # Return in the format the frontend expects
    return {
        "status": "success",
        "results": [file_info]
    }

@app.post("/train")
async def start_training(dataset_id: str = "1"):
    """Start training job"""
    new_job = {
        "id": str(len(mock_jobs) + 1),
        "type": "training",
        "status": "pending",
        "progress": 0,
        "created_at": datetime.now().isoformat(),
        "dataset_id": dataset_id
    }
    mock_jobs.append(new_job)
    return new_job

@app.post("/api/v1/training/start")
async def start_training_v1():
    """Start training job API v1"""
    import uuid
    job_id = str(uuid.uuid4())

    # Create a mock training job
    training_job = {
        "id": job_id,
        "type": "training",
        "status": "running",
        "progress": 0,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "dataset": {
            "totalImages": 1,
            "validatedImages": 1,
            "totalBoxes": 0,
            "completedBoxes": 0
        },
        "message": "Training started successfully"
    }

    # Add to mock jobs list
    mock_jobs.append(training_job)

    return training_job

@app.get("/api/v1/training/status/{job_id}")
async def get_training_status(job_id: str):
    """Get training job status"""
    # Find the job in mock_jobs
    for job in mock_jobs:
        if job.get("id") == job_id:
            # Simulate progress
            if job["status"] == "running":
                job["progress"] = min(job.get("progress", 0) + 20, 100)
                if job["progress"] >= 100:
                    job["status"] = "completed"
                job["updated_at"] = datetime.now().isoformat()
            return job

    # Return a default completed job if not found
    return {
        "id": job_id,
        "type": "training",
        "status": "completed",
        "progress": 100,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "dataset": {
            "totalImages": 1,
            "validatedImages": 1,
            "totalBoxes": 0,
            "completedBoxes": 0
        }
    }

@app.get("/api/v1/training/jobs")
async def get_training_jobs_v1():
    """Get all training jobs API v1"""
    return mock_jobs

@app.get("/ws")
async def websocket_endpoint():
    """Mock WebSocket endpoint"""
    return {"message": "WebSocket endpoint - use ws:// protocol"}

@app.get("/api/v1/logos/{file_id}/annotations")
async def get_logo_annotations(file_id: str):
    """Get annotations for a specific logo"""
    # Return empty annotations for now (no annotations yet)
    return {
        "file_id": file_id,
        "annotations": [],
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }

@app.post("/api/v1/logos/{file_id}/annotations")
async def save_logo_annotations(file_id: str, annotations: dict):
    """Save annotations for a specific logo"""
    return {
        "file_id": file_id,
        "annotations": annotations.get("annotations", []),
        "status": "saved",
        "updated_at": datetime.now().isoformat()
    }

@app.get("/uploads/{file_id}/{filename}")
async def serve_uploaded_file(file_id: str, filename: str):
    """Serve uploaded files"""
    file_path = Path("uploads") / file_id / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # Determine content type based on file extension
    content_type = "application/octet-stream"
    if filename.lower().endswith(('.jpg', '.jpeg')):
        content_type = "image/jpeg"
    elif filename.lower().endswith('.png'):
        content_type = "image/png"
    elif filename.lower().endswith('.gif'):
        content_type = "image/gif"
    elif filename.lower().endswith('.webp'):
        content_type = "image/webp"

    return FileResponse(file_path, media_type=content_type)

@app.get("/")
async def root():
    return {"message": "Logo Recognition API", "version": "1.0.0"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)