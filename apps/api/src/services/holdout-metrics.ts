/**
 * Shared mapper for the persisted `metrics.holdout` block (Story 7.2).
 *
 * Single source of truth for the holdoutMetrics API shape — imported by every
 * route that exposes holdout metrics (training.ts, feedback.ts). The block is
 * written snake_case by the ML-service; we accept camelCase defensively too.
 *
 * Contract: a MISSING holdout block returns null (model simply has no holdout
 * evaluation). A PRESENT-BUT-MALFORMED block (accuracy not a number) ALSO
 * returns null — never coerce missing values to 0, which would render a
 * data-plumbing bug as a genuine "0.0% accuracy" model score.
 */

import { createLogger } from '../core/logger';

const logger = createLogger('holdout-metrics');

export interface HoldoutMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  holdoutSize: number;
  holdoutHash: string | null;
}

export function mapHoldoutMetrics(metrics: unknown): HoldoutMetrics | null {
  if (!metrics || typeof metrics !== 'object') return null;
  const holdout = (metrics as { holdout?: Record<string, unknown> }).holdout;
  if (!holdout || typeof holdout !== 'object') return null;

  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

  const accuracy = num(holdout.accuracy);
  const holdoutSize = num(holdout.holdoutSize ?? holdout.holdout_size);

  // Malformed block: present but core fields missing/non-numeric → treat as
  // absent and log, instead of surfacing zeros as if the model scored 0.0%.
  if (accuracy === null || holdoutSize === null) {
    logger.warn('Malformed metrics.holdout block encountered; returning null', {
      keys: Object.keys(holdout),
    });
    return null;
  }

  return {
    accuracy,
    precision: num(holdout.precision) ?? 0,
    recall: num(holdout.recall) ?? 0,
    f1: num(holdout.f1) ?? 0,
    holdoutSize,
    holdoutHash: (holdout.holdoutHash ?? holdout.holdout_hash ?? null) as string | null,
  };
}
