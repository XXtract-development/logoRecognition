-- Story 13.6 — Persistente pauze, baseline-invalidatie en automatische stilstand.
--
-- Eén wijziging uit de Structural Seed (AD-11): een nieuwe, minimale key/value-
-- tabel `system_settings`. Dit is de ENIGE bron van waarheid voor:
--   * `flywheel.paused`         — persistente pauze-stand (een herstart heft de
--                                 pauze NIET op; de bron is de database, nooit
--                                 process-/env-state, AD-11).
--   * `flywheel.baselineStale`  — baseline-invalidatie-marker (AD-5): élke mutatie
--                                 van de actieve referentieset buiten batch-promotie
--                                 om markeert de baseline verouderd → de volgende
--                                 poortrun draait een verse nulmeting.
--   * `flywheel.autoPauseStreak`— teller opeenvolgende gequarantaineerde batches
--                                 voor de K=2-automatische-stilstand (AC 4).
--
-- Bewust minimaal (AD-11: "nieuwe, minimale key/value-tabel"): geen per-key-
-- typering op DB-niveau; de vorm van `value` is een applicatie-contract in
-- services/flywheel/{pause,baseline}.ts. `updated_by` legt de laatste muterende
-- gebruiker vast (AD-13-herleidbaarheid, o.a. pauze/hervatten).
--
-- Terugdraaipad: zie down.sql in deze map (drop tabel).

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(255),

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);
