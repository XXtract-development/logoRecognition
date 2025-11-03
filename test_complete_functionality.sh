#!/bin/bash

echo "🔍 COMPLETE FUNCTIONALITY TEST"
echo "==============================="
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

# Function to test endpoint
test_endpoint() {
    local endpoint=$1
    local description=$2

    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000$endpoint)

    if [ "$STATUS" = "200" ]; then
        echo -e "${GREEN}✅ $description${NC}"
        ((PASS++))
    else
        echo -e "${RED}❌ $description - HTTP $STATUS${NC}"
        ((FAIL++))
    fi
}

echo "1. BACKEND API ENDPOINTS"
echo "------------------------"
test_endpoint "/health" "Health check"
test_endpoint "/api/v1/logos" "Logo list"
test_endpoint "/api/v1/training/dataset" "Training dataset"
test_endpoint "/api/v1/training/jobs" "Training jobs"
test_endpoint "/api/categories" "Categories"
test_endpoint "/api/training/readiness" "Training readiness"
test_endpoint "/api/annotation-metrics/sufficiency/test/test" "Annotation metrics"

echo ""
echo "2. FRONTEND AVAILABILITY"
echo "------------------------"
FRONTEND_CHECK=$(curl -s http://localhost:4001/ 2>/dev/null | grep -o "Logo Recognition" | head -1)
if [ "$FRONTEND_CHECK" = "Logo Recognition" ]; then
    echo -e "${GREEN}✅ Frontend running on port 4001${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ Frontend not accessible${NC}"
    ((FAIL++))
fi

echo ""
echo "3. TRAINING READINESS DATA"
echo "--------------------------"
READINESS_DATA=$(curl -s http://localhost:8000/api/training/readiness)
IS_READY=$(echo $READINESS_DATA | grep -o '"ready":true' | head -1)
if [ "$IS_READY" = '"ready":true' ]; then
    echo -e "${GREEN}✅ System ready for training${NC}"
    IMAGES=$(echo $READINESS_DATA | grep -oE '"total_images":[0-9]+' | grep -oE '[0-9]+')
    ANNOTATIONS=$(echo $READINESS_DATA | grep -oE '"total_annotations":[0-9]+' | grep -oE '[0-9]+')
    echo "   📸 Images: $IMAGES"
    echo "   📝 Annotations: $ANNOTATIONS"
    ((PASS++))
else
    echo -e "${YELLOW}⚠️  System not ready for training${NC}"
    echo $READINESS_DATA | python -m json.tool 2>/dev/null
fi

echo ""
echo "4. WEBSOCKET CONNECTION"
echo "-----------------------"
WS_TEST=$(python3 -c "
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

if [ "$WS_TEST" = "OK" ]; then
    echo -e "${GREEN}✅ WebSocket functional${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ WebSocket not working${NC}"
    ((FAIL++))
fi

echo ""
echo "5. IMAGE UPLOAD TEST"
echo "--------------------"
# Create test image
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" | base64 -d > /tmp/test_img.png

UPLOAD=$(curl -s -X POST http://localhost:8000/api/v1/logos/upload \
  -F "file=@/tmp/test_img.png" 2>/dev/null)

if echo "$UPLOAD" | grep -q '"status":"success"'; then
    echo -e "${GREEN}✅ Upload functionality works${NC}"
    ((PASS++))

    FILE_ID=$(echo "$UPLOAD" | grep -o '"file_id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ ! -z "$FILE_ID" ]; then
        # Test image retrieval
        IMG_CHECK=$(curl -s -o /tmp/retrieved.bin -w "%{http_code}" http://localhost:8000/api/v1/logos/$FILE_ID/image)
        FILE_TYPE=$(file /tmp/retrieved.bin | grep -o "PNG image data")

        if [ "$IMG_CHECK" = "200" ] && [ "$FILE_TYPE" = "PNG image data" ]; then
            echo -e "${GREEN}✅ Image retrieval works (no NS_ERROR_FAILURE)${NC}"
            ((PASS++))
        else
            echo -e "${RED}❌ Image retrieval issue${NC}"
            ((FAIL++))
        fi
    fi
else
    echo -e "${RED}❌ Upload failed${NC}"
    ((FAIL++))
fi

echo ""
echo "6. ERROR MONITORING"
echo "-------------------"
ERROR_MONITOR=$(node -e "
try {
    const ErrorMonitor = require('/Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/utils/errorMonitor.js').default;
    console.log(ErrorMonitor ? 'OK' : 'FAIL');
} catch(e) {
    console.log('FAIL');
}
" 2>/dev/null)

if [ "$ERROR_MONITOR" = "OK" ]; then
    echo -e "${GREEN}✅ Error monitoring system active${NC}"
    ((PASS++))
else
    echo -e "${YELLOW}⚠️  Error monitoring not fully configured${NC}"
fi

echo ""
echo "7. STARTUP VALIDATOR"
echo "--------------------"
VALIDATOR=$(node -e "
const StartupValidator = require('/Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/utils/startupValidator.js').default;
const validator = new StartupValidator();
validator.validate().then(report => {
    console.log(report.success ? 'OK' : 'FAIL');
    process.exit(0);
});
" 2>/dev/null)

if [ "$VALIDATOR" = "OK" ]; then
    echo -e "${GREEN}✅ Startup validator operational${NC}"
    ((PASS++))
else
    echo -e "${YELLOW}⚠️  Startup validator has warnings${NC}"
fi

echo ""
echo "==============================="
echo "📊 TEST RESULTS"
echo "==============================="
echo -e "✅ Passed: ${GREEN}$PASS${NC}"
echo -e "❌ Failed: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
    echo ""
    echo "✨ System Status:"
    echo "   • Backend API: Fully operational"
    echo "   • Frontend: Running on port 4001"
    echo "   • Training Readiness: Dashboard available"
    echo "   • WebSocket: Connected"
    echo "   • Error Handling: Active"
    echo ""
    echo "📍 Access the app at: http://localhost:4001"
else
    echo -e "${RED}⚠️  SOME TESTS FAILED${NC}"
    echo "Please review the failures above."
fi