-- Epic 7 (Story 7.2): Holdout evaluation metrics on model versions
-- Stores holdout accuracy/precision/recall/f1 plus the evaluated holdout
-- set identity (size + hash), kept distinct from the train/val metrics.

-- AlterTable
ALTER TABLE "model_versions" ADD COLUMN "metrics" JSONB NOT NULL DEFAULT '{}';
