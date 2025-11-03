# Coolify Deployment Guide
## Logo Recognition System

---

## 1. Introduction to Coolify

Coolify is a self-hosted, open-source platform that provides Heroku/Vercel-like deployment capabilities without the enterprise costs. It's perfect for the Logo Recognition System as it offers:

- **Simple Docker deployments** without Kubernetes complexity
- **Automatic SSL certificates** via Let's Encrypt
- **Built-in monitoring** and health checks
- **Git-based deployments** with automatic rollbacks
- **Cost-effective scaling** on your own infrastructure

---

## 2. Infrastructure Requirements

### 2.1 Server Specifications

**Minimum Requirements (Development/Testing):**
```yaml
CPU: 4 cores
RAM: 8 GB
Storage: 100 GB SSD
Network: 100 Mbps
OS: Ubuntu 22.04 LTS
```

**Recommended Requirements (Production):**
```yaml
CPU: 8+ cores
RAM: 16-32 GB
Storage: 500 GB SSD (RAID)
Network: 1 Gbps
OS: Ubuntu 22.04 LTS
```

### 2.2 Cost Comparison

| Platform | Monthly Cost | Notes |
|----------|-------------|-------|
| **Coolify (Self-hosted)** | €40-100 | VPS/Dedicated server only |
| AWS (comparable) | €300-500 | EC2, RDS, S3, ALB, etc. |
| Vercel + External Services | €200-400 | Vercel Pro + Database + Storage |
| Heroku | €250-450 | Dyno + Database + Add-ons |

**Savings: 60-80% compared to cloud platforms**

---

## 3. Coolify Installation

### 3.1 Install Coolify on Server

```bash
# SSH into your server
ssh root@your-server-ip

# Run Coolify installation script
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

# The script will:
# - Install Docker
# - Install Docker Compose
# - Set up Coolify
# - Configure Traefik
# - Start all services
```

### 3.2 Access Coolify Dashboard

```bash
# After installation, access at:
https://your-server-ip:8000

# Default credentials are shown in terminal
# Change them immediately!
```

---

## 4. Project Configuration

### 4.1 Create Coolify Application Structure

```yaml
# coolify-compose.yml
version: '3.8'

services:
  # Frontend - React Application
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.coolify
    environment:
      - REACT_APP_API_URL=${API_URL}
      - NODE_ENV=production
    labels:
      - coolify.managed=true
      - coolify.type=application
      - coolify.domain=${FRONTEND_DOMAIN}
      - coolify.ssl=true
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Backend - FastAPI Application
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.coolify
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - S3_ENDPOINT=${S3_ENDPOINT}
      - JWT_SECRET=${JWT_SECRET}
    labels:
      - coolify.managed=true
      - coolify.type=application
      - coolify.domain=${API_DOMAIN}
      - coolify.ssl=true
      - coolify.port=8000
    depends_on:
      - postgres
      - redis
      - minio
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Celery Worker
  celery:
    build:
      context: ./backend
      dockerfile: Dockerfile.coolify
    command: celery -A app.celery_app worker --loglevel=info
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - S3_ENDPOINT=${S3_ENDPOINT}
    labels:
      - coolify.managed=true
      - coolify.type=worker
    depends_on:
      - redis
      - postgres

  # PostgreSQL Database
  postgres:
    image: postgres:17-alpine
    environment:
      - POSTGRES_DB=${DB_NAME}
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    labels:
      - coolify.managed=true
      - coolify.type=database
      - coolify.persistent=true

  # Redis Cache
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    labels:
      - coolify.managed=true
      - coolify.type=cache
      - coolify.persistent=true

  # MinIO Object Storage
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=${MINIO_USER}
      - MINIO_ROOT_PASSWORD=${MINIO_PASSWORD}
    volumes:
      - minio_data:/data
    labels:
      - coolify.managed=true
      - coolify.type=storage
      - coolify.domain=${STORAGE_DOMAIN}
      - coolify.port=9001
      - coolify.persistent=true

  # Prometheus Monitoring
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./infrastructure/prometheus:/etc/prometheus
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    labels:
      - coolify.managed=true
      - coolify.type=monitoring

  # Grafana Dashboard
  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
    labels:
      - coolify.managed=true
      - coolify.type=monitoring
      - coolify.domain=${MONITORING_DOMAIN}
      - coolify.ssl=true

volumes:
  postgres_data:
  redis_data:
  minio_data:
  prometheus_data:
  grafana_data:
```

