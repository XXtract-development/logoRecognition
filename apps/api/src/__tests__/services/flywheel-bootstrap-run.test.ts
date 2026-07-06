/**
 * Story 17.1 — Bootstrap-run per lege klasse (API-deel).
 *
 * Dekt de job-orkestratie: hoofdvlag- en pauze-guard bij job-start (AC5/AC6),
 * de HARDE declaratie-guard per GTIN (AC1), drempel/nominatie via de 13.2-service
 * met herkomst `bootstrap` (AC1), het zaad-nooit-referentie-contract (AC2, NFR-6),
 * statusovergangen wachtend→gedraaid→gevuld|leeg + lastRunAt (AC3) en run-budget/
 * time-box (AC4).
 *
 * Prisma (`core/db`) en `mlClient` zijn globaal gemockt in src/__tests__/setup.ts.
 * De collaborators `nomination`, `t3777-declarations` en `pause` worden hier
 * gemockt zodat elke guard geïsoleerd getest kan worden.
 * AC→test-mapping: _bmad-output/implementation-artifacts/ac-trace-17-1.md.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import { nominateCandidate } from '../../services/flywheel/nomination';
import { resolveDeclaredMarks } from '../../services/t3777-declarations';
import { shouldSkipForPause } from '../../services/flywheel/pause';
import { runBootstrap, resolveSeedPath, candidateGtinsForCode } from '../../services/flywheel/bootstrap-run';

vi.mock('../../services/flywheel/nomination', () => ({
  nominateCandidate: vi.fn(),
}));
// Story 19.5: de guard leest nu de 5/5 declared-marks (resolveDeclaredMarks), niet
// langer de T3777-only resolveDeclarations. De mock-factory levert de 5/5-lezer.
vi.mock('../../services/t3777-declarations', () => ({
  resolveDeclaredMarks: vi.fn(),
}));

/** Bouw een declared-marks-resultaat waarin `codes` als accreditatie-marks gelden. */
function marksOf(codes: string[], reason = 'ok') {
  return {
    marks: codes.map((code) => ({ code, fieldType: 'PackagingMarkedLabelAccreditationCode' })),
    reason,
  };
}
vi.mock('../../services/flywheel/pause', () => ({
  shouldSkipForPause: vi.fn(),
}));

const mockPrisma = prisma as unknown as {
  bootstrapQueue: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  referenceLogo: { findFirst: ReturnType<typeof vi.fn> };
  mismatchEvent: { findMany: ReturnType<typeof vi.fn> };
  artworkImport: { findFirst: ReturnType<typeof vi.fn> };
};

const mockMl = mlClient as unknown as { bootstrapSearch: ReturnType<typeof vi.fn> };
const mockNominate = nominateCandidate as unknown as ReturnType<typeof vi.fn>;
const mockMarks = resolveDeclaredMarks as unknown as ReturnType<typeof vi.fn>;
const mockPause = shouldSkipForPause as unknown as ReturnType<typeof vi.fn>;

const CODE = 'BLUE_ANGEL';

beforeEach(() => {
  vi.clearAllMocks();
  // Hoofdvlag standaard AAN + niet gepauzeerd, zodat het gelukkige pad draait.
  process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
  delete process.env.FLYWHEEL_BOOTSTRAP_THRESHOLD;
  delete process.env.FLYWHEEL_BOOTSTRAP_RUN_BUDGET;
  delete process.env.FLYWHEEL_BOOTSTRAP_MAX_SECONDS;
  mockPause.mockResolvedValue(false);

  // Eén wachtende klasse.
  mockPrisma.bootstrapQueue.findMany.mockResolvedValue([{ t3777Code: CODE }]);
  mockPrisma.bootstrapQueue.update.mockResolvedValue({});
  // Zaad bestaat (ook inactief mogelijk).
  mockPrisma.referenceLogo.findFirst.mockResolvedValue({
    storagePath: `reference-logos/${CODE}/default.png`,
  });
  // Twee kandidaat-GTINs uit declared-not-found-events.
  mockPrisma.mismatchEvent.findMany.mockResolvedValue([
    { gtin: '111' },
    { gtin: '222' },
  ]);
  // Beide GTINs hebben een artwork-pagina.
  mockPrisma.artworkImport.findFirst.mockImplementation(({ where }: { where: { gtin: string } }) =>
    Promise.resolve({ storagePath: `artwork/${where.gtin}/converted-0.png` })
  );
  // Beide GTINs declareren de code (default gelukkig pad, 5/5 declared-marks).
  mockMarks.mockResolvedValue(marksOf([CODE]));
  // ml levert geen matches (per test overschreven).
  mockMl.bootstrapSearch.mockResolvedValue({
    seed_path: `reference-logos/${CODE}/default.png`,
    threshold: 0.93,
    matches: [],
    gtins_processed: 2,
    gtins_total: 2,
    timed_out: false,
    seed_leaks_skipped: 0,
  });
  mockNominate.mockResolvedValue({ status: 'nominated', candidateId: 'rc-1', reused: false });
});

