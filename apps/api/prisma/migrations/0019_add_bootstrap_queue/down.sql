-- Terugdraaipad voor migratie 0019 (Story 16.2) — drop de tabel volledig.
-- De indexen (UNIQUE op t3777_code, index op status) vallen mee weg met de tabel.
-- Geen andere schema-objecten geraakt.

DROP TABLE IF EXISTS "bootstrap_queue";
