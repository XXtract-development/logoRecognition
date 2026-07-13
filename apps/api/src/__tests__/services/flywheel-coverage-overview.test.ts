/**
 * Story 12.10 (AC4, AC5d) — overview-paneel `coverage`: per-`field_type`
 * dekkingsteller (vakken gevuld / ≥3-echt / gids-only / gedeclareerd universe).
 *
 * Dekt:
 *  - de PURE aggregatie (`buildCoverageByFieldType`) op ruwe per-code-tellingen;
 *  - `getCoveragePanel` met gemockte Prisma (`groupBy`) + gemockte MinIO-index-read
 *    (`downloadTrainingObject`), incl. best-effort degradatie als de index niet
 *    leesbaar is (sectie-lokale fout-tolerantie, State Patterns).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { downloadTrainingObject } from '../../services/storage';
import { buildCoverageByFieldType, getCoveragePanel, type RawCoverageRow } from '../../services/flywheel/overview/coverage';

type Mock = ReturnType<typeof vi.fn>;
async function db() {
  return (await import('../../core/db')).default as unknown as {
    referenceLogo: { groupBy: Mock };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildCoverageByFieldType (AC4) — pure aggregatie', () => {
  it('telt gevuld / ≥3-echt / gids-only per fieldType', () => {
    const rows: RawCoverageRow[] = [
      { fieldType: 'PackagingMarkedLabelAccreditationCode', t3777Code: 'GREEN_DOT', totalActive: 16, realActive: 16 },
      { fieldType: 'PackagingMarkedLabelAccreditationCode', t3777Code: 'FAIRTRADE_COCOA', totalActive: 3, realActive: 0 },
      { fieldType: 'NutritionalScore', t3777Code: 'NUTRISCORE_D', totalActive: 2, realActive: 2 },
    ];
    const byFieldType = buildCoverageByFieldType(rows, null);

    const packaging = byFieldType.find((f) => f.fieldType === 'PackagingMarkedLabelAccreditationCode');
    expect(packaging).toMatchObject({ filledCodes: 2, readyCodes: 1, guideOnlyCodes: 1, declaredUniverseCodes: null });

    const nutri = byFieldType.find((f) => f.fieldType === 'NutritionalScore');
    // NUTRISCORE_D heeft 2 echte refs — onder de k=3-drempel, dus NIET "ready".
    expect(nutri).toMatchObject({ filledCodes: 1, readyCodes: 0, guideOnlyCodes: 0 });
  });

  it('neemt een fieldType op die alléén in het gedeclareerde universe voorkomt (0 refs)', () => {
    const byFieldType = buildCoverageByFieldType([], { GHSSymbolDescriptionCode: 0 });
    expect(byFieldType).toEqual([
      { fieldType: 'GHSSymbolDescriptionCode', filledCodes: 0, readyCodes: 0, guideOnlyCodes: 0, declaredUniverseCodes: 0 },
    ]);
  });

  it('sorteert alfabetisch op fieldType (deterministisch)', () => {
    const rows: RawCoverageRow[] = [
      { fieldType: 'NutritionalScore', t3777Code: 'NUTRISCORE_A', totalActive: 1, realActive: 1 },
      { fieldType: 'DietTypeCode', t3777Code: 'VEGAN', totalActive: 1, realActive: 1 },
    ];
    const byFieldType = buildCoverageByFieldType(rows, null);
    expect(byFieldType.map((f) => f.fieldType)).toEqual(['DietTypeCode', 'NutritionalScore']);
  });
});

describe('getCoveragePanel (AC4) — DB + MinIO-index samenstellen', () => {
  it('combineert groupBy-tellingen met het gedeclareerde universe uit de index', async () => {
    const prisma = await db();
    prisma.referenceLogo.groupBy
      .mockResolvedValueOnce([
        { fieldType: 'DietTypeCode', t3777Code: 'VEGAN', _count: { _all: 9 } },
      ])
      .mockResolvedValueOnce([
        { fieldType: 'DietTypeCode', t3777Code: 'VEGAN', _count: { _all: 9 } },
      ]);

    (downloadTrainingObject as unknown as Mock).mockResolvedValueOnce(
      Buffer.from(
        JSON.stringify({
          summary: { perKey: { 'DietTypeCode/VEGAN': { gtins: 3, labels: 5 }, 'DietTypeCode/HALAL': { gtins: 1, labels: 1 } } },
        })
      )
    );

    const panel = await getCoveragePanel();
    expect(panel.available).toBe(true);
    expect(panel.indexAvailable).toBe(true);
    expect(panel.byFieldType).toEqual([
      { fieldType: 'DietTypeCode', filledCodes: 1, readyCodes: 1, guideOnlyCodes: 0, declaredUniverseCodes: 2 },
    ]);
  });

  it('degradeert sectie-lokaal (leeg-maar-available) als de aggregatie faalt', async () => {
    const prisma = await db();
    prisma.referenceLogo.groupBy.mockRejectedValueOnce(new Error('db weg'));

    const panel = await getCoveragePanel();
    expect(panel).toMatchObject({ available: true, byFieldType: [], indexAvailable: false });
  });

  it('indexAvailable=false + declaredUniverseCodes=null als de MinIO-index niet leesbaar is', async () => {
    const prisma = await db();
    prisma.referenceLogo.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    (downloadTrainingObject as unknown as Mock).mockResolvedValueOnce(null);

    const panel = await getCoveragePanel();
    expect(panel.indexAvailable).toBe(false);
    expect(panel.byFieldType).toEqual([]);
  });
});
