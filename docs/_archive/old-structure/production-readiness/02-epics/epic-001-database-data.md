# EPIC-001: Database & Data Management
**Sprint:** 1 (Week 1)
**Priority:** P1 - CRITICAL
**Story Points:** 21
**Status:** 🔴 Not Started

---

## 📊 Epic Overview

This epic addresses critical foundation issues that block all other functionality. The system currently uses mock data without real persistence, has hardcoded database credentials, and lacks proper connection pooling.

## 🎯 Epic Goals

1. **Secure all database connections** - Remove hardcoded credentials
2. **Implement connection pooling** - Handle high concurrent loads
3. **Fix data persistence** - Connect frontend to real backend
4. **Enable data flow** - End-to-end data pipeline working

## 🚨 Current Issues

### Critical Problems
- **Hardcoded credentials in `backend/app/database.py`**
- **No PgBouncer connection pooling active**
- **GET /api/v1/images/list returns 500 error**
- **Frontend uses sessionStorage instead of API**
- **No database migrations configured**
- **Redis not connected for session management**

### Impact
- 🔴 **Security Risk:** Credentials exposed in code
- 🔴 **Performance:** No connection pooling causes bottlenecks
- 🔴 **Functionality:** App doesn't work with real data
- 🔴 **Reliability:** No data survives restarts

---

## 📋 User Stories

### STORY-001: Secure Database Configuration
**Points:** 5
**As a** DevOps Engineer
**I want to** implement secure database configuration management
**So that** credentials are never exposed and connections are encrypted

#### Technical Implementation
```python
# backend/app/database.py - CURRENT (INSECURE)
config = {
    'host': 'localhost',
    'password': 'secure_password_123',  # HARDCODED!
}

# backend/app/database.py - TARGET (SECURE)
from hvac import Client as VaultClient

vault_client = VaultClient(url=os.getenv('VAULT_ADDR'))
config = {
    'host': vault_client.read('database/config')['host'],
    'password': vault_client.read('database/creds')['password'],
    'ssl_context': ssl.create_default_context(),
}
```

#### Acceptance Criteria
- [ ] All database credentials moved to environment variables
- [ ] HashiCorp Vault or K8s secrets configured
- [ ] SSL/TLS enabled for all database connections
- [ ] Connection strings use environment interpolation
- [ ] No hardcoded passwords in any file
- [ ] Secrets rotation mechanism implemented

#### Files to Modify
- `backend/app/database.py`
- `backend/app/main.py`
- `backend/.env.example`
- `k8s/secrets/database-secret.yaml` (create)
- `docker-compose.yml`

---

### STORY-002: Database Connection Pooling
**Points:** 3
**As a** System Administrator
**I want to** enable connection pooling
**So that** the database can handle high concurrent loads

#### Technical Implementation
```yaml
# k8s/pgbouncer/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pgbouncer-config
data:
  pgbouncer.ini: |
    [databases]
    logo_recognition = host=postgres-service port=5432 dbname=logo_recognition

    [pgbouncer]
    pool_mode = transaction
    max_client_conn = 1000
    default_pool_size = 25
    min_pool_size = 10
    reserve_pool_size = 5
```

#### Acceptance Criteria
- [ ] PgBouncer configured and running
- [ ] Connection pool size optimized (min: 10, max: 100)
- [ ] Transaction pooling mode enabled
- [ ] Monitoring metrics for pool usage
- [ ] Automatic reconnection on failure
- [ ] Pool exhaustion alerts configured

#### Files to Create/Modify
- `k8s/pgbouncer/deployment.yaml` (create)
- `k8s/pgbouncer/service.yaml` (create)
- `k8s/pgbouncer/configmap.yaml` (create)
- `backend/app/database.py`
- `docker-compose.yml`

---

### STORY-003: Fix Image List API Endpoint
**Points:** 5
**As a** Frontend Developer
**I want to** retrieve uploaded images from the API
**So that** users can see and work with real data

#### Current Error
```python
# backend/app/routers/image_upload.py
@router.get("/list")
async def list_images():
    # This currently throws 500 error
    # Missing database connection
    pass
```

#### Target Implementation
```python
@router.get("/list")
async def list_images(
    page: int = 1,
    per_page: int = 20,
    sort_by: str = "created_at",
    db: AsyncSession = Depends(get_db)
):
    offset = (page - 1) * per_page

    query = select(Image).order_by(
        desc(getattr(Image, sort_by))
    ).offset(offset).limit(per_page)

    result = await db.execute(query)
    images = result.scalars().all()

    return {
        "images": [ImageResponse.from_orm(img) for img in images],
        "page": page,
        "per_page": per_page,
        "total": await db.scalar(select(func.count(Image.id)))
    }
```

#### Acceptance Criteria
- [ ] GET /api/v1/images/list returns 200 status
- [ ] Paginated response (20 items per page)
- [ ] Filtering by upload date
- [ ] Sorting options (date, size, name)
- [ ] Response time < 200ms
- [ ] Error handling for edge cases

#### Files to Modify
- `backend/app/routers/image_upload.py`
- `backend/app/models/image.py` (create)
- `backend/app/schemas/image.py` (create)
- `backend/tests/test_image_upload.py`
- `frontend/src/pages/AnnotationPage.js`

