/**
 * ATDD red-phase scaffold — Epic 15 (UI): Stories 15.1, 15.2, 15.4-UI-deel
 * plus het web-deel van 17.2 (bootstrap-wachtrij-paneel).
 *
 * Alle tests zijn it.todo (red phase); geen imports van nog-niet-bestaande componenten.
 * Beoogde component: apps/web/src/pages/FlywheelPage.tsx (route /flywheel).
 * Conventie: colocated component-test naast de pagina (patroon *.test.tsx).
 */
import { describe, it } from 'vitest';

describe('Story 15.1 — Vliegwiel-sectie: theming, route en navigatie (RED)', () => {
  it.todo(
    'AC1: antd 5 is via een ConfigProvider-wrapper uitsluitend rond de /flywheel-paginas gethemed met de XXtract-tokens (navy primair, teal links, groen succes, UX-DR5-statuskleuren, Inter 14px) zonder visuele regressie op bestaande schermen; app-brede retheme buiten scope'
  );

  it.todo(
    'AC2: navigatie-item "Vliegwiel" (icoon autorenew, badge met aantal openstaande quarantainebatches) naast Review leidt naar route /flywheel (FlywheelPage, flat-page-conventie) met correcte lege/ladende staat; alle teksten NL via i18next-keys met glossary-termen conform PRD par. 3'
  );
});

describe('Story 15.2 — Overzichtsscherm: de gezondheid van het vliegwiel (RED)', () => {
  it.todo(
    'AC1: FlywheelPage laadt /api/v1/flywheel/overview en toont conform mock-overzicht.html: KPI-tegelrij, gold-set-precisietrend met tolerantielijn en een meetpunt per gepasseerde batch, quarantainetabel met faalreden, en panelen voor klassen-aan-cap, outlier-meldingen, bootstrap-wachtrij, mismatch-trends en GLN-dekkingsgraad; panelen zonder gebouwde bron-epic tonen hun lege staat'
  );

  it.todo(
    'AC2: statussemantiek — groen=gepasseerd/gepromoveerd, amber=quarantaine/wachtend, rood uitsluitend regressie-alarm en automatische stilstand (UX-DR5)'
  );

  it.todo(
    'AC3: klik op een batch in de quarantainetabel opent de batch-detailpagina (15.3-route; tot die bestaat: detail-drawer met poort-uitkomsten uit de overview-data)'
  );

  it.todo(
    'AC4: gold-set-samenstellingspaneel toont omvang, ECHT/VALS-verdeling, top-5 meest/minst vertegenwoordigde klassen en scheefgroei-signalen (14.2-data)'
  );

  it.todo(
    'AC5: Historie-tab toont gepasseerde batches met rollback-actie achter een bevestigingsmodal met verplicht redenveld (batches/:id/rollback); teruggedraaide batch krijgt badge "teruggedraaid" en het baseline-herstel is zichtbaar in de precisietrend'
  );

  it.todo(
    'AC6: doorklik op een outlier-melding opent een vergelijkingsweergave (referentie naast klasse-genoten) met acties Behouden/Deactiveren; Deactiveren zet active=false (soft-delete, gelogd) via outliers/:id/decision'
  );

  it.todo(
    'AC7: KPI-tegelrij bevat aantal openstaande quarantaines + ouderdom (SM-5), teller "gemiste nominaties" met reden (phash-onbereikbaar/pauze/vlag-uit, 13.2-events) en de "laatste succesvolle run" van de promotielus'
  );

  it.todo(
    'AC8: verversknop en refresh-on-load, geen polling; bij verouderde data een "verouderde data"-melding met handmatig vernieuwen (UX-DR8)'
  );
});

describe('Story 15.4 — Drempelbeheer en pauzebediening (UI-deel) (RED)', () => {
  it.todo(
    'AC2-UI: drempelbeheer toont de per-methode-drempels (template/embedding/classifier) afzonderlijk, dwingt een verplicht redenveld af bij wijziging en toont de wijzigingshistorie'
  );

  it.todo(
    'AC3-UI: pauzeknop toont een bevestigingsmodal en daarna een persistente amber pauzebanner; hervatten is een expliciete actie'
  );

  it.todo(
    'AC4-UI: hervat-modal toont eventuele openstaande quarantaines als waarschuwing zonder de hervatting te blokkeren'
  );

  it.todo(
    'AC5: bij automatische stilstand (K=2) toont het dashboard een rode stilstand-banner met de aanleiding, die linkt naar de betrokken batches; de notificatie via het bestaande patroon is zichtbaar'
  );
});

describe('Story 17.2 — Bootstrap-wachtrij-paneel (web-deel) (RED)', () => {
  it.todo(
    'AC2-UI: paneel rendert per klasse declaratiefrequentie en status (wachtend/gedraaid/gevuld/leeg/uitgesloten), gesorteerd op effectieve volgorde (override eerst, dan frequentie), met lege staat conform UX-DR8'
  );

  it.todo(
    'AC3/AC4-UI: "nieuw geactiveerde klasse"-melding met doorklik-navigatie naar /flywheel/batches/:id; NL-teksten via i18next-keys (UX-DR10)'
  );
});
