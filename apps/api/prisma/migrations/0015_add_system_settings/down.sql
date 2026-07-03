-- Terugdraaipad (down-script) voor migratie 0015_add_system_settings
-- (Story 13.6, ARCH-2: elke migratie levert een gedocumenteerd terugdraaipad).
--
-- Prisma Migrate kent geen automatische down-migraties; dit script draai je
-- handmatig om de `system_settings`-tabel te verwijderen. De tabel is
-- zelfstandig (geen FK's van of naar andere tabellen), dus een enkele DROP
-- volstaat. CASCADE ruimt de primary-key-index mee op.
--
-- LET OP: na deze terugrol verdwijnt de persistente pauze-stand én de
-- baseline-invalidatie-marker. Een lopende pauze is daarmee niet langer
-- persistent — draai dit uitsluitend wanneer Story 13.6 volledig teruggedraaid
-- wordt.

-- DropTable
DROP TABLE IF EXISTS "system_settings" CASCADE;
