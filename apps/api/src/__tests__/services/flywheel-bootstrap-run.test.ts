/**
 * Story 17.1 — Bootstrap-run per lege klasse (API-deel). Story 19.8 (herzien):
 * de gevonden crops worden als OPEN `artworkReviewItem` aan de menselijke review-
 * wachtrij voorgelegd i.p.v. auto-genomineerd.
 *
 * Dekt de job-orkestratie: hoofdvlag- en pauze-guard bij job-start (AC5/AC6),
 * de HARDE declaratie-guard per GTIN (AC1), de review-voorlegging + hard-negative/
 * dedup-guard (19.8 AC1/AC2), het zaad-nooit-crop-contract (AC2, NFR-6),
 * statusovergangen wachtend→gedraaid→gevuld|leeg + lastRunAt (AC3, 19.8 AC5) en
 * run-budget/time-box (AC4).
 *
 * Prisma (`core/db`) en `mlClient` zijn globaal gemockt in src/__tests__/setup.ts.
 * De collaborators `t3777-declarations` en `pause` worden hier gemockt zodat elke
 * guard geïsoleerd getest kan worden.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import { resolveDeclaredMarks } from '../../services/t3777-declarations';
import { shouldSkipForPause } from '../../services/flywheel/pause';
import { runBootstrap, resolveSeedPath, candidateGtinsForCode } from '../../services/flywheel/bootstrap-run';

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
  referenceLogo: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  mismatchEvent: { findMany: ReturnType<typeof vi.fn> };
  artworkImport: { findFirst: ReturnType<typeof vi.fn> };
  artworkReviewItem: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  hardNegative: { findUnique: ReturnType<typeof vi.fn> };
  goldSetRecord: { count: ReturnType<typeof vi.fn> };
};

const mockMl = mlClient as unknown as {
  bootstrapSearch: ReturnType<typeof vi.fn>;
  computePhash: ReturnType<typeof vi.fn>;
};
const mockMarks = resolveDeclaredMarks as unknown as ReturnType<typeof vi.fn>;
const mockPause = shouldSkipForPause as unknown as ReturnType<typeof vi.fn>;
/** De review-voorlegging (vervangt de vroegere nominatie in het lege-klasse-pad). */
const mockReviewCreate = () => mockPrisma.artworkReviewItem.create;

const SEED = 'reference-logos/BLUE_ANGEL/default.png';
const CODE = 'BLUE_ANGEL';

/** Eén ml-match met een sub-0,90 cosine (het reële bootstrap-scenario). */
function matchFixture(overrides: Record<string, unknown> = {}) {
  return {
    seed_path: SEED,
    threshold: 0.6,
    matches: [
      {
        gtin: '111',
        bbox: { x: 1, y: 2, width: 3, height: 4 },
        seed_cosine: 0.7,
        crop_path: 'artwork-crops/111/17_1_bootstrap_1_2_3_4.png',
        source_file: 'artwork/111/converted-0.png',
      },
    ],
    gtins_processed: 2,
    gtins_total: 2,
    timed_out: false,
    seed_leaks_skipped: 0,
    ...overrides,
  };
}

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
  // referenceLogo.findFirst dient twee queries: het ZAAD (geen `active`-filter →
  // storagePath {not:''}) én de dedup op een bestaande crop-referentie (active:true).
  // Zaad → aanwezig; dedup → geen bestaande referentie.
  mockPrisma.referenceLogo.findFirst.mockImplementation(({ where }: { where: { active?: boolean } }) =>
    Promise.resolve(where.active ? null : { storagePath: SEED })
  );
  // Geen actieve promotie-referenties (AC5-signaal, guardrails.countActivePromotionReferences).
  mockPrisma.referenceLogo.count.mockResolvedValue(0);
  // Story 19.9: standaard 0 actieve ECHTE-crop-referenties (< k) — het gids-pad
  // blijft het default gedrag in deze test-suite; AC1/AC2 hebben een eigen describe-blok.
  mockPrisma.referenceLogo.findMany.mockResolvedValue([]);
  // Twee kandidaat-GTINs uit declared-not-found-events.
  mockPrisma.mismatchEvent.findMany.mockResolvedValue([{ gtin: '111' }, { gtin: '222' }]);
  // Beide GTINs hebben een artwork-pagina.
  mockPrisma.artworkImport.findFirst.mockImplementation(({ where }: { where: { gtin: string } }) =>
    Promise.resolve({ storagePath: `artwork/${where.gtin}/converted-0.png` })
  );
  // Beide GTINs declareren de code (default gelukkig pad, 5/5 declared-marks).
  mockMarks.mockResolvedValue(marksOf([CODE]));
  // ml levert geen matches (per test overschreven).
  mockMl.bootstrapSearch.mockResolvedValue(matchFixture({ matches: [] }));
  // Inhouds-hash beschikbaar; geen hard-negative; geen bestaand review-item.
  mockMl.computePhash.mockResolvedValue({ content_hash: 'ch-1' });
  mockPrisma.hardNegative.findUnique.mockResolvedValue(null);
  mockPrisma.artworkReviewItem.findFirst.mockResolvedValue(null);
  mockPrisma.artworkReviewItem.create.mockResolvedValue({ id: 'ri-1' });
  // Standaard geen mens-bevestigde ECHT-crop → klasse blijft `leeg` (AC5).
  mockPrisma.goldSetRecord.count.mockResolvedValue(0);
});

