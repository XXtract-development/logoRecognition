/**
 * Declared-values verification flow tests — Story 12.8.
 *
 * Covers:
 *   AC1  no-artwork terminal status (no throw) when nothing is imported.
 *   AC2  declaration reason carried 1:1; a fail-safe empty declaration → done
 *        with empty verdicts + the reason (never "verified, nothing found").
 *   AC4  targeted localize is called with a codes-filter of the declared,
 *        alias-mapped, ACTIVE codes only (candidate shrink).
 *   AC5  verdict mapping (CONFIRMED/UNCERTAIN/NOT_FOUND/UNSUPPORTED) over the
 *        existing crosscheck thresholds, incl. RECYCLABLE-noise unsupported case.
 *   AC7  shadow-log to recognition_logs/_results (no new model), run-state Redis.
 *   AC8  no artwork_review_items / training-data writes; flywheel hooks stay off
 *        with the flags unset (byte-equal response).
 *
 * prisma / ioredis / bullmq / mlClient are mocked in setup.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { getRedisConnection } from '../../services/pipeline/queue';
import { mlClient } from '../../services/ml-client';

const mockPrisma = prisma as unknown as Record<string, any>;

/** Map-backed get/setex on the memoized Redis singleton (deterministic run-state). */
function installFreshRedisCache(): Map<string, string> {
  const store = new Map<string, string>();
  const redis = getRedisConnection() as unknown as {
    get: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
  };
  redis.get = vi.fn(async (key: string) => store.get(key) ?? null);
  redis.setex = vi.fn(async (key: string, _ttl: number, val: string) => {
    store.set(key, val);
    return 'OK';
  });
  return store;
}

const GTIN = '08718989912451';

