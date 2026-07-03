/**
 * Story 16.4 — Controle-cohort voor de bevestigingsgraad-trend (GREEN).
 *
 * Dekt AC1 (cohort-definitie stabiel in system_settings + idempotente seed-
 * selectie), AC2 (maandelijkse job via upsertJobScheduler + ratio-berekening incl.
 * randgevallen + events met herkomst cohort-<runId>), AC3 (trend per cohort-run
 * uit de overview-API), AC4 (pauze-scope bij job-start + isolatie via de worker),
 * en de herkomst-scheiding (cohort-events tellen NIET in de reguliere aggregaties).
 *
 * Prisma + BullMQ + ioredis worden globaal gemockt (setup.ts). De verify-flow en
 * de klok worden geïnjecteerd zodat we de bedrading + telling testen, niet de
 * ML-logica.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VerifyRunState, VerifyCodeResult } from '../../services/pipeline/verify-flow';
import { clearSettingsCache } from '../../services/flywheel/system-settings';

// De system_settings-store heeft een korte in-process read-cache; die MOET tussen
// tests gewist worden, anders lekt een cohort-/pauze-waarde van de ene test naar de
// volgende (getSetting geeft dan een stale hit i.p.v. de nieuwe mock-waarde).
beforeEach(() => {
  clearSettingsCache();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verdict(
  code: string,
  v: VerifyCodeResult['verdict'],
  confidence: number | null = null
): VerifyCodeResult {
  return {
    declaredCode: code,
    code,
    alias: null,
    verdict: v,
    confidence,
    bbox: null,
    sourceFile: null,
    method: v === 'CONFIRMED' ? 'classifier' : null,
  };
}

function doneState(
  gtin: string,
  verdicts: VerifyCodeResult[],
  reason: VerifyRunState['declaration']['reason'] = 'ok'
): VerifyRunState {
  return {
    status: 'done',
    gtin,
    declaration: { reason, codes: verdicts.map((v) => v.declaredCode) },
    verdicts,
    processingTimeMs: 10,
    startedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// AC1 — cohort-definitie stabiel + idempotente seed-selectie
// ---------------------------------------------------------------------------

describe('AC1 — cohort-definitie in system_settings (control-cohort)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolveControlCohort leest + normaliseert de GTIN-lijst (dedup, trim)', async () => {
    const { resolveControlCohort, CONTROL_COHORT_SETTING_KEY } = await import(
      '../../services/flywheel/control-cohort'
    );
    const prisma = (await import('../../core/db')).default as unknown as {
      systemSetting: { findUnique: ReturnType<typeof vi.fn> };
    };
    prisma.systemSetting.findUnique.mockResolvedValueOnce({
      key: CONTROL_COHORT_SETTING_KEY,
      value: {
        gtins: [' 0001 ', '0001', '0002', '', '0003'],
        capturedAt: '2026-07-03T00:00:00.000Z',
        selectionCriterion: 'test',
      },
    });

    const cohort = await resolveControlCohort();
    expect(cohort).not.toBeNull();
    // '0001' gededupt/getrimd, lege string weg → 3 unieke.
    expect(cohort!.gtins).toEqual(['0001', '0002', '0003']);
    expect(cohort!.capturedAt).toBe('2026-07-03T00:00:00.000Z');
  });

  it('resolveControlCohort geeft null bij ontbrekende of ongeldige definitie', async () => {
    const { resolveControlCohort } = await import('../../services/flywheel/control-cohort');
    const prisma = (await import('../../core/db')).default as unknown as {
      systemSetting: { findUnique: ReturnType<typeof vi.fn> };
    };
    prisma.systemSetting.findUnique.mockResolvedValueOnce(null);
    expect(await resolveControlCohort()).toBeNull();

    prisma.systemSetting.findUnique.mockResolvedValueOnce({ value: { gtins: 'nope' } });
    expect(await resolveControlCohort()).toBeNull();
  });

  it('seed selecteert GTINs gespreid over codes (round-robin, idempotent-deterministisch)', async () => {
    const { selectCohortGtins } = await import('../../scripts/seed-control-cohort');
    const entries = [
      { _id: 'A', codes: ['X', 'Y'] },
      { _id: 'B', codes: ['X'] },
      { _id: 'C', codes: ['Y'] },
      { _id: 'D', codes: ['Z'] },
      { _id: '', codes: ['X'] }, // lege GTIN → weg
      { _id: 'E', codes: [] }, // geen codes → weg
    ];
    const first = selectCohortGtins(entries, 100);
    const second = selectCohortGtins(entries, 100);
    // Deterministisch → dezelfde volgorde bij herhaalde samenstelling (stabiliteit).
    expect(first).toEqual(second);
    // Alle bruikbare GTINs, gededupt.
    expect([...first].sort()).toEqual(['A', 'B', 'C', 'D']);
    // Spreiding: round-robin begint met één GTIN per code (A voor X, C voor Y, D voor Z).
    expect(first.slice(0, 3)).toEqual(['A', 'C', 'D']);
  });

  it('seed respecteert de doel-omvang', async () => {
    const { selectCohortGtins } = await import('../../scripts/seed-control-cohort');
    const entries = Array.from({ length: 50 }, (_, i) => ({
      _id: `G${i}`,
      codes: ['X'],
    }));
    expect(selectCohortGtins(entries, 10)).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// AC2 — ratio-berekening (randgevallen) + verdict-telling
// ---------------------------------------------------------------------------

describe('AC2 — ratio-berekening + verdict-telling', () => {
  it('cohortConfirmedRatio: confirmed / (confirmed + declared-not-found)', async () => {
    const { cohortConfirmedRatio } = await import('../../services/flywheel/control-cohort');
    expect(cohortConfirmedRatio({ confirmed: 3, declaredNotFound: 1 })).toBe(0.75);
  });

  it('cohortConfirmedRatio: 0 confirmed → 0 (niet null) als er wel niet-gevonden zijn', async () => {
    const { cohortConfirmedRatio } = await import('../../services/flywheel/control-cohort');
    expect(cohortConfirmedRatio({ confirmed: 0, declaredNotFound: 4 })).toBe(0);
  });

  it('cohortConfirmedRatio: 0 declaratie-uitkomsten → null (noemer 0)', async () => {
    const { cohortConfirmedRatio } = await import('../../services/flywheel/control-cohort');
    expect(cohortConfirmedRatio({ confirmed: 0, declaredNotFound: 0 })).toBeNull();
  });

  it('verdictsToCohortCounts: UNSUPPORTED telt NIET in de noemer, UNCERTAIN wél als niet-gevonden', async () => {
    const { verdictsToCohortCounts, cohortConfirmedRatio } = await import(
      '../../services/flywheel/control-cohort'
    );
    const counts = verdictsToCohortCounts([
      verdict('A', 'CONFIRMED', 0.9),
      verdict('B', 'NOT_FOUND'),
      verdict('C', 'UNCERTAIN', 0.4),
      verdict('D', 'UNSUPPORTED'),
    ]);
    expect(counts).toEqual({ confirmed: 1, declaredNotFound: 2, notSupported: 1 });
    // noemer = 1 + 2 = 3 (UNSUPPORTED telt niet mee) → 1/3.
    expect(cohortConfirmedRatio(counts)).toBe(0.3333);
  });
});

// ---------------------------------------------------------------------------
// AC2 — job-run: events met herkomst cohort-<runId>, scheduler via upsert
// ---------------------------------------------------------------------------

describe('AC2 — cohort-job registreert events met herkomst cohort-<runId>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runCohortRerun draait het verify-pad per GTIN en schrijft mismatch_events met origin cohort-<runId>', async () => {
    const prisma = (await import('../../core/db')).default as unknown as {
      systemSetting: { findUnique: ReturnType<typeof vi.fn> };
      referenceLogo: { findMany: ReturnType<typeof vi.fn> };
      mismatchEvent: { createMany: ReturnType<typeof vi.fn> };
    };
    // Cohort-definitie: 2 GTINs. Pauze-key null.
    prisma.systemSetting.findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
      if (where.key === 'flywheel.paused') return Promise.resolve(null);
      return Promise.resolve({
        value: { gtins: ['G1', 'G2'], capturedAt: 'x', selectionCriterion: 'y' },
      });
    });
    // Actieve klassen (voor de 16.1-registratie): A + B actief.
    prisma.referenceLogo.findMany.mockResolvedValue([
      { t3777Code: 'A' },
      { t3777Code: 'B' },
    ]);
    prisma.mismatchEvent.createMany.mockResolvedValue({ count: 1 });

    const { runCohortRerun } = await import('../../services/flywheel/control-cohort');

    const runVerify = vi
      .fn()
      .mockImplementation((_runId: string, gtin: string) =>
        Promise.resolve(
          doneState(gtin, [verdict('A', 'CONFIRMED', 0.9), verdict('B', 'NOT_FOUND')])
        )
      );

    const result = await runCohortRerun({
      runVerify,
      now: () => new Date('2026-07-03T03:23:00.000Z'),
    });

    expect(result.status).toBe('ran');
    expect(result.processed).toBe(2);
    // 2 GTINs × (1 confirmed + 1 declared-not-found) → ratio 2/(2+2) = 0.5.
    expect(result.counts.confirmed).toBe(2);
    expect(result.counts.declaredNotFound).toBe(2);
    expect(result.confirmedRatio).toBe(0.5);
    expect(runVerify).toHaveBeenCalledTimes(2);

    // Elke createMany-aanroep schrijft origin `cohort-<runId>`.
    const runId = result.runId!;
    const calls = prisma.mismatchEvent.createMany.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const rows = (call[0] as { data: Array<{ origin: string; runId: string }> }).data;
      for (const row of rows) {
        expect(row.origin).toBe(`cohort-${runId}`);
        expect(row.runId).toBe(runId);
      }
    }
  });

  it('registerCohortMismatchEvents zet de herkomst op cohort-<runId> (zonder vlag — meetinstrument)', async () => {
    const prisma = (await import('../../core/db')).default as unknown as {
      referenceLogo: { findMany: ReturnType<typeof vi.fn> };
      mismatchEvent: { createMany: ReturnType<typeof vi.fn> };
    };
    prisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'A' }]);
    prisma.mismatchEvent.createMany.mockResolvedValue({ count: 1 });

    const { registerCohortMismatchEvents } = await import(
      '../../services/flywheel/mismatch-events'
    );
    // Geen FLYWHEEL_*-vlaggen gezet → toch schrijven (cohort is het meetinstrument).
    delete process.env.FLYWHEEL_NOMINATION_ENABLED;
    delete process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED;

    await registerCohortMismatchEvents({
      gtin: 'G1',
      gln: null,
      declared: ['A'],
      confirmedCodes: ['A'],
      undeclaredFindings: [],
      runId: 'RUN1',
    });

    const rows = (
      prisma.mismatchEvent.createMany.mock.calls[0][0] as {
        data: Array<{ origin: string }>;
      }
    ).data;
    expect(rows.every((r) => r.origin === 'cohort-RUN1')).toBe(true);
  });

  it('scheduler registreert flywheel-cohort-rerun via upsertJobScheduler (geen repeat), maandelijkse cron + tz', async () => {
    const { Queue } = await import('bullmq');
    delete process.env.FLYWHEEL_COHORT_CRON;
    const { registerFlywheelSchedulers } = await import('../../services/flywheel/scheduler');
    await registerFlywheelSchedulers();

    const queueInstance = (Queue as unknown as ReturnType<typeof vi.fn>).mock.results.at(-1)
      ?.value;
    const upsert = queueInstance.upsertJobScheduler as ReturnType<typeof vi.fn>;

    const cohortCall = upsert.mock.calls.find(
      (c) => (c[2] as { name?: string })?.name === 'flywheel-cohort-rerun'
    );
    expect(cohortCall).toBeDefined();
    expect(cohortCall![1]).toMatchObject({ pattern: '23 3 1 * *', tz: 'Europe/Amsterdam' });

    // Nooit het gedeprecieerde repeat-pad.
    const add = queueInstance.add as ReturnType<typeof vi.fn>;
    for (const call of add.mock.calls) {
      expect(call[2]?.repeat).toBeUndefined();
    }
  });

  it('worker routeert flywheel-cohort-rerun naar de cohort-flow (leest de definitie)', async () => {
    const prisma = (await import('../../core/db')).default as unknown as {
      systemSetting: { findUnique: ReturnType<typeof vi.fn> };
    };
    // Pauze null + geen definitie → skipped-empty, maar de route MOET de definitie hebben gelezen.
    prisma.systemSetting.findUnique.mockResolvedValue(null);
    const { processFlywheelJob } = await import('../../services/pipeline/workers');
    await processFlywheelJob({ name: 'flywheel-cohort-rerun' } as never);
    expect(prisma.systemSetting.findUnique).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC3 — trend per cohort-run uit de overview-API + stabiliteit
// ---------------------------------------------------------------------------

describe('AC3 — cohort-trend per run (overview)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('buildCohortTrend: één meetpunt per run (origin), chronologisch, ratio per run', async () => {
    const { buildCohortTrend } = await import('../../services/flywheel/overview/cohort-trend');
    const trend = buildCohortTrend([
      { origin: 'cohort-R2', type: 'confirmed', n: 8, run_at: new Date('2026-08-01T03:23:00Z') },
      { origin: 'cohort-R2', type: 'declared-not-found', n: 2, run_at: new Date('2026-08-01T03:23:00Z') },
      { origin: 'cohort-R1', type: 'confirmed', n: 5, run_at: new Date('2026-07-01T03:23:00Z') },
      { origin: 'cohort-R1', type: 'declared-not-found', n: 5, run_at: new Date('2026-07-01T03:23:00Z') },
      // not-supported telt niet in de noemer.
      { origin: 'cohort-R1', type: 'not-supported', n: 3, run_at: new Date('2026-07-01T03:23:00Z') },
    ]);

    expect(trend.map((p) => p.runId)).toEqual(['R1', 'R2']); // chronologisch
    expect(trend[0].confirmedRatio).toBe(0.5); // R1: 5/(5+5)
    expect(trend[1].confirmedRatio).toBe(0.8); // R2: 8/(8+2)
    // De stijgende SM-3-trend zichtbaar.
    expect(trend[1].confirmedRatio!).toBeGreaterThan(trend[0].confirmedRatio!);
  });

  it('getCohortTrend leest UITSLUITEND cohort-events (origin LIKE cohort-%)', async () => {
    const prisma = (await import('../../core/db')).default as unknown as {
      $queryRaw: ReturnType<typeof vi.fn>;
    };
    prisma.$queryRaw.mockResolvedValueOnce([
      { origin: 'cohort-R1', type: 'confirmed', n: 1, run_at: new Date('2026-07-01T00:00:00Z') },
    ]);
    const { getCohortTrend } = await import('../../services/flywheel/overview/cohort-trend');
    const panel = await getCohortTrend();
    expect(panel.available).toBe(true);
    expect(panel.runs).toHaveLength(1);
    expect(panel.runs[0].runId).toBe('R1');
    // De query bevat de cohort-only filter.
    const sql = String(prisma.$queryRaw.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain("origin LIKE");
  });

  it('overview-composer neemt cohortTrend als paneel op', async () => {
    const prisma = (await import('../../core/db')).default as unknown as {
      $queryRaw: ReturnType<typeof vi.fn>;
    };
    prisma.$queryRaw.mockResolvedValue([]);
    const { composeOverview } = await import('../../services/flywheel/overview/index');
    const overview = await composeOverview();
    expect(overview).toHaveProperty('cohortTrend');
  });

  it('stabiliteit: twee runs gebruiken exact dezelfde GTIN-lijst (definitie ongemoeid)', async () => {
    const { runCohortRerun } = await import('../../services/flywheel/control-cohort');
    const prisma = (await import('../../core/db')).default as unknown as {
      systemSetting: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
      referenceLogo: { findMany: ReturnType<typeof vi.fn> };
      mismatchEvent: { createMany: ReturnType<typeof vi.fn> };
    };
    prisma.systemSetting.findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
      if (where.key === 'flywheel.paused') return Promise.resolve(null);
      return Promise.resolve({
        value: { gtins: ['G1', 'G2', 'G3'], capturedAt: 'x', selectionCriterion: 'y' },
      });
    });
    prisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'A' }]);
    prisma.mismatchEvent.createMany.mockResolvedValue({ count: 1 });

    const seen: string[][] = [];
    const runVerify = vi.fn().mockImplementation((_r: string, gtin: string) => {
      return Promise.resolve(doneState(gtin, [verdict('A', 'CONFIRMED', 0.9)]));
    });

    for (let i = 0; i < 2; i++) {
      runVerify.mockClear();
      await runCohortRerun({ runVerify, now: () => new Date(`2026-0${7 + i}-01T03:23:00Z`) });
      seen.push(runVerify.mock.calls.map((c) => c[1] as string));
    }
    expect(seen[0]).toEqual(['G1', 'G2', 'G3']);
    expect(seen[1]).toEqual(seen[0]); // identieke lijst, ongewijzigd
    // De definitie is NOOIT via upsert overschreven door de run.
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC4 — pauze-scope + isolatie
// ---------------------------------------------------------------------------

describe('AC4 — pauze-scope bij job-start', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gepauzeerd → geen verwerking (skipped-paused), verify-flow niet aangeroepen', async () => {
    const prisma = (await import('../../core/db')).default as unknown as {
      systemSetting: { findUnique: ReturnType<typeof vi.fn> };
    };
    // isPaused leest flywheel.paused; definitie zou niet eens gelezen mogen worden.
    prisma.systemSetting.findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
      if (where.key === 'flywheel.paused') {
        return Promise.resolve({ value: { paused: true, reason: 'test', since: 'x', by: 'u' } });
      }
      return Promise.resolve({ value: { gtins: ['G1'], capturedAt: 'x', selectionCriterion: 'y' } });
    });

    const { runCohortRerun } = await import('../../services/flywheel/control-cohort');
    const runVerify = vi.fn();
    const result = await runCohortRerun({ runVerify, now: () => new Date() });

    expect(result.status).toBe('skipped-paused');
    expect(runVerify).not.toHaveBeenCalled();
  });

  it('uitval (no-artwork/api-fout) telt als skipped, niet als declared-not-found', async () => {
    const prisma = (await import('../../core/db')).default as unknown as {
      systemSetting: { findUnique: ReturnType<typeof vi.fn> };
      referenceLogo: { findMany: ReturnType<typeof vi.fn> };
      mismatchEvent: { createMany: ReturnType<typeof vi.fn> };
    };
    prisma.systemSetting.findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
      if (where.key === 'flywheel.paused') return Promise.resolve(null);
      return Promise.resolve({ value: { gtins: ['G1', 'G2', 'G3'], capturedAt: 'x', selectionCriterion: 'y' } });
    });
    prisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'A' }]);
    prisma.mismatchEvent.createMany.mockResolvedValue({ count: 1 });

    const { runCohortRerun } = await import('../../services/flywheel/control-cohort');
    const runVerify = vi.fn().mockImplementation((_r: string, gtin: string) => {
      if (gtin === 'G1') return Promise.resolve(doneState(gtin, [verdict('A', 'CONFIRMED', 0.9)]));
      if (gtin === 'G2') {
        // no-artwork terminal status.
        return Promise.resolve({ ...doneState(gtin, []), status: 'no-artwork' } as VerifyRunState);
      }
      // api-fout: done maar reason niet ok/lege-declaratie → uitval.
      return Promise.resolve(doneState(gtin, [], 'api-fout'));
    });

    const result = await runCohortRerun({ runVerify, now: () => new Date('2026-07-03T03:23:00Z') });
    expect(result.processed).toBe(1); // alleen G1
    expect(result.counts.skipped).toBe(2); // G2 + G3 uitval
    expect(result.counts.confirmed).toBe(1);
    expect(result.counts.declaredNotFound).toBe(0); // uitval NIET als niet-gevonden
  });

  it('time-box: resterende GTINs vallen als uitval bij overschrijding', async () => {
    process.env.FLYWHEEL_COHORT_MAX_SECONDS = '1';
    const prisma = (await import('../../core/db')).default as unknown as {
      systemSetting: { findUnique: ReturnType<typeof vi.fn> };
      referenceLogo: { findMany: ReturnType<typeof vi.fn> };
      mismatchEvent: { createMany: ReturnType<typeof vi.fn> };
    };
    prisma.systemSetting.findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
      if (where.key === 'flywheel.paused') return Promise.resolve(null);
      return Promise.resolve({ value: { gtins: ['G1', 'G2', 'G3'], capturedAt: 'x', selectionCriterion: 'y' } });
    });
    prisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'A' }]);
    prisma.mismatchEvent.createMany.mockResolvedValue({ count: 1 });

    // Klok: 1e read (start) = base, daarna telkens +10s → time-box (1s) overschreden.
    let tick = 0;
    const base = Date.parse('2026-07-03T03:23:00Z');
    const now = () => new Date(base + (tick++ === 0 ? 0 : 10_000));

    const { runCohortRerun } = await import('../../services/flywheel/control-cohort');
    const runVerify = vi.fn().mockImplementation((_r: string, gtin: string) =>
      Promise.resolve(doneState(gtin, [verdict('A', 'CONFIRMED', 0.9)]))
    );

    const result = await runCohortRerun({ runVerify, now });
    // Niet het hele cohort verwerkt; resterende GTINs als uitval.
    expect(result.processed).toBeLessThan(3);
    expect(result.counts.skipped).toBeGreaterThan(0);
    delete process.env.FLYWHEEL_COHORT_MAX_SECONDS;
  });
});

// ---------------------------------------------------------------------------
// Herkomst-scheiding — cohort-events tellen NIET in de reguliere aggregaties
// ---------------------------------------------------------------------------

describe('Herkomst-scheiding — cohort uitgesloten uit reguliere stromen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('16.1 mismatch-trends filtert origin NOT LIKE cohort-%', async () => {
    const prisma = (await import('../../core/db')).default as unknown as {
      $queryRaw: ReturnType<typeof vi.fn>;
    };
    prisma.$queryRaw.mockResolvedValue([]);
    const { getMismatchTrends } = await import('../../services/flywheel/overview/mismatch-trends');
    await getMismatchTrends();
    const sqls = prisma.$queryRaw.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));
    expect(sqls.length).toBeGreaterThan(0);
    for (const sql of sqls) {
      expect(sql).toContain('origin NOT LIKE');
    }
  });

  it('16.2 werkvoorraad-aggregatie sluit cohort-herkomst uit', async () => {
    const prisma = (await import('../../core/db')).default as unknown as {
      $queryRaw: ReturnType<typeof vi.fn>;
      bootstrapQueue: { upsert: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    };
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.bootstrapQueue.findMany?.mockResolvedValue?.([]);
    const { runMismatchWorkloadAggregation } = await import(
      '../../services/flywheel/mismatch-workload'
    );
    await runMismatchWorkloadAggregation();
    const sqls = prisma.$queryRaw.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));
    expect(sqls.some((s) => s.includes("origin NOT LIKE 'cohort-%'"))).toBe(true);
  });
});
