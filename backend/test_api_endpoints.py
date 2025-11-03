#!/usr/bin/env python
"""
Test script to verify all API endpoints are working correctly
"""
import requests
import json
import sys
from datetime import datetime

# ANSI color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'
BOLD = '\033[1m'

BASE_URL = "http://localhost:8000"

# Define all endpoints that should exist
ENDPOINTS = [
    # Health check
    ("GET", "/health", None, "Health check"),

    # Original endpoints
    ("GET", "/dataset", None, "Get datasets (original)"),
    ("GET", "/jobs", None, "Get jobs (original)"),

    # API v1 training endpoints (what frontend expects)
    ("GET", "/api/v1/training/dataset", None, "Get training datasets"),
    ("GET", "/api/v1/training/jobs", None, "Get training jobs"),

    # WebSocket endpoint
    ("GET", "/ws", None, "WebSocket endpoint"),

    # Root endpoint
    ("GET", "/", None, "API root"),
]

def test_endpoint(method, path, data, description):
    """Test a single endpoint"""
    url = f"{BASE_URL}{path}"

    try:
        if method == "GET":
            response = requests.get(url)
        elif method == "POST":
            response = requests.post(url, json=data)
        else:
            return f"{RED}✗{RESET}", f"Unsupported method: {method}", None

        if response.status_code == 200:
            return f"{GREEN}✓{RESET}", f"{response.status_code}", response.json()
        elif response.status_code == 404:
            return f"{RED}✗{RESET}", f"{RED}404 Not Found{RESET}", None
        else:
            return f"{YELLOW}⚠{RESET}", f"{YELLOW}{response.status_code}{RESET}", response.text

    except requests.exceptions.ConnectionError:
        return f"{RED}✗{RESET}", f"{RED}Connection failed{RESET}", None
    except Exception as e:
        return f"{RED}✗{RESET}", f"{RED}Error: {str(e)}{RESET}", None

def main():
    print(f"\n{BOLD}Testing Logo Recognition API Endpoints{RESET}")
    print(f"{BOLD}{'='*60}{RESET}\n")
    print(f"Base URL: {BLUE}{BASE_URL}{RESET}\n")

    total = len(ENDPOINTS)
    passed = 0
    failed = 0

    # Test each endpoint
    for method, path, data, description in ENDPOINTS:
        print(f"{BOLD}{method:6}{RESET} {path:40} - {description:30}", end=" ")

        status_icon, status_text, response_data = test_endpoint(method, path, data, description)

        print(f"[{status_icon}] {status_text}")

        if "✓" in status_icon:
            passed += 1
            # Show sample of response data for successful requests
            if response_data:
                data_str = json.dumps(response_data, indent=2)
                if len(data_str) > 100:
                    data_str = data_str[:100] + "..."
                print(f"       Response: {BLUE}{data_str}{RESET}")
        else:
            failed += 1

    # Summary
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}Summary:{RESET}")
    print(f"  Total endpoints tested: {total}")
    print(f"  {GREEN}Passed: {passed}{RESET}")
    print(f"  {RED}Failed: {failed}{RESET}")

    if failed == 0:
        print(f"\n{GREEN}{BOLD}✓ All endpoints are working correctly!{RESET}")
        return 0
    else:
        print(f"\n{RED}{BOLD}✗ {failed} endpoint(s) are not working.{RESET}")
        print(f"\n{YELLOW}Fix required:{RESET}")
        print(f"  The frontend expects these API paths to exist:")
        print(f"  - /api/v1/training/dataset")
        print(f"  - /api/v1/training/jobs")
        print(f"\n  Make sure the backend server implements these endpoints.")
        return 1

if __name__ == "__main__":
    sys.exit(main())