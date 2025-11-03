"""Logo detection and management routes"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, Response
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime
from pathlib import Path
import shutil

# Remove prefix - it's already added in main.py as /api/v1/logos
router = APIRouter()

# Storage directory for uploaded images
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "images"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Persistent metadata storage
METADATA_FILE = UPLOAD_DIR / "metadata.json"

# Load existing metadata from disk
def load_metadata():
    if METADATA_FILE.exists():
        import json
        try:
            with METADATA_FILE.open("r") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_metadata(metadata):
    import json
    with METADATA_FILE.open("w") as f:
        json.dump(metadata, f, indent=2)

# Initialize with persistent storage
uploaded_files = load_metadata()


@router.post("/upload")
async def upload_logo(
    file: UploadFile = File(...),
    metadata: Optional[str] = Form(None)
):
    """
    Upload a logo image for detection and annotation

    This endpoint accepts image files and returns upload information
    including a file_id that can be used for further operations.
    """
    # Generate a unique file ID
    file_id = str(uuid.uuid4())

    # Validate file type
    if file.content_type not in ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Supported types: JPEG, PNG, GIF, WebP, BMP"
        )

    # Save the file to disk
    file_extension = Path(file.filename).suffix
    file_path = UPLOAD_DIR / f"{file_id}{file_extension}"

    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Store metadata persistently
        uploaded_files[file_id] = {
            "filename": file.filename,
            "file_path": str(file_path),
            "content_type": file.content_type,
            "upload_date": datetime.now().isoformat()
        }
        save_metadata(uploaded_files)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    return {
        "status": "success",
        "results": [
            {
                "file_id": file_id,
                "filename": file.filename,
                "url": f"/api/v1/logos/{file_id}/image",
                "message": "Upload successful",
                "upload_date": uploaded_files[file_id]["upload_date"]
            }
        ]
    }


@router.get("/{file_id}/image")
async def get_logo_image(file_id: str):
    """Get the image for a specific logo by file_id"""
    # Check if file exists in our storage
    if file_id not in uploaded_files:
        # Return a 1x1 transparent PNG as placeholder for missing files
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\xf8\xd7V\x00\x00\x00\x00IEND\xaeB`\x82'
        return Response(content=png_data, media_type="image/png")

    file_info = uploaded_files[file_id]
    file_path = Path(file_info["file_path"])

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")

    # Return the actual uploaded file
    return FileResponse(
        path=file_path,
        media_type=file_info["content_type"],
        filename=file_info["filename"]
    )


@router.get("/{file_id}/annotations")
async def get_annotations(file_id: str):
    """Get annotations for a specific logo"""
    # In a real implementation, fetch from database
    return []


@router.post("/{file_id}/annotations")
async def create_annotation(file_id: str, annotation: Dict[str, Any]):
    """Create a new annotation for a logo"""
    # In a real implementation, save to database
    return {
        "id": str(uuid.uuid4()),
        "file_id": file_id,
        "created_at": datetime.now().isoformat(),
        **annotation
    }


@router.post("/detect")
async def detect_logo(file: UploadFile = File(...)):
    """Detect logos in uploaded image"""
    return {"message": "Logo detection endpoint", "filename": file.filename}


@router.get("/")
async def list_logos():
    """List all detected logos"""
    return {"logos": []}