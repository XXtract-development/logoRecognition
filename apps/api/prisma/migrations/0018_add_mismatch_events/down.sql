-- Terugdraaipad voor migratie 0018 (Story 16.1) — drop de tabel volledig.
-- De indexen vallen mee weg met de tabel. Geen andere schema-objecten geraakt.

DROP TABLE IF EXISTS "mismatch_events";
