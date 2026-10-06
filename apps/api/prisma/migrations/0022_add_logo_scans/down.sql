-- Terugdraaipad voor migratie 0022 (Verhaal 1.3) — drop beide tabellen volledig.
-- De indexen vallen mee weg met de tabellen. Geen andere schema-objecten geraakt.

DROP TABLE IF EXISTS "logo_current_image";
DROP TABLE IF EXISTS "logo_scans";
