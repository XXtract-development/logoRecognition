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

---

## Update 2026-06-04 — Epic 8: Automatische Trainingsdata uit Etiket-Artwork

### Gewijzigd model

- **TrainingData**: drie nieuwe velden (Story 8.6):
  - `provenance Json @default("{}")` — herkomst van een artwork-afgeleide crop: `{ sourceFile, bbox, method, confidence }`. GIN-index (`jsonb_path_ops`) voor het bulk-deactiveren per bronbestand.
  - `active Boolean @default(true)` (+ index) — soft-delete-vlag; `false` sluit een record uit van training zonder het te verwijderen (intrekken van een foute bron).
  - `cropPath String?` — pad naar de uitgesneden crop in MinIO.

### Nieuwe modellen (artwork-pipeline)

- **ArtworkImportRun** (`artwork_import_runs`, Story 8.1): id, `status` (`running`/`completed`/`failed`), `gtins` (JSONB-lijst), tellers `importedCount`/`skippedCount`/`failedCount`, `heartbeatAt` (stale-detectie: runs zonder heartbeat > `IMPORT_RUN_STALE_MINUTES` worden bij een nieuwe run op `failed` gezet), `completedAt`, `createdAt`. Eén rij per importbatch.
- **ArtworkImport** (`artwork_imports`, Story 8.1): id, `gtin`, `gln?`, `mediaId` (**unique**), `fileName`, `sourceLocation`, `sha256Hash?`, `storagePath?` (MinIO, prefix `artwork/{gtin}/{fileName}`), `mimeType?`, `status` (`imported`/`failed`), `failureReason?`, `importRunId` (FK → ArtworkImportRun, cascade), `pages` (JSONB), `createdAt`. **Artwork-cache / dedup:** de unique-constraint op `mediaId` plus de `sha256Hash` vormen de cachelaag — bij een nieuwe run wordt een media-item met status `imported` overgeslagen (geteld als `skipped`), zodat ongewijzigde artwork niet opnieuw gedownload of opgeslagen wordt; alleen nieuwe of eerder mislukte items worden (her)verwerkt.
- **ArtworkReviewItem** (`artwork_review_items`, Story 8.5): id, `gtin`, `t3777Code`, `cropPath?`, `bbox` (JSONB), `confidence?`, `method?`, `reason` (waarom naar review), `sourceFile?`, `status` (`open` …), `createdAt`/`updatedAt`. Gevuld door de crosscheck-routing voor alles wat niet automatisch geaccepteerd kan worden.

Schema: `apps/api/prisma/schema.prisma` + synchroon bijgewerkte `infrastructure/docker/postgres/init.sql` (de drie tabellen in schema `logos`, `TrainingData`-kolommen via `ALTER TABLE … ADD COLUMN IF NOT EXISTS`). De ML-service leest deze tabellen via asyncpg raw SQL.
