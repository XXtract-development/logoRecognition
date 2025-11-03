#!/bin/bash

echo "🔒 Running Security Scans..."

# OWASP ZAP Scan
echo "Running OWASP ZAP baseline scan..."
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t http://localhost:8000 \
  -r zap-report.html \
  -J zap-report.json

# Dependency Check
echo "Checking dependencies for vulnerabilities..."
npm audit --audit-level=moderate
pnpm audit --audit-level=moderate

# Container Security Scan with Trivy
echo "Scanning containers for vulnerabilities..."
trivy image logo-recognition-api:latest
trivy image logo-recognition-web:latest

# Secret Detection
echo "Scanning for exposed secrets..."
trufflehog filesystem . --json > secrets-report.json

# SAST with Semgrep
echo "Running static analysis..."
semgrep --config=auto --json -o semgrep-report.json .

echo "✅ Security scans complete!"
