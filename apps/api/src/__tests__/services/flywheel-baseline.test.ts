/**
 * Story 13.5 — Baseline-marker-abstractie (baseline.ts) tests.
 *
 * Dekt de volgorde-ontkoppeling (AC3): tot 13.6 de bron levert is de marker
 * default "niet verouderd"; de env-override forceert het gedrag testbaar.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { isBaselineStale } from '../../services/flywheel/baseline';

afterEach(() => {
  delete process.env.FLYWHEEL_BASELINE_STALE;
});

describe('isBaselineStale (AC3)', () => {
  it('default false (geen invalidatie-bron tot 13.6)', async () => {
    expect(await isBaselineStale()).toBe(false);
  });

  it('true via FLYWHEEL_BASELINE_STALE=true', async () => {
    process.env.FLYWHEEL_BASELINE_STALE = 'true';
    expect(await isBaselineStale()).toBe(true);
  });

  it('true via FLYWHEEL_BASELINE_STALE=1', async () => {
    process.env.FLYWHEEL_BASELINE_STALE = '1';
    expect(await isBaselineStale()).toBe(true);
  });
});
