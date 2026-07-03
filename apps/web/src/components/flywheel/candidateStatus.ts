/**
 * Kandidaatstatus → badge-tint + NL-label (Story 15.3, UX-DR5/DESIGN.md badge-set).
 *
 * KRITIEK (UX-DR5): `afgekeurd` is NEUTRAAL GRIJS — géén rood (afkeuren is regulier
 * werk, geen fout). `te beoordelen` amber, `vrijgegeven` groen. Status altijd via
 * dot + tekst (StatusBadge), nooit kleur alleen (UX-DR9).
 *
 * De server-statussen van een kandidaat in dit scherm:
 *   in_batch  → 'te beoordelen' (wacht op de datamanager)   → amber
 *   candidate → 'vrijgegeven'   (terug in de aanvoer)        → groen
 *   rejected  → 'afgekeurd'     (hard-negative)              → neutraal grijs
 */

import type { BadgeTone } from './statusColors';

export type ReviewState = 'te-beoordelen' | 'vrijgegeven' | 'afgekeurd';

export interface CandidateStatusView {
  state: ReviewState;
  tone: BadgeTone;
  /** True zodra de kandidaat beoordeeld is (vrijgegeven of afgekeurd). */
  reviewed: boolean;
}

/** Map een server-kandidaatstatus naar de review-weergave. */
export function candidateStatusView(status: string): CandidateStatusView {
  switch (status) {
    case 'candidate':
      return { state: 'vrijgegeven', tone: 'ok', reviewed: true };
    case 'rejected':
      return { state: 'afgekeurd', tone: 'neutral', reviewed: true };
    case 'in_batch':
    default:
      return { state: 'te-beoordelen', tone: 'warn', reviewed: false };
  }
}

/** NL-labeltekst per review-state (voor badge + samenvatting). */
export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  'te-beoordelen': 'te beoordelen',
  vrijgegeven: 'vrijgegeven',
  afgekeurd: 'afgekeurd',
};
