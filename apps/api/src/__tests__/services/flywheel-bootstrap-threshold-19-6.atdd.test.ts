/**
 * Story 19.6 — bootstrap-cosine-drempel herkalibratie (ATDD, api-kant).
 *
 * RODE FASE (vóór de fix). De go-live-investigate (case-file
 * investigations/flywheel-ml-search-0-matches-investigation.md) bewees met een
 * lees-alleen sweep + visuele verificatie dat de bootstrap-matchdrempel `0,93`
 * ver boven de werkelijke keurmerk-match-cosine (0,60–0,74) ligt → 0 vondsten.
 *
 * Deze test dwingt de herkalibreerde default af: `getBootstrapThreshold()` moet
 * zonder env de nieuwe, lagere default (0,60) teruggeven i.p.v. 0,93. De env-
 * override MOET blijven werken (omkeerbaarheid: 0,93 herstelt het oude gedrag).
 * Faalt op de huidige code (default 0,93); slaagt na de herkalibratie.
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('Story 19.6 — getBootstrapThreshold herkalibreerde default', () => {
  beforeEach(() => {
    delete process.env.FLYWHEEL_BOOTSTRAP_THRESHOLD;
  });

  it('default is herkalibreerd naar 0,60 (was 0,93) — afgestemd op de echte match-cosine', async () => {
    const c = await import('../../services/flywheel/config');
    expect(c.getBootstrapThreshold()).toBeCloseTo(0.6);
  });

  it('env-override blijft werken (omkeerbaar: 0,93 = oud gedrag)', async () => {
    const c = await import('../../services/flywheel/config');
    process.env.FLYWHEEL_BOOTSTRAP_THRESHOLD = '0.93';
    expect(c.getBootstrapThreshold()).toBeCloseTo(0.93);
    process.env.FLYWHEEL_BOOTSTRAP_THRESHOLD = '0.70';
    expect(c.getBootstrapThreshold()).toBeCloseTo(0.7);
  });
});
