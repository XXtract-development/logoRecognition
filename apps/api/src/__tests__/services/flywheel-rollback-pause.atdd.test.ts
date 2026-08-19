/**
 * ATDD red-phase scaffold — Story 13.6: Rollback, persistente pauze en automatische stilstand
 *
 * Alle tests zijn it.todo (red phase). Beoogde modules:
 * apps/api/src/services/flywheel/rollback.ts en system-settings (persistente pauze).
 */
import { describe, it } from 'vitest';

describe('Story 13.6 — Rollback, persistente pauze en automatische stilstand (RED)', () => {
  it.todo(
    'AC1: Prisma-migratie voor system_settings (key/value, persistente pauze) bestaat met down-script, uitvoering alleen na expliciete goedkeuring (ARCH-2)'
  );

  it.todo(
    'AC2: rollback via batches/:id/rollback zet alle referenties van de batch active=false (soft-delete, nooit DELETE), geen detectie matcht er meer tegen, batch krijgt status rolled_back, baseline valt terug op de laatst overgebleven passed-batch, en de rollback is herleidbaar in het evidence-contract (wie/wanneer/waarom)'
  );

  it.todo(
    'AC3: elke mutatie van de actieve referentieset buiten batch-promotie om (handmatige curatie/upload, outlier-deactivatie, rollback van een niet-recente batch, legacy-12.3-registratie) markeert de baseline als verouderd zodat de eerstvolgende poortrun met een verse nulmeting begint'
  );

  it.todo(
    'AC4: K=2 opeenvolgende gequarantaineerde batches pauzeren het systeem persistent in system_settings (herstart heft de pauze niet op) en produceren een notificatie met de aanleiding'
  );

  it.todo(
    'AC5: pauze-scope — met pauze actief ontstaan geen nieuwe kandidaten en promoveert niets (nominatie-hooks, flywheel-promotion, flywheel-bootstrap), terwijl live-detectie, trainingsdata-registratie, outlier-audit (read-only) en dashboard-reads doorlopen; hervatten vereist een expliciete actie'
  );

  it.todo(
    'AC6: hard-negative-export filtert uitsluitend op de menselijk afgewezen categorie (quarantaine-afkeuring, reviewstation-reject wegens "geen keurmerk"); zacht afgewezen kandidaten (cap/duplicaat/outlier) zitten er per definitie niet in'
  );
});
