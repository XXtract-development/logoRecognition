/**
 * Shared provenance shape + mapper (Epic 8, Story 8.6).
 *
 * Single source of truth for the TrainingData `provenance` JSON block. Every
 * route that writes or reads provenance imports from here (artwork-pipeline.ts
 * for registration, training.ts for the holdout synthetic-guard) so the shape
 * is defined in ONE place — the Epic 7 "shape-op-één-plek"/malformed-blocks
 * lesson (mirrors holdout-metrics.ts).
 *
 * Contract: a MISSING or empty provenance block maps to null. A PRESENT-BUT-
 * MALFORMED block (e.g. method not one of the known values, bbox missing)
 * ALSO returns null + a warning — never silently coerce to partial/zero values
 * that would hide a data-plumbing bug.
 */

import { createLogger } from '../core/logger';

const logger = createLogger('provenance');

/**
 * Logo category for keurmerk training data. Named constant instead of a magic
 * string (Epic 7 recommendation) — re-used by the registration upsert and the
 * reference-logo library so the two never drift apart.
 */
export const KEURMERK_CATEGORY = 'keurmerk';

/** Allowed provenance methods (FR49). */
export const PROVENANCE_METHODS = ['template', 'classifier', 'human', 'synthetic'] as const;
export type ProvenanceMethod = (typeof PROVENANCE_METHODS)[number];

// Type aliases (not interfaces) on purpose: aliases carry an implicit index
// signature, which makes them assignable to Prisma's InputJsonObject when
// writing the provenance Json column (interfaces are not — TS2322 in build).
export type ProvenanceBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Provenance = {
  sourceFile: string;
  bbox: ProvenanceBbox;
  method: ProvenanceMethod;
  confidence: number;
};

function isMethod(v: unknown): v is ProvenanceMethod {
  return typeof v === 'string' && (PROVENANCE_METHODS as readonly string[]).includes(v);
}

function isBbox(v: unknown): v is ProvenanceBbox {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.x === 'number' &&
    typeof b.y === 'number' &&
    typeof b.width === 'number' &&
    typeof b.height === 'number'
  );
}

/**
 * Map a persisted provenance JSON value to the typed shape, or null when it is
 * missing/empty/malformed. Logs a warning for the malformed case so a plumbing
 * bug is visible instead of producing silent partial nulls.
 */
export function mapProvenance(value: unknown): Provenance | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;

  // Empty default block `{}` → simply "no provenance", not malformed.
  if (Object.keys(p).length === 0) return null;

  if (
    typeof p.sourceFile !== 'string' ||
    !isBbox(p.bbox) ||
    !isMethod(p.method) ||
    typeof p.confidence !== 'number'
  ) {
    logger.warn('Malformed provenance block encountered; returning null', {
      keys: Object.keys(p),
    });
    return null;
  }

  return {
    sourceFile: p.sourceFile,
    bbox: p.bbox,
    method: p.method,
    confidence: p.confidence,
  };
}

/**
 * Build a provenance block for persistence from validated input. Centralises
 * the write-side shape so it cannot drift from {@link mapProvenance}.
 */
export function buildProvenance(input: {
  sourceFile: string;
  bbox: ProvenanceBbox;
  method: ProvenanceMethod;
  confidence: number;
}): Provenance {
  return {
    sourceFile: input.sourceFile,
    bbox: input.bbox,
    method: input.method,
    confidence: input.confidence,
  };
}
