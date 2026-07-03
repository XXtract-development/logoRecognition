/**
 * NFR-6-pad-guard — bronrestrictie voor exports, API-responses en rapporten.
 *
 * Bindende regel (ARCHITECTURE-SPINE Consistency Convention "GS1-gidsbeelden",
 * FR-16 / NFR-6): GS1-gidsbeelden staan UITSLUITEND in het bootstrap-zoekpad;
 * ze verschijnen NOOIT in exports, API-responses of rapporten. Exports en
 * rapporten bevatten uitsluitend eigen crop-paden.
 *
 * De gidsbibliotheek leeft onder het prefix `reference-logos/` (zie
 * `apps/api/src/api/v1/reference-logos.ts:106` en `services/storage.ts`). Deze
 * guard weigert/filtert elk pad onder dat prefix — afgedwongen, niet aangenomen.
 * Herbruikbaar door latere export-stories (Story 16.3, taak 2).
 *
 * Ontwerp: pure functies, geen DB/side-effects behalve een gelogde waarschuwing
 * wanneer een gidspad wordt onderschept (aantoonbaar in de test).
 */

import { createLogger } from '../../core/logger';

const logger = createLogger('flywheel-reference-path-guard');

/**
 * Het gids-/referentiebibliotheek-prefix dat NOOIT in een export/rapport mag.
 * Byte-gelijk aan het opslag-contract (`reference-logos/{code}/{variant}.{ext}`).
 */
export const REFERENCE_LOGO_PREFIX = 'reference-logos/';

/**
 * True wanneer `path` naar een GS1-gidsbeeld verwijst (onder het
 * `reference-logos/`-prefix) en dus per NFR-6 niet in een export/rapport mag.
 *
 * Robuust tegen leidende `./` en `/` zodat een pad dat cosmetisch anders is
 * opgebouwd (bv. `./reference-logos/...` of `/reference-logos/...`) niet
 * ongemerkt door de guard glipt. `null`/`undefined`/leeg zijn geen gidspad.
 */
export function isReferenceLogoPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const normalized = path.replace(/^\.?\/+/, '');
  return normalized.startsWith(REFERENCE_LOGO_PREFIX);
}

/**
 * Sanitiseer een enkel bronbestand/crop-pad voor opname in een export/rapport.
 * Een gidspad (`reference-logos/...`) wordt geweigerd: retourneert `null` en
 * logt een waarschuwing (aantoonbaar). Elk ander (eigen) pad passeert ongewijzigd.
 *
 * `context` beschrijft waar het pad vandaan kwam (bv. `{ gtin, t3777Code }`) zodat
 * een onderschepping herleidbaar in de log verschijnt.
 */
export function sanitizeSourcePath(
  path: string | null | undefined,
  context?: Record<string, unknown>
): string | null {
  if (isReferenceLogoPath(path)) {
    logger.warn(
      'NFR-6-guard: gidsbeeld-pad (reference-logos/) onderschept en uit export/rapport verwijderd',
      { path, ...context }
    );
    return null;
  }
  return path ?? null;
}
