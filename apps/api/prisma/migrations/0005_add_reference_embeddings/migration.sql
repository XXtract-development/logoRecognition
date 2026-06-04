-- Epic 8 (Story 8.4): Reference keurmerk embeddings
-- One embedding per active reference keurmerk variant, used to classify
-- localised crops via pgvector cosine similarity (find_similar_references).
--
-- Deliberately a SEPARATE table from logo_embeddings:
--   (a) logo_embeddings.model_id is NOT NULL, but reference embeddings are
--       model-independent (they describe official keurmerk artwork);
--   (b) sharing logo_embeddings would pollute find_similar_logos — reference
--       artwork would surface as logo search results.

-- CreateTable
CREATE TABLE "reference_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference_logo_id" UUID NOT NULL,
    "embedding" vector(512),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reference_embeddings_reference_logo_id_idx" ON "reference_embeddings"("reference_logo_id");

-- AddForeignKey
ALTER TABLE "reference_embeddings" ADD CONSTRAINT "reference_embeddings_reference_logo_id_fkey" FOREIGN KEY ("reference_logo_id") REFERENCES "reference_logos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
