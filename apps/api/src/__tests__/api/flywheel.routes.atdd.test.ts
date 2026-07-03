/**
 * ATDD red-phase scaffold — Story 15.4: Drempelbeheer en pauzebediening (API-deel)
 *
 * Het UI-deel van 15.4 staat in apps/web/src/pages/FlywheelPage.atdd.test.tsx.
 * Alle tests zijn it.todo (red phase). Beoogde route: apps/api/src/api/v1/flywheel.ts
 * (endpoints thresholds, pause; tabel threshold_changes).
 */
import { describe, it } from 'vitest';

describe('Story 15.4 — Drempelbeheer en pauzebediening (API-deel) (RED)', () => {
  it.todo(
    'AC1: Prisma-migratie voor threshold_changes (patroon model_activation_logs) bestaat met down-script, uitvoering alleen na expliciete goedkeuring (ARCH-2)'
  );

  it.todo(
    'AC2: endpoint thresholds — drempelwijziging vereist een reden (zonder reden geweigerd), logt oude+nieuwe waarde+gebruiker+reden in threshold_changes, levert de wijzigingshistorie en de per-methode-drempels (template/embedding/classifier) elk afzonderlijk'
  );

  it.todo(
    'AC3: endpoint pause — pauzeren zet de persistente pauzestand (system_settings, 13.6) en overleeft een herstart; hervatten is een expliciete, aparte actie'
  );

  it.todo(
    'AC4: hervatting wordt gelogd met gebruiker en tijdstempel (patroon threshold_changes); de response bevat eventuele openstaande quarantaines als waarschuwing zonder de hervatting te blokkeren'
  );
});
