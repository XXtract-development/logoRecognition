/**
 * Story 12.18 — pure helpers for declared GS1 marks (Story 12.7 label-prior).
 *
 * Kept in its own module (no apiClient import) so consumers get the REAL
 * implementation even in tests that mock `artworkReviewService`'s network calls.
 */

/** Minimal shape of a declared mark (mirrors DeclaredMark in artworkReviewService). */
export interface DeclaredMarkLike {
  code: string;
  fieldType: string;
}

/**
 * Map a declared mark to the canonical t3777 code used by review items, so the
 * label-prior comparison (`declared.codes.has(shownCode)`) matches.
 *
 * The declared-marks endpoint returns the Nutri-Score grade as a BARE letter
 * (`{code:'D', fieldType:'NutritionalScore'}`), while review items carry the full
 * `NUTRISCORE_D`. Without this mapping every Nutri-Score item wrongly reads as
 * "niet gedeclareerd". Only a bare single letter A–E under fieldType
 * `NutritionalScore` is normalised — category codes that ride the same fieldType
 * (e.g. `GENERAL_FOODS`) are left untouched (leak-guard mirrors the 12.15 map
 * build). All other marks pass through unchanged.
 */
export const canonicalDeclaredCode = (mark: DeclaredMarkLike): string => {
  if (mark.fieldType === 'NutritionalScore' && /^[A-E]$/.test(mark.code)) {
    return `NUTRISCORE_${mark.code}`;
  }
  return mark.code;
};
