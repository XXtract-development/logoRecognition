# Security Architecture

**Laatst bijgewerkt:** 2025-11-03

---

## Overview

Security is multi-layered across:
1. Authentication & Authorization
2. API Security
3. Data Security
4. Infrastructure Security
5. Application Security

---

## 1. Authentication & Authorization

### JWT Authentication
- **Algorithm:** HS256 (HMAC with SHA-256)
- **Token Lifetime:** 1 hour (access token)
- **Refresh Token:** 7 days
- **Storage:** HTTP-only cookies (recommended) or localStorage

### Token Structure
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "USER",
  "iat": 1234567890,
  "exp": 1234571490
}
```

### Role-Based Access Control (RBAC)
- **USER:** Basic operations (train, recognize)
- **ADMIN:** All operations + user management

---

## 2. API Security

### HTTPS Only
- **TLS Version:** 1.3
- **Certificate:** Let's Encrypt
- **HSTS:** Enabled with 1 year max-age

### CORS Configuration
```typescript
{
  origin: process.env.ALLOWED_ORIGINS.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}
```

### Rate Limiting
- **Global:** 1000 requests/15min per IP
- **Auth endpoints:** 5 attempts/15min per IP
- **Training:** 5 concurrent jobs per user
- **Recognition:** 50 requests/minute per user

### Input Validation
- **API:** Fastify schemas with TypeBox
- **ML Backend:** Pydantic models
- **File uploads:** Type, size, content validation

### Security Headers (Helmet)
```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
```

---

## 3. Data Security

### Encryption at Rest
- **Database:** PostgreSQL encrypted volumes (AES-256)
- **S3/MinIO:** Server-side encryption (SSE-S3)
- **Secrets:** Environment variables, never in code

### Encryption in Transit
- **API → ML Backend:** HTTPS
- **Frontend → API:** HTTPS
- **WebSocket:** WSS (Secure WebSocket)

### Password Security
- **Hashing:** bcrypt with cost factor 12
- **Salting:** Automatic per bcrypt
- **Password Policy:** Min 8 chars, complexity required

### Sensitive Data
- **PII:** Minimal collection
- **Passwords:** Never logged
- **Tokens:** Secure storage, short-lived

---

## 4. Infrastructure Security

### Network Security
- **Firewall:** UFW/iptables configured
- **Private Networks:** DB, Redis in private subnet
- **Public Access:** Only load balancer exposed

### Container Security
- **Base Images:** Official, minimal (Alpine)
- **Scanning:** Trivy/Snyk for vulnerabilities
- **Non-root:** Containers run as non-root user
- **Read-only:** Root filesystem where possible

### Secrets Management
- **Development:** .env files (gitignored)
- **Production:** Kubernetes Secrets or external vault
- **Rotation:** Quarterly for production secrets

---

## 5. Application Security

### SQL Injection Prevention
- **ORM:** Prisma with parameterized queries
- **No raw SQL:** Unless absolutely necessary
- **Validation:** All user input validated

### XSS Prevention
- **React:** Auto-escaping by default
- **CSP:** Content Security Policy headers
- **Sanitization:** DOMPurify for user HTML

### CSRF Prevention
- **Tokens:** CSRF tokens for state-changing operations
- **SameSite:** Cookies with SameSite=Strict

### File Upload Security
```typescript
// Validation
{
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  validateContent: true, // Magic number check
  sanitizeFilename: true,
  virusScan: true // In production
}
```

### Dependency Security
- **npm audit:** Weekly
- **Dependabot:** Auto PRs for vulnerabilities
- **Lock files:** Committed for reproducibility

---

## Audit Logging

### What We Log
- Authentication attempts (success/failure)
- Authorization failures
- Data mutations (create, update, delete)
- Admin actions
- API errors

### Log Format
```json
{
  "timestamp": "2025-11-03T18:00:00Z",
  "level": "info",
  "userId": "uuid",
  "action": "user.login",
  "ip": "1.2.3.4",
  "userAgent": "...",
  "result": "success",
  "metadata": {}
}
```

### Log Storage
- **Retention:** 90 days
- **Access:** Admin only
- **Encryption:** Yes

---

## Security Checklist

### Development
- [ ] No secrets in code
- [ ] Input validation everywhere
- [ ] SQL injection prevented
- [ ] XSS prevented
- [ ] Dependencies up to date

### Deployment
- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] Rate limiting active
- [ ] Secrets properly managed
- [ ] Backups encrypted

### Monitoring
- [ ] Failed auth attempts monitored
- [ ] Unusual API activity detected
- [ ] Security logs reviewed
- [ ] Vulnerability scans scheduled

---

## Incident Response

### Procedure
1. **Detect:** Monitoring/alerting
2. **Contain:** Isolate affected systems
3. **Investigate:** Root cause analysis
4. **Remediate:** Fix vulnerability
5. **Review:** Post-mortem, improve

### Contacts
- **Security Team:** security@company.com
- **On-Call:** Documented in runbook

---

## Compliance

### GDPR Considerations
- **Data Minimization:** Collect only necessary data
- **Right to Delete:** User deletion implemented
- **Data Export:** User data export API
- **Consent:** Clear consent mechanisms

---

Voor gedetailleerde security specs, zie:
- Archived security docs: `_archive/SECURITY_ARCHITECTURE.md`
- Architecture security: `_archive/old-structure/architecture/15-security-and-performance.md`
