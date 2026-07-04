-- Terugdraai-script voor migratie 0020 (Story 18.1). Handmatig, na expliciete toestemming.
ALTER TABLE "artwork_imports" DROP COLUMN "gln_backfill_reason";
