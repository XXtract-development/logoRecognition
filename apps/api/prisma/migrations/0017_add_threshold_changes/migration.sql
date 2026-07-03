-- Story 15.4 — Drempelbeheer en pauzebediening (AD-13).
--
-- Eén wijziging (de ENIGE schemawijziging van Epic 15): een nieuwe tabel
-- `threshold_changes` die EXACT het `model_activation_logs`-patroon volgt (flat
-- audit-log, geen relaties). Elke wijziging van een promotiedrempel — én elke
-- pauze/hervat-overgang van het vliegwiel — wordt hier vastgelegd met oude
-- waarde, nieuwe waarde, reden, gebruiker en tijdstempel.
--
-- Dit is UITSLUITEND de audittrail: de actuele waarde leeft in `system_settings`
-- (override, key `flywheel.promotionThreshold.<methode>`) resp. env, nooit hier
-- (twee bronnen van waarheid is verboden). `threshold_key` draagt zowel de
-- drempelsleutels als de pauze-sleutel `flywheel.paused`.
--
-- De DESC-index op `changed_at` dient de historie-weergave (nieuwste boven).
--
-- Terugdraaipad: zie down.sql in deze map (drop tabel).

-- CreateTable
CREATE TABLE "threshold_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "threshold_key" VARCHAR(255) NOT NULL,
    "old_value" VARCHAR(255) NOT NULL,
    "new_value" VARCHAR(255) NOT NULL,
    "reason" TEXT,
    "user_id" VARCHAR(255) NOT NULL,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threshold_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "threshold_changes_changed_at_idx" ON "threshold_changes"("changed_at" DESC);
