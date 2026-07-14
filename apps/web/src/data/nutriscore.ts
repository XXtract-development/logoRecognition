/**
 * Story 12.20 — the letter-independent Nutri-Score placeholder.
 *
 * The shape-based harvest (Story 12.12, `queue_harvest_nutriscore.py` →
 * `PROVISIONAL_UNKNOWN`) tags a detected Nutri-Score logo with the bare code
 * `NUTRISCORE` when it finds the shape but does NOT determine the grade letter —
 * the reviewer assigns A–E. It is NOT a real t3777 keurmerk code and is never
 * stored as a reference; surfacing the raw code in the review UI reads as a
 * broken code. This module lets the UI recognise it and show a clear label/hint.
 */
export const LETTERLESS_NUTRISCORE = 'NUTRISCORE';

/** True for the letter-independent Nutri-Score placeholder (grade not yet chosen). */
export const isLetterlessNutriscore = (code: string | null | undefined): boolean =>
  code === LETTERLESS_NUTRISCORE;
