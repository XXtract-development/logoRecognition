-- Story 12.1: GS1-veldtype op de keurmerk-referentiebibliotheek.
-- Bestaande rijen zijn alle T3777-keurmerken -> default ACCREDITATION.
-- Waarden: ACCREDITATION | DIET | NUTRITIONAL | GHS_SYMBOL | CONSUMER_USAGE.
ALTER TABLE "reference_logos"
  ADD COLUMN IF NOT EXISTS "field_type" VARCHAR(30) NOT NULL DEFAULT 'ACCREDITATION';
