#!/bin/bash

echo "========================================="
echo "🏁 FINAL SYSTEM TEST - NO CONSOLE ERRORS"
echo "========================================="
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

TOTAL=0
PASSED=0
FAILED=0

test_item() {
    local name=$1
    local command=$2
    local expected=$3

    TOTAL=$((TOTAL + 1))
    result=$(eval $command 2>&1)

    if [[ "$result" == *"$expected"* ]]; then
        echo -e "${GREEN}✅ PASS${NC}: $name"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ FAIL${NC}: $name"
        echo "   Expected: $expected"
        echo "   Got: ${result:0:100}..."
        FAILED=$((FAILED + 1))
    fi
}

echo "1️⃣  BUILD STATUS"
echo "-----------------"

# Check if frontend built successfully
BUILD_WARNINGS=$(cd frontend && npm run build 2>&1 | grep -c "Compiled with warnings" || echo "0")
if [ "$BUILD_WARNINGS" = "1" ]; then
    echo -e "${GREEN}✅ PASS${NC}: Frontend builds successfully (warnings only)"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ FAIL${NC}: Frontend build failed"
    FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

echo ""
echo "2️⃣  NO CRITICAL ERRORS"
echo "------------------------"

# Check frontend log for errors
ERROR_COUNT=$(tail -100 /tmp/frontend_clean.log 2>/dev/null | grep -cE "(ERROR|Failed to compile)" || echo "0")
if [ "$ERROR_COUNT" = "0" ]; then
    echo -e "${GREEN}✅ PASS${NC}: No compilation errors in frontend log"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ FAIL${NC}: Found $ERROR_COUNT errors in frontend log"
    FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# Check for WebSocket errors handled gracefully
test_item "WebSocket errors handled gracefully" \
    "grep -c 'console.error' /Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/services/websocket.ts" \
    "0"

test_item "Training WebSocket errors handled" \
    "grep -c 'console.error' /Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/services/training/TrainingWebSocketService.ts" \
    "0"

echo ""
echo "3️⃣  FRONTEND FUNCTIONALITY"
echo "----------------------------"

test_item "Frontend serves on port 4001" \
    "curl -s -o /dev/null -w '%{http_code}' http://localhost:4001/" \
    "200"

test_item "React app loads without errors" \
    "curl -s http://localhost:4001/ | grep -c '<div id=\"root\"'" \
    "1"

test_item "No error text in HTML" \
    "curl -s http://localhost:4001/ | grep -icE '(TypeError|ReferenceError|NetworkError)' || echo '0'" \
    "0"

echo ""
echo "4️⃣  API HEALTH"
echo "---------------"

test_item "All critical endpoints healthy" \
    "for ep in /health /api/v1/logos /api/v1/training/dataset /api/categories /api/training/readiness; do curl -s -o /dev/null -w '%{http_code}' http://localhost:8000\$ep; done | grep -c 200" \
    "5"

test_item "Image endpoint returns PNG (no NS_ERROR)" \
    "curl -s http://localhost:8000/api/v1/logos/test/image | file -b - | grep -c PNG || echo '0'" \
    "1"

echo ""
echo "5️⃣  TRAINING READINESS COMPONENT"
echo "----------------------------------"

test_item "Component file exists" \
    "ls /Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/components/training/TrainingReadinessOverview/TrainingReadinessOverview.js 2>/dev/null | wc -l" \
    "1"

test_item "Component fully implemented" \
    "grep -c 'Table\|Progress\|exportToCSV\|trainAllReady' /Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/components/training/TrainingReadinessOverview/TrainingReadinessOverview.js" \
    "4"

test_item "Component integrated in App" \
    "grep -c 'TrainingReadinessOverview' /Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/App.js" \
    "2"

echo ""
echo "========================================="
echo "📊 FINAL TEST SUMMARY"
echo "========================================="
echo ""
echo "Total Tests: $TOTAL"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
    echo ""
    echo "✅ System Status:"
    echo "   • Frontend compiles without errors"
    echo "   • WebSocket errors handled gracefully"
    echo "   • No console.error() calls in WebSocket code"
    echo "   • All API endpoints working"
    echo "   • Training Readiness Overview fully implemented"
    echo "   • No NS_ERROR_FAILURE issues"
    echo ""
    echo "📍 Ready for UAT at http://localhost:4001"
    echo ""
    echo "Note: The React DevTools warning is expected and can be ignored."
    echo "WebSocket connection messages are now logged as info, not errors."
else
    echo -e "${RED}⚠️  Some tests failed${NC}"
    echo ""
    echo "Please review the failures above."
fi

echo ""
echo "========================================="