-- spec-logo-scan-k4aa (CAP-7): SigLIP 2 reference embeddings for the K4-aa scan route,
-- kept next to (never instead of) the EfficientNet-B0 rows in `reference_embeddings`.
--
-- One row per (reference, model); `storage_path` records which reference file was
-- embedded, so a moved file is re-embedded by POST /ml/artwork/k4aa/reference-embeddings/sync.
-- Without this table the code starts and serves the legacy route; a K4-aa scan then fails
-- with `siglip_references_missing`. Rollout: apply deliberately, then run the sync.
CREATE TABLE "reference_embeddings_siglip2" (
    "reference_logo_id" UUID NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "embedding" vector(768) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_embeddings_siglip2_pkey" PRIMARY KEY ("reference_logo_id", "model"),
    CONSTRAINT "reference_embeddings_siglip2_reference_logo_id_fkey" FOREIGN KEY ("reference_logo_id")
        REFERENCES "reference_logos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

COMMENT ON TABLE "reference_embeddings_siglip2" IS
  'spec-logo-scan-k4aa: SigLIP 2 B/16-384 image embeddings of active reference logos (K4-aa gate); model = <checkpoint>@<revision>.';
