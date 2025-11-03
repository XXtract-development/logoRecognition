# MinIO Storage Operations Guide - A++ Production

## Table of Contents
1. [System Overview](#system-overview)
2. [Deployment Guide](#deployment-guide)
3. [Security Configuration](#security-configuration)
4. [Performance Tuning](#performance-tuning)
5. [Monitoring & Alerting](#monitoring--alerting)
6. [Disaster Recovery](#disaster-recovery)
7. [Troubleshooting](#troubleshooting)
8. [SLA Compliance](#sla-compliance)

---

## System Overview

### Architecture
- **4-Node MinIO Cluster** with Erasure Coding (EC:4)
- **Nginx Load Balancer** with health checks
- **Redis Cache** for presigned URLs
- **CloudFront CDN** for global delivery
- **Prometheus + Grafana** for monitoring

### Performance Targets
- Upload Latency: < 100ms (p95)
- CDN Delivery: < 50ms (p95)
- Throughput: > 1000 req/sec
- Availability: 99.99%
- Durability: 99.999999%

---

## Deployment Guide

### Prerequisites
```bash
# Required tools
- Docker 20.10+
- Docker Compose 2.0+
- K6 (for load testing)
- AWS CLI (for CDN management)

# System requirements per node
- CPU: 4 cores minimum
- RAM: 8GB minimum
- Disk: 500GB SSD minimum
- Network: 1Gbps minimum
```

### Step 1: Environment Configuration

```bash
# Copy environment template
cp .env.minio.example .env.minio

# Generate secure credentials
export MINIO_ROOT_USER=$(openssl rand -hex 16)
export MINIO_ROOT_PASSWORD=$(openssl rand -hex 32)
export REDIS_PASSWORD=$(openssl rand -hex 24)

# Edit .env.minio with your values
vim .env.minio
```

**CRITICAL Security Requirements:**
- Never use default credentials
- Use strong passwords (32+ characters)
- Rotate credentials quarterly
- Store credentials in secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault)

### Step 2: Deploy MinIO Cluster

```bash
# Load environment variables
source .env.minio

# Deploy MinIO cluster
docker-compose -f docker-compose.minio.yml up -d

# Verify cluster health
docker-compose -f docker-compose.minio.yml ps
docker exec minio1 mc admin info minio
```

### Step 3: Initialize Storage

```bash
# Wait for cluster to be ready
sleep 30

# Initialize buckets and policies
docker exec minio-client mc alias set myminio http://nginx:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
docker exec minio-client mc mb myminio/logo-images
docker exec minio-client mc versioning enable myminio/logo-images
docker exec minio-client mc ilm add --expiry-days 30 myminio/logo-images
```

### Step 4: Configure CDN

```bash
# Deploy CloudFront distribution
aws cloudfront create-distribution \
  --distribution-config file://infrastructure/cloudfront-config.json

# Get distribution ID
export DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[0].Id" --output text)

# Update .env.minio with CDN details
echo "CLOUDFRONT_DISTRIBUTION_ID=$DISTRIBUTION_ID" >> .env.minio
```

---

## Security Configuration

### 1. Network Security

```yaml
# Firewall rules (iptables/ufw)
# MinIO API
ufw allow from 10.0.0.0/8 to any port 9000
# MinIO Console (admin only)
ufw allow from 192.168.1.0/24 to any port 9001
# Block all other access
ufw default deny incoming
```

### 2. Access Control

```bash
# Create application user with limited permissions
mc admin user add myminio app-user app-password
mc admin policy set myminio readwrite user=app-user

# Disable root access from applications
mc admin config set myminio api root_access=off
```

### 3. Encryption

```bash
# Enable server-side encryption
mc encrypt set sse-s3 myminio/logo-images

# Configure TLS
mc admin config set myminio api tls=on
```

### 4. Audit Logging

```bash
# Enable audit logging
mc admin config set myminio audit_webhook:primary \
  endpoint="https://logging.example.com/minio" \
  auth_token="$AUDIT_TOKEN"
```

---

## Performance Tuning

### MinIO Configuration

```bash
# Optimize for high throughput
mc admin config set myminio api \
  requests_max=10000 \
  requests_deadline=30s \
  ready_deadline=20s

# Configure erasure coding
mc admin config set myminio storage_class \
  standard="EC:4" \
  rrs="EC:2"

# Enable caching
mc admin config set myminio cache \
  drives="/cache1,/cache2" \
  exclude="*.zip,*.pdf" \
  quota=80 \
  after=3 \
  watermark_low=70 \
  watermark_high=90
```

### System Tuning

```bash
# /etc/sysctl.conf optimizations
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 8192
net.core.netdev_max_backlog = 16384
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_notsent_lowat = 16384
fs.file-max = 2097152

# Apply settings
sysctl -p
```

### Redis Cache Optimization

```bash
# redis.conf settings
maxmemory 4gb
maxmemory-policy allkeys-lru
tcp-keepalive 60
tcp-backlog 511
databases 16
save ""  # Disable persistence for cache
```

---

## Monitoring & Alerting

### Prometheus Configuration

```yaml
# Alert rules (alerts-minio.yml)
- alert: MinIONodeDown
  expr: up{job="minio-node"} == 0
  for: 1m
  annotations:
    summary: "MinIO node {{ $labels.instance }} is down"
    runbook: "https://docs.example.com/runbooks/minio-node-down"

- alert: StorageCapacity80
  expr: minio_cluster_capacity_usable_free_bytes / minio_cluster_capacity_usable_total_bytes < 0.2
  for: 10m
  annotations:
    summary: "Storage at 80% capacity"
    action: "Scale storage or cleanup old data"
```

### Key Metrics to Monitor

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|------------------|-------------------|---------|
| Upload Latency (p95) | 80ms | 100ms | Scale MinIO nodes |
| Download Latency (p95) | 40ms | 50ms | Check CDN cache |
| Error Rate | 0.05% | 0.1% | Check logs, failover |
| Storage Usage | 70% | 80% | Add storage nodes |
| Cache Hit Rate | < 85% | < 80% | Tune cache settings |
| Active Connections | 800 | 950 | Scale connection pool |

### Grafana Dashboard

Import dashboard from: `infrastructure/docker/grafana/dashboards/minio-a++.json`

Key panels:
- Real-time upload/download rates
- Latency percentiles (p50, p95, p99)
- Error rate and types
- Storage capacity and trends
- Cache performance
- Node health status

---

## Disaster Recovery

### Backup Strategy

```bash
#!/bin/bash
# backup-minio.sh - Run daily via cron

# Variables
BACKUP_DIR="/backup/minio/$(date +%Y%m%d)"
SOURCE_BUCKET="logo-images"

# Create backup directory
mkdir -p $BACKUP_DIR

# Sync bucket to backup location
mc mirror --overwrite myminio/$SOURCE_BUCKET $BACKUP_DIR

# Compress backup
tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR

# Upload to S3 Glacier
aws s3 cp $BACKUP_DIR.tar.gz s3://backup-bucket/ --storage-class GLACIER

# Cleanup local backup older than 7 days
find /backup/minio -type f -mtime +7 -delete
```

### Recovery Procedures

#### Scenario 1: Single Node Failure

```bash
# 1. Remove failed node from cluster
docker-compose -f docker-compose.minio.yml stop minio2

# 2. Replace with new node
docker-compose -f docker-compose.minio.yml up -d minio2

# 3. Trigger healing
mc admin heal -r myminio/
```

#### Scenario 2: Complete Cluster Failure

```bash
# 1. Deploy new cluster
docker-compose -f docker-compose.minio.yml down
docker volume prune
docker-compose -f docker-compose.minio.yml up -d

# 2. Restore from backup
mc mirror $BACKUP_DIR myminio/logo-images

# 3. Verify data integrity
mc admin heal -r --dry-run myminio/
```

#### Scenario 3: Data Corruption

```bash
# 1. Identify corrupted objects
mc admin heal -r --dry-run myminio/ | grep "corruption"

# 2. Restore specific objects from backup
for object in $(cat corrupted_objects.txt); do
  mc cp $BACKUP_DIR/$object myminio/logo-images/$object
done

# 3. Run full heal
mc admin heal -r myminio/
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: High Upload Latency

```bash
# Check network latency
ping -c 100 minio1
iperf3 -c minio1

# Check disk I/O
iostat -x 1
iotop

# Check MinIO performance
mc admin trace -v myminio

# Solutions:
# - Scale MinIO nodes horizontally
# - Upgrade to faster disks (NVMe SSD)
# - Optimize erasure coding settings
# - Enable multipart uploads for large files
```

#### Issue 2: Low Cache Hit Rate

```bash
# Check Redis status
redis-cli info stats

# Analyze cache misses
redis-cli --scan --pattern "presigned:*" | wc -l

# Solutions:
# - Increase cache TTL
# - Increase Redis memory
# - Implement cache warming
# - Review access patterns
```

#### Issue 3: Connection Pool Exhaustion

```bash
# Check connection count
netstat -an | grep :9000 | wc -l

# Check MinIO connections
mc admin top conn myminio

# Solutions:
# - Increase max_pool_connections
# - Implement connection pooling in client
# - Add more MinIO nodes
# - Review client connection lifecycle
```

### Debug Commands

```bash
# Enable debug logging
mc admin config set myminio logger_webhook:debug \
  endpoint="http://localhost:8080/debug" \
  queue_size=10000

# Trace specific operations
mc admin trace -v --path "/logo-images/*" myminio

# Profile CPU usage
mc admin profile start myminio
sleep 60
mc admin profile stop myminio

# Check cluster status
mc admin info myminio
mc stat myminio/logo-images
```

---

## SLA Compliance

### Availability Monitoring

```bash
#!/bin/bash
# sla-check.sh - Run every 5 minutes

# Check availability
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://minio-lb:9000/minio/health/live)

if [ $RESPONSE -ne 200 ]; then
  echo "ALERT: MinIO unavailable at $(date)"
  # Send alert
  curl -X POST https://alerts.example.com/webhook \
    -d '{"alert": "MinIO down", "severity": "critical"}'
fi

# Log to metrics
echo "minio_availability{status=\"$RESPONSE\"} 1" | \
  curl --data-binary @- http://prometheus:9090/metrics/job/sla
```

### Performance Validation

```bash
# Run K6 load test
k6 run \
  --vus 100 \
  --duration 5m \
  k6/tests/storage_load_test.js

# Validate results meet SLA
k6 inspect storage_load_test.json \
  --constraint "upload_latency.p(95)<100" \
  --constraint "cdn_latency.p(95)<50" \
  --constraint "errors.rate<0.001"
```

### Monthly SLA Report

```sql
-- Prometheus query for monthly availability
(1 - (
  sum(rate(minio_s3_requests_errors_total[30d])) /
  sum(rate(minio_s3_requests_total[30d]))
)) * 100

-- Expected: >= 99.99%
```

---

## Operational Checklists

### Daily Operations
- [ ] Check cluster health status
- [ ] Review error logs for anomalies
- [ ] Verify backup completion
- [ ] Check storage capacity (< 70%)
- [ ] Monitor latency metrics

### Weekly Operations
- [ ] Run performance tests
- [ ] Review and optimize slow queries
- [ ] Clean up old object versions
- [ ] Update monitoring dashboards
- [ ] Review security logs

### Monthly Operations
- [ ] Generate SLA compliance report
- [ ] Review and update capacity planning
- [ ] Test disaster recovery procedures
- [ ] Update documentation
- [ ] Security audit and patching

### Quarterly Operations
- [ ] Rotate credentials
- [ ] Full backup restoration test
- [ ] Load testing at peak capacity
- [ ] Review and update runbooks
- [ ] Architecture review and optimization

---

## Contact and Escalation

### Support Levels

| Level | Contact | Response Time | Escalation |
|-------|---------|--------------|------------|
| L1 | DevOps Team | 15 min | After 1 hour |
| L2 | Platform Team | 30 min | After 4 hours |
| L3 | Architecture Team | 1 hour | After 8 hours |
| Vendor | MinIO Support | 2 hours | Critical only |

### Emergency Procedures

```bash
# Emergency shutdown
docker-compose -f docker-compose.minio.yml stop

# Emergency failover to backup region
./scripts/failover-to-backup.sh

# Emergency data recovery
./scripts/emergency-recovery.sh
```

---

## Appendix

### Configuration Files
- `.env.minio.example` - Environment template
- `docker-compose.minio.yml` - Cluster configuration
- `infrastructure/docker/nginx/nginx-minio.conf` - Load balancer config
- `infrastructure/docker/prometheus/prometheus-minio.yml` - Monitoring config
- `infrastructure/docker/prometheus/alerts-minio.yml` - Alert rules
- `infrastructure/docker/grafana/dashboards/minio-a++.json` - Dashboard

### Scripts
- `scripts/backup-minio.sh` - Automated backup
- `scripts/health-check.sh` - Health monitoring
- `scripts/failover.sh` - Failover procedures
- `scripts/performance-test.sh` - Performance validation

### Documentation
- [MinIO Official Docs](https://docs.min.io)
- [AWS S3 Compatibility](https://docs.min.io/docs/aws-cli-with-minio)
- [Erasure Coding Guide](https://docs.min.io/docs/minio-erasure-code-quickstart-guide)
- [Security Best Practices](https://docs.min.io/docs/minio-security-overview)