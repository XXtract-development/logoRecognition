#!/usr/bin/env python3
"""
Quick startup test for Sprint 2 validation
"""
import uvicorn
import os
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Mock database for testing
os.environ.update({
    "DATABASE_HOST": "localhost",
    "DATABASE_PORT": "5432",
    "DATABASE_NAME": "test_db",
    "DATABASE_USER": "test",
    "DATABASE_PASSWORD": "test",
    "REDIS_URL": "redis://localhost:6379",
    "MINIO_ENDPOINT": "localhost:9000",
    "MINIO_ACCESS_KEY": "minioadmin",
    "MINIO_SECRET_KEY": "minioadmin",
    "MOCK_MODE": "true"  # Enable mock mode
})

def start_backend():
    """Start backend in test mode"""
    print("🚀 Starting backend in validation mode...")
    try:
        from app.main import app
        uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
    except Exception as e:
        print(f"❌ Backend startup failed: {e}")
        return False
    return True

if __name__ == "__main__":
    start_backend()