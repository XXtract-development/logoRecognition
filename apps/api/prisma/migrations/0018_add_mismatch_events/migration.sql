-- Story 16.1 — Mismatch-registratie en -aggregatie (FR-14, AD-2/AD-8/AD-13).
--
-- Eén nieuwe tabel `mismatch_events`: de gedeelde registratie- en aggregatiebron
-- voor de twee waardevolste mismatch-datastromen van het vliegwiel. Elke
-- verwerking met declaratie legt per gedeclareerde code een uitkomst vast
-- (`confirmed` / `declared-not-found` / `not-supported`) en per hoogbetrouwbare
-- niet-gedeclareerde vondst een `found-not-declared`-event.
--
-- Eén gedeeld contract voor registratie (FR-14), werkvoorraad (FR-15, Story 16.2)
-- en export (FR-16, Story 16.3). Geschreven door het crosscheck- én het
-- kruischeck-pad, elk achter zijn eigen vlag (AD-8). `apps/api` is exclusief
-- eigenaar (AD-2); ml-service schrijft hier nooit in.
--
-- Kolommen (Structural Seed): `type` als VARCHAR met vaste waardenset (geen
-- Prisma-enum, patroon `ArtworkReviewItem.status`); `confidence` nullable
-- (declared-not-found/not-supported hebben geen vondst-confidence); `gln`
-- nullable (Epic 18 vult het archief pas — aggregatie groepeert dan op
-- "onbekend"); `origin` draagt de herkomst (crosscheck/kruischeck/cohort-<runId>);
-- `run_id` de per-run-herleidbaarheid (AD-13). Events zijn per-run-observaties:
-- herverwerking van dezelfde GTIN levert nieuwe rijen (geen dedup).
--
-- Indexen: DESC op `created_at` (trend), plus `t3777_code` en `gln` voor de
-- per-klasse/per-leverancier-aggregatie (AC5).
--
-- Terugdraaipad: zie down.sql in deze map (drop tabel).

-- CreateTable
CREATE TABLE "mismatch_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gtin" VARCHAR(14) NOT NULL,
    "gln" VARCHAR(13),
    "t3777_code" VARCHAR(100) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "confidence" DOUBLE PRECISION,
    "origin" VARCHAR(64) NOT NULL,
    "run_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mismatch_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mismatch_events_created_at_idx" ON "mismatch_events"("created_at" DESC);

-- CreateIndex
CREATE INDEX "mismatch_events_t3777_code_idx" ON "mismatch_events"("t3777_code");

-- CreateIndex
CREATE INDEX "mismatch_events_gln_idx" ON "mismatch_events"("gln");
