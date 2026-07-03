/**
 * Story 14.3 — Wekelijkse outlier-audit op de referentiebibliotheek (API-deel).
 *
 * Dekt de job-flow (drempel-toepassing, dedup, persistentie + run-tijdstempel,
 * gecureerde referenties, "deactiveert niets", pauze-scope) en het overview-
 * paneel. Het pure reken-contract (`/ml/outlier-audit` bibliotheek-modus) staat
 * in apps/ml-service/tests/unit/test_outlier_service.py.
 *
 * Prisma (`core/db` → gemockt `@prisma/client`) en `mlClient` worden globaal
 * gemockt in src/__tests__/setup.ts. AC→test-mapping:
 * _bmad-output/implementation-artifacts/ac-trace-14-3.md.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import {
  selectOutliers,
  runOutlierAudit,
} from '../../services/flywheel/outlier-audit';
import { getOutliersPanel } from '../../services/flywheel/outliers-overview';

const mockPrisma = prisma as unknown as {
  referenceLogo: { findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  outlierFinding: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

const mockMl = mlClient as unknown as {
  outlierAuditLibrary: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FLYWHEEL_OUTLIER_PERCENTILE;
  delete process.env.FLYWHEEL_OUTLIER_ABS_DISTANCE;
  delete process.env.FLYWHEEL_OUTLIER_MIN_CLASS_SIZE;
  // Sane defaults.
  mockPrisma.referenceLogo.findMany.mockResolvedValue([]);
  mockPrisma.outlierFinding.findFirst.mockResolvedValue(null);
  mockPrisma.outlierFinding.create.mockResolvedValue({ id: 'of-1' });
  mockPrisma.outlierFinding.findMany.mockResolvedValue([]);
  mockPrisma.outlierFinding.count.mockResolvedValue(0);
});

// ---------------------------------------------------------------------------
// selectOutliers — pure drempel-toepassing (AC2)
// ---------------------------------------------------------------------------

describe('selectOutliers — drempel-toepassing (AC2)', () => {
  const thresholds = { percentileThreshold: 0.95, absDistance: 0.45, minClassSize: 3 };

  it('markeert de referentie in het bovenste percentiel (percentiel-pad)', () => {
    const results = [
      { reference_logo_id: 'a', distance: 0.1, percentile: 0.2 },
      { reference_logo_id: 'b', distance: 0.15, percentile: 0.5 },
      { reference_logo_id: 'c', distance: 0.2, percentile: 0.8 },
      { reference_logo_id: 'd', distance: 0.3, percentile: 1.0 }, // top-percentiel
    ];
    const hits = selectOutliers('T1', results, thresholds);
    expect(hits.map((h) => h.referenceLogoId)).toEqual(['d']);
    expect(hits[0].reason).toBe('percentile');
  });

  it('markeert een referentie boven de absolute grens (absolute-pad), ook onder de percentiel-poort', () => {
    // Kleine klasse (2 < minClassSize 3): percentiel telt NIET, maar de absolute
    // grens (0.45) wel — 'far' ligt op 0.6.
    const results = [
      { reference_logo_id: 'near', distance: 0.05, percentile: 0.5 },
      { reference_logo_id: 'far', distance: 0.6, percentile: 1.0 },
    ];
    const hits = selectOutliers('T1', results, thresholds);
    expect(hits.map((h) => h.referenceLogoId)).toEqual(['far']);
    expect(hits[0].reason).toBe('absolute');
  });

  it('kleine klasse (<minClassSize) levert GEEN percentiel-outlier zonder absolute overschrijding', () => {
    // 2 referenties, beide onder de absolute grens: geen enkele treffer, ook al
    // heeft er één percentiel 1.0.
    const results = [
      { reference_logo_id: 'x', distance: 0.1, percentile: 0.5 },
      { reference_logo_id: 'y', distance: 0.2, percentile: 1.0 },
    ];
    const hits = selectOutliers('T1', results, thresholds);
    expect(hits).toEqual([]);
  });

  it('markeert reason "both" als beide grenzen overschreden zijn', () => {
    const results = [
      { reference_logo_id: 'a', distance: 0.1, percentile: 0.2 },
      { reference_logo_id: 'b', distance: 0.1, percentile: 0.3 },
      { reference_logo_id: 'c', distance: 0.1, percentile: 0.4 },
      { reference_logo_id: 'd', distance: 0.9, percentile: 1.0 }, // beide grenzen
    ];
    const hits = selectOutliers('T1', results, thresholds);
    expect(hits).toHaveLength(1);
    expect(hits[0].reason).toBe('both');
  });
});

// ---------------------------------------------------------------------------
// runOutlierAudit — job-flow (AC2, AC3)
// ---------------------------------------------------------------------------

describe('runOutlierAudit — job-flow (AC2/AC3)', () => {
  it('persisteert een open finding per treffer met run-tijdstempel (AC3)', async () => {
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'RECYCLABLE' }]);
    mockMl.outlierAuditLibrary.mockResolvedValue({
      t3777_code: 'RECYCLABLE',
      centroid_size: 4,
      results: [
        { reference_logo_id: 'r1', distance: 0.1, percentile: 0.3 },
        { reference_logo_id: 'r2', distance: 0.7, percentile: 1.0 }, // outlier (abs + pct)
      ],
    });

    const result = await runOutlierAudit();

    expect(result.classesAudited).toBe(1);
    expect(result.outliersFound).toBe(1);
    expect(result.findingsPersisted).toBe(1);
    expect(mockPrisma.outlierFinding.create).toHaveBeenCalledTimes(1);
    const created = mockPrisma.outlierFinding.create.mock.calls[0][0].data;
    expect(created.referenceLogoId).toBe('r2');
    expect(created.status).toBe('open');
    expect(created.distance).toBe(0.7);
    expect(created.percentile).toBe(1.0);
    // Run-tijdstempel gezet en gelijk aan de gerapporteerde auditRunAt (NFR-5).
    expect(created.auditRunAt).toBeInstanceOf(Date);
    expect(created.auditRunAt.getTime()).toBe(result.auditRunAt.getTime());
  });

  it('gebruikt ÉÉN auditRunAt voor alle findings binnen de run (NFR-5)', async () => {
    mockPrisma.referenceLogo.findMany.mockResolvedValue([
      { t3777Code: 'A' },
      { t3777Code: 'B' },
    ]);
    mockMl.outlierAuditLibrary
      .mockResolvedValueOnce({
        t3777_code: 'A',
        centroid_size: 3,
        results: [{ reference_logo_id: 'a1', distance: 0.9, percentile: 1.0 }],
      })
      .mockResolvedValueOnce({
        t3777_code: 'B',
        centroid_size: 3,
        results: [{ reference_logo_id: 'b1', distance: 0.9, percentile: 1.0 }],
      });

    await runOutlierAudit();

    const stamps = mockPrisma.outlierFinding.create.mock.calls.map(
      (c) => (c[0].data.auditRunAt as Date).getTime()
    );
    expect(stamps).toHaveLength(2);
    expect(new Set(stamps).size).toBe(1); // identiek run-tijdstempel
  });

  it('dedupt: geen duplicaat als de referentie al een open finding heeft (AC3-idempotentie)', async () => {
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'A' }]);
    mockMl.outlierAuditLibrary.mockResolvedValue({
      t3777_code: 'A',
      centroid_size: 3,
      results: [{ reference_logo_id: 'dup', distance: 0.9, percentile: 1.0 }],
    });
    // Er bestaat al een open finding voor 'dup'.
    mockPrisma.outlierFinding.findFirst.mockResolvedValue({ id: 'existing' });

    const result = await runOutlierAudit();

    expect(result.outliersFound).toBe(1);
    expect(result.findingsPersisted).toBe(0);
    expect(mockPrisma.outlierFinding.create).not.toHaveBeenCalled();
  });

  it('audit dekt óók handmatig gecureerde referenties (source != flywheel-promotion)', async () => {
    // De job filtert klassen op active=true, NIET op source — een gecureerde
    // referentie (source null/handmatig) wordt gewoon geauditeerd. We bewijzen
    // dat de klasse-query geen source-filter draagt.
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'CURATED' }]);
    mockMl.outlierAuditLibrary.mockResolvedValue({
      t3777_code: 'CURATED',
      centroid_size: 5,
      results: [{ reference_logo_id: 'curated-ref', distance: 0.8, percentile: 1.0 }],
    });

    await runOutlierAudit();

    const where = mockPrisma.referenceLogo.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ active: true }); // geen source-filter
    expect(mockMl.outlierAuditLibrary).toHaveBeenCalledWith({ t3777_code: 'CURATED' });
    expect(mockPrisma.outlierFinding.create).toHaveBeenCalledTimes(1);
  });

  it('DEACTIVEERT NIETS: geen enkele write op reference_logos (FR-8)', async () => {
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'A' }]);
    mockMl.outlierAuditLibrary.mockResolvedValue({
      t3777_code: 'A',
      centroid_size: 4,
      results: [{ reference_logo_id: 'r', distance: 0.9, percentile: 1.0 }],
    });

    await runOutlierAudit();

    // De enige writes zijn outlier_findings-inserts; reference_logos wordt nooit
    // gemuteerd (geen update/updateMany).
    expect(mockPrisma.referenceLogo.update).not.toHaveBeenCalled();
    expect(mockPrisma.referenceLogo.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.outlierFinding.create).toHaveBeenCalled();
  });

  it('slaat een klasse met een ml-fout over en auditeert de rest door', async () => {
    mockPrisma.referenceLogo.findMany.mockResolvedValue([
      { t3777Code: 'BROKEN' },
      { t3777Code: 'OK' },
    ]);
    mockMl.outlierAuditLibrary
      .mockRejectedValueOnce(new Error('ml down'))
      .mockResolvedValueOnce({
        t3777_code: 'OK',
        centroid_size: 3,
        results: [{ reference_logo_id: 'ok1', distance: 0.9, percentile: 1.0 }],
      });

    const result = await runOutlierAudit();

    expect(result.classesAudited).toBe(2);
    expect(result.findingsPersisted).toBe(1); // alleen de gezonde klasse leverde
  });

  it('lege klasse (centroid_size 0) levert niets en crasht niet', async () => {
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'EMPTY' }]);
    mockMl.outlierAuditLibrary.mockResolvedValue({
      t3777_code: 'EMPTY',
      centroid_size: 0,
      results: [],
    });

    const result = await runOutlierAudit();
    expect(result.outliersFound).toBe(0);
    expect(mockPrisma.outlierFinding.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Pauze-scope (AC5) — de audit draait door bij pauze
// ---------------------------------------------------------------------------

describe('pauze-scope (AC5)', () => {
  it('draait gewoon door zonder pauze-check (read-only, buiten pauze-scope AD-11)', async () => {
    // De job raadpleegt GEEN pauze-service. Ook met een (hypothetisch) actieve
    // pauze auditeert hij door: we zetten geen pause-mock en bewijzen dat de
    // flow findings blijft schrijven.
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'A' }]);
    mockMl.outlierAuditLibrary.mockResolvedValue({
      t3777_code: 'A',
      centroid_size: 3,
      results: [{ reference_logo_id: 'r', distance: 0.9, percentile: 1.0 }],
    });

    const result = await runOutlierAudit();
    expect(result.findingsPersisted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Overview-paneel (AC3) — persistentie + herstart-bestendigheid
// ---------------------------------------------------------------------------

describe('getOutliersPanel — overview (AC3)', () => {
  it('geeft open findings + laatste auditRunAt terug (opvraagbaar, herstart-bestendig)', async () => {
    const auditRunAt = new Date('2026-07-05T05:00:00.000Z');
    const createdAt = new Date('2026-07-05T05:00:01.000Z');
    mockPrisma.outlierFinding.count.mockResolvedValue(1);
    mockPrisma.outlierFinding.findMany.mockResolvedValue([
      {
        id: 'of-1',
        referenceLogoId: 'r1',
        distance: 0.8,
        percentile: 1.0,
        auditRunAt,
        createdAt,
        referenceLogo: { t3777Code: 'RECYCLABLE', variantLabel: 'v1' },
      },
    ]);
    mockPrisma.outlierFinding.findFirst.mockResolvedValue({ auditRunAt });

    const panel = await getOutliersPanel();

    expect(panel.openCount).toBe(1);
    expect(panel.openFindings).toHaveLength(1);
    expect(panel.openFindings[0]).toMatchObject({
      id: 'of-1',
      referenceLogoId: 'r1',
      t3777Code: 'RECYCLABLE',
      variantLabel: 'v1',
      distance: 0.8,
      percentile: 1.0,
    });
    expect(panel.lastAuditRunAt).toBe(auditRunAt.toISOString());
    // Paneel leest alleen OPEN findings (status-filter).
    expect(mockPrisma.outlierFinding.findMany.mock.calls[0][0].where).toEqual({ status: 'open' });
  });

  it('lege set: openCount 0, geen findings, lastAuditRunAt null', async () => {
    mockPrisma.outlierFinding.count.mockResolvedValue(0);
    mockPrisma.outlierFinding.findMany.mockResolvedValue([]);
    mockPrisma.outlierFinding.findFirst.mockResolvedValue(null);

    const panel = await getOutliersPanel();
    expect(panel.openCount).toBe(0);
    expect(panel.openFindings).toEqual([]);
    expect(panel.lastAuditRunAt).toBeNull();
  });
});