### 4.2 Environment Configuration

```bash
# .env.coolify
# Domain Configuration
FRONTEND_DOMAIN=app.yourdomain.com
API_DOMAIN=api.yourdomain.com
STORAGE_DOMAIN=storage.yourdomain.com
MONITORING_DOMAIN=monitor.yourdomain.com

# API Configuration
API_URL=https://api.yourdomain.com
REACT_APP_API_URL=https://api.yourdomain.com

# Database Configuration
DB_NAME=logo_recognition
DB_USER=logo_user
DB_PASSWORD=secure_password_here
DATABASE_URL=postgresql://logo_user:secure_password_here@postgres:5432/logo_recognition

# Redis Configuration
REDIS_URL=redis://redis:6379/0

# MinIO Configuration
MINIO_USER=minioadmin
MINIO_PASSWORD=secure_minio_password
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=secure_minio_password
S3_BUCKET=logo-images

# Security
JWT_SECRET=your_jwt_secret_key_here

# Monitoring
GRAFANA_PASSWORD=secure_grafana_password
```

---

## 5. Deployment Process

### 5.1 Initial Setup in Coolify UI

1. **Add New Project:**
   ```
   Dashboard → Projects → New Project
   Name: Logo Recognition System
   ```

2. **Add Git Repository:**
   ```
   Settings → Git → Add Repository
   URL: https://github.com/yourusername/logoRecognition
   Branch: main
   ```

3. **Configure Build:**
   ```
   Build → Docker Compose
   File: coolify-compose.yml
   Environment: Production
   ```

4. **Set Environment Variables:**
   ```
   Environment → Add Variables
   [Paste all variables from .env.coolify]
   ```

5. **Configure Domains:**
   ```
   Domains → Add Domain
   - app.yourdomain.com → frontend
   - api.yourdomain.com → backend
   - storage.yourdomain.com → minio
   - monitor.yourdomain.com → grafana
   ```

### 5.2 Deployment Commands

```bash
# Deploy via Coolify CLI
coolify deploy --project logo-recognition --env production

# Or via Git push (if webhooks configured)
git push origin main
# Coolify automatically deploys on push

# Manual deployment from UI
# Dashboard → Projects → Logo Recognition → Deploy
```

### 5.3 GitHub Actions Integration

```yaml
# .github/workflows/deploy-coolify.yml
name: Deploy to Coolify

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Coolify
        run: |
          curl -X POST ${{ secrets.COOLIFY_WEBHOOK_URL }} \
            -H "Content-Type: application/json" \
            -d '{"ref": "main", "deploy": true}'

      - name: Wait for deployment
        run: sleep 60

      - name: Health check
        run: |
          curl -f https://api.yourdomain.com/health || exit 1
          curl -f https://app.yourdomain.com || exit 1
```

---

## 6. Scaling Configuration

### 6.1 Horizontal Scaling

```yaml
# coolify-scaling.yml
services:
  backend:
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure

  celery:
    deploy:
      replicas: 5
      restart_policy:
        condition: on-failure

  frontend:
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
```

### 6.2 Resource Limits

```yaml
# Resource constraints per service
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G

  celery:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 1G

  postgres:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
```

---

## 7. Monitoring & Maintenance

### 7.1 Coolify Monitoring Features

```yaml
Built-in Monitoring:
  - Container health checks
  - Resource usage graphs
  - Application logs
  - Deployment history
  - Automatic alerts

Access at:
  - Dashboard → Projects → Logo Recognition → Monitoring
```

### 7.2 Application Metrics

```bash
# Prometheus metrics available at:
https://monitor.yourdomain.com/metrics

# Grafana dashboards at:
https://monitor.yourdomain.com

# Pre-configured dashboards:
- System Overview
- API Performance
- ML Model Metrics
- Database Performance
- Redis Cache Hit Rate
```

### 7.3 Backup Strategy

