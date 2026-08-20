-- Story 20.20 (AC4/AC5): de declaratie-oogst onthoudt WAT hij nakeek.
--
-- Tot nu toe onthield de oogst alleen paren die een review-item OPLEVERDEN
-- (`review_item_exists`). De ruim 1200 paren die zijn nagekeken en niets
-- opleverden stonden nergens en werden elke ronde opnieuw doorgerekend — bij
-- ~28 s per paar is dat de ~8,5 uur die deze story wegneemt.
--
-- Een eigen tabel en NIET de objectopslag: dit vraagt opzoekingen per paar, en
-- het bestaande opslagpatroon valt bij een leesfout fail-safe terug op "niets
-- onthouden" — precies het dure geval, en dan onzichtbaar. De oogst heeft al
-- een databaseverbinding.
--
-- Omvang: orde duizenden rijen (1349 paren nu), verwaarloosbaar naast de
-- 7.635 review-items.
--
-- `permanent` scheidt de twee soorten oordeel:
--   * blijvend  — kandidaat aangemaakt, of een keyline-pagina (20.9): een
--     eigenschap van de pagina/wachtrij zelf, die niet meer verandert.
--   * voorlopig — onder de drempel, of cross-code afgewezen (20.7): een oordeel
--     tegen de referentiepool van DAT moment. `ref_pool_fingerprint` legt vast
--     tegen welke pool geoordeeld is (aantal actieve referenties + de jongste
--     `created_at`); verandert die vingerafdruk, dan wordt het paar opnieuw
--     bekeken. Zonder dat zou de oogst zichzelf afsluiten voor precies de
--     referenties die het vliegwiel zelf oplevert.
-- "Cap bereikt" is een runbudget en GEEN oordeel — dat komt hier nooit in.
--
-- Sleutel `(t3777_code, gtin, source_file)` en dat is de enige. Verandert de
-- paginakeuze voor een GTIN, dan is het een nieuw paar en mag het opnieuw.
CREATE TABLE "declared_harvest_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "t3777_code" VARCHAR(100) NOT NULL,
    "gtin" VARCHAR(50) NOT NULL,
    "source_file" VARCHAR(500) NOT NULL,
    "outcome" VARCHAR(30) NOT NULL,
    "permanent" BOOLEAN NOT NULL,
    "ref_pool_fingerprint" TEXT,
    "checked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "declared_harvest_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "declared_harvest_checks_pair_key"
    ON "declared_harvest_checks"("t3777_code", "gtin", "source_file");

-- De bulk-ophaal vóór de paginalus zoekt per bronpagina; anders zou de story
-- dure beeldanalyse vervangen door duizenden losse opzoekingen.
CREATE INDEX "declared_harvest_checks_source_file_idx"
    ON "declared_harvest_checks"("source_file");
