-- Rollback for migration 0023 (spec-logo-scan-k4aa): drops only the SigLIP 2 table.
-- `reference_embeddings` (EfficientNet-B0) is not touched.

DROP TABLE IF EXISTS "reference_embeddings_siglip2";
