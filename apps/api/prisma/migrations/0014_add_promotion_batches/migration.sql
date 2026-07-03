-- Story 13.4 — Nachtelijke promotielus: batch-tabel + FK-constraint (AD-6/AD-13/AD-15/AD-16).
--
-- Twee wijzigingen, beide uit de Structural Seed:
--   1. Nieuwe tabel `promotion_batches` (status pending/passed/quarantined/
--      rolled_back, gate_results JSONB, baseline_measurement JSONB, timestamps).
--   2. De FK-constraint op `reference_candidates.promotion_batch_id` →
--      `promotion_batches.id` die 13.2 BEWUST als nullable kolom zonder
--      constraint aanmaakte, wordt nu alsnog toegevoegd (claim-semantiek AD-15).
--
-- Terugdraaipad: zie down.sql in deze map (drop FK + drop tabel).

-- CreateTable
CREATE TABLE "promotion_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "gate_results" JSONB NOT NULL DEFAULT '{}',
    "baseline_measurement" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,

    CONSTRAINT "promotion_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotion_batches_status_idx" ON "promotion_batches"("status");

-- CreateIndex
CREATE INDEX "promotion_batches_created_at_idx" ON "promotion_batches"("created_at" DESC);

-- CreateIndex
CREATE INDEX "reference_candidates_promotion_batch_id_idx" ON "reference_candidates"("promotion_batch_id");

-- AddForeignKey
ALTER TABLE "reference_candidates" ADD CONSTRAINT "reference_candidates_promotion_batch_id_fkey" FOREIGN KEY ("promotion_batch_id") REFERENCES "promotion_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

