/**
 * ATDD red-phase scaffold — Story 15.3: Quarantaine-afhandeling met volledig bewijs
 *
 * Alle tests zijn it.todo (red phase). Beoogde component:
 * apps/web/src/pages/FlywheelBatchDetailPage.tsx (route /flywheel/batches/:id).
 */
import { describe, it } from 'vitest';

describe('Story 15.3 — Quarantaine-afhandeling met volledig bewijs (RED)', () => {
  it.todo(
    'AC1: batch-detailpagina toont conform mock-quarantaine.html: faalreden, batchvoortgang, kandidatenlijst met statusbadges (master) en per kandidaat het bewijspaneel (crop naast referentie, scores, declaratieblok, poort-uitkomsten); toetsenbordnavigatie A/R/U/pijltjes/Esc conform reviewstation werkt en focus-states zijn zichtbaar'
  );

  it.todo(
    'AC2: afkeuren via candidates/:id/decision zet de kandidaat op rejected + hard-negative (herbruik 14.1-route voor gold-set-aanwas indien van toepassing), via conditional update'
  );

  it.todo(
    'AC3: vrijgeven zet de kandidaat terug naar candidate voor herbundeling in een nieuwe batch die de volledige poort opnieuw doorloopt (endpoint draait zelf nooit poortlogica); HTTP 409 op kandidaten in een batch in verwerking'
  );

  it.todo(
    'AC4: "Batch afsluiten" is pas actief als alle kandidaten beoordeeld zijn en toont een samenvattingsmodal (N afgekeurd => hard-negative; M vrijgegeven => nieuwe batch door de poort); na elke individuele beslissing springt de weergave automatisch door naar de volgende onbeoordeelde kandidaat (auto-advance)'
  );
});
