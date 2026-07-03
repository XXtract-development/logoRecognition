-- Story 13.2 — Referentie-vliegwiel nominatie-tabellen (AD-3/AD-12/AD-14/AD-16).
-- Drie nieuwe tabellen: reference_candidates, candidate_embeddings, hard_negatives.
-- promotion_batch_id is nullable ZONDER FK-constraint — de FK volgt in de
-- 13.4-migratie (Structural Seed). Terugdraaipad: zie down.sql in deze map.

-- CreateTable
CREATE TABLE "reference_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "t3777_code" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'candidate',
    "origin" VARCHAR(20) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "crop_path" VARCHAR(1000),
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "promotion_batch_id" UUID,
    "reference_logo_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference_candidate_id" UUID NOT NULL,
    "embedding" vector(512),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hard_negatives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_hash" VARCHAR(64) NOT NULL,
    "t3777_code" VARCHAR(100) NOT NULL,
    "crop_path" VARCHAR(1000),
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hard_negatives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reference_candidates_status_idx" ON "reference_candidates"("status");

-- CreateIndex
CREATE INDEX "reference_candidates_t3777_code_idx" ON "reference_candidates"("t3777_code");

-- CreateIndex
CREATE INDEX "reference_candidates_created_at_idx" ON "reference_candidates"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "reference_candidates_content_hash_t3777_code_key" ON "reference_candidates"("content_hash", "t3777_code");

-- CreateIndex
CREATE INDEX "candidate_embeddings_reference_candidate_id_idx" ON "candidate_embeddings"("reference_candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "hard_negatives_content_hash_key" ON "hard_negatives"("content_hash");

-- CreateIndex
CREATE INDEX "hard_negatives_t3777_code_idx" ON "hard_negatives"("t3777_code");

-- CreateIndex
CREATE INDEX "hard_negatives_created_at_idx" ON "hard_negatives"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "reference_candidates" ADD CONSTRAINT "reference_candidates_reference_logo_id_fkey" FOREIGN KEY ("reference_logo_id") REFERENCES "reference_logos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_embeddings" ADD CONSTRAINT "candidate_embeddings_reference_candidate_id_fkey" FOREIGN KEY ("reference_candidate_id") REFERENCES "reference_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

