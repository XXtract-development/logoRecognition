-- Story 18.1 (FR-21): record-niveau uitvalreden voor de GLN-backfill.
-- Additief, nullable — geen backfill van bestaande waarden, geen NOT NULL.
-- NIET failure_reason hergebruiken: dat veld draagt import-status-semantiek.
ALTER TABLE "artwork_imports" ADD COLUMN "gln_backfill_reason" VARCHAR(50);
