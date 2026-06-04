# Data Models

**Database:** PostgreSQL 14+ met pgvector
**ORM:** Prisma 5.9.1
**Laatst bijgewerkt:** 2025-11-03

---

## Core Models

### User
```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  name          String
  passwordHash  String
  role          Role      @default(USER)

  // Relations
  categories    Category[]
  trainingJobs  TrainingJob[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

enum Role {
  USER
  ADMIN
}
```

### Category
```prisma
model Category {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?

  // Relations
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  logos       Logo[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Logo
```prisma
model Logo {
  id          String   @id @default(uuid())
  imageUrl    String
  s3Key       String

  // Relations
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  annotations Annotation[]

  metadata    Json?    // Image metadata (dimensions, format, etc.)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Annotation
```prisma
model Annotation {
  id          String   @id @default(uuid())

  // Bounding box
  x           Int
  y           Int
  width       Int
  height      Int

  // Relations
  logoId      String
  logo        Logo     @relation(fields: [logoId], references: [id])

  confidence  Float?   // For auto-generated annotations
  isManual    Boolean  @default(true)

  createdAt   DateTime @default(now())
}
```

### TrainingJob
```prisma
model TrainingJob {
  id          String   @id @default(uuid())
  status      JobStatus @default(PENDING)
  progress    Int      @default(0)

  // Configuration
  config      Json     // Training hyperparameters

  // Results
  metrics     Json?    // Training metrics
  modelS3Key  String?  // Trained model location

  // Relations
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  categoryId  String?

  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}
```

### RecognitionResult
```prisma
model RecognitionResult {
  id          String   @id @default(uuid())
  imageUrl    String
  s3Key       String

  // Results
  predictions Json     // Array of predictions with confidence scores

  // Metadata
  processingTime Int   // Milliseconds
  modelVersion   String

  createdAt   DateTime @default(now())
}
```

---

## Relationships

```
User (1) ─────< (N) Category
Category (1) ─< (N) Logo
Logo (1) ─────< (N) Annotation
User (1) ─────< (N) TrainingJob
```

---

## Indexes

```prisma
@@index([categoryId])        // Logo.categoryId
@@index([userId])            // Category.userId, TrainingJob.userId
@@index([status])            // TrainingJob.status
@@index([createdAt])         // All models for time-based queries
@@unique([email])            // User.email
@@unique([name])             // Category.name
```

---

## Vector Extension (pgvector)

Voor similarity search van logo embeddings:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE logo_embeddings (
  id UUID PRIMARY KEY,
  logo_id UUID REFERENCES logos(id),
  embedding vector(512),  -- Dimension depends on model
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON logo_embeddings USING ivfflat (embedding vector_cosine_ops);
```

---

## Sample Queries

### Get All Logos for Category
```typescript
const logos = await prisma.logo.findMany({
  where: { categoryId: 'uuid' },
  include: { annotations: true }
});
```

### Get Training Job with Status
```typescript
const jobs = await prisma.trainingJob.findMany({
  where: {
    userId: 'uuid',
    status: 'RUNNING'
  },
  include: { user: true }
});
```

### Create Logo with Annotation
```typescript
const logo = await prisma.logo.create({
  data: {
    imageUrl: 'https://...',
    s3Key: 'uploads/...',
    categoryId: 'uuid',
    annotations: {
      create: {
        x: 100,
        y: 150,
        width: 200,
        height: 180,
        isManual: true
      }
    }
  }
});
```

---

Voor complete schema en migraties, zie:
- Prisma schema: `apps/api/prisma/schema.prisma`
- Migrations: `apps/api/prisma/migrations/`
- Archived details: `_archive/old-structure/architecture/4-data-models.md`

---

## Update 2026-06-03 — Epic 7: Betrouwbaar Evaluatiefundament

### Gewijzigde modellen

- **TrainingData**: nieuw veld `holdout Boolean @default(false)` (+ index). Holdout-records zijn op query-niveau uitgesloten van training en augmentatie; initiële vulling via gestratificeerde steekproef (15% per label, alleen gevalideerde records).
- **ModelVersion**: nieuw veld `metrics Json @default("{}")`. Bevat o.a. `metrics.holdout = { accuracy, precision, recall, f1, holdout_size, holdout_hash }` — de holdout-metrics zijn onderscheiden van de bestaande train/val-kolommen.

### Nieuw model

- **ReferenceLogo** (`reference_logos`): id, t3777Code, variantLabel, source, storagePath (MinIO, prefix `reference-logos/{code}/{variant}`), active (soft delete), logoId (FK → Logo via upsert op category='keurmerk'), createdAt. Unique op (t3777Code, variantLabel). Kennisbron voor Epic 8 (template-matching/synthese).

Migratie: `apps/api/prisma/migrations/0004_add_reference_logos/` + synchroon bijgewerkte `infrastructure/docker/postgres/init.sql` (ML-service leest via asyncpg raw SQL).
