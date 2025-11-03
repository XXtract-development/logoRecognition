# 14. Deployment Architecture

## 14.1 Deployment Strategy

**Frontend Deployment:**
- **Platform:** Coolify Static Site
- **Build Command:** `pnpm build:web`
- **Output Directory:** `apps/web/dist`
- **CDN/Edge:** Coolify built-in reverse proxy with Traefik

**Backend Deployment:**
- **Platform:** Coolify Docker Service
- **Build Command:** `docker build -f apps/api/Dockerfile`
- **Deployment Method:** Zero-downtime rolling updates via Coolify

## 14.2 CI/CD Pipeline

```yaml
name: Deploy to Coolify

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install
      - name: Run tests
        run: |
          pnpm test
          python -m pytest backend/tests/

  deploy-frontend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - name: Build frontend
        run: |
          pnpm install
          pnpm build:web
      - name: Deploy to Coolify
        run: |
          curl -X POST "${{ secrets.COOLIFY_WEBHOOK_URL }}/frontend" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"ref": "main"}'

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Coolify
        run: |
          curl -X POST "${{ secrets.COOLIFY_WEBHOOK_URL }}/backend" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"ref": "main"}'
```

## 14.3 Coolify Configuration

### Frontend Application (Static Site)
```yaml
# coolify-frontend.yaml
name: logo-recognition-frontend
type: static-site
repository: https://github.com/your-org/logo-recognition
build_command: "pnpm install && pnpm build:web"
output_directory: "frontend/dist"
domain: "logo-app.yourdomain.com"
ssl: true
```

### Backend Application (Docker Service)
```yaml
# coolify-backend.yaml
name: logo-recognition-backend
type: docker-service
repository: https://github.com/your-org/logo-recognition
dockerfile: "backend/Dockerfile"
domain: "api.logo-app.yourdomain.com"
ssl: true
port: 8000
environment:
  - DATABASE_URL=postgresql://user:pass@postgres:5432/logo_recognition
  - REDIS_URL=redis://redis:6379
  - MINIO_ENDPOINT=minio:9000
healthcheck:
  enabled: true
  path: "/health"
  interval: 30s
  timeout: 10s
  retries: 3
```

### Database Service (PostgreSQL)
```yaml
# coolify-postgres.yaml
name: logo-recognition-postgres
type: postgres
version: "15"
database: logo_recognition
username: postgres
volume: postgres_data
extensions:
  - pgvector
```

### Cache Service (Redis)
```yaml
# coolify-redis.yaml
name: logo-recognition-redis
type: redis
version: "7"
volume: redis_data
```

### Object Storage (MinIO)
```yaml
# coolify-minio.yaml
name: logo-recognition-minio
type: minio
access_key: minioadmin
secret_key: minioadmin123
volume: minio_data
```

## 14.4 Infrastructure Requirements

### Server Specifications
- **Minimum:** 4 vCPU, 8GB RAM, 100GB SSD
- **Recommended:** 8 vCPU, 16GB RAM, 250GB SSD
- **For ML Training:** GPU-enabled instance (optional)

### Network Configuration
- **Domain:** Configure DNS A records pointing to server IP
- **SSL:** Automatic Let's Encrypt certificates via Coolify
- **Firewall:** Ports 80, 443, 22 (SSH) open

## 14.5 Environment Configuration

### Production Environment Variables
```bash
# Backend (.env)
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/logo_recognition
REDIS_URL=redis://redis:6379
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
JWT_SECRET_KEY=your-secret-key
ENVIRONMENT=production
LOG_LEVEL=INFO
```

### Frontend Environment Variables
```bash
# Frontend (.env.production)
VITE_API_URL=https://api.logo-app.yourdomain.com
VITE_WS_URL=wss://api.logo-app.yourdomain.com
VITE_ENVIRONMENT=production
```

## 14.6 Monitoring and Observability

### Built-in Coolify Monitoring
- **Application Logs:** Automatic log aggregation
- **Resource Metrics:** CPU, memory, disk usage
- **Health Checks:** Automated endpoint monitoring
- **Alerts:** Email/Slack notifications on failures

### Additional Monitoring Stack
```yaml
# Deployed as separate Coolify services
prometheus:
  type: docker-service
  image: prom/prometheus:latest
  port: 9090
  volumes:
    - prometheus_data:/prometheus

grafana:
  type: docker-service
  image: grafana/grafana:latest
  port: 3000
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin123
  volumes:
    - grafana_data:/var/lib/grafana
```

## 14.7 Backup Strategy

### Database Backups
```bash
# Automated daily backups via Coolify
backup_schedule: "0 2 * * *"  # 2 AM daily
retention: 30 days
storage: S3/MinIO bucket
```

### Application Data Backups
- **Images:** Stored in MinIO with versioning
- **Models:** Automatic model versioning in MinIO
- **Configuration:** Git-based configuration management

## 14.8 Scaling Strategy

### Horizontal Scaling
- **Frontend:** CDN caching (Cloudflare optional)
- **Backend:** Multiple container instances
- **Database:** Read replicas for heavy queries
- **Queue:** Redis Cluster for high throughput

### Auto-scaling Configuration
```yaml
scaling:
  enabled: true
  min_replicas: 1
  max_replicas: 5
  cpu_threshold: 70%
  memory_threshold: 80%
```

## 14.9 Security Configuration

### SSL/TLS
- **Automatic:** Let's Encrypt certificates via Coolify
- **Renewal:** Automatic certificate renewal
- **Protocols:** TLS 1.2+ only

### Network Security
- **Firewall:** UFW with restrictive rules
- **VPN:** Optional Wireguard for admin access
- **Rate Limiting:** Traefik middleware configuration

### Application Security
```yaml
security:
  cors:
    allowed_origins:
      - "https://logo-app.yourdomain.com"
  rate_limiting:
    requests_per_minute: 100
  authentication:
    jwt_expiry: 24h
    refresh_token_expiry: 7d
```

## 14.10 Disaster Recovery

### Backup Restoration
1. **Database:** Point-in-time recovery from backups
2. **Applications:** Git-based deployment restoration
3. **Data:** MinIO backup restoration

### High Availability
- **Server Redundancy:** Multiple server deployment
- **Database:** Master-slave replication
- **Load Balancing:** Coolify load balancer

## 14.11 Cost Optimization

### Resource Efficiency
- **Container Limits:** Appropriate CPU/memory limits
- **Auto-shutdown:** Development environment auto-sleep
- **Storage:** Lifecycle policies for old data

### Expected Monthly Costs
- **VPS (8vCPU/16GB):** €50-80/month
- **Domain + SSL:** €10-20/year
- **Backup Storage:** €5-15/month
- **Total Estimated:** €70-110/month

## 14.12 Migration from Kubernetes

### Migration Steps
1. **Export Kubernetes configurations** to Coolify format
2. **Update CI/CD pipelines** for Coolify webhooks
3. **Migrate persistent volumes** to Coolify volumes
4. **Update DNS records** to point to new infrastructure
5. **Test all services** in staging environment
6. **Execute blue-green deployment** for zero downtime

### Configuration Mapping
| Kubernetes | Coolify Equivalent |
|------------|------------------|
| Deployment | Docker Service |
| Service | Traefik Route |
| Ingress | Domain Configuration |
| ConfigMap | Environment Variables |
| Secret | Encrypted Variables |
| PVC | Volume Mount |

---

**Note:** This deployment architecture provides a simplified, cost-effective alternative to Kubernetes while maintaining professional deployment capabilities through Coolify's Docker-based orchestration.