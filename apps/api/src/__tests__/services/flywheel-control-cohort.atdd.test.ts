/**
 * ATDD red-phase scaffold — Story 16.4: Controle-cohort voor de bevestigingsgraad-trend
 *
 * Alle tests zijn it.todo (red phase). Beoogde module:
 * apps/api/src/services/flywheel/control-cohort.ts (job flywheel-cohort-rerun, queue flywheel).
 */
import { describe, it } from 'vitest';

describe('Story 16.4 — Controle-cohort voor de bevestigingsgraad-trend (RED)', () => {
  it.todo(
    'AC1: cohort-definitie (~100 GTINs) staat stabiel in system_settings (key flywheel.control-cohort: lijst + vastlegdatum + selectiecriterium), eenmalig samengesteld via idempotent script met --dry-run; runs wijzigen de lijst nooit, bewuste wijziging wordt gelogd en start een nieuwe trendlijn'
  );

  it.todo(
    'AC2: repeatable job flywheel-cohort-rerun (queue flywheel, concurrency 1, upsertJobScheduler, cadans FLYWHEEL_COHORT_CRON buiten het harvest-venster) herverwerkt het cohort via de 12.8-verify-flow en legt uitkomsten vast als mismatch_events met herkomst cohort-<runId>; ratio = confirmed / (confirmed + declared-not-found), UNSUPPORTED telt niet mee in de noemer (randgevallen: 0 confirmed, 0 events)'
  );

  it.todo(
    'AC3: ratio-trend per cohort-run is opvraagbaar via de overview-API — een meetpunt per run, berekend over events met die run-herkomst; tweede run gebruikt exact dezelfde GTIN-lijst'
  );

  it.todo(
    'AC4: pauze-scope en isolatie — job checkt de persistente pauze bij start (gepauzeerd => geen verwerking, gelogde skip) en draait via de BullMQ-worker, getemperd/time-boxed, nooit in het live-API-request-pad'
  );
});
