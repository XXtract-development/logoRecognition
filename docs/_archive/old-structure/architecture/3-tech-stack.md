# 3. Tech Stack

## ⚠️ CRITICAL: Technology Stack Enforcement

**MANDATORY FOR ALL DEVELOPER AGENTS:**
This Technology Stack Table defines the EXACT versions that MUST be used in this project. Developer agents are STRICTLY PROHIBITED from:
- Using different versions than specified
- Adding new technologies without architecture approval
- Downgrading to older versions
- Using alternative libraries for the same purpose

**ALWAYS use the LATEST stable versions as specified below. This table is updated regularly to ensure we use the most current, secure, and performant versions.**

## 3.1 Technology Stack Table

| Category | Technology | EXACT Version | Purpose | Enforcement Notes |
|----------|-----------|---------------|---------|-------------------|
| Frontend Language | TypeScript | 5.7.2 | Type-safe frontend development | LATEST stable - NO older versions |
| Frontend Framework | React | 18.3.1 | UI component framework | LATEST 18.x - DO NOT use 17.x |
| UI Component Library | Ant Design | 5.22.5 | Pre-built UI components | LATEST 5.x - Critical security updates |
| State Management | Zustand | 5.0.2 | Client state management | LATEST stable - Breaking changes from 4.x |
| Backend Language | Python | 3.13.1 | Backend development | LATEST stable - Performance improvements |
| Backend Framework | FastAPI | 0.115.5 | REST API framework | LATEST - Security patches included |
| API Style | REST + WebSocket | N/A | API communication | WebSocket via fastapi-websocket |
| Primary Database | PostgreSQL | 17.2 | Main data storage | LATEST stable - DO NOT use < 16 |
| Vector Extension | pgvector | 0.8.0 | Vector similarity search | LATEST - Performance critical |
| Cache | Redis | 7.4.2 | Session and result caching | LATEST 7.x stable |
| File Storage | S3/MinIO | RELEASE.2024-12-18 | Image and model storage | LATEST MinIO release |
| Authentication | JWT + OAuth2 | pyjwt==2.10.1 | User authentication | LATEST security patches |
| ML Framework | PyTorch | 2.5.1 | Model training | LATEST stable with CUDA 12.4 |
| ML Runtime | ONNX Runtime | 1.20.1 | Model inference | LATEST - Critical optimizations |
| Object Detection | EfficientDet-D4 | tf-2.18.0 | Logo detection | TensorFlow 2.18.0 implementation |
| Task Queue | Celery | 5.4.0 | Async task processing | LATEST stable release |
| Frontend Testing | Vitest | 2.1.8 | Unit/integration testing | LATEST - Much faster than 1.x |
| Backend Testing | pytest | 8.3.4 | Backend testing | LATEST with new fixtures |
| E2E Testing | Playwright | 1.49.1 | End-to-end testing | LATEST - New browser versions |
| Build Tool | Vite | 6.0.3 | Frontend build tool | LATEST major version |
| Bundler | Rollup | 4.28.1 | JavaScript bundling | Via Vite 6.x |
| Container | Docker | 27.4.1 | Containerization | LATEST stable |
| Orchestration | Coolify | 4.0+ | Self-hosted deployment platform | Docker-based deployment orchestration |
| IaC Tool | Terraform | 1.10.3 | Infrastructure as Code | LATEST with OpenTofu compat |
| CI/CD | GitHub Actions | N/A | Continuous Integration | Use actions/checkout@v4 |
| Monitoring | Prometheus | 3.0.1 | Metrics collection | LATEST v3 with new features |
| Monitoring UI | Grafana | 11.4.0 | Metrics visualization | LATEST stable |
| Logging | OpenSearch | 2.18.0 | Centralized logging | Replace ELK with OpenSearch |
| CSS Framework | TailwindCSS | 3.4.17 | Utility-first CSS | LATEST 3.x stable |
| Package Manager (Frontend) | pnpm | 9.15.1 | Monorepo management | LATEST - REQUIRED for workspaces |
| Node.js Runtime | Node.js | 22.12.0 LTS | JavaScript runtime | LATEST LTS - NO older versions |

## 3.2 Version Update Policy

### Automatic Updates Required
- **Security Patches:** Apply immediately when available
- **Minor Versions:** Update monthly during maintenance windows
- **Major Versions:** Evaluate quarterly, update if backward compatible

### Version Lock Files
```json
// package.json - EXACT versions enforced
{
  "dependencies": {
    "react": "18.3.1",
    "typescript": "5.7.2",
    "zustand": "5.0.2",
    "@ant-design/components": "5.22.5"
  },
  "engines": {
    "node": ">=22.12.0",
    "pnpm": ">=9.15.1"
  }
}
```

```python
# requirements.txt - EXACT versions enforced
fastapi==0.115.5
pydantic==2.10.3
sqlalchemy==2.0.36
celery==5.4.0
pytest==8.3.4
torch==2.5.1
onnxruntime==1.20.1
```

## 3.3 Developer Agent Compliance

**CRITICAL RULES FOR DEVELOPER AGENTS:**

1. **Version Checking:** ALWAYS verify the exact version before installation
2. **No Downgrades:** NEVER use older versions than specified
3. **No Alternatives:** NEVER substitute with similar libraries
4. **Update Commands:** Use these EXACT commands:
   ```bash
   # Frontend
   pnpm add react@18.3.1 typescript@5.7.2 --save-exact

   # Backend
   pip install fastapi==0.115.5 torch==2.5.1 --upgrade
   ```
5. **Verification:** After installation, verify versions:
   ```bash
   # Frontend
   pnpm list react typescript

   # Backend
   pip show fastapi torch
   ```

## 3.4 Technology Stack Validation

Developer agents MUST validate the stack before ANY development:

```bash
# Run stack validation script
./scripts/validate-stack.sh

# Expected output:
# ✅ TypeScript: 5.7.2 (latest)
# ✅ React: 18.3.1 (latest)
# ✅ Python: 3.13.1 (latest)
# ✅ FastAPI: 0.115.5 (latest)
# ... all technologies validated
```

**FAILURE TO COMPLY WITH THIS TECHNOLOGY STACK WILL RESULT IN REJECTED CODE REVIEWS**

---
