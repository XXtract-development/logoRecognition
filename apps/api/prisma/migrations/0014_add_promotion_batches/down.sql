-- Terugdraaipad (down-script) voor migratie 0014_add_promotion_batches
-- (Story 13.4, ARCH-2: elke migratie levert een gedocumenteerd terugdraaipad).
--
-- Prisma Migrate kent geen automatische down-migraties; dit script draai je
-- handmatig om de promotie-batch-tabel + FK-constraint te verwijderen. De
-- volgorde is bewust: eerst de FK op reference_candidates droppen, dan de tabel.
--
-- LET OP: de kolom reference_candidates.promotion_batch_id blijft bestaan
-- (nullable, zonder constraint) — precies de 13.2-toestand van vóór deze
-- migratie. Kandidaten met een gezette promotion_batch_id verwijzen na deze
-- terugrol naar een niet meer bestaande batch; dat is aanvaardbaar omdat de
-- kolom weer constraint-loos is. DROP TABLE ... CASCADE ruimt indexen mee op.

-- DropForeignKey
ALTER TABLE "reference_candidates" DROP CONSTRAINT IF EXISTS "reference_candidates_promotion_batch_id_fkey";

-- DropIndex (op reference_candidates; de batch-tabel-indexen verdwijnen met de tabel)
DROP INDEX IF EXISTS "reference_candidates_promotion_batch_id_idx";

-- DropTable
DROP TABLE IF EXISTS "promotion_batches" CASCADE;
