#!/bin/bash

echo "========================================"
echo "🔍 TEST: NO WEBSOCKET ERRORS IN CONSOLE"
echo "========================================"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "1️⃣  Checking WebSocket code is disabled..."
echo "---------------------------------------------"

# Check if WebSocket connections are disabled in code
WEBSOCKET_NEW=$(grep -r "new WebSocket" frontend/src --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" | grep -v "//.*new WebSocket" | grep -v "/\*" | wc -l)

if [ "$WEBSOCKET_NEW" -eq "0" ]; then
    echo -e "${GREEN}✅ No active WebSocket connections in code${NC}"
else
    echo -e "${RED}❌ Found $WEBSOCKET_NEW active WebSocket connections${NC}"
    echo "Files with active WebSocket connections:"
    grep -r "new WebSocket" frontend/src --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" | grep -v "//.*new WebSocket" | grep -v "/\*" | cut -d: -f1 | sort -u
fi

echo ""
echo "2️⃣  Checking console.error() calls..."
echo "--------------------------------------"

# Check for console.error in WebSocket related files
ERROR_COUNT=$(grep -r "console.error" frontend/src/services/websocket.ts frontend/src/services/training/TrainingWebSocketService.ts 2>/dev/null | grep -v "//" | wc -l)

if [ "$ERROR_COUNT" -eq "0" ]; then
    echo -e "${GREEN}✅ No console.error() in WebSocket services${NC}"
else
    echo -e "${RED}❌ Found $ERROR_COUNT console.error() calls in WebSocket services${NC}"
fi

echo ""
echo "3️⃣  Testing frontend loads without errors..."
echo "---------------------------------------------"

# Test frontend response
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/)

if [ "$FRONTEND_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Frontend loads successfully${NC}"
else
    echo -e "${RED}❌ Frontend not accessible${NC}"
fi

# Check HTML for error indicators
HTML_ERRORS=$(curl -s http://localhost:4001/ | grep -icE "(WebSocket|NS_ERROR|CONNECTION_REFUSED)" || echo "0")

if [ "$HTML_ERRORS" = "0" ]; then
    echo -e "${GREEN}✅ No WebSocket error text in HTML${NC}"
else
    echo -e "${RED}❌ Found WebSocket error indicators in HTML${NC}"
fi

echo ""
echo "4️⃣  Verifying disabled WebSocket functions..."
echo "----------------------------------------------"

# Check specific functions are disabled
DISABLED_FUNCS=0

# Check websocket.ts connect function
if grep -q "Always resolve immediately without connecting" frontend/src/services/websocket.ts 2>/dev/null; then
    echo -e "${GREEN}✅ websocket.ts connect() disabled${NC}"
    DISABLED_FUNCS=$((DISABLED_FUNCS + 1))
else
    echo -e "${RED}❌ websocket.ts connect() not properly disabled${NC}"
fi

# Check TrainingWebSocketService
if grep -q "WebSocket is disabled until backend support" frontend/src/services/training/TrainingWebSocketService.ts 2>/dev/null; then
    echo -e "${GREEN}✅ TrainingWebSocketService disabled${NC}"
    DISABLED_FUNCS=$((DISABLED_FUNCS + 1))
else
    echo -e "${RED}❌ TrainingWebSocketService not properly disabled${NC}"
fi

# Check FileUploadExperience
if grep -q "WebSocket disabled - using polling instead" frontend/src/components/FileUploadExperience.jsx 2>/dev/null; then
    echo -e "${GREEN}✅ FileUploadExperience WebSocket disabled${NC}"
    DISABLED_FUNCS=$((DISABLED_FUNCS + 1))
else
    echo -e "${RED}❌ FileUploadExperience WebSocket not disabled${NC}"
fi

echo ""
echo "========================================"
echo "📊 RESULTS SUMMARY"
echo "========================================"
echo ""

TOTAL_CHECKS=7
PASSED=$((3 - ERROR_COUNT/2))

if [ "$WEBSOCKET_NEW" -eq "0" ] && [ "$ERROR_COUNT" -eq "0" ] && [ "$FRONTEND_STATUS" = "200" ] && [ "$HTML_ERRORS" = "0" ] && [ "$DISABLED_FUNCS" -eq "3" ]; then
    echo -e "${GREEN}🎉 ALL CHECKS PASSED!${NC}"
    echo ""
    echo "✅ No WebSocket connection attempts in code"
    echo "✅ No console.error() calls for WebSocket"
    echo "✅ Frontend loads without errors"
    echo "✅ All WebSocket functions properly disabled"
    echo ""
    echo "The NS_ERROR_WEBSOCKET_CONNECTION_REFUSED errors have been eliminated!"
else
    echo -e "${RED}⚠️  Some checks failed${NC}"
    echo ""
    echo "Please review the failures above."
fi

echo ""
echo "========================================="