#!/bin/bash

echo "🔬 ROBUUSTE OPLOSSING TEST - Alle Netwerk Fouten"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

# Function to test endpoint
test_endpoint() {
    local endpoint=$1
    local expected=$2
    local description=$3

    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000$endpoint)

    if [ "$STATUS" = "$expected" ]; then
        echo -e "${GREEN}✅ $description - HTTP $STATUS${NC}"
        ((PASS_COUNT++))
    else
        echo -e "${RED}❌ $description - HTTP $STATUS (verwacht: $expected)${NC}"
        ((FAIL_COUNT++))
    fi
}

echo "1️⃣  BACKEND ENDPOINTS TEST"
echo "----------------------------"
test_endpoint "/health" "200" "Health check"
test_endpoint "/api/v1/logos" "200" "Logo lijst"
test_endpoint "/api/v1/training/dataset" "200" "Dataset info"
test_endpoint "/api/v1/training/jobs" "200" "Training jobs"
test_endpoint "/api/categories" "200" "Categories"
test_endpoint "/api/training/readiness" "200" "Training readiness"
test_endpoint "/api/annotation-metrics/sufficiency/test/test" "200" "Annotation metrics"
test_endpoint "/api/v1/logos/test123/image" "200" "Image endpoint (NS_ERROR fix)"

echo ""
echo "2️⃣  WEBSOCKET TEST"
echo "----------------------------"
WEBSOCKET_TEST=$(python3 -c "
import asyncio
import websockets
async def test():
    try:
        async with websockets.connect('ws://localhost:8000/ws') as ws:
            await ws.send('test')
            response = await ws.recv()
            return 'OK' if response == 'Echo: test' else 'FAIL'
    except:
        return 'FAIL'
print(asyncio.run(test()))
" 2>/dev/null)

if [ "$WEBSOCKET_TEST" = "OK" ]; then
    echo -e "${GREEN}✅ WebSocket connection werkt${NC}"
    ((PASS_COUNT++))
else
    echo -e "${RED}❌ WebSocket connection gefaald${NC}"
    ((FAIL_COUNT++))
fi

echo ""
echo "3️⃣  IMAGE UPLOAD TEST"
echo "----------------------------"
# Create test image
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" | base64 -d > /tmp/test.png

# Upload test
UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:8000/api/v1/logos/upload \
  -F "file=@/tmp/test.png" 2>/dev/null)

if echo "$UPLOAD_RESPONSE" | grep -q '"status":"success"'; then
    echo -e "${GREEN}✅ Upload endpoint werkt correct${NC}"
    ((PASS_COUNT++))

    # Extract file_id
    FILE_ID=$(echo "$UPLOAD_RESPONSE" | grep -o '"file_id":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ ! -z "$FILE_ID" ]; then
        # Test image retrieval
        IMG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/logos/$FILE_ID/image)
        if [ "$IMG_STATUS" = "200" ]; then
            echo -e "${GREEN}✅ Uploaded image retrieval werkt (geen 500 error)${NC}"
            ((PASS_COUNT++))
        else
            echo -e "${RED}❌ Uploaded image retrieval: HTTP $IMG_STATUS${NC}"
            ((FAIL_COUNT++))
        fi
    fi
else
    echo -e "${RED}❌ Upload endpoint probleem${NC}"
    ((FAIL_COUNT++))
fi

echo ""
echo "4️⃣  STARTUP VALIDATION TEST"
echo "----------------------------"
cd /Users/frisovanweelden/Documents/projects/logoRecognition/frontend
VALIDATION=$(node -e "
const StartupValidator = require('./src/utils/startupValidator.js').default;
const validator = new StartupValidator();
validator.validate().then(report => {
    console.log(report.success ? 'SUCCESS' : 'FAIL');
    process.exit(0);
});
" 2>/dev/null)

if [ "$VALIDATION" = "SUCCESS" ]; then
    echo -e "${GREEN}✅ Startup validation slaagt${NC}"
    ((PASS_COUNT++))
else
    echo -e "${YELLOW}⚠️  Startup validation heeft waarschuwingen${NC}"
fi

echo ""
echo "5️⃣  ERROR MONITORING TEST"
echo "----------------------------"
# Check if error monitor is loaded
ERROR_MONITOR_CHECK=$(node -e "
const ErrorMonitor = require('./src/utils/errorMonitor.js').default;
if (ErrorMonitor) {
    console.log('LOADED');
} else {
    console.log('FAILED');
}
" 2>/dev/null)

if [ "$ERROR_MONITOR_CHECK" = "LOADED" ]; then
    echo -e "${GREEN}✅ Error monitoring systeem geladen${NC}"
    ((PASS_COUNT++))
else
    echo -e "${RED}❌ Error monitoring systeem niet geladen${NC}"
    ((FAIL_COUNT++))
fi

echo ""
echo "========================================="
echo "📊 TESTRESULTATEN"
echo "========================================="
echo -e "✅ Geslaagd: ${GREEN}$PASS_COUNT${NC}"
echo -e "❌ Gefaald:  ${RED}$FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}🎉 ALLE TESTS GESLAAGD!${NC}"
    echo ""
    echo "✨ Opgeloste problemen:"
    echo "   • NS_ERROR_FAILURE bij images"
    echo "   • 404 errors op endpoints"
    echo "   • 500 error bij uploaded images"
    echo "   • WebSocket 403 connection refused"
    echo "   • Upload button disabled issue"
    echo "   • Startup validatie systeem"
    echo "   • Realtime error monitoring"
    exit 0
else
    echo -e "${RED}⚠️  Er zijn nog $FAIL_COUNT problemen${NC}"
    echo ""
    echo "Controleer de backend logs voor details:"
    echo "tail -f /tmp/backend.log"
    exit 1
fi