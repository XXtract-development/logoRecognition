-- Terugdraaipad (down-script) voor migratie 0016_add_outlier_findings
-- (Story 14.3, ARCH-2: elke migratie levert een gedocumenteerd terugdraaipad).
--
-- Prisma Migrate kent geen automatische down-migraties; dit script draai je
-- handmatig om de `outlier_findings`-tabel te verwijderen. De tabel hangt met
-- één FK aan `reference_logos` (ON DELETE CASCADE); een enkele DROP CASCADE
-- ruimt de tabel, zijn indexen en de FK-constraint mee op.
--
-- LET OP: na deze terugrol verdwijnen alle geregistreerde outlier-meldingen
-- (open én beoordeeld). Draai dit uitsluitend wanneer Story 14.3 volledig
-- teruggedraaid wordt.

-- DropTable
DROP TABLE IF EXISTS "outlier_findings" CASCADE;
