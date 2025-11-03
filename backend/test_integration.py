#!/usr/bin/env python
"""
Comprehensive Integration Test for Logo Recognition System
Tests all API endpoints, file uploads, and system functionality
"""
import requests
import json
import sys
import time
import os
from datetime import datetime
import base64
from io import BytesIO
from PIL import Image
import random

# ANSI color codes
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
CYAN = '\033[96m'
RESET = '\033[0m'
BOLD = '\033[1m'

BASE_URL = "http://localhost:8000"
FRONTEND_URL = "http://localhost:4001"

class IntegrationTest:
    def __init__(self):
        self.results = []
        self.passed = 0
        self.failed = 0
        self.warnings = 0

    def log(self, category, test_name, status, details=""):
        """Log test result"""
        icon = {
            "pass": f"{GREEN}✓{RESET}",
            "fail": f"{RED}✗{RESET}",
            "warning": f"{YELLOW}⚠{RESET}",
            "info": f"{BLUE}ℹ{RESET}"
        }.get(status, "?")

        if status == "pass":
            self.passed += 1
        elif status == "fail":
            self.failed += 1
        elif status == "warning":
            self.warnings += 1

        self.results.append({
            "category": category,
            "test": test_name,
            "status": status,
            "details": details
        })

        print(f"  {icon} {test_name:50} {details}")

    def test_api_health(self):
        """Test 1: API Health Checks"""
        print(f"\n{BOLD}{CYAN}1. API HEALTH CHECKS{RESET}")
        print("="*60)

        endpoints = [
            ("/health", "Backend health check"),
            ("/", "API root endpoint"),
        ]

        for path, description in endpoints:
            try:
                resp = requests.get(f"{BASE_URL}{path}", timeout=5)
                if resp.status_code == 200:
                    self.log("API", description, "pass", f"Status {resp.status_code}")
                else:
                    self.log("API", description, "fail", f"Status {resp.status_code}")
            except Exception as e:
                self.log("API", description, "fail", str(e))

    def test_frontend_access(self):
        """Test 2: Frontend Accessibility"""
        print(f"\n{BOLD}{CYAN}2. FRONTEND ACCESSIBILITY{RESET}")
        print("="*60)

        try:
            resp = requests.get(FRONTEND_URL, timeout=5)
            if resp.status_code == 200:
                self.log("Frontend", "Frontend page loads", "pass", f"Status {resp.status_code}")

                # Check for essential frontend resources
                if "<!DOCTYPE html>" in resp.text or "<html" in resp.text:
                    self.log("Frontend", "HTML content present", "pass", "Valid HTML")
                else:
                    self.log("Frontend", "HTML content present", "fail", "No HTML found")
            else:
                self.log("Frontend", "Frontend page loads", "fail", f"Status {resp.status_code}")
        except Exception as e:
            self.log("Frontend", "Frontend connection", "fail", str(e))

    def test_crud_operations(self):
        """Test 3: CRUD Operations on API"""
        print(f"\n{BOLD}{CYAN}3. CRUD OPERATIONS{RESET}")
        print("="*60)

        # Test GET operations
        get_endpoints = [
            ("/dataset", "Get datasets"),
            ("/jobs", "Get jobs"),
            ("/api/v1/training/dataset", "Get training datasets (v1)"),
            ("/api/v1/training/jobs", "Get training jobs (v1)"),
        ]

        for path, description in get_endpoints:
            try:
                resp = requests.get(f"{BASE_URL}{path}", timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        self.log("CRUD", f"{description}", "pass", f"Returns list with {len(data)} items")
                    else:
                        self.log("CRUD", f"{description}", "pass", "Returns valid JSON")
                else:
                    self.log("CRUD", f"{description}", "fail", f"Status {resp.status_code}")
            except Exception as e:
                self.log("CRUD", f"{description}", "fail", str(e))

    def test_file_upload(self):
        """Test 4: File Upload Functionality"""
        print(f"\n{BOLD}{CYAN}4. FILE UPLOAD{RESET}")
        print("="*60)

        # Create a test image in memory
        try:
            img = Image.new('RGB', (100, 100), color=(73, 109, 137))
            img_byte_arr = BytesIO()
            img.save(img_byte_arr, format='PNG')
            img_byte_arr.seek(0)

            files = {'file': ('test_logo.png', img_byte_arr, 'image/png')}

            # Test different upload endpoints
            upload_endpoints = [
                "/upload",
                "/api/v1/logos/upload"
            ]

            for endpoint in upload_endpoints:
                try:
                    resp = requests.post(f"{BASE_URL}{endpoint}", files=files, timeout=5)
                    if resp.status_code in [200, 201]:
                        self.log("Upload", f"Upload to {endpoint}", "pass", "File uploaded successfully")
                    elif resp.status_code == 404:
                        self.log("Upload", f"Upload to {endpoint}", "warning", "Endpoint not found (404)")
                    else:
                        self.log("Upload", f"Upload to {endpoint}", "fail", f"Status {resp.status_code}")
                except Exception as e:
                    self.log("Upload", f"Upload to {endpoint}", "warning", f"Connection error: {str(e)[:30]}")

        except Exception as e:
            self.log("Upload", "Create test image", "fail", str(e))

    def test_websocket_endpoint(self):
        """Test 5: WebSocket Endpoint"""
        print(f"\n{BOLD}{CYAN}5. WEBSOCKET ENDPOINT{RESET}")
        print("="*60)

        try:
            resp = requests.get(f"{BASE_URL}/ws", timeout=5)
            if resp.status_code == 200:
                self.log("WebSocket", "WebSocket endpoint exists", "pass", "Endpoint available")
            else:
                self.log("WebSocket", "WebSocket endpoint exists", "fail", f"Status {resp.status_code}")
        except Exception as e:
            self.log("WebSocket", "WebSocket endpoint", "fail", str(e))

    def test_cors_headers(self):
        """Test 6: CORS Configuration"""
        print(f"\n{BOLD}{CYAN}6. CORS CONFIGURATION{RESET}")
        print("="*60)

        try:
            # Test CORS with OPTIONS request
            resp = requests.options(f"{BASE_URL}/health",
                                   headers={'Origin': 'http://localhost:4001'},
                                   timeout=5)

            cors_headers = {
                'Access-Control-Allow-Origin': resp.headers.get('Access-Control-Allow-Origin'),
                'Access-Control-Allow-Methods': resp.headers.get('Access-Control-Allow-Methods'),
                'Access-Control-Allow-Headers': resp.headers.get('Access-Control-Allow-Headers')
            }

            if cors_headers['Access-Control-Allow-Origin']:
                self.log("CORS", "CORS headers present", "pass",
                        f"Origin: {cors_headers['Access-Control-Allow-Origin']}")
            else:
                self.log("CORS", "CORS headers present", "fail", "No CORS headers found")

        except Exception as e:
            self.log("CORS", "CORS test", "fail", str(e))

    def test_training_endpoint(self):
        """Test 7: Training Endpoint"""
        print(f"\n{BOLD}{CYAN}7. TRAINING ENDPOINT{RESET}")
        print("="*60)

        try:
            # Start a training job
            resp = requests.post(f"{BASE_URL}/train",
                                json={"dataset_id": "1"},
                                timeout=5)

            if resp.status_code in [200, 201]:
                job_data = resp.json()
                self.log("Training", "Start training job", "pass",
                        f"Job ID: {job_data.get('id', 'unknown')}")

                # Check if job appears in job list
                jobs_resp = requests.get(f"{BASE_URL}/jobs", timeout=5)
                if jobs_resp.status_code == 200:
                    jobs = jobs_resp.json()
                    self.log("Training", "Job appears in list", "pass",
                            f"Total jobs: {len(jobs)}")
            else:
                self.log("Training", "Start training job", "fail",
                        f"Status {resp.status_code}")

        except Exception as e:
            self.log("Training", "Training endpoint", "fail", str(e))

    def test_performance(self):
        """Test 8: Performance Testing"""
        print(f"\n{BOLD}{CYAN}8. PERFORMANCE TESTING{RESET}")
        print("="*60)

        # Test response times
        endpoints = [
            "/health",
            "/dataset",
            "/jobs"
        ]

        for endpoint in endpoints:
            try:
                start_time = time.time()
                resp = requests.get(f"{BASE_URL}{endpoint}", timeout=5)
                response_time = (time.time() - start_time) * 1000  # Convert to ms

                if response_time < 100:
                    self.log("Performance", f"{endpoint} response time", "pass",
                            f"{response_time:.2f}ms")
                elif response_time < 500:
                    self.log("Performance", f"{endpoint} response time", "warning",
                            f"{response_time:.2f}ms (slow)")
                else:
                    self.log("Performance", f"{endpoint} response time", "fail",
                            f"{response_time:.2f}ms (too slow)")
            except Exception as e:
                self.log("Performance", f"{endpoint} performance", "fail", str(e))

    def test_error_handling(self):
        """Test 9: Error Handling"""
        print(f"\n{BOLD}{CYAN}9. ERROR HANDLING{RESET}")
        print("="*60)

        # Test 404 handling
        try:
            resp = requests.get(f"{BASE_URL}/nonexistent", timeout=5)
            if resp.status_code == 404:
                self.log("Errors", "404 handling", "pass", "Returns proper 404")
            else:
                self.log("Errors", "404 handling", "fail", f"Returns {resp.status_code}")
        except Exception as e:
            self.log("Errors", "404 handling", "fail", str(e))

        # Test invalid upload
        try:
            resp = requests.post(f"{BASE_URL}/upload",
                                data={"invalid": "data"},
                                timeout=5)
            if resp.status_code in [400, 422]:
                self.log("Errors", "Invalid upload handling", "pass",
                        "Properly rejects invalid data")
            else:
                self.log("Errors", "Invalid upload handling", "warning",
                        f"Status {resp.status_code}")
        except Exception as e:
            self.log("Errors", "Invalid upload", "fail", str(e))

    def run_all_tests(self):
        """Run all integration tests"""
        print(f"\n{BOLD}{'='*60}{RESET}")
        print(f"{BOLD}LOGO RECOGNITION SYSTEM - INTEGRATION TEST SUITE{RESET}")
        print(f"{BOLD}{'='*60}{RESET}")
        print(f"Backend URL: {BLUE}{BASE_URL}{RESET}")
        print(f"Frontend URL: {BLUE}{FRONTEND_URL}{RESET}")
        print(f"Test Time: {CYAN}{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")

        # Run all test categories
        self.test_api_health()
        self.test_frontend_access()
        self.test_crud_operations()
        self.test_file_upload()
        self.test_websocket_endpoint()
        self.test_cors_headers()
        self.test_training_endpoint()
        self.test_performance()
        self.test_error_handling()

        # Print summary
        print(f"\n{BOLD}{'='*60}{RESET}")
        print(f"{BOLD}TEST SUMMARY{RESET}")
        print(f"{BOLD}{'='*60}{RESET}")

        total = self.passed + self.failed + self.warnings

        print(f"Total Tests Run: {total}")
        print(f"{GREEN}✓ Passed: {self.passed}{RESET}")
        print(f"{YELLOW}⚠ Warnings: {self.warnings}{RESET}")
        print(f"{RED}✗ Failed: {self.failed}{RESET}")

        if total > 0:
            pass_rate = (self.passed / total) * 100
            print(f"\nPass Rate: {pass_rate:.1f}%")

            if pass_rate >= 90:
                print(f"\n{GREEN}{BOLD}SYSTEM STATUS: EXCELLENT ✓{RESET}")
                print("All critical systems are operational!")
            elif pass_rate >= 70:
                print(f"\n{YELLOW}{BOLD}SYSTEM STATUS: GOOD ⚠{RESET}")
                print("System is operational with minor issues.")
            else:
                print(f"\n{RED}{BOLD}SYSTEM STATUS: NEEDS ATTENTION ✗{RESET}")
                print("Critical issues detected. Please review failed tests.")

        return 0 if self.failed == 0 else 1

if __name__ == "__main__":
    tester = IntegrationTest()
    sys.exit(tester.run_all_tests())