describe('Story 12.8 — verify-flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFreshRedisCache();
    // Flywheel flags OFF by default (shadow mode, AC8).
    delete process.env.FLYWHEEL_NOMINATION_ENABLED;
    delete process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED;
    // Declaration provider needs a catalog key + a gln for the fetch path.
    process.env.CATALOG_API_KEY = 'test-key';
    mockPrisma.artworkImport.findFirst.mockResolvedValue({ gln: '8710000000005' });
    mockPrisma.recognitionLog.create.mockResolvedValue({ id: 'log-1' });
    mockPrisma.recognitionResult.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.mismatchEvent.createMany.mockResolvedValue({ count: 0 });
  });

  // -------------------------------------------------------------------------
  // AC1 — no-artwork terminal status (no throw)
  // -------------------------------------------------------------------------
  it('AC1: terminates with status no-artwork (no throw) when nothing is imported', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    mockPrisma.artworkImport.findMany.mockResolvedValue([]);
    vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({ detections: [], truncated: false });

    const state = await runVerifyDeclared('run-1', GTIN);

    expect(state.status).toBe('no-artwork');
    expect(state.gtin).toBe(GTIN);
    // No detection call happens for an empty artwork set.
    expect(mlClient.localizeArtwork).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // AC2 — fail-safe empty declaration is not "verified, nothing found"
  // -------------------------------------------------------------------------
  it('AC2: an API fail-safe (empty declaration) → done with reason, empty verdicts', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    mockPrisma.artworkImport.findMany.mockResolvedValue([
      { storagePath: 'artwork/x/a.png', mimeType: 'image/png', fileName: 'a.png', pages: null },
    ]);
    // No gln → declaration resolver returns reason 'gln-ontbreekt' with [] codes.
    mockPrisma.artworkImport.findFirst.mockResolvedValue(null);

    const state = await runVerifyDeclared('run-2', GTIN);

    expect(state.status).toBe('done');
    expect(state.declaration.reason).toBe('gln-ontbreekt');
    expect(state.declaration.codes).toEqual([]);
    expect(state.verdicts).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // AC4/AC5 — targeted localize + verdict mapping
  // -------------------------------------------------------------------------
  it('AC4/AC5: localizes only the declared active codes and maps CONFIRMED/UNSUPPORTED', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');

    // Two imported images.
    mockPrisma.artworkImport.findMany.mockResolvedValue([
      { storagePath: 'artwork/x/a.png', mimeType: 'image/png', fileName: 'a.png', pages: null },
    ]);
    // Declaration: GREEN_DOT (active) + RECYCLABLE_GENERAL_CLAIM (NOT active → UNSUPPORTED).
    vi.spyOn(
      await import('../../services/t3777-declarations'),
      'resolveDeclarations'
    ).mockResolvedValue({ codes: ['GREEN_DOT', 'RECYCLABLE_GENERAL_CLAIM'], reason: 'ok' });
    // Only GREEN_DOT has an active reference class.
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'GREEN_DOT' }]);

    const localizeSpy = vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({
      detections: [{ t3777_code: 'GREEN_DOT', bbox: { x: 1, y: 2, width: 10, height: 10 } }],
      truncated: false,
    } as never);
    vi.spyOn(mlClient, 'classifyArtwork').mockResolvedValue({
      results: [
        {
          bbox: { x: 1, y: 2, width: 10, height: 10 },
          t3777_code: 'GREEN_DOT',
          confidence: 0.95, // ≥ classifier/embedding thresholds → CONFIRMED
          method: 'template', // template threshold 0.85
        },
      ],
    } as never);

    const state = await runVerifyDeclared('run-3', GTIN);

    // AC4: localize called with the codes-filter of the ACTIVE declared codes only.
    expect(localizeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ storage_path: 'artwork/x/a.png', codes: ['GREEN_DOT'] })
    );

    expect(state.status).toBe('done');
    const green = state.verdicts.find((v) => v.code === 'GREEN_DOT');
    const recyc = state.verdicts.find((v) => v.code === 'RECYCLABLE_GENERAL_CLAIM');
    expect(green?.verdict).toBe('CONFIRMED');
    expect(green?.confidence).toBe(0.95);
    expect(green?.method).toBe('template');
    // UNSUPPORTED: declared, no active reference class (AC3) — never silently skipped.
    expect(recyc?.verdict).toBe('UNSUPPORTED');
  });

  it('AC5: a hit below the method threshold → UNCERTAIN (confidence carried); missing → NOT_FOUND', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    mockPrisma.artworkImport.findMany.mockResolvedValue([
      { storagePath: 'artwork/x/a.png', mimeType: 'image/png', fileName: 'a.png', pages: null },
    ]);
    vi.spyOn(
      await import('../../services/t3777-declarations'),
      'resolveDeclarations'
    ).mockResolvedValue({ codes: ['GREEN_DOT', 'EU_ORGANIC_FARMING'], reason: 'ok' });
    mockPrisma.referenceLogo.findMany.mockResolvedValue([
      { t3777Code: 'GREEN_DOT' },
      { t3777Code: 'EU_ORGANIC_FARMING' },
    ]);
    vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({
      detections: [{ t3777_code: 'GREEN_DOT', bbox: { x: 1, y: 2, width: 10, height: 10 } }],
      truncated: false,
    } as never);
    // GREEN_DOT found but confidence 0.70 < template 0.85 → UNCERTAIN.
    // EU_ORGANIC_FARMING not classified → NOT_FOUND.
    vi.spyOn(mlClient, 'classifyArtwork').mockResolvedValue({
      results: [
        {
          bbox: { x: 1, y: 2, width: 10, height: 10 },
          t3777_code: 'GREEN_DOT',
          confidence: 0.7,
          method: 'template',
        },
      ],
    } as never);

    const state = await runVerifyDeclared('run-4', GTIN);
    const green = state.verdicts.find((v) => v.code === 'GREEN_DOT');
    const org = state.verdicts.find((v) => v.code === 'EU_ORGANIC_FARMING');
    expect(green?.verdict).toBe('UNCERTAIN');
    expect(green?.confidence).toBe(0.7);
    expect(org?.verdict).toBe('NOT_FOUND');
    expect(org?.confidence).toBeNull();
  });

  // -------------------------------------------------------------------------
  // AC7 — shadow-log to recognition_logs/_results
  // -------------------------------------------------------------------------
  it('AC7: writes a recognition_logs row + a result per CONFIRMED verdict', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    mockPrisma.artworkImport.findMany.mockResolvedValue([
      { storagePath: 'artwork/x/a.png', mimeType: 'image/png', fileName: 'a.png', pages: null },
    ]);
    vi.spyOn(
      await import('../../services/t3777-declarations'),
      'resolveDeclarations'
    ).mockResolvedValue({ codes: ['GREEN_DOT'], reason: 'ok' });
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'GREEN_DOT' }]);
    vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({
      detections: [{ t3777_code: 'GREEN_DOT', bbox: { x: 1, y: 2, width: 10, height: 10 } }],
      truncated: false,
    } as never);
    vi.spyOn(mlClient, 'classifyArtwork').mockResolvedValue({
      results: [
        { bbox: { x: 1, y: 2, width: 10, height: 10 }, t3777_code: 'GREEN_DOT', confidence: 0.95, method: 'template' },
      ],
    } as never);

    await runVerifyDeclared('run-5', GTIN);

    expect(mockPrisma.recognitionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ requestId: 'run-5', detectionCount: 1 }) })
    );
    expect(mockPrisma.recognitionResult.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ value: 'GREEN_DOT', category: 'keurmerk', confidence: 0.95 }),
        ]),
      })
    );
  });

  // -------------------------------------------------------------------------
  // AC8 — no review items / training data; flywheel off by default
  // -------------------------------------------------------------------------
  it('AC8: never creates review items or training data, and writes no mismatch events with the flag off', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    mockPrisma.artworkImport.findMany.mockResolvedValue([
      { storagePath: 'artwork/x/a.png', mimeType: 'image/png', fileName: 'a.png', pages: null },
    ]);
    vi.spyOn(
      await import('../../services/t3777-declarations'),
      'resolveDeclarations'
    ).mockResolvedValue({ codes: ['GREEN_DOT'], reason: 'ok' });
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'GREEN_DOT' }]);
    vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({
      detections: [{ t3777_code: 'GREEN_DOT', bbox: { x: 1, y: 2, width: 10, height: 10 } }],
      truncated: false,
    } as never);
    vi.spyOn(mlClient, 'classifyArtwork').mockResolvedValue({
      results: [
        { bbox: { x: 1, y: 2, width: 10, height: 10 }, t3777_code: 'GREEN_DOT', confidence: 0.95, method: 'template' },
      ],
    } as never);

    await runVerifyDeclared('run-6', GTIN);

    expect(mockPrisma.artworkReviewItem.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.trainingData.create).not.toHaveBeenCalled();
    // Flag off → mismatch-events writes nothing.
    expect(mockPrisma.mismatchEvent.createMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // C1 (review) — flywheel mismatch path uses CANONICAL declared codes
  // -------------------------------------------------------------------------
  it('registers CANONICAL declared codes to the kruischeck mismatch path when the flag is on', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'true';
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');

    mockPrisma.artworkImport.findMany.mockResolvedValue([
      { storagePath: 'artwork/x/a.png', mimeType: 'image/png', fileName: 'a.png', pages: null },
    ]);
    // Declared with an ALIASED code: MARINE_STEWARDSHIP_COUNCIL → _LABEL.
    vi.spyOn(
      await import('../../services/t3777-declarations'),
      'resolveDeclarations'
    ).mockResolvedValue({ codes: ['MARINE_STEWARDSHIP_COUNCIL'], reason: 'ok' });
    // referenceLogo.findMany is queried BOTH for the active-class filter (by the
    // verify-flow) and by 16.1 loadActiveClasses — return the canonical class.
    mockPrisma.referenceLogo.findMany.mockResolvedValue([
      { t3777Code: 'MARINE_STEWARDSHIP_COUNCIL_LABEL' },
    ]);
    vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({
      detections: [{ t3777_code: 'MARINE_STEWARDSHIP_COUNCIL_LABEL', bbox: { x: 1, y: 2, width: 10, height: 10 } }],
      truncated: false,
    } as never);
    vi.spyOn(mlClient, 'classifyArtwork').mockResolvedValue({
      results: [
        {
          bbox: { x: 1, y: 2, width: 10, height: 10 },
          t3777_code: 'MARINE_STEWARDSHIP_COUNCIL_LABEL',
          confidence: 0.95,
          method: 'template',
        },
      ],
    } as never);
    mockPrisma.mismatchEvent.createMany.mockResolvedValue({ count: 1 });

    const state = await runVerifyDeclared('run-canon', GTIN);

    // The declared MSC is CONFIRMED under its canonical class in the response.
    const msc = state.verdicts.find((v) => v.declaredCode === 'MARINE_STEWARDSHIP_COUNCIL');
    expect(msc?.verdict).toBe('CONFIRMED');
    expect(msc?.code).toBe('MARINE_STEWARDSHIP_COUNCIL_LABEL');
    expect(msc?.alias).toBe('MARINE_STEWARDSHIP_COUNCIL_LABEL');

    // The 16.1 mismatch path must have written a CONFIRMED event on the CANONICAL
    // code — never a false declared-not-found from the raw GS1 code.
    expect(mockPrisma.mismatchEvent.createMany).toHaveBeenCalled();
    const rows = mockPrisma.mismatchEvent.createMany.mock.calls.at(-1)![0].data as Array<{
      t3777Code: string;
      type: string;
    }>;
    const confirmedRow = rows.find((r) => r.t3777Code === 'MARINE_STEWARDSHIP_COUNCIL_LABEL');
    expect(confirmedRow?.type).toBe('confirmed');
  });

  // -------------------------------------------------------------------------
  // Story 16.4 — skipFlywheelHooks suppresses nominations + mismatch events even
  // with the kruischeck flag ON (the control-cohort measurement isolation).
  // -------------------------------------------------------------------------
  it('skipFlywheelHooks: no nomination/mismatch writes even with the flags ON (cohort isolation)', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'true';
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');

    mockPrisma.artworkImport.findMany.mockResolvedValue([
      { storagePath: 'artwork/x/a.png', mimeType: 'image/png', fileName: 'a.png', pages: null },
    ]);
    vi.spyOn(
      await import('../../services/t3777-declarations'),
      'resolveDeclarations'
    ).mockResolvedValue({ codes: ['GREEN_DOT'], reason: 'ok' });
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'GREEN_DOT' }]);
    vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({
      detections: [{ t3777_code: 'GREEN_DOT', bbox: { x: 1, y: 2, width: 10, height: 10 } }],
      truncated: false,
    } as never);
    vi.spyOn(mlClient, 'classifyArtwork').mockResolvedValue({
      results: [
        { bbox: { x: 1, y: 2, width: 10, height: 10 }, t3777_code: 'GREEN_DOT', confidence: 0.95, method: 'template' },
      ],
    } as never);
    mockPrisma.mismatchEvent.createMany.mockResolvedValue({ count: 1 });

    const state = await runVerifyDeclared('run-cohort-iso', GTIN, { skipFlywheelHooks: true });

    // The verdict response is unchanged (CONFIRMED) — only the SIDE-effects are gone.
    expect(state.verdicts.find((v) => v.declaredCode === 'GREEN_DOT')?.verdict).toBe('CONFIRMED');
    // No kruischeck-origin mismatch events, despite both flags being ON.
    expect(mockPrisma.mismatchEvent.createMany).not.toHaveBeenCalled();
    // No review items / training data either (measurement-only).
    expect(mockPrisma.artworkReviewItem.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.trainingData.create).not.toHaveBeenCalled();
  });

  it('resolveArtworkImages expands a PDF import into one image per rasterized page', async () => {
    const { resolveArtworkImages } = await import('../../services/pipeline/verify-flow');
    mockPrisma.artworkImport.findMany.mockResolvedValue([
      {
        storagePath: 'artwork/x/doc.pdf',
        mimeType: 'application/pdf',
        fileName: 'doc.pdf',
        pages: { pages: [{ page: 1, imagePath: 'artwork/x/doc.page-1.png' }, { page: 2, imagePath: 'artwork/x/doc.page-2.png' }] },
      },
    ]);
    const images = await resolveArtworkImages(GTIN);
    expect(images.map((i) => i.storagePath)).toEqual([
      'artwork/x/doc.page-1.png',
      'artwork/x/doc.page-2.png',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 12.26 — regressie: BullMQ verbiedt ':' in custom job-ids. `verify:<runId>`
// faalde op ACC met "Custom Id cannot contain :" en blokkeerde ELKE
// verify-declared-start (ontdekt bij de eerste echte API-run, 2026-07-15).
// ---------------------------------------------------------------------------
describe('12.26 — enqueueVerifyDeclared jobId', () => {
  it('gebruikt een custom jobId zonder dubbele punt', async () => {
    const addSpy = vi.fn().mockResolvedValue(undefined);
    const closeSpy = vi.fn().mockResolvedValue(undefined);
    const bullmq = await import('bullmq');
    const queueSpy = vi
      .spyOn(bullmq, 'Queue')
      .mockImplementation(() => ({ add: addSpy, close: closeSpy }) as never);
    const redis = await import('../../services/pipeline/queue');
    vi.spyOn(redis, 'getRedisConnection').mockReturnValue({} as never);
    // writeRunState gebruikt de redis-verbinding; stub de set-call
    (redis.getRedisConnection as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn().mockResolvedValue('OK'),
    } as never);

    const { enqueueVerifyDeclared } = await import(
      '../../services/pipeline/verify-flow'
    );
    await enqueueVerifyDeclared('08719587352908', 'run-123');

    expect(addSpy).toHaveBeenCalledTimes(1);
    const opts = addSpy.mock.calls[0][2];
    expect(opts.jobId).toBeDefined();
    expect(String(opts.jobId)).not.toContain(':');
    expect(String(opts.jobId)).toContain('run-123');
    queueSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 12.27 — Nutri-Score-declaraties (apart GS1-veld `nutritionalScore`) tellen
// mee in de kruischeck. Ontdekt bij de eerste echte API-runs (2026-07-15):
// NS-producten kregen "lege-declaratie" omdat alleen T3777 werd gelezen.
// ---------------------------------------------------------------------------
describe('12.27 — Nutri-Score-veld in de kruischeck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFreshRedisCache();
    delete process.env.FLYWHEEL_NOMINATION_ENABLED;
    delete process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED;
    process.env.CATALOG_API_KEY = 'test-key';
    mockPrisma.artworkImport.findFirst.mockResolvedValue({ gln: '8710000000005' });
    mockPrisma.recognitionLog.create.mockResolvedValue({ id: 'log-1' });
    mockPrisma.recognitionResult.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.mismatchEvent.createMany.mockResolvedValue({ count: 0 });
  });

  it('NS-only declaratie: letter D wordt NUTRISCORE_D en levert een CONFIRMED-verdict via de specialist', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    mockPrisma.artworkImport.findMany.mockResolvedValue([
      { storagePath: 'artwork/x/a.png', mimeType: 'image/png', fileName: 'a.png', pages: null },
    ]);
    const decl = await import('../../services/t3777-declarations');
    vi.spyOn(decl, 'resolveDeclarations').mockResolvedValue({ codes: [], reason: 'lege-declaratie' });
    vi.spyOn(decl, 'resolveDeclaredMarks').mockResolvedValue({
      marks: [
        { code: 'D', fieldType: 'NutritionalScore' },
        { code: 'GENERAL_FOODS', fieldType: 'NutritionalScore' }, // categorie-lek: NIET meenemen
        { code: 'VEGAN', fieldType: 'DietTypeCode' }, // ander spoor: NIET meenemen
      ],
      reason: 'ok',
    });
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'NUTRISCORE_D' }]);
    const localizeSpy = vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({
      detections: [{ t3777_code: 'NUTRISCORE_D', bbox: { x: 1, y: 2, width: 10, height: 10 } }],
      truncated: false,
    } as never);
    vi.spyOn(mlClient, 'classifyArtwork').mockResolvedValue({
      results: [
        {
          bbox: { x: 1, y: 2, width: 10, height: 10 },
          t3777_code: 'NUTRISCORE_D',
          confidence: 0.852,
          method: 'nutriscore-head',
        },
      ],
    } as never);

    const state = await runVerifyDeclared('run-ns-1', GTIN);

    expect(state.status).toBe('done');
    expect(state.declaration.reason).toBe('ok'); // er IS een declaratie (de letter)
    expect(state.declaration.codes).toEqual(['NUTRISCORE_D']); // leak-guard + spoor-scope
    expect(localizeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ codes: ['NUTRISCORE_D'] })
    );
    const d = state.verdicts.find((v) => v.code === 'NUTRISCORE_D');
    expect(d?.verdict).toBe('CONFIRMED'); // 0.852 >= nutriscore-head-drempel (0.80)
    expect(d?.method).toBe('nutriscore-head');
  });

  it('T3777 + NS samen: samengevoegd zonder dubbelingen; T3777-gedrag ongewijzigd', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    mockPrisma.artworkImport.findMany.mockResolvedValue([
      { storagePath: 'artwork/x/a.png', mimeType: 'image/png', fileName: 'a.png', pages: null },
    ]);
    const decl = await import('../../services/t3777-declarations');
    vi.spyOn(decl, 'resolveDeclarations').mockResolvedValue({ codes: ['GREEN_DOT'], reason: 'ok' });
    vi.spyOn(decl, 'resolveDeclaredMarks').mockResolvedValue({
      marks: [{ code: 'A', fieldType: 'NutritionalScore' }],
      reason: 'ok',
    });
    mockPrisma.referenceLogo.findMany.mockResolvedValue([
      { t3777Code: 'GREEN_DOT' },
      { t3777Code: 'NUTRISCORE_A' },
    ]);
    vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({ detections: [], truncated: false } as never);
    vi.spyOn(mlClient, 'classifyArtwork').mockResolvedValue({ results: [] } as never);

    const state = await runVerifyDeclared('run-ns-2', GTIN);
    expect(state.declaration.codes.sort()).toEqual(['GREEN_DOT', 'NUTRISCORE_A']);
  });

  it('marks-resolutie faalt: kruischeck blijft byte-identiek op het T3777-pad (fail-open)', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    mockPrisma.artworkImport.findMany.mockResolvedValue([
      { storagePath: 'artwork/x/a.png', mimeType: 'image/png', fileName: 'a.png', pages: null },
    ]);
    const decl = await import('../../services/t3777-declarations');
    vi.spyOn(decl, 'resolveDeclarations').mockResolvedValue({ codes: [], reason: 'lege-declaratie' });
    vi.spyOn(decl, 'resolveDeclaredMarks').mockRejectedValue(new Error('marks kapot'));

    const state = await runVerifyDeclared('run-ns-3', GTIN);
    expect(state.status).toBe('done');
    expect(state.declaration.reason).toBe('lege-declaratie');
    expect(state.verdicts).toEqual([]);
  });
});

