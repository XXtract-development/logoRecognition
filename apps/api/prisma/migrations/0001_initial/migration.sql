-- Logo Recognition - Initial Migration
-- Generated from prisma/schema.prisma
--
-- Required PostgreSQL extensions:
--   pgvector (vector similarity search)
--   pg_trgm  (trigram text search)
--   btree_gin (GIN index support for btree types)
--   btree_gist (GiST index support for btree types)
--
-- Ensure these extensions are available on your PostgreSQL server.
-- pgvector must be installed separately: https://github.com/pgvector/pgvector

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER', 'VIEWER');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'ANNOTATING', 'TRAINING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "logo_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "filename" VARCHAR(255) NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "embedding" vector(512),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "brand_name" VARCHAR(255),
    "confidence_score" DOUBLE PRECISION,
    "detected_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "logo_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_data" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "image_id" UUID NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "confidence" DOUBLE PRECISION,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validation_date" TIMESTAMPTZ,
    "validated_by" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" VARCHAR(50) NOT NULL,
    "model_type" VARCHAR(100) NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "precision_score" DOUBLE PRECISION,
    "recall_score" DOUBLE PRECISION,
    "f1_score" DOUBLE PRECISION,
    "training_date" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "query_vector" vector(512),
    "results_count" INTEGER,
    "search_time_ms" DOUBLE PRECISION,
    "user_id" VARCHAR(255),
    "session_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "organization_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'UPLOADING',
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "training_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "image_id" UUID NOT NULL,
    "batch_id" UUID,
    "logo_id" UUID,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "category" VARCHAR(100),
    "value" VARCHAR(100),
    "confidence" DOUBLE PRECISION,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category" VARCHAR(100) NOT NULL,
    "value" VARCHAR(100) NOT NULL,
    "confidence_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.99,
    "training_samples" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "logos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logo_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "logo_id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "embedding" vector(512) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logo_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recognition_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "model_id" UUID,
    "image_hash" VARCHAR(64),
    "confidence_threshold" DOUBLE PRECISION,
    "processing_time_ms" INTEGER,
    "detection_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recognition_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recognition_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "log_id" UUID NOT NULL,
    "logo_id" UUID,
    "category" VARCHAR(100) NOT NULL,
    "value" VARCHAR(100) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recognition_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "log_id" UUID NOT NULL,
    "predicted_logo_id" UUID,
    "confidence" DOUBLE PRECISION,
    "correct_logo_id" UUID,
    "validated_by" UUID,
    "validated_at" TIMESTAMPTZ,
    "incorporated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_stats" (
    "id" SERIAL NOT NULL,
    "query_hash" VARCHAR(64) NOT NULL,
    "query_text" TEXT,
    "execution_count" BIGINT NOT NULL DEFAULT 0,
    "total_time_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mean_time_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_time_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_executed" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_checks" (
    "id" SERIAL NOT NULL,
    "service_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "response_time_ms" DOUBLE PRECISION,
    "details" JSONB NOT NULL DEFAULT '{}',
    "checked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_history" (
    "id" SERIAL NOT NULL,
    "backup_type" VARCHAR(50) NOT NULL,
    "backup_path" VARCHAR(500) NOT NULL,
    "size_bytes" BIGINT,
    "duration_seconds" DOUBLE PRECISION,
    "status" VARCHAR(20) NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "logo_images_brand_name_idx" ON "logo_images"("brand_name");

-- CreateIndex
CREATE INDEX "logo_images_created_at_idx" ON "logo_images"("created_at" DESC);

-- CreateIndex
CREATE INDEX "training_data_image_id_idx" ON "training_data"("image_id");

-- CreateIndex
CREATE INDEX "training_data_label_idx" ON "training_data"("label");

-- CreateIndex
CREATE INDEX "training_data_validated_idx" ON "training_data"("validated");

-- CreateIndex
CREATE UNIQUE INDEX "model_versions_version_key" ON "model_versions"("version");

-- CreateIndex
CREATE INDEX "model_versions_is_active_idx" ON "model_versions"("is_active");

-- CreateIndex
CREATE INDEX "model_versions_version_idx" ON "model_versions"("version");

-- CreateIndex
CREATE INDEX "search_history_user_id_idx" ON "search_history"("user_id");

-- CreateIndex
CREATE INDEX "search_history_created_at_idx" ON "search_history"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "training_batches_user_id_idx" ON "training_batches"("user_id");

-- CreateIndex
CREATE INDEX "training_batches_status_idx" ON "training_batches"("status");

-- CreateIndex
CREATE INDEX "annotations_image_id_idx" ON "annotations"("image_id");

-- CreateIndex
CREATE INDEX "annotations_batch_id_idx" ON "annotations"("batch_id");

-- CreateIndex
CREATE INDEX "annotations_logo_id_idx" ON "annotations"("logo_id");

-- CreateIndex
CREATE INDEX "logos_category_idx" ON "logos"("category");

-- CreateIndex
CREATE INDEX "logos_is_active_idx" ON "logos"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "logos_category_value_key" ON "logos"("category", "value");

-- CreateIndex
CREATE INDEX "logo_embeddings_logo_id_idx" ON "logo_embeddings"("logo_id");

-- CreateIndex
CREATE INDEX "recognition_logs_request_id_idx" ON "recognition_logs"("request_id");

-- CreateIndex
CREATE INDEX "recognition_logs_user_id_idx" ON "recognition_logs"("user_id");

-- CreateIndex
CREATE INDEX "recognition_logs_image_hash_idx" ON "recognition_logs"("image_hash");

-- CreateIndex
CREATE INDEX "recognition_logs_created_at_idx" ON "recognition_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "recognition_results_log_id_idx" ON "recognition_results"("log_id");

-- CreateIndex
CREATE INDEX "recognition_results_logo_id_idx" ON "recognition_results"("logo_id");

-- CreateIndex
CREATE INDEX "feedback_queue_log_id_idx" ON "feedback_queue"("log_id");

-- CreateIndex
CREATE INDEX "feedback_queue_incorporated_idx" ON "feedback_queue"("incorporated");

-- CreateIndex
CREATE UNIQUE INDEX "query_stats_query_hash_key" ON "query_stats"("query_hash");

-- CreateIndex
CREATE INDEX "health_checks_service_name_idx" ON "health_checks"("service_name");

-- CreateIndex
CREATE INDEX "health_checks_checked_at_idx" ON "health_checks"("checked_at" DESC);

-- CreateIndex
CREATE INDEX "backup_history_created_at_idx" ON "backup_history"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "training_data" ADD CONSTRAINT "training_data_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "logo_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_batches" ADD CONSTRAINT "training_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "logo_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "training_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_logo_id_fkey" FOREIGN KEY ("logo_id") REFERENCES "logos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logo_embeddings" ADD CONSTRAINT "logo_embeddings_logo_id_fkey" FOREIGN KEY ("logo_id") REFERENCES "logos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognition_logs" ADD CONSTRAINT "recognition_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognition_results" ADD CONSTRAINT "recognition_results_log_id_fkey" FOREIGN KEY ("log_id") REFERENCES "recognition_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognition_results" ADD CONSTRAINT "recognition_results_logo_id_fkey" FOREIGN KEY ("logo_id") REFERENCES "logos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_queue" ADD CONSTRAINT "feedback_queue_log_id_fkey" FOREIGN KEY ("log_id") REFERENCES "recognition_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
