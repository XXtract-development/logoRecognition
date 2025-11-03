#!/bin/bash
# UAT Startup Script - Logo Recognition System

set -e

echo "🚀 Starting Logo Recognition System for UAT..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Navigate to project root
cd /Users/frisovanweelden/Documents/projects/logoRecognition

#  ===================================
# 1. Check Docker Containers
# ===================================
echo "📦 Checking Docker containers..."

# Check if containers are running
if ! docker ps | grep -q "logo-recognition-postgres"; then
    echo "${YELLOW}⚠️  PostgreSQL container not running, starting...${NC}"
    docker start logo-recognition-postgres || docker run -d --name logo-recognition-postgres \
        -e POSTGRES_DB=logo_recognition \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=test_password_123_IN_PRODUCTION \
        -p 5432:5432 \
        pgvector/pgvector:pg16
fi

if ! docker ps | grep -q "logo-recognition-redis"; then
    echo "${YELLOW}⚠️  Redis container not running, starting...${NC}"
    docker start logo-recognition-redis || docker run -d --name logo-recognition-redis \
        -p 6379:6379 \
        redis:7-alpine
fi

if ! docker ps | grep -q "logo-recognition-minio"; then
    echo "${YELLOW}⚠️  MinIO container not running, starting...${NC}"
    docker start logo-recognition-minio
fi

# Wait for containers to be healthy
sleep 3

echo "${GREEN}✅ All containers running${NC}"
echo ""

# ===================================
# 2. Test Connections
# ===================================
echo "🔍 Testing connections..."

# Test PostgreSQL
if PGPASSWORD=test_password_123_IN_PRODUCTION psql -h localhost -U postgres -d logo_recognition -c "SELECT 1;" > /dev/null 2>&1; then
    echo "${GREEN}✅ PostgreSQL connection OK${NC}"
else
    echo "${RED}❌ PostgreSQL connection failed${NC}"
fi

# Test Redis
if redis-cli ping > /dev/null 2>&1; then
    echo "${GREEN}✅ Redis connection OK${NC}"
else
    echo "${RED}❌ Redis connection failed${NC}"
fi

echo ""

# ===================================
# 3. Start Backend API
# ===================================
echo "🌐 Starting Backend API..."

# Kill any existing backend process
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
sleep 1

# Set environment variables explicitly
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

# Start backend from correct directory
cd backend
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/backend.log 2>&1 &
BACKEND_PID=$!

echo "Backend starting (PID: $BACKEND_PID)..."
echo "📝 Logs: tail -f /tmp/backend.log"

# Wait for backend to start
echo "⏳ Waiting for backend..."
for i in {1..15}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "${GREEN}✅ Backend started successfully!${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

echo ""
echo ""

# ===================================
# 4. System Status
# ===================================
echo "📊 System Status:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Health check
HEALTH=$(curl -s http://localhost:8000/health || echo '{"status":"down"}')
echo "Backend Health: $HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ===================================
# 5. Access Information
# ===================================
echo "${GREEN}✅ Logo Recognition System Ready for UAT!${NC}"
echo ""
echo "🌐 API Endpoints:"
echo "   • API Base:      http://localhost:8000"
echo "   • API Docs:      http://localhost:8000/docs"
echo "   • Health Check:  http://localhost:8000/health"
echo "   • Metrics:       http://localhost:8000/metrics"
echo ""
echo "💾 Services:"
echo "   • PostgreSQL:    localhost:5432"
echo "   • Redis:         localhost:6379"
echo "   • MinIO:         localhost:9000"
echo ""
echo "📝 Logs & Management:"
echo "   • Backend logs:  tail -f /tmp/backend.log"
echo "   • Stop backend:  kill $BACKEND_PID"
echo "   • Stop all:      docker stop logo-recognition-postgres logo-recognition-redis logo-recognition-minio"
echo ""
echo "🧪 Quick Test:"
echo "   curl http://localhost:8000/health"
echo ""
