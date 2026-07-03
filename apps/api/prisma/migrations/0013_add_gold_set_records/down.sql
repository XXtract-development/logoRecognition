-- Terugdraaipad (down-script) voor migratie 0013_add_gold_set_records
-- (Story 13.3, ARCH-2: elke migratie levert een gedocumenteerd terugdraaipad).
--
-- Prisma Migrate kent geen automatische down-migraties; dit script draai je
-- handmatig om de gold-set-tabel te verwijderen. DROP ... CASCADE ruimt de
-- indexen en de zelf-FK-constraint mee op.
--
-- LET OP: dit verwijdert ALLE gold-set-records (de 91 crop-samples + de 74
-- GTIN-declaratie-records én latere reviewbeslissingen). Alleen bedoeld voor een
-- volledige terugrol van 13.3 op een omgeving waar de regressietest (13.5) de
-- tabel nog niet in gebruik heeft. De bevroren JSON-snapshots in
-- tests/validation/ blijven bestaan en kunnen opnieuw geseed worden.

DROP TABLE IF EXISTS "gold_set_records" CASCADE;
