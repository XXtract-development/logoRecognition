/**
 * Story 13.2 — vlag/drempel-config + gemiste-nominatie-teller unit-tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Story 13.2 — flywheel config (AD-8)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FLYWHEEL_NOMINATION_ENABLED;
    delete process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED;
    delete process.env.FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE;
    delete process.env.FLYWHEEL_PROMOTION_THRESHOLD_EMBEDDING;
    delete process.env.FLYWHEEL_PROMOTION_THRESHOLD_CLASSIFIER;
  });

  it('beide vlaggen default uit (AC5, AD-8)', async () => {
    const c = await import('../../services/flywheel/config');
    expect(c.isNominationEnabled()).toBe(false);
    expect(c.isKruischeckNominationEnabled()).toBe(false);
  });

  it('kruischeck-vlag vereist ook de hoofdvlag (AD-8)', async () => {
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'true';
    const c = await import('../../services/flywheel/config');
    // hoofdvlag uit → kruischeck blijft uit ondanks eigen vlag aan
    expect(c.isKruischeckNominationEnabled()).toBe(false);
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    expect(c.isKruischeckNominationEnabled()).toBe(true);
  });

  it('promotiedrempels default 0,90 per methode (FR-5)', async () => {
    const c = await import('../../services/flywheel/config');
    expect(c.getPromotionThresholdForMethod('template')).toBe(0.9);
    expect(c.getPromotionThresholdForMethod('embedding')).toBe(0.9);
    expect(c.getPromotionThresholdForMethod('classifier')).toBe(0.9);
    // geen methode → strengste (classifier)
    expect(c.getPromotionThresholdForMethod(undefined)).toBe(0.9);
  });

  it('promotiedrempel per methode override-baar via env', async () => {
    process.env.FLYWHEEL_PROMOTION_THRESHOLD_EMBEDDING = '0.80';
    const c = await import('../../services/flywheel/config');
    expect(c.getPromotionThresholdForMethod('embedding')).toBe(0.8);
    expect(c.getPromotionThresholdForMethod('template')).toBe(0.9);
  });
});

describe('Story 13.4 — guardrail-config (cap/dedup/cron/watchdog)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FLYWHEEL_CLASS_CAP;
    delete process.env.FLYWHEEL_DEDUP_HAMMING_MAX;
    delete process.env.FLYWHEEL_DEDUP_COSINE;
    delete process.env.FLYWHEEL_PROMOTION_CRON;
    delete process.env.FLYWHEEL_WATCHDOG_STALE_HOURS;
  });

  it('cap default 10, override-baar', async () => {
    const c = await import('../../services/flywheel/config');
    expect(c.getClassCap()).toBe(10);
    process.env.FLYWHEEL_CLASS_CAP = '25';
    expect(c.getClassCap()).toBe(25);
  });

  it('dedup-drempels defaulten (Hamming 6, cosine 0,97) en zijn override-baar', async () => {
    const c = await import('../../services/flywheel/config');
    expect(c.getDedupHammingMax()).toBe(6);
    expect(c.getDedupCosine()).toBeCloseTo(0.97);
    process.env.FLYWHEEL_DEDUP_HAMMING_MAX = '3';
    process.env.FLYWHEEL_DEDUP_COSINE = '0.95';
    expect(c.getDedupHammingMax()).toBe(3);
    expect(c.getDedupCosine()).toBeCloseTo(0.95);
  });

  it('promotie-cron default 01:00 (0 1 * * *), tz Europe/Amsterdam', async () => {
    const c = await import('../../services/flywheel/config');
    expect(c.getPromotionCron()).toBe('0 1 * * *');
    expect(c.FLYWHEEL_PROMOTION_TZ).toBe('Europe/Amsterdam');
    process.env.FLYWHEEL_PROMOTION_CRON = '0 2 * * *';
    expect(c.getPromotionCron()).toBe('0 2 * * *');
  });

  it('watchdog-drempel default 26h, override-baar', async () => {
    const c = await import('../../services/flywheel/config');
    expect(c.getWatchdogStaleHours()).toBe(26);
    process.env.FLYWHEEL_WATCHDOG_STALE_HOURS = '48';
    expect(c.getWatchdogStaleHours()).toBe(48);
  });
});

describe('Story 13.2 — gemiste-nominatie-teller (AC7, NFR-5)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('geeft alle redenen terug met tellers (dashboard-keyset)', async () => {
    const m = await import('../../services/flywheel/missed-nominations');
    const counts = await m.getMissedNominationCounts();
    expect(Object.keys(counts).sort()).toEqual(
      ['pauze', 'phash-onbereikbaar', 'vlag-uit'].sort()
    );
  });

  it('recordMissedNomination hoogt de Redis-teller op zonder te breken', async () => {
    const m = await import('../../services/flywheel/missed-nominations');
    await expect(
      m.recordMissedNomination('phash-onbereikbaar', { gtin: '123' })
    ).resolves.toBeUndefined();
  });
});

describe('Story 13.5 — regressie-gate-config (AD-5)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FLYWHEEL_REGRESSION_THRESHOLD;
    delete process.env.FLYWHEEL_REGRESSION_MIN_WORSENED;
    delete process.env.FLYWHEEL_REGRESSION_SAMPLE_SWITCH;
    delete process.env.FLYWHEEL_REGRESSION_TOLERANCE_PP;
  });

  it('defaults: drempel 0,90 · min-worsened 2 · sample-switch 200 · tolerantie 1pp', async () => {
    const c = await import('../../services/flywheel/config');
    expect(c.getRegressionThreshold()).toBe(0.9);
    expect(c.getRegressionMinWorsened()).toBe(2);
    expect(c.getRegressionSampleSwitch()).toBe(200);
    expect(c.getRegressionTolerancePp()).toBe(1);
  });

  it('env-overrides worden gerespecteerd', async () => {
    process.env.FLYWHEEL_REGRESSION_THRESHOLD = '0.85';
    process.env.FLYWHEEL_REGRESSION_MIN_WORSENED = '3';
    process.env.FLYWHEEL_REGRESSION_SAMPLE_SWITCH = '500';
    process.env.FLYWHEEL_REGRESSION_TOLERANCE_PP = '2';
    const c = await import('../../services/flywheel/config');
    expect(c.getRegressionThreshold()).toBe(0.85);
    expect(c.getRegressionMinWorsened()).toBe(3);
    expect(c.getRegressionSampleSwitch()).toBe(500);
    expect(c.getRegressionTolerancePp()).toBe(2);
  });
});

describe('Story 18.2 — GLN-restant-re-import-dosering (NFR-3, AD-7)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FLYWHEEL_GLN_REIMPORT_BATCH_SIZE;
    delete process.env.FLYWHEEL_GLN_REIMPORT_PAUSE_MS;
  });

  it('conservatieve defaults: batch 25, pauze 30000 ms', async () => {
    const c = await import('../../services/flywheel/config');
    expect(c.getGlnReimportBatchSize()).toBe(25);
    expect(c.getGlnReimportPauseMs()).toBe(30000);
  });

  it('env-overrides worden gerespecteerd', async () => {
    process.env.FLYWHEEL_GLN_REIMPORT_BATCH_SIZE = '10';
    process.env.FLYWHEEL_GLN_REIMPORT_PAUSE_MS = '60000';
    const c = await import('../../services/flywheel/config');
    expect(c.getGlnReimportBatchSize()).toBe(10);
    expect(c.getGlnReimportPauseMs()).toBe(60000);
  });

  it('pauze 0 is toegestaan (geen tempering); ongeldige/negatieve waarden vallen terug op de default', async () => {
    process.env.FLYWHEEL_GLN_REIMPORT_PAUSE_MS = '0';
    let c = await import('../../services/flywheel/config');
    expect(c.getGlnReimportPauseMs()).toBe(0);

    vi.resetModules();
    process.env.FLYWHEEL_GLN_REIMPORT_BATCH_SIZE = '0'; // ongeldig (> 0 vereist)
    process.env.FLYWHEEL_GLN_REIMPORT_PAUSE_MS = '-5'; // ongeldig (≥ 0 vereist)
    c = await import('../../services/flywheel/config');
    expect(c.getGlnReimportBatchSize()).toBe(25);
    expect(c.getGlnReimportPauseMs()).toBe(30000);
  });
});
