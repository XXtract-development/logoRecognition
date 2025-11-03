#!/bin/bash

# A++ Grade Test Execution Script
# Comprehensive test runner with multiple profiles

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Set Python path
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

echo -e "${GREEN}🧪 Logo Detection API - Test Suite Runner${NC}"
echo "========================================="

# Function to run tests with specific marker
run_test_suite() {
    local suite_name=$1
    local marker=$2
    local extra_args=$3

    echo -e "\n${YELLOW}Running ${suite_name} tests...${NC}"

    if python -m pytest -m "${marker}" ${extra_args} --tb=short; then
        echo -e "${GREEN}✅ ${suite_name} tests passed${NC}"
        return 0
    else
        echo -e "${RED}❌ ${suite_name} tests failed${NC}"
        return 1
    fi
}

# Parse command line arguments
case "${1:-all}" in
    "quick")
        echo "Running quick test suite (unit tests only)..."
        run_test_suite "Unit" "unit and not slow" "--maxfail=3"
        ;;

    "unit")
        echo "Running all unit tests..."
        run_test_suite "Unit" "unit" "-v"
        ;;

    "integration")
        echo "Running integration tests..."
        run_test_suite "Integration" "integration" "-v"
        ;;

    "performance")
        echo "Running performance tests..."
        run_test_suite "Performance" "performance" "-v --benchmark-only"
        ;;

    "security")
        echo "Running security tests..."
        run_test_suite "Security" "security" "-v"
        ;;

    "smoke")
        echo "Running smoke tests..."
        run_test_suite "Smoke" "smoke" "-v --maxfail=1"
        ;;

    "ci")
        echo "Running CI/CD test suite..."
        echo "Excluding slow and flaky tests..."
        python -m pytest \
            -m "not skip_ci and not slow and not flaky" \
            --cov=app \
            --cov-report=xml \
            --cov-report=term-missing:skip-covered \
            --cov-fail-under=70 \
            --maxfail=5 \
            --tb=short
        ;;

    "coverage")
        echo "Running tests with detailed coverage report..."
        python -m pytest \
            --cov=app \
            --cov-report=html \
            --cov-report=term-missing \
            --cov-fail-under=70 \
            -v
        echo -e "${GREEN}Coverage report generated in htmlcov/index.html${NC}"
        ;;

    "parallel")
        echo "Running tests in parallel for speed..."
        python -m pytest \
            -n auto \
            -m "not slow" \
            --tb=short \
            --maxfail=5
        ;;

    "all")
        echo "Running complete test suite..."

        # Run each test category
        local all_passed=true

        run_test_suite "Smoke" "smoke" "--maxfail=1" || all_passed=false
        run_test_suite "Unit" "unit" "" || all_passed=false
        run_test_suite "Integration" "integration" "" || all_passed=false
        run_test_suite "Security" "security" "" || all_passed=false
        run_test_suite "Performance" "performance" "--benchmark-only" || all_passed=false

        if [ "$all_passed" = true ]; then
            echo -e "\n${GREEN}🎉 All test suites passed!${NC}"

            # Generate coverage report
            echo -e "\n${YELLOW}Generating coverage report...${NC}"
            python -m pytest \
                --cov=app \
                --cov-report=html \
                --cov-report=term-missing:skip-covered \
                -q

            echo -e "${GREEN}Coverage report available in htmlcov/index.html${NC}"
            exit 0
        else
            echo -e "\n${RED}Some test suites failed${NC}"
            exit 1
        fi
        ;;

    "watch")
        echo "Starting test watcher..."
        echo "Tests will run automatically on file changes..."

        # Use pytest-watch if available, otherwise use a simple loop
        if command -v ptw &> /dev/null; then
            ptw -- -m "unit and not slow" --tb=short
        else
            echo "Installing pytest-watch for better experience..."
            pip install pytest-watch
            ptw -- -m "unit and not slow" --tb=short
        fi
        ;;

    "failed")
        echo "Running only previously failed tests..."
        python -m pytest --lf -v
        ;;

    "debug")
        echo "Running tests with debugging enabled..."
        python -m pytest \
            -vvv \
            --tb=long \
            --capture=no \
            --pdb-trace \
            -x \
            ${2:-tests/}
        ;;

    "clean")
        echo "Cleaning test artifacts..."
        rm -rf .pytest_cache
        rm -rf htmlcov
        rm -rf .coverage
        rm -rf coverage.xml
        rm -rf .benchmarks
        find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
        echo -e "${GREEN}Test artifacts cleaned${NC}"
        ;;

    *)
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  quick       - Run fast unit tests only"
        echo "  unit        - Run all unit tests"
        echo "  integration - Run integration tests"
        echo "  performance - Run performance benchmarks"
        echo "  security    - Run security tests"
        echo "  smoke       - Run smoke tests"
        echo "  ci          - Run CI/CD test suite"
        echo "  coverage    - Run tests with coverage report"
        echo "  parallel    - Run tests in parallel"
        echo "  all         - Run complete test suite"
        echo "  watch       - Watch for changes and auto-run tests"
        echo "  failed      - Re-run only failed tests"
        echo "  debug       - Run tests with debugging"
        echo "  clean       - Clean test artifacts"
        exit 1
        ;;
esac