// ---------------------------------------------------------------------------
// AC6 — hoofdvlag-scope (AD-8)
// ---------------------------------------------------------------------------

describe('AC6 — hoofdvlag-scope (AD-8)', () => {
  it('met FLYWHEEL_NOMINATION_ENABLED=false draait de job niet en nomineert niets', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'false';
    const res = await runBootstrap();
    expect(res.skipped).toBe(true);
    expect(res.skipReason).toBe('vlag-uit');
    expect(mockPrisma.bootstrapQueue.findMany).not.toHaveBeenCalled();
    expect(mockMl.bootstrapSearch).not.toHaveBeenCalled();
    expect(mockNominate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC5 — pauze-scope (AD-11)
// ---------------------------------------------------------------------------

describe('AC5 — pauze-scope (AD-11)', () => {
  it('met de pauzestand actief start de job niet', async () => {
    mockPause.mockResolvedValue(true);
    const res = await runBootstrap();
    expect(res.skipped).toBe(true);
    expect(res.skipReason).toBe('pauze');
    expect(mockPrisma.bootstrapQueue.findMany).not.toHaveBeenCalled();
    expect(mockMl.bootstrapSearch).not.toHaveBeenCalled();
    expect(mockNominate).not.toHaveBeenCalled();
  });

  it('vraagt de pauze-check op met de bootstrap-jobnaam', async () => {
    await runBootstrap();
    expect(mockPause).toHaveBeenCalledWith('flywheel-bootstrap');
  });
});

// ---------------------------------------------------------------------------
// AC1 — declaratie-guard + drempel + nominatie via 13.2 (herkomst bootstrap)
// ---------------------------------------------------------------------------

describe('AC1 — gerichte zoektocht binnen declarerende GTINs', () => {
  it('slaat een niet-declarerende GTIN over (telt + logt) en doorzoekt alleen declarerende GTINs', async () => {
    // GTIN 111 declareert de code, GTIN 222 niet (reason ok maar code ontbreekt).
    mockMarks.mockImplementation((gtin: string) =>
      gtin === '111'
        ? Promise.resolve(marksOf([CODE]))
        : Promise.resolve(marksOf(['OTHER']))
    );

    const res = await runBootstrap();

    // Alleen de declarerende GTIN gaat mee naar de ml-zoektocht.
    expect(mockMl.bootstrapSearch).toHaveBeenCalledTimes(1);
    const call = mockMl.bootstrapSearch.mock.calls[0][0];
    expect(call.gtinPages).toEqual([{ gtin: '111', pageKey: 'artwork/111/converted-0.png' }]);

    const cls = res.classesProcessed[0];
    expect(cls.declaredGtins).toBe(1);
    expect(cls.skippedNonDeclaring).toBe(1);
  });

  it('slaat een GTIN met reason != ok over (declaratie niet bevestigd)', async () => {
    mockMarks.mockResolvedValue({ marks: [], reason: 'gln-ontbreekt' });
    const res = await runBootstrap();
    expect(mockMl.bootstrapSearch).not.toHaveBeenCalled();
    expect(res.classesProcessed[0].skippedNonDeclaring).toBe(2);
    expect(res.classesProcessed[0].status).toBe('leeg');
  });

  it('nomineert een vondst ≥ drempel via de 13.2-service met herkomst bootstrap', async () => {
    mockMl.bootstrapSearch.mockResolvedValue({
      seed_path: `reference-logos/${CODE}/default.png`,
      threshold: 0.93,
      matches: [
        {
          gtin: '111',
          bbox: { x: 1, y: 2, width: 3, height: 4 },
          seed_cosine: 0.95,
          crop_path: 'artwork-crops/111/17_1_bootstrap_1_2_3_4.png',
          source_file: 'artwork/111/converted-0.png',
        },
      ],
      gtins_processed: 2,
      gtins_total: 2,
      timed_out: false,
      seed_leaks_skipped: 0,
    });

    const res = await runBootstrap();

    expect(mockNominate).toHaveBeenCalledTimes(1);
    const arg = mockNominate.mock.calls[0][0];
    expect(arg.origin).toBe('bootstrap');
    expect(arg.gtin).toBe('111');
    expect(arg.declared).toEqual([CODE]);
    expect(arg.detection.cropPath).toBe('artwork-crops/111/17_1_bootstrap_1_2_3_4.png');
    expect(arg.detection.t3777Code).toBe(CODE);
    expect(res.classesProcessed[0].nominated).toBe(1);
    expect(res.classesProcessed[0].status).toBe('gevuld');
  });

  it('geeft de bootstrap-drempel door aan de ml-zoektocht (default 0,93, env-override)', async () => {
    process.env.FLYWHEEL_BOOTSTRAP_THRESHOLD = '0.88';
    await runBootstrap();
    expect(mockMl.bootstrapSearch.mock.calls[0][0].threshold).toBe(0.88);
  });

  it('nomineert NOOIT rechtstreeks in reference_candidates — uitsluitend via de 13.2-service', async () => {
    // Guard: er bestaat geen directe candidate-create in de bootstrap-flow.
    const mockRc = (prisma as unknown as { referenceCandidate?: { create?: ReturnType<typeof vi.fn> } })
      .referenceCandidate;
    mockMl.bootstrapSearch.mockResolvedValue({
      seed_path: `reference-logos/${CODE}/default.png`,
      threshold: 0.93,
      matches: [
        {
          gtin: '111',
          bbox: { x: 1, y: 2, width: 3, height: 4 },
          seed_cosine: 0.95,
          crop_path: 'artwork-crops/111/c.png',
          source_file: 'artwork/111/p.png',
        },
      ],
      gtins_processed: 1,
      gtins_total: 1,
      timed_out: false,
      seed_leaks_skipped: 0,
    });
    await runBootstrap();
    expect(mockNominate).toHaveBeenCalled();
    if (mockRc?.create) expect(mockRc.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC2 — zaad wordt nooit referentie (NFR-6)
// ---------------------------------------------------------------------------

describe('AC2 — zaad wordt nooit referentie (NFR-6)', () => {
  it('het zaad wordt uitsluitend als zoekinstrument (seedPath) meegegeven, nooit genomineerd', async () => {
    mockMl.bootstrapSearch.mockResolvedValue({
      seed_path: `reference-logos/${CODE}/default.png`,
      threshold: 0.93,
      matches: [
        {
          gtin: '111',
          bbox: { x: 1, y: 2, width: 3, height: 4 },
          seed_cosine: 0.95,
          crop_path: 'artwork-crops/111/c.png',
          source_file: 'artwork/111/p.png',
        },
      ],
      gtins_processed: 1,
      gtins_total: 1,
      timed_out: false,
      seed_leaks_skipped: 0,
    });

    await runBootstrap();

    // Het zaadpad gaat als zoekinstrument mee.
    expect(mockMl.bootstrapSearch.mock.calls[0][0].seedPath).toBe(
      `reference-logos/${CODE}/default.png`
    );
    // GEEN enkele nominatie mag het zaadpad als crop dragen (het zaad is nooit een crop).
    for (const call of mockNominate.mock.calls) {
      expect(call[0].detection.cropPath).not.toBe(`reference-logos/${CODE}/default.png`);
      expect(call[0].detection.cropPath.startsWith('artwork-crops/')).toBe(true);
    }
  });

  it('resolveSeedPath leest het zaad ook uit een INACTIEVE referentie-rij (12.3-pivot)', async () => {
    // De query filtert niet op active — bewijs dat een inactief zaad ook telt.
    mockPrisma.referenceLogo.findFirst.mockResolvedValue({
      storagePath: `reference-logos/${CODE}/guide.png`,
    });
    const seed = await resolveSeedPath(CODE);
    expect(seed).toBe(`reference-logos/${CODE}/guide.png`);
    const where = mockPrisma.referenceLogo.findFirst.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('active');
  });

  it('zonder zaad wordt de run leeg (reden geen-zaad) en de klasse blijft opneembaar', async () => {
    mockPrisma.referenceLogo.findFirst.mockResolvedValue(null);
    const res = await runBootstrap();
    expect(mockMl.bootstrapSearch).not.toHaveBeenCalled();
    expect(res.classesProcessed[0].status).toBe('leeg');
    expect(res.classesProcessed[0].emptyReason).toBe('geen-zaad');
    // status → leeg + lastRunAt gezet (opneembaar in een volgende run).
    const finalize = mockPrisma.bootstrapQueue.update.mock.calls.find(
      (c) => c[0].data.status === 'leeg'
    );
    expect(finalize?.[0].data.lastRunAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// AC3 — lege run → terug in wachtrij; statusovergangen
// ---------------------------------------------------------------------------

describe('AC3 — lege run → terug in wachtrij + statusovergangen', () => {
  it('een run zonder vondsten wordt leeg met lastRunAt; de klasse blijft opneembaar', async () => {
    mockMl.bootstrapSearch.mockResolvedValue({
      seed_path: `reference-logos/${CODE}/default.png`,
      threshold: 0.93,
      matches: [],
      gtins_processed: 2,
      gtins_total: 2,
      timed_out: false,
      seed_leaks_skipped: 0,
    });
    const res = await runBootstrap();
    expect(res.classesProcessed[0].status).toBe('leeg');

    const statuses = mockPrisma.bootstrapQueue.update.mock.calls.map((c) => c[0].data.status);
    // Overgang wachtend→gedraaid→leeg.
    expect(statuses).toContain('gedraaid');
    expect(statuses).toContain('leeg');
    const leeg = mockPrisma.bootstrapQueue.update.mock.calls.find((c) => c[0].data.status === 'leeg');
    expect(leeg?.[0].data.lastRunAt).toBeInstanceOf(Date);
  });

  it('zet status → gedraaid bij start (voor de zoektocht)', async () => {
    await runBootstrap();
    const first = mockPrisma.bootstrapQueue.update.mock.calls[0];
    expect(first[0].where.t3777Code).toBe(CODE);
    expect(first[0].data.status).toBe('gedraaid');
  });

  it('een vondst → gevuld met lastRunAt', async () => {
    mockMl.bootstrapSearch.mockResolvedValue({
      seed_path: `reference-logos/${CODE}/default.png`,
      threshold: 0.93,
      matches: [
        {
          gtin: '111',
          bbox: { x: 0, y: 0, width: 5, height: 5 },
          seed_cosine: 0.99,
          crop_path: 'artwork-crops/111/c.png',
          source_file: 'artwork/111/p.png',
        },
      ],
      gtins_processed: 1,
      gtins_total: 1,
      timed_out: false,
      seed_leaks_skipped: 0,
    });
    await runBootstrap();
    const gevuld = mockPrisma.bootstrapQueue.update.mock.calls.find(
      (c) => c[0].data.status === 'gevuld'
    );
    expect(gevuld).toBeTruthy();
    expect(gevuld?.[0].data.lastRunAt).toBeInstanceOf(Date);
  });

  it('verwerkt nooit een uitgesloten klasse (excluded=false in de wachtrij-query)', async () => {
    await runBootstrap();
    const where = mockPrisma.bootstrapQueue.findMany.mock.calls[0][0].where;
    expect(where.excluded).toBe(false);
    expect(where.status).toBe('wachtend');
  });
});

// ---------------------------------------------------------------------------
// AC4 — run-budget + time-box
// ---------------------------------------------------------------------------

describe('AC4 — run-budget en time-box', () => {
  it('verwerkt maximaal FLYWHEEL_BOOTSTRAP_RUN_BUDGET GTINs; het restant blijft in de wachtrij', async () => {
    process.env.FLYWHEEL_BOOTSTRAP_RUN_BUDGET = '1';
    // Drie kandidaat-GTINs beschikbaar, maar het budget is 1.
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([
      { gtin: '111' },
      { gtin: '222' },
      { gtin: '333' },
    ]);
    await runBootstrap();
    // De declaratie-guard (die het budget verbruikt) draait maar één keer.
    expect(mockMarks).toHaveBeenCalledTimes(1);
    // De ml-zoektocht kreeg hooguit één GTIN mee.
    if (mockMl.bootstrapSearch.mock.calls.length > 0) {
      expect(mockMl.bootstrapSearch.mock.calls[0][0].gtinPages.length).toBeLessThanOrEqual(1);
    }
  });

  it('candidateGtinsForCode begrenst op het budget en dedupliceert GTINs', async () => {
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([
      { gtin: 'A' },
      { gtin: 'A' },
      { gtin: 'B' },
      { gtin: 'C' },
    ]);
    const gtins = await candidateGtinsForCode(CODE, 2);
    expect(gtins).toEqual(['A', 'B']);
  });

  it('markeert budgetTruncated wanneer ml aangeeft dat de time-box bereikt is', async () => {
    mockMl.bootstrapSearch.mockResolvedValue({
      seed_path: `reference-logos/${CODE}/default.png`,
      threshold: 0.93,
      matches: [],
      gtins_processed: 1,
      gtins_total: 2,
      timed_out: true,
      seed_leaks_skipped: 0,
    });
    const res = await runBootstrap();
    expect(res.budgetTruncated).toBe(true);
  });
});
