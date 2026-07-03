/**
 * T3777 declaration → active reference-class alias/normalisation (Story 12.8, AC3).
 *
 * A GS1 T3777 declaration code and the code under which we hold an ACTIVE
 * reference logo are not always the same string. Two families are known to
 * diverge (Story 12.8 Dev Notes, `keurmerk-declaratie-frequentie.md`):
 *
 *   - MARINE_STEWARDSHIP_COUNCIL (the GS1 declaration) vs
 *     MARINE_STEWARDSHIP_COUNCIL_LABEL (the reference class we model), and
 *   - the RAINFOREST_ALLIANCE rebrand: the old single-class code and the new
 *     RAINFOREST_ALLIANCE_PEOPLE_NATURE both map to the class we hold a
 *     reference for.
 *
 * This module is a PURE, side-effect-free normalisation: declaration code →
 * canonical class code. It does NOT decide whether that class is *active* — that
 * is the caller's job (it holds the live active-class set from
 * `reference_logos WHERE active=true`). Separating the two keeps this table
 * data-only and unit-testable without a DB (AC3/AC9), and lets the verify-flow
 * decide UNSUPPORTED strictly on live data:
 *
 *   declared code → aliasT3777Code() → canonical code → in active set?
 *      yes → detect this class
 *      no  → verdict UNSUPPORTED (never silently skipped, AC3)
 *
 * IMPORTANT — never silently drop: an unknown declaration code is returned
 * unchanged (identity), so the caller still checks it against the active set and
 * emits UNSUPPORTED when absent. The alias table only REWRITES codes that are
 * known to diverge; it never removes a code from consideration.
 */

/**
 * Static alias map: GS1 T3777 declaration code → canonical active reference
 * class code. Keys and values are the uppercased codes as they appear in the
 * GS1 XML / `reference_logos.t3777_code`. Only codes whose declaration string
 * differs from the reference-class string belong here.
 *
 * Derivation (Story 12.8 AC3): the full table is derived by laying the 43 active
 * classes (`SELECT DISTINCT t3777_code FROM reference_logos WHERE active=true`)
 * next to the top-30 declaration frequencies. The two families below are the
 * confirmed divergences; the rest of the active classes use the identical
 * declaration string (identity — no entry needed). New divergences are added
 * here with a one-line rationale as they surface on ACC.
 */
export const T3777_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // MSC: the GS1 declaration is MARINE_STEWARDSHIP_COUNCIL; the modelled
  // reference class carries the _LABEL suffix.
  MARINE_STEWARDSHIP_COUNCIL: 'MARINE_STEWARDSHIP_COUNCIL_LABEL',

  // Rainforest Alliance rebrand: the new "People & Nature" declaration and the
  // legacy short form both point at the single RAINFOREST_ALLIANCE reference
  // class we model.
  RAINFOREST_ALLIANCE_PEOPLE_NATURE: 'RAINFOREST_ALLIANCE',
});

/**
 * Normalise a single declaration code to its canonical reference-class code.
 *
 * - trims + uppercases (declarations are already uppercased by the parser, but
 *   this keeps the function robust for direct callers/tests),
 * - rewrites a known alias to its canonical class,
 * - returns any other (unknown) code UNCHANGED so the caller still evaluates it
 *   against the active-class set (→ UNSUPPORTED when absent). Never returns
 *   empty for a non-empty input.
 */
export function aliasT3777Code(code: string): string {
  const normalized = code.trim().toUpperCase();
  return T3777_ALIASES[normalized] ?? normalized;
}

/** One resolved declaration code: the canonical class + which alias (if any) was applied. */
export interface AliasedCode {
  /** The original declaration code (trimmed/uppercased). */
  declared: string;
  /** The canonical reference-class code after alias mapping. */
  canonical: string;
  /**
   * The applied alias, or null when the code was passed through unchanged. Set
   * so a verdict can report exactly which alias was used (AC5: "welke alias is
   * toegepast").
   */
  alias: string | null;
}

/**
 * Map a list of declaration codes to their canonical reference-class codes,
 * de-duplicating on the CANONICAL code so two declaration codes that alias to
 * the same class (e.g. both Rainforest variants) collapse to one verification
 * target. The first declared code that produced a canonical wins its `declared`
 * slot; order follows first appearance.
 */
export function aliasDeclaredCodes(declared: string[]): AliasedCode[] {
  const seen = new Set<string>();
  const out: AliasedCode[] = [];
  for (const raw of declared) {
    const declaredNorm = raw.trim().toUpperCase();
    if (!declaredNorm) continue;
    const canonical = aliasT3777Code(declaredNorm);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push({
      declared: declaredNorm,
      canonical,
      alias: canonical !== declaredNorm ? canonical : null,
    });
  }
  return out;
}