```bash
# Automated daily backups via Coolify
coolify backup create --project logo-recognition

# Backup configuration
cat > backup-config.yml << EOF
schedule: "0 2 * * *"  # Daily at 2 AM
retention: 30  # Keep 30 days
destinations:
  - type: s3
    bucket: backups
  - type: local
    path: /backups
include:
  - postgres_data
  - minio_data
  - redis_data
EOF

# Restore from backup
coolify backup restore --project logo-recognition --backup-id <id>
```

---

## 8. Security Configuration

### 8.1 SSL/TLS Configuration

```yaml
# Automatic via Let's Encrypt
# Configured in coolify-compose.yml with labels:
labels:
  - coolify.ssl=true
  - coolify.ssl.email=admin@yourdomain.com

# Force HTTPS redirect
  - coolify.ssl.redirect=true
```

### 8.2 Firewall Rules

```bash
# UFW configuration
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 8000/tcp  # Coolify Dashboard
ufw enable
```

### 8.3 Security Headers

```yaml
# Automatically added by Coolify/Traefik:
- Strict-Transport-Security
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection
- Content-Security-Policy
```

---

## 9. Troubleshooting

### 9.1 Common Issues

```bash
# Container not starting
coolify logs --project logo-recognition --service backend

# Database connection issues
coolify exec --project logo-recognition --service postgres \
  psql -U logo_user -d logo_recognition

# Redis connection issues
coolify exec --project logo-recognition --service redis \
  redis-cli ping

# Storage issues
coolify exec --project logo-recognition --service minio \
  mc admin info local
```

### 9.2 Performance Tuning

```bash
# Increase Docker resources
cat >> /etc/docker/daemon.json << EOF
{
  "storage-driver": "overlay2",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

systemctl restart docker
```

---

## 10. Migration from Docker Compose

### 10.1 Quick Migration Steps

```bash
# 1. Export current data
docker-compose exec postgres pg_dump -U user -d logo_recognition > backup.sql
docker-compose exec redis redis-cli --rdb /tmp/dump.rdb

# 2. Copy configuration files
cp docker-compose.yml coolify-compose.yml
cp .env .env.coolify

# 3. Update compose file with Coolify labels
# Add labels section to each service

# 4. Push to repository
git add coolify-compose.yml .env.coolify
git commit -m "Add Coolify configuration"
git push origin main

# 5. Deploy via Coolify
# Follow Section 5.1 steps
```

### 10.2 Data Migration

```bash
# Import database
coolify exec --project logo-recognition --service postgres \
  psql -U logo_user -d logo_recognition < backup.sql

# Import Redis data
coolify exec --project logo-recognition --service redis \
  redis-cli --rdb /data/dump.rdb

# Sync MinIO data
coolify exec --project logo-recognition --service minio \
  mc mirror /local/data local/logo-images
```

---

## 11. Cost Analysis

### 11.1 Total Cost Breakdown

| Component | Self-hosted (Coolify) | AWS Equivalent |
|-----------|---------------------|----------------|
| Server/Compute | €80/month (Hetzner) | €200/month (EC2) |
| Database | Included | €75/month (RDS) |
| Storage (500GB) | Included | €50/month (S3) |
| Load Balancer | Included (Traefik) | €25/month (ALB) |
| SSL Certificates | Free (Let's Encrypt) | €15/month |
| Monitoring | Included | €50/month (CloudWatch) |
| **Total** | **€80/month** | **€415/month** |

**Annual Savings: €4,020**

### 11.2 Scaling Costs

```yaml
Small (MVP):
  - 1 Server: €40/month
  - Supports: 100 users

Medium (Growth):
  - 1 Server: €80/month
  - Supports: 1,000 users

Large (Enterprise):
  - 2-3 Servers: €200-300/month
  - Supports: 10,000+ users
  - Still 70% cheaper than cloud
```

---

## 12. Conclusion

Coolify provides an excellent deployment platform for the Logo Recognition System with:

- **80% cost reduction** compared to cloud platforms
- **Simplified operations** without Kubernetes complexity
- **Professional features** (SSL, monitoring, scaling)
- **Full control** over infrastructure
- **Easy migration** from Docker Compose

The platform is production-ready and can scale from MVP to enterprise deployments while maintaining cost efficiency and operational simplicity.

---

*Document Version: 1.0*
*Last Updated: September 2024*
*Platform: Coolify 4.0+*