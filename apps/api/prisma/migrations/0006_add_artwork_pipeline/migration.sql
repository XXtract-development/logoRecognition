-- Epic 8 (Stories 8.1, 8.5, 8.6): Artwork pipeline schema
-- Adds the artwork import/review tables and the TrainingData provenance columns.
--
-- These objects already exist in infrastructure/docker/postgres/init.sql for a
-- FRESH database, but init.sql only runs on first-init of an empty data dir. On
-- existing ACC/PROD databases the schema is applied through Prisma migrations
-- (same mechanism as 0002 holdout and 0004 reference_logos), so this migration
-- restores parity between prisma/schema.prisma and the migration history.

-- AlterTable: TrainingData provenance/soft-delete/crop columns (Story 8.6)
ALTER TABLE "training_data" ADD COLUMN     "provenance" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "training_data" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "training_data" ADD COLUMN     "crop_path" VARCHAR(1000);

-- CreateIndex
CREATE INDEX "training_data_active_idx" ON "training_data"("active");

-- CreateTable: artwork import runs (Story 8.1)
CREATE TABLE "artwork_import_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" VARCHAR(20) NOT NULL DEFAULT 'running',
    "gtins" JSONB NOT NULL DEFAULT '[]',
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "heartbeat_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artwork_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "artwork_import_runs_status_idx" ON "artwork_import_runs"("status");

-- CreateIndex
CREATE INDEX "artwork_import_runs_created_at_idx" ON "artwork_import_runs"("created_at" DESC);

-- CreateTable: individual artwork import records (Story 8.1)
CREATE TABLE "artwork_imports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gtin" VARCHAR(50) NOT NULL,
    "gln" VARCHAR(50),
    "media_id" VARCHAR(255) NOT NULL,
    "file_name" VARCHAR(500) NOT NULL,
    "source_location" VARCHAR(1000) NOT NULL,
    "sha256_hash" VARCHAR(64),
    "storage_path" VARCHAR(1000),
    "mime_type" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'imported',
    "failure_reason" TEXT,
    "import_run_id" UUID NOT NULL,
    "pages" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artwork_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "artwork_imports_media_id_key" ON "artwork_imports"("media_id");

-- CreateIndex
CREATE INDEX "artwork_imports_gtin_idx" ON "artwork_imports"("gtin");

-- CreateIndex
CREATE INDEX "artwork_imports_import_run_id_idx" ON "artwork_imports"("import_run_id");

-- CreateIndex
CREATE INDEX "artwork_imports_status_idx" ON "artwork_imports"("status");

-- AddForeignKey
ALTER TABLE "artwork_imports" ADD CONSTRAINT "artwork_imports_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "artwork_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: artwork review items for crosscheck routing (Story 8.5)
CREATE TABLE "artwork_review_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gtin" VARCHAR(50) NOT NULL,
    "t3777_code" VARCHAR(100) NOT NULL,
    "crop_path" VARCHAR(1000),
    "bbox" JSONB NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION,
    "method" VARCHAR(50),
    "reason" TEXT NOT NULL,
    "source_file" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "artwork_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "artwork_review_items_gtin_idx" ON "artwork_review_items"("gtin");

-- CreateIndex
CREATE INDEX "artwork_review_items_status_idx" ON "artwork_review_items"("status");

-- CreateIndex
CREATE INDEX "artwork_review_items_t3777_code_idx" ON "artwork_review_items"("t3777_code");
