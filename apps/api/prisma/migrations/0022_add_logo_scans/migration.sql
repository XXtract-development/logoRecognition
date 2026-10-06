-- Verhaal 1.3: herhaalbare en herleidbare logo-scans.
--
-- `logo_scans` bewaart elke scan (ook mislukte en vervangen) 12 maanden met
-- versies en ruwe detecties; een geplande taak ruimt rijen ouder dan 12 maanden
-- op. `logo_current_image` houdt per product het huidige beeld bij en schuift
-- alleen vooruit op `requested_at`.
--
-- Uitrol: deze migratie moet VOOR de uitrol van de code gecontroleerd zijn
-- toegepast. Zonder tabel draait de code op verhaal-1.2-gedrag (Redis, geen
-- dedupe).
CREATE TABLE "logo_scans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scan_id" UUID NOT NULL,
    "product_id" VARCHAR(256),
    "pipeline_id" VARCHAR(256),
    "image_hash" VARCHAR(64) NOT NULL,
    "model_version" VARCHAR(256) NOT NULL,
    "reference_version" VARCHAR(256) NOT NULL,
    "policy_version" VARCHAR(256),
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(50),
    "consumer" VARCHAR(100) NOT NULL,
    "logo_results" JSONB,
    "processing_time_ms" INTEGER,
    "requested_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logo_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "logo_scans_scan_id_key" ON "logo_scans"("scan_id");

CREATE UNIQUE INDEX "logo_scans_key_key"
    ON "logo_scans"("product_id", "image_hash", "model_version", "reference_version", "attempt");

CREATE INDEX "logo_scans_created_at_idx" ON "logo_scans"("created_at");

CREATE TABLE "logo_current_image" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" VARCHAR(256) NOT NULL,
    "image_hash" VARCHAR(64) NOT NULL,
    "requested_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "logo_current_image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "logo_current_image_product_id_key" ON "logo_current_image"("product_id");

COMMENT ON TABLE "logo_scans" IS
  'Verhaal 1.3: elke logo-scan met versies en ruwe detecties, 12 maanden bewaard. '
  'reference_version is de poolhandtekening <aantal>:<laatste createdAt> van reference_logos (actief).';
COMMENT ON TABLE "logo_current_image" IS
  'Verhaal 1.3: per product het huidige beeld; schuift alleen vooruit op requested_at.';
