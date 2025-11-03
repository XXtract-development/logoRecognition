# 20. Disaster Recovery and Backup

## 20.1 Backup Strategy

**Database Backups:**
- Automated daily backups of PostgreSQL
- Point-in-time recovery enabled (7-day retention)
- Cross-region backup replication
- Monthly backup verification tests

**Model Artifacts:**
- All trained models versioned in S3
- Immutable storage with object lock
- Cross-region replication for critical models

**Application State:**
- Redis persistence with AOF + RDB
- Regular snapshots every 6 hours

## 20.2 Recovery Procedures

**RTO (Recovery Time Objective):** 2 hours
**RPO (Recovery Point Objective):** 1 hour

**Disaster Recovery Plan:**
1. Database failure: Restore from latest backup + WAL replay
2. Service failure: Auto-scaling and health checks trigger replacement
3. Region failure: DNS failover to backup region
4. Data corruption: Restore from versioned backups

---
