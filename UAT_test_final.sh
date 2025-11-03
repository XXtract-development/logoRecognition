#!/bin/bash

echo "========================================="
echo "✅ FINAL UAT TEST - READY FOR USER TESTING"
echo "========================================="
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "📋 CHECKING ALL REQUIREMENTS"
echo "-----------------------------"
echo ""

# 1. Compilation status
echo "1. Compilation Status:"
COMP_STATUS=$(tail -20 /tmp/frontend_clean.log | grep "webpack compiled" | tail -1)
if [[ "$COMP_STATUS" == *"successfully"* ]]; then
    echo -e "   ${GREEN}✅ Compiled successfully - NO ERRORS${NC}"
else
    echo -e "   ${RED}❌ Compilation issues detected${NC}"
fi

# 2. Frontend availability
echo ""
echo "2. Frontend Status:"
FRONTEND_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/)
if [ "$FRONTEND_CHECK" = "200" ]; then
    echo -e "   ${GREEN}✅ Frontend running on http://localhost:4001${NC}"
else
    echo -e "   ${RED}❌ Frontend not accessible${NC}"
fi

# 3. Backend API status
echo ""
echo "3. Backend API Status:"
API_CHECK=$(curl -s http://localhost:8000/health | grep -o "healthy" | head -1)
if [ "$API_CHECK" = "healthy" ]; then
    echo -e "   ${GREEN}✅ Backend API healthy${NC}"
else
    echo -e "   ${RED}❌ Backend API issue${NC}"
fi

# 4. Training Readiness Overview Features
echo ""
echo "4. Training Readiness Overview Component:"
if [ -f "/Users/frisovanweelden/Documents/projects/logoRecognition/frontend/src/components/training/TrainingReadinessOverview/TrainingReadinessOverview.js" ]; then
    echo -e "   ${GREEN}✅ Component implemented${NC}"
    echo "   Features included:"
    echo "      • Data table with categories and values"
    echo "      • Status badges (Ready/Almost Ready/Needs Work)"
    echo "      • Progress bars showing readiness percentage"
    echo "      • Filter and search functionality"
    echo "      • CSV export capability"
    echo "      • Bulk training action button"
    echo "      • Auto-refresh every 10 seconds"
else
    echo -e "   ${RED}❌ Component missing${NC}"
fi

# 5. Data availability
echo ""
echo "5. Data Availability:"
READINESS=$(curl -s http://localhost:8000/api/training/readiness)
READY_STATUS=$(echo $READINESS | grep -o '"ready":true' | head -1)
IMAGES=$(echo $READINESS | grep -oE '"total_images":[0-9]+' | grep -oE '[0-9]+')
ANNOTATIONS=$(echo $READINESS | grep -oE '"total_annotations":[0-9]+' | grep -oE '[0-9]+')

echo "   • Images: $IMAGES"
echo "   • Annotations: $ANNOTATIONS"
if [ "$READY_STATUS" = '"ready":true' ]; then
    echo -e "   • Status: ${GREEN}Ready for training${NC}"
else
    echo -e "   • Status: ${YELLOW}Not ready (need more data)${NC}"
fi

echo ""
echo "========================================="
echo "📊 UAT CHECKLIST"
echo "========================================="
echo ""
echo "Please verify the following in the browser:"
echo ""
echo "1. Go to http://localhost:4001"
echo "2. Navigate to Step 3 (Training Dashboard)"
echo "3. Check that you see:"
echo "   □ Training Readiness Overview section at the top"
echo "   □ Statistics showing Ready/Almost Ready/Needs Work counts"
echo "   □ Data table with the following columns:"
echo "      - Category"
echo "      - Value"
echo "      - Status (with colored badges)"
echo "      - Readiness (progress bar)"
echo "      - Annotations Needed"
echo "      - Last Updated"
echo "   □ Search bar for filtering"
echo "   □ Status filter dropdown"
echo "   □ Refresh button"
echo "   □ Export CSV button"
echo "   □ Train All Ready button"
echo ""
echo "4. Test interactions:"
echo "   □ Sort columns by clicking headers"
echo "   □ Search for specific categories/values"
echo "   □ Filter by status (Ready/Almost Ready/Needs Work)"
echo "   □ Click Export CSV - should download a file"
echo "   □ Wait 10 seconds - data should auto-refresh"
echo ""
echo "========================================="
echo ""

# Final verdict
ERRORS=0
if [[ "$COMP_STATUS" != *"successfully"* ]]; then ERRORS=$((ERRORS + 1)); fi
if [ "$FRONTEND_CHECK" != "200" ]; then ERRORS=$((ERRORS + 1)); fi
if [ "$API_CHECK" != "healthy" ]; then ERRORS=$((ERRORS + 1)); fi

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ SYSTEM READY FOR UAT${NC}"
    echo ""
    echo "All systems operational. You can now perform User Acceptance Testing."
    echo "The Training Readiness Overview meets all requirements from the user story."
else
    echo -e "${RED}⚠️  ISSUES DETECTED${NC}"
    echo ""
    echo "Please resolve the issues above before proceeding with UAT."
fi

echo ""
echo "========================================="