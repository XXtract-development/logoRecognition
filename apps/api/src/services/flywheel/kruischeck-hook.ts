/**
 * Kruischeck → nominatie-hook (Story 13.2, taak 6, AD-8 / FR-20).
 *
 * Koppel-klare service-functie voor de kruischeck-herkomst. Story 12.8
 * (`verify-flow.ts`, het CONFIRMED-verdict-pad) is ready-for-dev maar nog niet
 * gemerged — deze functie is de aansluitkant. Zodra 12.8 landt, wordt hij op de
 * CONFIRMED-verdict-bepaling aangeroepen, ZONDER dat de verdict-response richting
 * n8n verandert (contract-invariant AD-8).
 *
 * Dubbele-vlag-check zit in de nominatie-service (`nominateCandidate` met origin
 * `kruischeck` vereist `isKruischeckNominationEnabled()`, dat óók de hoofdvlag
 * eist). Met een van beide vlaggen uit ontstaat geen kandidaat en schrijft dit
 * pad niets — het verdict-pad blijft byte-gelijk.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KOPPELRECEPT voor Story 12.8 (`apps/api/src/services/flywheel/kruischeck-hook`):
 *
 *   import { nominateFromKruischeck } from './flywheel/kruischeck-hook';
 *
 *   // in verify-flow.ts, NÁ het bepalen van een CONFIRMED-verdict en NADAT de
 *   // verdict-response is samengesteld (nooit ervóór — de response mag niet van
 *   // de nominatie afhangen). Op het request-pad: enqueue (nooit inline). In een
 *   // worker-pad mag het synchroon.
 *   //
 *   //   await nominateFromKruischeck({
 *   //     gtin, t3777Code, confidence, method, cropPath, sourceFile, bbox,
 *   //     declared,            // de GS1-declaratie waartegen 12.8 kruist
 *   //     enqueue: true,       // request-pad → true; worker-pad → false
 *   //   });
 *   //
 *   // De verdict-response die naar n8n gaat, blijft ongewijzigd; deze aanroep is
 *   // fire-and-forget aanvullend werk (best-effort).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nominateCandidate, NominationDetection, NominationOutcome } from './nomination';
import { enqueueNominations } from './crosscheck-hook';

export interface KruischeckNominationInput {
  gtin: string;
  t3777Code: string;
  confidence: number;
  method?: string;
  cropPath?: string;
  sourceFile?: string;
  bbox?: { x: number; y: number; width: number; height: number };
  /** GS1-declaratie waartegen de kruischeck een CONFIRMED-verdict gaf. */
  declared: string[];
  /**
   * true = request-pad → enqueue (nooit inline, NFR-3/NFR-7);
   * false = worker-pad → synchroon toegestaan.
   */
  enqueue?: boolean;
}

/**
 * Nomineer een CONFIRMED-kruischeck-verdict als kandidaat-referentie (herkomst
 * `kruischeck`). Vereist BEIDE vlaggen (afgedwongen in `nominateCandidate`).
 *
 * @returns de nominatie-uitkomst bij synchrone verwerking; bij enqueue `null`
 *          (het werk draait later in de worker).
 */
export async function nominateFromKruischeck(
  input: KruischeckNominationInput
): Promise<NominationOutcome | null> {
  const detection: NominationDetection = {
    t3777Code: input.t3777Code,
    confidence: input.confidence,
    method: input.method,
    cropPath: input.cropPath,
    sourceFile: input.sourceFile,
    bbox: input.bbox,
  };

  if (input.enqueue) {
    await enqueueNominations(input.gtin, [detection], input.declared, 'kruischeck');
    return null;
  }

  return nominateCandidate({
    detection,
    origin: 'kruischeck',
    gtin: input.gtin,
    declared: input.declared,
  });
}
