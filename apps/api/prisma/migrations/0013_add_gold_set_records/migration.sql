-- Story 13.3 — Gold-set naar beheerde opslag (AD-4/AD-13, FR-10).
--
-- Nieuwe tabel: gold_set_records. Vervangt de bevroren JSON-snapshots in
-- tests/validation/ als bron van waarheid voor de regressietest (13.5).
--
-- ONTWERPBESLISSINGEN (variance t.o.v. de Structural Seed — spine fixeert enkel
-- sleutel-kolommen en relaties; deze story vult ze in):
--
--   * cropPath NULLABLE. Twee bronniveaus voeden deze tabel:
--       - crop-niveau : de 91 records uit gold-set-oogstrun.json — cropPath
--                       gevuld; evidence bevat gtin/confidence/method/
--                       sourceFile/bbox. De 13.5-regressie-eval consumeert
--                       UITSLUITEND deze crop-records.
--       - GTIN-niveau : de 74 records uit declared-marks-goldset.json — per
--                       (gtin, code) één record ECHT met cropPath NULL, source
--                       'declared-marks-goldset'. Dienen als declaratie-anker,
--                       niet als eval-input.
--     Daarom is crop_path nullable (GTIN-records hebben geen crop).
--
--   * evidence JSONB @default('{}'). Zodat NIETS van de bron-JSON verloren gaat
--     (bron-id, gtin, confidence, method, sourceFile, bbox, codes) — herleid-
--     baarheid conform AD-13.
--
-- IMMUTABILITY (AD-13, FR-10): records worden nooit ge-update op inhouds-
-- kolommen en nooit verwijderd. De ENIGE toegestane mutatie is replaced_by_id
-- zetten op het OUDE record bij vervanging. Actieve set = replaced_by_id IS NULL
-- (AD-4, geen keten-traversal). De service-guard in apps/api bewaakt dit.
--
-- 14.1-AFSTEMPUNT (BEWUST): er is GEEN CHECK-constraint die
-- replaced_by_id = id blokkeert — de self-tombstone-undo van Story 14.1 steunt
-- hierop. Voeg zo'n constraint hier NIET toe.
--
-- Terugdraaipad: zie down.sql in deze map (ARCH-2). Handmatig uit te voeren met
-- `prisma migrate deploy` NA expliciete toestemming (operationele envelope §2);
-- nooit auto-migrate.

-- CreateTable
CREATE TABLE "gold_set_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" VARCHAR(20) NOT NULL,
    "t3777_code" VARCHAR(100) NOT NULL,
    "crop_path" VARCHAR(1000),
    "source" VARCHAR(100) NOT NULL,
    "decided_by" VARCHAR(255),
    "replaced_by_id" UUID,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gold_set_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Actieve-set-query (AD-4): WHERE replaced_by_id IS NULL.
CREATE INDEX "gold_set_records_replaced_by_id_idx" ON "gold_set_records"("replaced_by_id");

-- CreateIndex
CREATE INDEX "gold_set_records_t3777_code_idx" ON "gold_set_records"("t3777_code");

-- CreateIndex
CREATE INDEX "gold_set_records_created_at_idx" ON "gold_set_records"("created_at" DESC);

-- AddForeignKey
-- Zelf-FK: het oude record verwijst naar zijn opvolger. NO ACTION (records zijn
-- immutable; geen cascade). GEEN constraint die replaced_by_id = id blokkeert.
ALTER TABLE "gold_set_records" ADD CONSTRAINT "gold_set_records_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "gold_set_records"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
