/**
 * Overview-stubs voor panelen waarvan de bron-epic nog niet gebouwd is
 * (Story 15.2, coördinatie-noot epics + UX-DR8):
 *   - GLN-dekkingsgraad   → Epic 18
 *
 * Het mismatch-trends-paneel is per Story 16.1 vervangen door de echte
 * sub-service `overview/mismatch-trends.ts`; de bootstrap-wachtrij is per Story
 * 16.2 vervangen door `overview/overview-bootstrap-queue.ts`. Beide staan hier
 * niet langer als stub.
 *
 * Elk levert een expliciete LEGE-STAAT-payload (`{ available: false, items: [] }`)
 * zodat het dashboard de lege staat toont in plaats van een kaal vlak of een
 * fout. Wanneer de betreffende epic landt, vervangt hij zijn stub door een echte
 * sub-service met dezelfde sleutels (`available` gaat naar `true`, `items`
 * gevuld) — de route en de client hoeven dan niet te veranderen.
 *
 * Modulariteit (coördinatie-noot epics): elk paneel is één sub-service-aanroep;
 * de route componeert alleen.
 */

/** Gedeelde lege-staat-vorm voor een nog-niet-gebouwd paneel. */
export interface EmptyPanel<T = never> {
  /** Bron-epic gebouwd? Zolang false: de client toont de lege staat. */
  available: false;
  /** ISO-code van de bron-epic die dit paneel gaat vullen (documentair). */
  sourceEpic: string;
  items: T[];
}

/** GLN-dekkingsgraad-paneel — lege staat tot Epic 18 (Story 18.1). */
export function getGlnCoveragePanel(): EmptyPanel {
  return { available: false, sourceEpic: 'epic-18', items: [] };
}
