-- Terugdraaipad (down-script) voor migratie 0017_add_threshold_changes
-- (Story 15.4, ARCH-2: elke migratie levert een gedocumenteerd terugdraaipad).
--
-- Prisma Migrate kent geen automatische down-migraties; dit script draai je
-- handmatig om de `threshold_changes`-tabel te verwijderen. De tabel is een
-- flat audit-log zonder relaties; een enkele DROP ruimt de tabel en zijn index
-- mee op.
--
-- LET OP: na deze terugrol verdwijnt de volledige drempel-/pauze-audittrail
-- (alle geregistreerde drempelwijzigingen en pauze/hervat-overgangen). De
-- actuele drempels en de pauze-stand zelf leven in `system_settings`/env en
-- blijven ongemoeid. Draai dit uitsluitend wanneer Story 15.4 volledig
-- teruggedraaid wordt.

-- DropTable
DROP TABLE IF EXISTS "threshold_changes" CASCADE;
