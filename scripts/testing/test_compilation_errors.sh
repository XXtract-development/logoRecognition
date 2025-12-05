#!/bin/bash

echo "🔍 COMPILATION ERROR DETECTION TEST"
echo "===================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check for compilation errors in frontend log
echo "1. Checking for compilation errors..."
echo "-------------------------------------"

# Check latest compilation status
ERRORS=$(tail -100 /tmp/frontend.log | grep -E "Failed to compile|ERROR in|Module not found|Can't resolve|Parsing error" | wc -l)

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}❌ Found $ERRORS compilation errors:${NC}"
    echo ""

    # Show specific errors
    echo "Module Resolution Errors:"
    tail -100 /tmp/frontend.log | grep -E "Module not found|Can't resolve" | head -5

    echo ""
    echo "Parsing Errors:"
    tail -100 /tmp/frontend.log | grep "Parsing error" | head -5

    echo ""
    echo "ESLint Errors:"
    tail -100 /tmp/frontend.log | grep "ERROR in \[eslint\]" -A 2 | head -10

else
    echo -e "${GREEN}✅ No compilation errors found${NC}"
fi

echo ""
echo "2. Checking file existence..."
echo "------------------------------"

# Check if mentioned files exist
FILES_TO_CHECK=(
    "/Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/components/training/TrainingReadinessOverview/index.js"
    "/Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/components/training/TrainingReadinessOverview/index.ts"
    "/Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/components/training/TrainingReadinessOverview/apiUtils.ts"
    "/Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/components/training/TrainingReadinessOverview/utils.ts"
    "/Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/components/training/TrainingReadinessOverview/api.ts"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ EXISTS: $(basename $file)${NC}"
    else
        echo -e "${RED}❌ MISSING: $(basename $file)${NC}"
    fi
done

echo ""
echo "3. Checking webpack status..."
echo "------------------------------"

WEBPACK_STATUS=$(tail -50 /tmp/frontend.log | grep "webpack compiled" | tail -1)
if echo "$WEBPACK_STATUS" | grep -q "with.*error"; then
    echo -e "${RED}❌ Webpack compilation failed${NC}"
    echo "   $WEBPACK_STATUS"
else
    echo -e "${GREEN}✅ Webpack compiled successfully${NC}"
fi

echo ""
echo "4. Testing if app actually works..."
echo "------------------------------------"

# Test if frontend responds
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/ 2>/dev/null)
if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✅ Frontend responds with HTTP 200${NC}"
else
    echo -e "${RED}❌ Frontend not responding (HTTP $RESPONSE)${NC}"
fi

echo ""
echo "===================================="
echo "DIAGNOSIS:"
echo "===================================="

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}The app has compilation errors that need to be fixed.${NC}"
    echo ""
    echo "Issues found:"
    echo "1. ESLint thinks there's an index.ts file that doesn't exist"
    echo "2. Module resolution is failing for TypeScript imports"
    echo ""
    echo "Recommended fixes:"
    echo "• Remove .ts extensions from imports in TypeScript files"
    echo "• Ensure index.js properly exports the component"
    echo "• Clear any cached TypeScript build files"
else
    echo -e "${GREEN}No compilation errors detected.${NC}"
fi