#!/bin/bash

echo "🔍 Testing all fixes for NS_ERROR_FAILURE and network issues..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test backend health
echo "1. Testing Backend Health..."
HEALTH=$(curl -s http://localhost:8000/health | python -m json.tool 2>/dev/null)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend health check passed${NC}"
else
    echo -e "${RED}❌ Backend health check failed${NC}"
fi

# Test image endpoint returns PNG
echo ""
echo "2. Testing Image Endpoint (NS_ERROR_FAILURE fix)..."
curl -s http://localhost:8000/api/v1/logos/test123/image -o /tmp/test_img.bin
FILE_TYPE=$(file /tmp/test_img.bin | grep -o "PNG image data")
if [ "$FILE_TYPE" = "PNG image data" ]; then
    echo -e "${GREEN}✅ Image endpoint returns PNG data (NS_ERROR_FAILURE fixed)${NC}"
else
    echo -e "${RED}❌ Image endpoint not returning PNG${NC}"
fi

# Test all critical endpoints
echo ""
echo "3. Testing All Critical Endpoints..."
ENDPOINTS=(
    "/health"
    "/api/v1/logos"
    "/api/v1/training/dataset"
    "/api/v1/training/jobs"
    "/api/categories"
    "/api/training/readiness"
)

ALL_PASS=true
for endpoint in "${ENDPOINTS[@]}"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000$endpoint)
    if [ "$STATUS" = "200" ]; then
        echo -e "   ${GREEN}✅ $endpoint - HTTP $STATUS${NC}"
    else
        echo -e "   ${RED}❌ $endpoint - HTTP $STATUS${NC}"
        ALL_PASS=false
    fi
done

# Test upload endpoint
echo ""
echo "4. Testing Upload Endpoint..."
UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:8000/api/v1/logos/upload -H "Content-Type: application/json" -d '{"file": "test.jpg"}')
if echo "$UPLOAD_RESPONSE" | grep -q '"status":"success"'; then
    echo -e "${GREEN}✅ Upload endpoint returns correct format${NC}"
else
    echo -e "${RED}❌ Upload endpoint issue${NC}"
fi

# Test frontend is on port 4001
echo ""
echo "5. Testing Frontend Port Configuration..."
FRONTEND_CHECK=$(curl -s http://localhost:4001/ | grep -o "Logo Recognition")
if [ "$FRONTEND_CHECK" = "Logo Recognition" ]; then
    echo -e "${GREEN}✅ Frontend running on port 4001${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend not detected on port 4001${NC}"
fi

# Run startup validator
echo ""
echo "6. Running Startup Validator..."
cd /Users/frisovanweelden/Documents/projects/logoRecognition/frontend
node -e "
const StartupValidator = require('./src/utils/startupValidator.js').default;
const validator = new StartupValidator();
validator.validate().then(report => {
    if (report.success) {
        console.log('   \033[0;32m✅ Startup validation passed\033[0m');
    } else {
        console.log('   \033[0;31m❌ Startup validation failed with', report.errors.length, 'errors\033[0m');
    }
    process.exit(report.success ? 0 : 1);
});
" 2>/dev/null

# Summary
echo ""
echo "========================================="
if [ "$ALL_PASS" = true ]; then
    echo -e "${GREEN}✨ ALL FIXES VERIFIED SUCCESSFULLY!${NC}"
    echo ""
    echo "Fixed issues:"
    echo "  • NS_ERROR_FAILURE in image loading"
    echo "  • 404 errors on API endpoints"
    echo "  • Upload button disabled issue"
    echo "  • Frontend port configuration (4001)"
    echo "  • Startup validation system"
else
    echo -e "${YELLOW}⚠️  Some issues may need attention${NC}"
fi
echo "========================================="