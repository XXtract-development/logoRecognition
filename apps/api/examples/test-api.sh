#!/bin/bash

# API Testing Script
# Uitgebreide tests voor de Logo Recognition API in Docker

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:8000}"
TIMEOUT=5

# Helper Functions
print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

print_test() {
    echo -e "${BLUE}🧪 $1${NC}"
}

# Test 1: Container Status
print_header "Test 1: Docker Container Status"
print_test "Checking if API container is running..."

if docker ps | grep -q "logo-recognition-api"; then
    CONTAINER_STATUS=$(docker ps --filter "name=logo-recognition-api" --format "{{.Status}}")
    print_success "Container is running: $CONTAINER_STATUS"
else
    print_error "Container is not running!"
    print_info "Start with: docker-compose up -d api"
    exit 1
fi

# Test 2: Health Endpoint
print_header "Test 2: Health Check Endpoint"
print_test "Testing GET $API_URL/health"

HEALTH_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" --max-time $TIMEOUT "$API_URL/health")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$HEALTH_RESPONSE" | grep -v "HTTP_CODE:")

if [ "$HTTP_CODE" == "200" ]; then
    print_success "Health check passed (HTTP $HTTP_CODE)"
    echo "Response: $BODY"

    # Validate JSON response
    if echo "$BODY" | jq -e '.status' > /dev/null 2>&1; then
        STATUS=$(echo "$BODY" | jq -r '.status')
        TIMESTAMP=$(echo "$BODY" | jq -r '.timestamp')

        print_success "Status: $STATUS"
        print_success "Timestamp: $TIMESTAMP"
    else
        print_error "Invalid JSON response"
    fi
else
    print_error "Health check failed (HTTP $HTTP_CODE)"
    echo "Response: $BODY"
    exit 1
fi

# Test 3: Response Time
print_header "Test 3: Response Time"
print_test "Measuring API response time..."

START_TIME=$(date +%s%N)
curl -s "$API_URL/health" > /dev/null
END_TIME=$(date +%s%N)

DURATION_NS=$((END_TIME - START_TIME))
DURATION_MS=$((DURATION_NS / 1000000))

if [ $DURATION_MS -lt 100 ]; then
    print_success "Response time: ${DURATION_MS}ms (excellent)"
elif [ $DURATION_MS -lt 500 ]; then
    print_success "Response time: ${DURATION_MS}ms (good)"
else
    print_info "Response time: ${DURATION_MS}ms (acceptable)"
fi

# Test 4: CORS Headers
print_header "Test 4: CORS Configuration"
print_test "Checking CORS headers..."

HEADERS=$(curl -s -I -X OPTIONS \
    -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: GET" \
    "$API_URL/health")

if echo "$HEADERS" | grep -qi "access-control-allow-origin"; then
    CORS_ORIGIN=$(echo "$HEADERS" | grep -i "access-control-allow-origin" | cut -d: -f2- | tr -d '\r')
    print_success "CORS enabled:$CORS_ORIGIN"
else
    print_info "CORS headers not found (may be OK depending on configuration)"
fi

# Test 5: Container Logs
print_header "Test 5: Container Logs"
print_test "Checking recent container logs..."

LOGS=$(docker-compose logs --tail=5 api 2>&1)
if [ $? -eq 0 ]; then
    print_success "Logs retrieved successfully"
    echo "$LOGS"
else
    print_error "Failed to retrieve logs"
fi

# Test 6: Port Accessibility
print_header "Test 6: Port Accessibility"
print_test "Checking if port 8000 is accessible..."

if nc -z localhost 8000 2>/dev/null; then
    print_success "Port 8000 is accessible"
else
    print_error "Port 8000 is not accessible"
    print_info "Check port mapping in docker-compose.yml"
fi

# Test 7: Multiple Requests (Load Test Light)
print_header "Test 7: Multiple Requests"
print_test "Sending 10 concurrent requests..."

SUCCESS_COUNT=0
TOTAL_REQUESTS=10

for i in $(seq 1 $TOTAL_REQUESTS); do
    if curl -s --max-time $TIMEOUT "$API_URL/health" > /dev/null 2>&1; then
        ((SUCCESS_COUNT++))
    fi &
done

wait

if [ $SUCCESS_COUNT -eq $TOTAL_REQUESTS ]; then
    print_success "All $TOTAL_REQUESTS requests successful"
elif [ $SUCCESS_COUNT -gt $((TOTAL_REQUESTS / 2)) ]; then
    print_info "$SUCCESS_COUNT/$TOTAL_REQUESTS requests successful"
else
    print_error "Only $SUCCESS_COUNT/$TOTAL_REQUESTS requests successful"
fi

# Test 8: Container Resource Usage
print_header "Test 8: Container Resources"
print_test "Checking container resource usage..."

STATS=$(docker stats logo-recognition-api --no-stream --format "CPU: {{.CPUPerc}} | Memory: {{.MemUsage}}")
print_success "$STATS"

# Test 9: Environment Variables
print_header "Test 9: Environment Variables"
print_test "Checking environment configuration..."

ENV_VARS=$(docker exec logo-recognition-api env | grep -E "NODE_ENV|PORT|HOST")
if [ ! -z "$ENV_VARS" ]; then
    print_success "Environment variables:"
    echo "$ENV_VARS"
else
    print_info "No environment variables found"
fi

# Test 10: API Endpoints Discovery
print_header "Test 10: API Endpoints"
print_test "Testing available endpoints..."

# Health endpoint
if curl -s --max-time $TIMEOUT "$API_URL/health" > /dev/null 2>&1; then
    print_success "✓ GET  /health"
else
    print_error "✗ GET  /health"
fi

# API v1 endpoint (placeholder - will 404 until implemented)
if curl -s --max-time $TIMEOUT "$API_URL/api/v1/recognition" > /dev/null 2>&1; then
    print_success "✓ POST /api/v1/recognition"
else
    print_info "✗ POST /api/v1/recognition (not implemented yet)"
fi

# Summary
print_header "Test Summary"

echo -e "${GREEN}✅ All critical tests passed!${NC}"
echo ""
echo "API Status: Healthy"
echo "API URL: $API_URL"
echo "Container: logo-recognition-api"
echo "Response Time: ${DURATION_MS}ms"
echo ""
print_info "Use 'docker-compose logs -f api' to monitor real-time logs"
print_info "Use 'curl $API_URL/health' to quickly check API status"
