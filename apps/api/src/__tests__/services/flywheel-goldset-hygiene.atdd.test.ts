/**
 * ATDD red-phase scaffold — Epic 14: Gold-set-aanwas, samenstellingsbewaking en outlier-audit
 *
 * Stories 14.1, 14.2 en het API-deel van 14.3 (job + persistentie; het /ml/outlier-audit-
 * rekencontract staat in apps/ml-service/tests/test_flywheel_atdd.py).
 * Alle tests zijn it.todo (red phase). Beoogde modules:
 * apps/api/src/services/flywheel/gold-set-accrual.ts, gold-set-composition.ts, outlier-audit-job.ts.
 */
import { describe, it } from 'vitest';

describe('Story 14.1 — Gold-set-aanwas uit reviewbeslissingen (RED)', () => {
  it.todo(
    'AC1: expliciete accept, of reject met reden "geen keurmerk", levert exact een gold_set_records-record op (accept=>ECHT, reject-geen-keurmerk=>VALS) met crop-verwijzing, T3777-code, bron en beslisser; de reviewstation-flow blijft verder ongewijzigd en de redenkeuze is alleen zichtbaar bij vliegwiel-vlag aan'
  );

  it.todo(
    'AC2: reject-reden "geen keurmerk" => gold-set-record VALS en inhouds-hash (via /ml/phash) naar hard_negatives (13.2-hernominatie-blokkade); reden "onjuiste locatie/verkeerde code" => geen gold-set-record en geen hard-negative'
  );

  it.todo(
    'AC3: undo vervangt het zojuist aangemaakte gold-set-record via replacedById (beide bewaard) en verwijdert de bijbehorende hard_negatives-rij'
  );

  it.todo(
    'AC4: correctie van een bestaand gold-set-record gebeurt via een nieuw record met replacedById; beide records blijven bewaard'
  );

  it.todo(
    'AC5: de aanwas-route is een herbruikbare service-functie die ook door quarantaine-beoordelingen (15.3) aangeroepen kan worden; gold-set groeit uitsluitend uit menselijke beslissingen'
  );
});

describe('Story 14.2 — Gold-set-samenstellingsbewaking (RED)', () => {
  it.todo(
    'AC1: samenstellingsdata-API levert omvang, ECHT/VALS-verdeling en top-5 meest/minst vertegenwoordigde klassen'
  );

  it.todo(
    'AC2: klasse >20% van de set of ECHT-aandeel buiten 60-90% registreert een scheefgroei-signaal, ontsloten via de overview-API'
  );

  it.todo(
    'AC3: promotie van een klasse zonder gold-set-dekking wordt gemarkeerd (niet geblokkeerd) in de batch-poort-uitkomsten (gateResults)'
  );

  it.todo(
    'AC4: samenstellingsbewaking wordt on-read berekend bij de overview-aanroep — er is geen aparte job'
  );
});

describe('Story 14.3 — Wekelijkse outlier-audit (API-deel: job + persistentie) (RED)', () => {
  it.todo(
    'AC1: Prisma-migratie voor outlier_findings (conform Structural Seed) bestaat met down-script, uitvoering alleen na expliciete goedkeuring (ARCH-2)'
  );

  it.todo(
    'AC3: afgeronde audit-run is persistent in outlier_findings (status open) en opvraagbaar via de overview-API, herstart-bestendig, inclusief run-tijdstempel'
  );

  it.todo(
    'AC4: beoordelingsacties (Behouden/Deactiveren) verlopen via endpoint outliers/:id/decision (15.2-flow); deze story levert uitsluitend signalering en persistentie'
  );

  it.todo(
    'AC5: met pauzestand actief draait de repeatable job flywheel-outlier-audit gewoon door (read-only, AD-11 pauze-scope)'
  );
});