describe('12.27 — drempels voor de Nutri-Score-methodes', () => {
  it('nutriscore-head en nutriscore-a2 hebben eigen drempels (niet de strengste default)', async () => {
    const { getThresholdForMethod } = await import('../../services/artwork-crosscheck');
    // specialist: confidence-bereik [0.80-0.99]; kruischeck-stand = 0 fouten gemeten
    expect(getThresholdForMethod('nutriscore-head')).toBe(0.8);
    // vangnet: claimt alleen >= eigen vloer (0.5, achter de familie-poort)
    expect(getThresholdForMethod('nutriscore-a2')).toBe(0.5);
    // bestaande methodes ongewijzigd
    expect(getThresholdForMethod('embedding')).toBeGreaterThan(0);
    expect(getThresholdForMethod(undefined)).toBeGreaterThan(0);
  });
});

describe('12.27 — adversarial-review-regressies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFreshRedisCache();
    delete process.env.FLYWHEEL_NOMINATION_ENABLED;
    delete process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED;
    process.env.CATALOG_API_KEY = 'test-key';
    mockPrisma.artworkImport.findFirst.mockResolvedValue({ gln: '8710000000005' });
    mockPrisma.recognitionLog.create.mockResolvedValue({ id: 'log-1' });
    mockPrisma.recognitionResult.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.mismatchEvent.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.artworkImport.findMany.mockResolvedValue([
      { storagePath: 'artwork/x/a.png', mimeType: 'image/png', fileName: 'a.png', pages: null },
    ]);
  });

  it('M1: winnaar per code op marge — 0.55-vangnet verslaat 0.79-embedding (multi-crop-inversie)', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    const decl = await import('../../services/t3777-declarations');
    vi.spyOn(decl, 'resolveDeclarations').mockResolvedValue({ codes: [], reason: 'lege-declaratie' });
    vi.spyOn(decl, 'resolveDeclaredMarks').mockResolvedValue({
      marks: [{ code: 'D', fieldType: 'NutritionalScore' }], reason: 'ok',
    });
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'NUTRISCORE_D' }]);
    vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({
      detections: [
        { t3777_code: 'NUTRISCORE_D', bbox: { x: 1, y: 2, width: 10, height: 10 } },
        { t3777_code: 'NUTRISCORE_D', bbox: { x: 50, y: 60, width: 10, height: 10 } },
      ],
      truncated: false,
    } as never);
    vi.spyOn(mlClient, 'classifyArtwork').mockResolvedValue({
      results: [
        // embedding 0.79 < drempel 0.80 (marge -0.01) — rauwe-confidence-winnaar
        { bbox: { x: 1, y: 2, width: 10, height: 10 }, t3777_code: 'NUTRISCORE_D', confidence: 0.79, method: 'embedding' },
        // vangnet 0.55 >= drempel 0.50 (marge +0.05) — marge-winnaar
        { bbox: { x: 50, y: 60, width: 10, height: 10 }, t3777_code: 'NUTRISCORE_D', confidence: 0.55, method: 'nutriscore-a2' },
      ],
    } as never);

    const state = await runVerifyDeclared('run-m1', GTIN);
    const d = state.verdicts.find((v) => v.code === 'NUTRISCORE_D');
    expect(d?.verdict).toBe('CONFIRMED'); // a2 0.55 >= 0.50 wint op marge van embedding 0.79 < 0.80
    expect(d?.method).toBe('nutriscore-a2');
  });

  it('M2: harde T3777-faalreden (api-fout) wordt NIET gemaskeerd; NS-letter wordt wél geverifieerd', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    const decl = await import('../../services/t3777-declarations');
    vi.spyOn(decl, 'resolveDeclarations').mockResolvedValue({ codes: [], reason: 'api-fout' });
    vi.spyOn(decl, 'resolveDeclaredMarks').mockResolvedValue({
      marks: [{ code: 'D', fieldType: 'NutritionalScore' }], reason: 'ok',
    });
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'NUTRISCORE_D' }]);
    vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({
      detections: [{ t3777_code: 'NUTRISCORE_D', bbox: { x: 1, y: 2, width: 10, height: 10 } }],
      truncated: false,
    } as never);
    vi.spyOn(mlClient, 'classifyArtwork').mockResolvedValue({
      results: [{ bbox: { x: 1, y: 2, width: 10, height: 10 }, t3777_code: 'NUTRISCORE_D', confidence: 0.9, method: 'nutriscore-head' }],
    } as never);

    const state = await runVerifyDeclared('run-m2', GTIN);
    expect(state.declaration.reason).toBe('api-fout'); // T3777-toestand blijft eerlijk onbekend
    expect(state.declaration.codes).toEqual(['NUTRISCORE_D']);
    expect(state.verdicts.find((v) => v.code === 'NUTRISCORE_D')?.verdict).toBe('CONFIRMED');
  });

  it('NS zonder actieve referentieklasse -> UNSUPPORTED (nooit stil overgeslagen)', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    const decl = await import('../../services/t3777-declarations');
    vi.spyOn(decl, 'resolveDeclarations').mockResolvedValue({ codes: [], reason: 'lege-declaratie' });
    vi.spyOn(decl, 'resolveDeclaredMarks').mockResolvedValue({
      marks: [{ code: 'B', fieldType: 'NutritionalScore' }], reason: 'ok',
    });
    mockPrisma.referenceLogo.findMany.mockResolvedValue([]); // geen actieve refs
    vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({ detections: [], truncated: false } as never);
    vi.spyOn(mlClient, 'classifyArtwork').mockResolvedValue({ results: [] } as never);

    const state = await runVerifyDeclared('run-unsup', GTIN);
    expect(state.verdicts.find((v) => v.code === 'NUTRISCORE_B')?.verdict).toBe('UNSUPPORTED');
  });

  it('NS gedeclareerd maar niets gevonden op het artwork -> NOT_FOUND', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    const decl = await import('../../services/t3777-declarations');
    vi.spyOn(decl, 'resolveDeclarations').mockResolvedValue({ codes: [], reason: 'lege-declaratie' });
    vi.spyOn(decl, 'resolveDeclaredMarks').mockResolvedValue({
      marks: [{ code: 'E', fieldType: 'NutritionalScore' }], reason: 'ok',
    });
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'NUTRISCORE_E' }]);
    vi.spyOn(mlClient, 'localizeArtwork').mockResolvedValue({ detections: [], truncated: false } as never);
    vi.spyOn(mlClient, 'classifyArtwork').mockResolvedValue({ results: [] } as never);

    const state = await runVerifyDeclared('run-nf', GTIN);
    expect(state.verdicts.find((v) => v.code === 'NUTRISCORE_E')?.verdict).toBe('NOT_FOUND');
  });

  it('realistisch marks-faalpad (reason != ok, lege marks) -> byte-identiek T3777-gedrag', async () => {
    const { runVerifyDeclared } = await import('../../services/pipeline/verify-flow');
    const decl = await import('../../services/t3777-declarations');
    vi.spyOn(decl, 'resolveDeclarations').mockResolvedValue({ codes: [], reason: 'lege-declaratie' });
    vi.spyOn(decl, 'resolveDeclaredMarks').mockResolvedValue({ marks: [], reason: 'api-fout' });

    const state = await runVerifyDeclared('run-real', GTIN);
    expect(state.status).toBe('done');
    expect(state.declaration.reason).toBe('lege-declaratie');
    expect(state.verdicts).toEqual([]);
  });
});
