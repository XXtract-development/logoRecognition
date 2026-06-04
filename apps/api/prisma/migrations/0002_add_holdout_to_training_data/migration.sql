-- Epic 7 (Story 7.1): Holdout marking on training data
-- Adds a persistent holdout flag so a stable, protected evaluation set
-- can be excluded from training/augmentation at query level (NFR3).

-- AlterTable
ALTER TABLE "training_data" ADD COLUMN "holdout" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "training_data_holdout_idx" ON "training_data"("holdout");
