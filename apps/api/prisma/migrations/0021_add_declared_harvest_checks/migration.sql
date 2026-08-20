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
--     tegen welke pool geoordeeld is: aantal + md5 over de id's van
--     `reference_embeddings` gejoind op ACTIEVE `reference_logos` — dezelfde
--     bron waarop de match draait, zodat een referentierij zonder embedding niet
--     meetelt en een netto-nul-wisseling wél gezien wordt. Verandert die
--     vingerafdruk, dan wordt het paar opnieuw
--     bekeken. Zonder dat zou de oogst zichzelf afsluiten voor precies de
--     referenties die het vliegwiel zelf oplevert.
-- "Cap bereikt" is een runbudget en GEEN oordeel — dat komt hier nooit in.
--
-- `outcome` kent vijf waarden: `candidate` (kandidaat aangemaakt),
-- `existing_item` (er stond al een review-item voor dit paar), `keyline`,
-- `below_floor` en `cross_code`. De eerste drie zijn blijvend, de laatste twee
-- voorlopig. `candidate` en `existing_item` hebben dezelfde houdbaarheid maar een
-- verschillende herkomst; met één gedeelde waarde is later niet meer te verklaren
-- waar een rij vandaan komt.
--
-- Sleutel `(t3777_code, gtin, source_file)` en dat is de enige. Verandert de
-- paginakeuze voor een GTIN, dan is het een nieuw paar en mag het opnieuw. De
-- OUDE rij blijft dan staan: er is geen opruiming voor verweesde rijen. Het
-- aantal rijen is dus niet gelijk aan het aantal levende paren. Bij de huidige
-- omvang (orde 1.300 paren) is dat verwaarloosbaar; groeit het uit de hand, dan
-- is een opruiming op `source_file` die niet meer in de kaart voorkomt de weg.
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

COMMENT ON TABLE "declared_harvest_checks" IS
  'Story 20.20: welke (code, gtin, bronpagina)-paren de declaratie-oogst nakeek. '
  'Blijvende oordelen (candidate, existing_item, keyline) tellen altijd; voorlopige '
  '(below_floor, cross_code) alleen zolang ref_pool_fingerprint gelijk blijft. '
  '"Cap bereikt" komt hier nooit in. Verandert de paginakeuze voor een GTIN, dan '
  'blijft de oude rij staan: het rijenaantal is niet het aantal levende paren.';

COMMENT ON COLUMN "declared_harvest_checks"."ref_pool_fingerprint" IS
  'Vingerafdruk van de MATCHBARE referentiepool van de code op het moment van '
  'oordelen: aantal + md5 over de id''s van reference_embeddings gejoind op '
  'actieve reference_logos — dezelfde bron waarop de match draait. Alleen gevuld '
  'bij een voorlopig oordeel.';
