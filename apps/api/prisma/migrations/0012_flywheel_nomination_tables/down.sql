-- Terugdraaipad (down-script) voor migratie 0012_flywheel_nomination_tables
-- (Story 13.2, ARCH-2: elke migratie levert een gedocumenteerd terugdraaipad).
--
-- Prisma Migrate kent geen automatische down-migraties; dit script draai je
-- handmatig om de drie nominatie-tabellen te verwijderen. Volgorde: eerst de
-- afhankelijke tabel (candidate_embeddings → FK naar reference_candidates),
-- daarna reference_candidates, daarna hard_negatives. DROP ... CASCADE ruimt de
-- indexen en FK-constraints mee op.
--
-- LET OP: dit verwijdert ALLE genomineerde kandidaten, hun schaduw-embeddings en
-- de hard-negatives. Alleen bedoeld voor een volledige terugrol van 13.2 op een
-- omgeving waar de vliegwiel-nominatie nog niet in gebruik is.

DROP TABLE IF EXISTS "candidate_embeddings" CASCADE;
DROP TABLE IF EXISTS "reference_candidates" CASCADE;
DROP TABLE IF EXISTS "hard_negatives" CASCADE;
