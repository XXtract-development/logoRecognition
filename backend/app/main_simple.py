"""Simplified FastAPI application for development"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pathlib import Path
import logging
import os
import time
import shutil
from typing import List

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Logo Recognition API - Development",
    description="Simplified API for development and testing",
    version="1.0.0-dev"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:4001", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "logo-recognition-api",
        "version": "1.0.0-dev",
        "database": "connected (mock)",
        "redis": "connected (mock)"
    }

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Logo Recognition API is running",
        "docs": "/docs",
        "health": "/health"
    }

# Mock API endpoints for frontend compatibility
@app.get("/api/v1/auth/session")
async def get_session():
    """Mock session endpoint"""
    return {
        "authenticated": True,
        "user": {
            "id": 1,
            "email": "user@example.com",
            "name": "Test User",
            "role": "admin"
        }
    }

@app.post("/api/auth/login")
async def login(credentials: dict):
    """Mock login endpoint"""
    return {
        "access_token": "mock-jwt-token",
        "token_type": "bearer",
        "user": {
            "id": 1,
            "email": credentials.get("email", "user@example.com"),
            "name": "Test User",
            "role": "admin"
        }
    }

@app.post("/api/auth/logout")
async def logout():
    """Mock logout endpoint"""
    return {"message": "Logged out successfully"}

@app.get("/api/auth/me")
async def get_current_user():
    """Mock current user endpoint"""
    return {
        "id": 1,
        "email": "user@example.com",
        "name": "Test User",
        "role": "admin"
    }

@app.get("/api/images")
async def get_images():
    """Mock images endpoint"""
    return {
        "images": [
            {
                "id": 1,
                "filename": "Plus pannekoek mix achterkant.jpg",
                "url": "/uploads/plus-pannekoek.jpg",
                "status": "uploaded",
                "size": 6015004,
                "uploaded_at": "2024-01-22T10:00:00Z",
                "ready_for_annotation": True
            }
        ],
        "total": 1,
        "page": 1,
        "per_page": 10
    }

@app.get("/api/v1/images")
async def get_images_v1():
    """Mock images v1 endpoint"""
    return {
        "images": [
            {
                "id": 1,
                "filename": "Plus pannekoek mix achterkant.jpg",
                "url": "/uploads/plus-pannekoek.jpg",
                "status": "ready",
                "uploaded_at": "2024-01-22T10:00:00Z"
            }
        ],
        "count": 1
    }

@app.post("/api/images/upload")
async def upload_image(file: UploadFile = File(None)):
    """Mock image upload endpoint"""
    try:
        filename = file.filename if file else "test.jpg"
        return {
            "success": True,
            "id": 1,
            "filename": filename,
            "url": f"/uploads/{filename}",
            "uploaded_at": "2024-01-22T10:00:00Z",
            "status": "success"
        }
    except:
        return {
            "success": True,
            "id": 1,
            "filename": "test.jpg",
            "url": "/uploads/test.jpg",
            "uploaded_at": "2024-01-22T10:00:00Z",
            "status": "success"
        }

@app.post("/api/v1/upload")
async def upload_v1(file: UploadFile = File(None)):
    """Alternative upload endpoint"""
    try:
        filename = file.filename if file else "uploaded.jpg"
        return {
            "success": True,
            "file": {
                "id": 1,
                "name": filename,
                "size": file.size if file else 1000000,
                "type": file.content_type if file else "image/jpeg"
            },
            "message": "File uploaded successfully"
        }
    except:
        return {
            "success": True,
            "file": {
                "id": 1,
                "name": "uploaded.jpg",
                "size": 1000000,
                "type": "image/jpeg"
            },
            "message": "File uploaded successfully"
        }

@app.get("/api/annotations")
async def get_annotations():
    """Mock annotations endpoint"""
    return {
        "annotations": [],
        "total": 0
    }

# Create uploads directory if it doesn't exist
UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Store uploaded files info in memory for this session
uploaded_files = {}

@app.post("/v1/logos/upload")
async def upload_logo(files: List[UploadFile] = File(None), file: UploadFile = File(None)):
    """Handle logo upload - saves files to disk"""
    try:
        # Handle both single file and files array
        uploaded_file = file if file else (files[0] if files else None)

        if not uploaded_file:
            raise HTTPException(status_code=400, detail="No file provided")

        filename = uploaded_file.filename
        logger.info(f"Upload received: {filename}")

        # Generate unique file ID
        file_id = "img_" + str(int(time.time() * 1000))

        # Save file to disk with unique name to avoid conflicts
        file_extension = Path(filename).suffix
        unique_filename = f"{file_id}{file_extension}"
        file_path = UPLOAD_DIR / unique_filename

        # Save the uploaded file
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(uploaded_file.file, buffer)

        logger.info(f"File saved to: {file_path}")

        # Store file info in memory for later retrieval
        uploaded_files[file_id] = {
            "file_id": file_id,
            "filename": filename,
            "original_filename": filename,
            "saved_filename": unique_filename,
            "url": f"/uploads/{unique_filename}",
            "uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "status": "ready",
            "annotations": []
        }

        # Return the exact format expected by the frontend
        return {
            "file_id": file_id,
            "filename": filename,
            "url": f"/uploads/{unique_filename}",
            "message": "File uploaded successfully"
        }
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/v1/uploads")
async def get_uploads():
    """Get uploaded files"""
    return {
        "files": [
            {
                "id": 1,
                "filename": "Plus pannekoek mix achterkant.jpg",
                "size": 6015004,
                "status": "uploaded",
                "uploaded_at": "2024-01-22T10:00:00Z"
            }
        ],
        "total": 1
    }

@app.get("/api/upload/status")
async def upload_status():
    """Get upload status"""
    return {
        "uploaded_count": 1,
        "ready_for_annotation": True,
        "files": [
            {
                "id": 1,
                "filename": "Plus pannekoek mix achterkant.jpg",
                "status": "ready"
            }
        ]
    }

@app.post("/api/recognition/detect")
async def detect_logos():
    """Mock logo detection endpoint"""
    return {
        "detections": [
            {
                "logo": "Example Logo",
                "confidence": 0.95,
                "bbox": [100, 100, 200, 200]
            }
        ],
        "processing_time": 0.5
    }

@app.get("/v1/logos/recent")
async def get_recent_logos(limit: int = 10):
    """Get recently uploaded logos"""
    # Return the most recent uploaded files
    recent = list(uploaded_files.values())[-limit:] if uploaded_files else []
    recent.reverse()  # Most recent first
    return recent

@app.get("/v1/logos/{file_id}/annotations")
async def get_logo_annotations(file_id: str):
    """Get annotations for a specific logo"""
    if file_id in uploaded_files:
        return uploaded_files[file_id].get("annotations", [])
    return []

@app.post("/v1/logos/{file_id}/annotations")
async def save_logo_annotations(file_id: str, annotations: list):
    """Save annotations for a specific logo"""
    if file_id in uploaded_files:
        uploaded_files[file_id]["annotations"] = annotations
        return {"success": True, "message": "Annotations saved"}
    return {"success": False, "message": "File not found"}

# Serve uploaded files
@app.get("/uploads/{filename}")
async def serve_upload(filename: str):
    """Serve uploaded files from disk"""
    file_path = UPLOAD_DIR / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # Determine media type based on file extension
    extension = file_path.suffix.lower()
    media_types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp'
    }
    media_type = media_types.get(extension, 'application/octet-stream')

    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={
            "Cache-Control": "public, max-age=3600"
        }
    )

# Add endpoint to serve images by file_id
@app.get("/v1/logos/{file_id}/image")
async def serve_logo_by_id(file_id: str):
    """Serve image by file ID"""
    if file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="Image not found")

    file_info = uploaded_files[file_id]
    file_path = UPLOAD_DIR / file_info["saved_filename"]

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")

    # Determine media type
    extension = file_path.suffix.lower()
    media_types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp'
    }
    media_type = media_types.get(extension, 'application/octet-stream')

    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={
            "Cache-Control": "public, max-age=3600"
        }
    )

# Store categories in memory
categories = [
    {"id": "1", "name": "Brand Logo", "count": 0, "color": "#1890ff"},
    {"id": "2", "name": "Product Logo", "count": 0, "color": "#52c41a"},
    {"id": "3", "name": "Sponsor Logo", "count": 0, "color": "#722ed1"},
    {"id": "4", "name": "Text/Label", "count": 0, "color": "#fa8c16"},
    {"id": "5", "name": "Other", "count": 0, "color": "#8c8c8c"}
]

@app.get("/api/categories")
async def get_categories():
    """Get all categories"""
    return {"categories": categories}

@app.post("/api/categories")
async def create_category(category: dict):
    """Create a new category"""
    new_category = {
        "id": str(int(time.time() * 1000)),
        "name": category.get("name", "New Category"),
        "count": 0,
        "color": category.get("color", "#" + format(hash(category.get("name", "")) & 0xFFFFFF, '06x'))
    }
    categories.append(new_category)
    return new_category

@app.put("/api/categories/{category_id}")
async def update_category(category_id: str, category: dict):
    """Update an existing category"""
    for i, cat in enumerate(categories):
        if cat["id"] == category_id:
            categories[i] = {**cat, **category}
            return categories[i]
    raise HTTPException(status_code=404, detail="Category not found")

@app.delete("/api/categories/{category_id}")
async def delete_category(category_id: str):
    """Delete a category"""
    global categories
    original_len = len(categories)
    categories = [cat for cat in categories if cat["id"] != category_id]
    if len(categories) < original_len:
        return {"success": True, "message": "Category deleted"}
    raise HTTPException(status_code=404, detail="Category not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)