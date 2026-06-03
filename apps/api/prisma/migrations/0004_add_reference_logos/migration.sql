-- Epic 7 (Story 7.3): Keurmerk reference library
-- Curated library of official keurmerk artwork + variants, stored in MinIO
-- under reference-logos/{t3777Code}/{variantLabel}.{ext}. Soft delete only
-- (active flag) so history is preserved. Consumed by Epic 8 (template-matching)
-- and 8.7 (synthesis).

-- CreateTable
CREATE TABLE "reference_logos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "t3777_code" VARCHAR(100) NOT NULL,
    "variant_label" VARCHAR(100) NOT NULL,
    "source" TEXT,
    "storage_path" VARCHAR(500) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "logo_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_logos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reference_logos_t3777_code_idx" ON "reference_logos"("t3777_code");

-- CreateIndex
CREATE UNIQUE INDEX "reference_logos_t3777_code_variant_label_key" ON "reference_logos"("t3777_code", "variant_label");

-- AddForeignKey
ALTER TABLE "reference_logos" ADD CONSTRAINT "reference_logos_logo_id_fkey" FOREIGN KEY ("logo_id") REFERENCES "logos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