---

### STORY-004: Implement Data Persistence Layer
**Points:** 8
**As a** Backend Developer
**I want to** properly persist all application data
**So that** data survives application restarts

#### Repository Pattern Implementation
```python
# backend/app/repositories/base.py
class BaseRepository:
    def __init__(self, model, db: AsyncSession):
        self.model = model
        self.db = db

    async def create(self, **kwargs):
        instance = self.model(**kwargs)
        self.db.add(instance)
        await self.db.commit()
        await self.db.refresh(instance)
        return instance

    async def get(self, id):
        return await self.db.get(self.model, id)

    async def list(self, offset=0, limit=20):
        result = await self.db.execute(
            select(self.model).offset(offset).limit(limit)
        )
        return result.scalars().all()

# backend/app/repositories/image.py
class ImageRepository(BaseRepository):
    def __init__(self, db: AsyncSession):
        super().__init__(Image, db)

    async def get_by_user(self, user_id: int):
        result = await self.db.execute(
            select(self.model).where(self.model.user_id == user_id)
        )
        return result.scalars().all()
```

#### Database Migrations
```python
# backend/alembic/versions/001_initial_schema.py
def upgrade():
    op.create_table(
        'images',
        sa.Column('id', sa.UUID, primary_key=True),
        sa.Column('filename', sa.String(255)),
        sa.Column('file_path', sa.String(500)),
        sa.Column('file_size', sa.Integer),
        sa.Column('mime_type', sa.String(100)),
        sa.Column('user_id', sa.UUID),
        sa.Column('created_at', sa.DateTime),
        sa.Column('updated_at', sa.DateTime)
    )

    op.create_table(
        'annotations',
        sa.Column('id', sa.UUID, primary_key=True),
        sa.Column('image_id', sa.UUID, sa.ForeignKey('images.id')),
        sa.Column('label', sa.String(255)),
        sa.Column('bbox', sa.JSON),
        sa.Column('confidence', sa.Float),
        sa.Column('created_at', sa.DateTime)
    )
```

#### Acceptance Criteria
- [ ] All uploads saved to database
- [ ] Annotations persisted with foreign keys
- [ ] Training jobs tracked in database
- [ ] User sessions stored in Redis
- [ ] Transaction support for data integrity
- [ ] Backup and restore procedures documented

#### Files to Create/Modify
- `backend/alembic.ini` (create)
- `backend/alembic/` directory structure (create)
- `backend/app/repositories/` directory (create)
- `backend/app/models/` all model files
- `backend/app/database.py`
- `backend/app/dependencies.py` (create)

---

## 🔧 Technical Requirements

### Database Configuration
```yaml
PostgreSQL:
  version: 15+
  extensions:
    - pgvector
    - pg_stat_statements
  settings:
    max_connections: 200
    shared_buffers: 256MB
    effective_cache_size: 1GB

PgBouncer:
  pool_mode: transaction
  max_client_conn: 1000
  default_pool_size: 25

Redis:
  version: 7+
  persistence: AOF
  maxmemory: 2GB
```

### Security Requirements
- No plaintext passwords in code or configs
- All connections use TLS 1.3
- Secrets rotated every 30 days
- Audit logging for all database access
- Principle of least privilege for DB users

### Performance Targets
- Connection pool acquisition: <10ms
- Query execution: <100ms for simple queries
- Transaction commit: <50ms
- Redis operations: <5ms

---

## 📈 Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Hardcoded Credentials | 15+ locations | 0 | Code scan |
| Connection Pool Size | 0 | 25-100 | PgBouncer metrics |
| API Success Rate | 0% | 100% | /api/v1/images/list |
| Query Performance | N/A | <100ms | p99 latency |
| Data Persistence | None | Full | Integration tests |

---

## 🔗 Dependencies

### Prerequisites
- PostgreSQL 15+ installed
- Redis 7+ installed
- HashiCorp Vault or K8s cluster for secrets
- Database migration tool (Alembic)

### Blocking
- This epic blocks ALL other functionality
- Must be completed before Sprint 2 can begin

### External Dependencies
- DBA approval for connection pool settings
- Security team review of credential management

---

## ✅ Definition of Done

- [ ] All story acceptance criteria met
- [ ] Zero hardcoded credentials in codebase
- [ ] Connection pooling handling 1000+ concurrent connections
- [ ] All API endpoints returning real data
- [ ] Database migrations runnable and reversible
- [ ] Integration tests passing
- [ ] Performance benchmarks met
- [ ] Security scan passing
- [ ] Documentation updated
- [ ] Deployed to staging environment

---

## 📚 References

- [PostgreSQL Connection Pooling Guide](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [PgBouncer Configuration](https://www.pgbouncer.org/config.html)
- [HashiCorp Vault Database Secrets](https://www.vaultproject.io/docs/secrets/databases)
- [SQLAlchemy Async Patterns](https://docs.sqlalchemy.org/en/14/orm/extensions/asyncio.html)
- Current PRD: `docs/prd_v2.md#sprint-1-requirements`
- Architecture: `docs/architecture/database-layer.md`

---

**Epic Owner:** Backend Team
**Sprint:** 1 (Week 1)
**Last Updated:** 2024-09-19