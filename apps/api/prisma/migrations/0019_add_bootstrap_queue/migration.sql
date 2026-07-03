-- Story 16.2 — Gedeclareerd-niet-gevonden wordt werkvoorraad (FR-15, AD-2/AD-13).
--
-- Eén nieuwe tabel `bootstrap_queue`: de structurele werkvoorraad van het
-- referentie-vliegwiel. Elke rij is één T3777-code die door de structureel-drempel
-- (≥N declared-not-found-events over ≥M verschillende GTINs, `mismatch_events`)
-- tot werkvoorraad is bevorderd omdat de klasse GEEN actieve referenties heeft
-- (lege klasse → bootstrap-wachtrij). Codes mét actieve referenties (zwakke
-- dekking) worden GEEN rij hier maar een aanvul-signaal in de overview-payload.
--
-- Kolommen (Structural Seed): `t3777_code` UNIEK (idempotente upsert, NFR-4 —
-- herhaalde aggregatie upsert i.p.v. dubbele rijen); `status` als VARCHAR met
-- vaste waardenset wachtend/gedraaid/gevuld/leeg/uitgesloten (geen Prisma-enum,
-- patroon `ArtworkReviewItem.status`) — Story 16.2 zet alleen `wachtend`, 17.1 zet
-- gedraaid/gevuld/leeg, 17.2 zet uitgesloten; `excluded` bool (uitgesloten blijft
-- uitgesloten — de aggregatie zet een excluded-rij nooit terug op wachtend);
-- `declaration_frequency` context (16.2 mag 0 starten, 17.2 verrijkt);
-- `priority_override`/`last_run_at` nullable (17.1/17.2 vullen die).
--
-- `apps/api` is exclusief eigenaar (AD-2); ml-service schrijft hier nooit in.
--
-- Indexen: UNIQUE op `t3777_code` (upsert-sleutel) + `status` (wachtrij-filter).
--
-- Terugdraaipad: zie down.sql in deze map (drop tabel).

-- CreateTable
CREATE TABLE "bootstrap_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "t3777_code" VARCHAR(100) NOT NULL,
    "declaration_frequency" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'wachtend',
    "priority_override" INTEGER,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "last_run_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bootstrap_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bootstrap_queue_t3777_code_key" ON "bootstrap_queue"("t3777_code");

-- CreateIndex
CREATE INDEX "bootstrap_queue_status_idx" ON "bootstrap_queue"("status");