// ---------------------------------------------------------------------------
// AC6 — hoofdvlag-scope (AD-8)
// ---------------------------------------------------------------------------

describe('AC6 — hoofdvlag-scope (AD-8)', () => {
  it('met FLYWHEEL_NOMINATION_ENABLED=false draait de job niet en legt niets voor', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'false';
    const res = await runBootstrap();
    expect(res.skipped).toBe(true);
    expect(res.skipReason).toBe('vlag-uit');
    expect(mockPrisma.bootstrapQueue.findMany).not.toHaveBeenCalled();
    expect(mockMl.bootstrapSearch).not.toHaveBeenCalled();
    expect(mockReviewCreate()).not.toHaveBeenCalled();
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
    expect(mockReviewCreate()).not.toHaveBeenCalled();
  });

  it('vraagt de pauze-check op met de bootstrap-jobnaam', async () => {
    await runBootstrap();
    expect(mockPause).toHaveBeenCalledWith('flywheel-bootstrap');
  });
});

// ---------------------------------------------------------------------------
// AC1 — declaratie-guard + review-voorlegging (Story 19.8, herzien)
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

  it('legt een sub-0,90 vondst voor als OPEN review-item (niet auto-genomineerd)', async () => {
    mockMl.bootstrapSearch.mockResolvedValue(matchFixture());

    const res = await runBootstrap();

    expect(mockPrisma.artworkReviewItem.create).toHaveBeenCalledTimes(1);
    const { data } = mockPrisma.artworkReviewItem.create.mock.calls[0][0];
    expect(data.status).toBe('open');
    expect(data.gtin).toBe('111');
    expect(data.t3777Code).toBe(CODE);
    expect(data.cropPath).toBe('artwork-crops/111/17_1_bootstrap_1_2_3_4.png');
    expect(data.reason).toBe('bootstrap-lege-klasse');
    expect(data.confidence).toBe(0.7);
    expect(res.classesProcessed[0].queuedForReview).toBe(1);
    // AC5: een review-pending crop maakt de klasse NIET `gevuld`.
    expect(res.classesProcessed[0].status).toBe('leeg');
    expect(res.classesProcessed[0].emptyReason).toBe('wacht-op-review');
  });

  it('geeft de bootstrap-drempel door aan de ml-zoektocht (default 0,60, env-override)', async () => {
    process.env.FLYWHEEL_BOOTSTRAP_THRESHOLD = '0.88';
    await runBootstrap();
    expect(mockMl.bootstrapSearch.mock.calls[0][0].threshold).toBe(0.88);
  });

  it('schrijft NOOIT rechtstreeks in reference_candidates — uitsluitend via de review-wachtrij', async () => {
    const mockRc = (prisma as unknown as { referenceCandidate?: { create?: ReturnType<typeof vi.fn> } })
      .referenceCandidate;
    mockMl.bootstrapSearch.mockResolvedValue(matchFixture());
    await runBootstrap();
    expect(mockPrisma.artworkReviewItem.create).toHaveBeenCalled();
    if (mockRc?.create) expect(mockRc.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC2 — kleppen (hard-negative + dedup) + zaad wordt nooit crop (NFR-6)
// ---------------------------------------------------------------------------

describe('AC2 — kleppen + zaad wordt nooit crop (NFR-6)', () => {
  it('legt een reeds mens-afgekeurde crop (hard-negative) NIET opnieuw voor', async () => {
    mockMl.bootstrapSearch.mockResolvedValue(matchFixture());
    mockPrisma.hardNegative.findUnique.mockResolvedValue({ contentHash: 'ch-1' });
    const res = await runBootstrap();
    expect(mockPrisma.artworkReviewItem.create).not.toHaveBeenCalled();
    expect(res.classesProcessed[0].queuedForReview).toBe(0);
  });

  it('legt een crop die voor deze code al ooit is voorgelegd NIET nogmaals voor (dedup per crop+code, elke status)', async () => {
    mockMl.bootstrapSearch.mockResolvedValue(matchFixture());
    // Ook een reeds AFGEWEZEN item (status rejected, zonder hard-negative) dedupt:
    // de mock retourneert een bestaand item ongeacht status → geen re-creatie.
    mockPrisma.artworkReviewItem.findFirst.mockResolvedValue({ id: 'bestaand', status: 'rejected' });
    const res = await runBootstrap();
    expect(mockPrisma.artworkReviewItem.create).not.toHaveBeenCalled();
    expect(res.classesProcessed[0].queuedForReview).toBe(0);
    // De dedup filtert per (cropPath, t3777Code) — NIET op status (elke status dedupt),
    // en per code zodat een andere klasse dezelfde regio wél voor háár code mag voorleggen.
    const where = mockPrisma.artworkReviewItem.findFirst.mock.calls[0][0].where;
    expect(where.cropPath).toBe('artwork-crops/111/17_1_bootstrap_1_2_3_4.png');
    expect(where.t3777Code).toBe(CODE);
    expect(where).not.toHaveProperty('status');
  });

  it('legt een crop die al een actieve referentie is NIET voor (referentie-dedup)', async () => {
    mockMl.bootstrapSearch.mockResolvedValue(matchFixture());
    // Geen review-item, maar wél een actieve referentie op dit crop_path + deze code.
    mockPrisma.artworkReviewItem.findFirst.mockResolvedValue(null);
    mockPrisma.referenceLogo.findFirst.mockImplementation(({ where }: { where: { active?: boolean } }) =>
      Promise.resolve(where.active ? { id: 'ref-1' } : { storagePath: SEED })
    );
    const res = await runBootstrap();
    expect(mockPrisma.artworkReviewItem.create).not.toHaveBeenCalled();
    expect(res.classesProcessed[0].queuedForReview).toBe(0);
  });

  it('het zaad gaat uitsluitend als zoekinstrument (seedPath) mee, nooit als voorgelegde crop', async () => {
    mockMl.bootstrapSearch.mockResolvedValue(matchFixture());
    await runBootstrap();
    expect(mockMl.bootstrapSearch.mock.calls[0][0].seedPath).toBe(SEED);
    // GEEN enkel review-item mag het zaadpad als crop dragen.
    for (const call of mockPrisma.artworkReviewItem.create.mock.calls) {
      expect(call[0].data.cropPath).not.toBe(SEED);
      expect(String(call[0].data.cropPath).startsWith('artwork-crops/')).toBe(true);
    }
  });

  it('resolveSeedPath leest het zaad ook uit een INACTIEVE referentie-rij (12.3-pivot)', async () => {
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
    const finalize = mockPrisma.bootstrapQueue.update.mock.calls.find(
      (c) => c[0].data.status === 'leeg'
    );
    expect(finalize?.[0].data.lastRunAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// AC3 / 19.8 AC5 — statusovergangen + gevuld-semantiek
// ---------------------------------------------------------------------------

describe('AC3 — lege run → terug in wachtrij + statusovergangen', () => {
  it('een run zonder vondsten wordt leeg (geen-vondsten) met lastRunAt; de klasse blijft opneembaar', async () => {
    mockMl.bootstrapSearch.mockResolvedValue(matchFixture({ matches: [] }));
    const res = await runBootstrap();
    expect(res.classesProcessed[0].status).toBe('leeg');
    expect(res.classesProcessed[0].emptyReason).toBe('geen-vondsten');

    const statuses = mockPrisma.bootstrapQueue.update.mock.calls.map((c) => c[0].data.status);
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

  it('19.8 AC5: een review-pending vondst → NIET gevuld (blijft bootstrapbaar)', async () => {
    mockMl.bootstrapSearch.mockResolvedValue(matchFixture());
    await runBootstrap();
    const gevuld = mockPrisma.bootstrapQueue.update.mock.calls.find(
      (c) => c[0].data.status === 'gevuld'
    );
    expect(gevuld).toBeUndefined();
    const leeg = mockPrisma.bootstrapQueue.update.mock.calls.find((c) => c[0].data.status === 'leeg');
    expect(leeg?.[0].data.lastRunAt).toBeInstanceOf(Date);
  });

  it('19.8 AC5: met ≥1 mens-bevestigde ECHT-crop → gevuld met lastRunAt', async () => {
    mockPrisma.goldSetRecord.count.mockResolvedValue(1);
    mockMl.bootstrapSearch.mockResolvedValue(matchFixture());
    await runBootstrap();
    // AC5-signaal: alleen mens-bevestigde ECHT-crops uit een review-bron tellen.
    const countArg = mockPrisma.goldSetRecord.count.mock.calls[0][0];
    expect(countArg.where.t3777Code).toBe(CODE);
    expect(countArg.where.label).toBe('ECHT');
    expect(countArg.where.source.in).toEqual(['review-accept', 'review-annotate']);
    // Alleen ACTIEVE (niet-ingetrokken) gold-set-records tellen (tombstone-filter).
    expect(countArg.where.replacedById).toBeNull();
    const gevuld = mockPrisma.bootstrapQueue.update.mock.calls.find(
      (c) => c[0].data.status === 'gevuld'
    );
    expect(gevuld).toBeTruthy();
    expect(gevuld?.[0].data.lastRunAt).toBeInstanceOf(Date);
  });

  it('19.8 AC5: met ≥1 actieve flywheel-promotion-referentie → gevuld (ook zonder ECHT-record)', async () => {
    mockPrisma.referenceLogo.count.mockResolvedValue(1); // countActivePromotionReferences > 0
    mockMl.bootstrapSearch.mockResolvedValue(matchFixture());
    await runBootstrap();
    const gevuld = mockPrisma.bootstrapQueue.update.mock.calls.find(
      (c) => c[0].data.status === 'gevuld'
    );
    expect(gevuld).toBeTruthy();
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
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([
      { gtin: '111' },
      { gtin: '222' },
      { gtin: '333' },
    ]);
    await runBootstrap();
    expect(mockMarks).toHaveBeenCalledTimes(1);
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
    mockMl.bootstrapSearch.mockResolvedValue(
      matchFixture({ matches: [], gtins_processed: 1, gtins_total: 2, timed_out: true })
    );
    const res = await runBootstrap();
    expect(res.budgetTruncated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Story 19.9 — schakelmoment naar nearest-reference-ranking (contract-tests AC4)
// ---------------------------------------------------------------------------

describe('Story 19.9 — realRefPaths-contract naar mlClient.bootstrapSearch', () => {
  const REAL_REFS = [
    { storagePath: 'artwork-crops/111/real1.png' },
    { storagePath: 'artwork-crops/222/real2.png' },
    { storagePath: 'artwork-crops/333/real3.png' },
  ];

  it('geeft realRefPaths + rankingThreshold + minRefs mee zodra de klasse >= k (default 3) actieve ECHTE-crop-refs heeft', async () => {
    mockPrisma.referenceLogo.findMany.mockResolvedValue(REAL_REFS);
    await runBootstrap();

    const call = mockMl.bootstrapSearch.mock.calls[0][0];
    expect(call.realRefPaths).toEqual(REAL_REFS.map((r) => r.storagePath));
    expect(call.minRefs).toBe(3);
    expect(typeof call.rankingThreshold).toBe('number');

    // De query filtert op actieve, ECHTE (niet-gids) referenties van de klasse.
    const where = mockPrisma.referenceLogo.findMany.mock.calls[0][0].where;
    expect(where.t3777Code).toBe(CODE);
    expect(where.active).toBe(true);
    expect(where.source.in).toEqual(['review-confirmed', 'realref-live-poc', 'flywheel-promotion']);
  });

  it('roept de ml-zoektocht KAAL aan (geen realRefPaths) zodra de klasse < k actieve ECHTE-crop-refs heeft — faalt op het oude gedrag', async () => {
    mockPrisma.referenceLogo.findMany.mockResolvedValue(REAL_REFS.slice(0, 2)); // 2 < default k=3
    await runBootstrap();

    const call = mockMl.bootstrapSearch.mock.calls[0][0];
    expect(call.realRefPaths).toBeUndefined();
    expect(call.rankingThreshold).toBeUndefined();
    expect(call.minRefs).toBeUndefined();
  });

  it('respecteert een env-override van FLYWHEEL_RANKING_MIN_REFS', async () => {
    process.env.FLYWHEEL_RANKING_MIN_REFS = '2';
    mockPrisma.referenceLogo.findMany.mockResolvedValue(REAL_REFS.slice(0, 2)); // == k=2
    await runBootstrap();

    const call = mockMl.bootstrapSearch.mock.calls[0][0];
    expect(call.realRefPaths).toEqual(REAL_REFS.slice(0, 2).map((r) => r.storagePath));
    expect(call.minRefs).toBe(2);
    delete process.env.FLYWHEEL_RANKING_MIN_REFS;
  });

  it('begrenst de refs-query met getRankingMaxRefs (default 25) — een lange-staart-klasse stuurt niet onbegrensd veel refs mee', async () => {
    mockPrisma.referenceLogo.findMany.mockResolvedValue(REAL_REFS);
    await runBootstrap();
    const query = mockPrisma.referenceLogo.findMany.mock.calls[0][0];
    expect(query.take).toBe(25);
    expect(query.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('code-review-fix: confidence op het review-item is het HOOGSTE van seed_cosine en ranking_cosine (anders zakt een sterke conditie-C-match onderaan de wachtrij)', async () => {
    mockPrisma.referenceLogo.findMany.mockResolvedValue(REAL_REFS);
    mockMl.bootstrapSearch.mockResolvedValue(
      matchFixture({
        ranking_active: true,
        real_refs_used: 3,
        matches: [
          {
            gtin: '111',
            bbox: { x: 1, y: 2, width: 3, height: 4 },
            seed_cosine: 0.1, // laag — de gids-cosine ALLEEN zou nooit gematcht hebben
            ranking_cosine: 0.92, // hoog — dit is waarom de regio matchte (conditie C)
            crop_path: 'artwork-crops/111/17_1_bootstrap_1_2_3_4.png',
            source_file: 'artwork/111/converted-0.png',
          },
        ],
      })
    );
    await runBootstrap();
    const { data } = mockPrisma.artworkReviewItem.create.mock.calls[0][0];
    expect(data.confidence).toBe(0.92);
  });
});
