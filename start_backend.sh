#!/bin/bash
# Backend startup script voor UAT

set -e

echo "🚀 Starting Logo Recognition Backend..."

# Navigate to backend directory
cd /Users/frisovanweelden/Documents/projects/logoRecognition/backend

# Set environment variables
export DATABASE_URL="postgresql://postgres:test_password_123_IN_PRODUCTION@localhost:5432/logo_recognition"
export REDIS_URL="redis://localhost:6379/0"
export CELERY_BROKER_URL="redis://localhost:6379/0"
export CELERY_RESULT_BACKEND="redis://localhost:6379/0"
export MINIO_ENDPOINT="localhost:9000"
export MINIO_ACCESS_KEY="minioadmin"
export MINIO_SECRET_KEY="test_password_123_IN_PRODUCTION"
export MINIO_BUCKET_NAME="logo-detection"
export MINIO_USE_SSL="false"
export PYTHONPATH="/Users/frisovanweelden/Documents/projects/logoRecognition/backend:$PYTHONPATH"

# Check if containers are running
echo "📦 Checking Docker containers..."
docker ps | grep -E "(postgres|redis|minio)" | grep -E "logo-recognition"

# Test database connection
echo "🔍 Testing database connection..."
PGPASSWORD=test_password_123_IN_PRODUCTION psql -h localhost -U postgres -d logo_recognition -c "SELECT 1;" > /dev/null 2>&1 && echo "✅ Database connection OK" || echo "❌ Database connection failed"

# Test Redis connection
echo "🔍 Testing Redis connection..."
redis-cli ping > /dev/null 2>&1 && echo "✅ Redis connection OK" || echo "❌ Redis connection failed"

# Kill any existing backend process
pkill -f "uvicorn app.main:app" 2>/dev/null || true

# Start backend server
echo "🌐 Starting FastAPI backend on http://localhost:8000"
echo "📝 Logs: /tmp/backend.log"
echo ""

nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/backend.log 2>&1 &

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Check health
echo "🏥 Checking server health..."
curl -s http://localhost:8000/health | python3 -m json.tool || echo "Server starting..."

echo ""
echo "✅ Backend started!"
echo "📖 API Docs: http://localhost:8000/docs"
echo "🏥 Health: http://localhost:8000/health"
echo "📊 Metrics: http://localhost:8000/metrics"
echo ""
echo "To view logs: tail -f /tmp/backend.log"
echo "To stop: pkill -f 'uvicorn app.main:app'"
