/**
 * Story 19.3 — keurmerk→etiket-index unit-tests (AC1 + AC2).
 *
 * AC1 (index + tellingen via de betrouwbare declaratie-lezer, getoetst aan het
 *      951-code-universum): buildIndex bouwt `{fieldType/code → [{gtin,gln,labels}]}`
 *      + tellingen per sleutel; codesPresent laat de universum-dekking af.
 * AC2 (idempotent seed-script met droge-run): de bouw is een DETERMINISTISCHE,
 *      PURE projectie — dezelfde invoer geeft byte-identieke serialisatie (idempotentie).
 *      De --dry-run-garantie (0 writes) volgt eruit dat de dry-run enkel buildIndex +
 *      print aanroept en writeIndex nooit raakt.
 *
 * Pure helpers only — importeren draait main() NIET (require.main-guard); geen
 * echte HTTP/DB.
 */

import { describe, it, expect } from 'vitest';
import {
  buildIndex,
  serializeIndex,
  indexKey,
  dedupSorted,
  UNIVERSE_CODE_COUNT,
  type GtinData,
} from '../../scripts/build-keurmerk-index';

/** Handige bouwer voor testdata. */
function gtinData(
  gtin: string,
  gln: string,
  marks: Array<[string, string]>,
  labels: string[]
): GtinData {
  return {
    gtin,
    gln,
    marks: marks.map(([fieldType, code]) => ({ fieldType, code })),
    labels,
  };
}

const FIXED_NOW = new Date('2026-07-05T10:00:00.000Z');

describe('Story 19.3 — buildIndex (AC1: index + tellingen)', () => {
  it('bouwt {fieldType/code → [{gtin,gln,labels}]} met tellingen per sleutel', () => {
    const data = [
      gtinData('0001', '111', [['PackagingMarkedLabelAccreditationCode', 'BIO']], ['/111/a.jpg', '/111/b.jpg']),
      gtinData('0002', '222', [['PackagingMarkedLabelAccreditationCode', 'BIO']], ['/222/c.jpg']),
    ];
    const index = buildIndex(data, FIXED_NOW);

    const key = indexKey('PackagingMarkedLabelAccreditationCode', 'BIO');
    expect(index.entries[key]).toHaveLength(2);
    expect(index.entries[key][0]).toEqual({ gtin: '0001', gln: '111', labels: ['/111/a.jpg', '/111/b.jpg'] });
    expect(index.summary.perKey[key]).toEqual({ gtins: 2, labels: 3 });
    expect(index.summary.distinctKeys).toBe(1);
    expect(index.summary.gtinsWithData).toBe(2);
  });

  it('meerdere codes per GTIN → GTIN verschijnt onder elke sleutel', () => {
    const data = [
      gtinData(
        '0001',
        '111',
        [
          ['PackagingMarkedLabelAccreditationCode', 'BIO'],
          ['DietTypeCode', 'VEGAN'],
          ['EU_consumerUsageLabelCodeList', 'NIX18'],
        ],
        ['/111/a.jpg']
      ),
    ];
    const index = buildIndex(data, FIXED_NOW);

    expect(index.summary.distinctKeys).toBe(3);
    expect(index.entries[indexKey('PackagingMarkedLabelAccreditationCode', 'BIO')]).toHaveLength(1);
    expect(index.entries[indexKey('DietTypeCode', 'VEGAN')]).toHaveLength(1);
    expect(index.entries[indexKey('EU_consumerUsageLabelCodeList', 'NIX18')]).toHaveLength(1);
    // Eén GTIN, drie sleutels: gtinsWithData telt het product één keer.
    expect(index.summary.gtinsWithData).toBe(1);
  });

  it('houdt gelijke codes uit VERSCHILLENDE velden gescheiden (samengestelde sleutel)', () => {
    const data = [
      gtinData(
        '0001',
        '111',
        [
          ['PackagingMarkedLabelAccreditationCode', 'X'],
          ['AdditionalPackagingMarkingsCode', 'X'],
        ],
        ['/111/a.jpg']
      ),
    ];
    const index = buildIndex(data, FIXED_NOW);
    expect(index.summary.distinctKeys).toBe(2);
    expect(index.summary.codesPresent).toEqual(['X']); // één code, twee velden
  });

  it('toetst aan het universum: codesPresent + universeCodeCount worden gerapporteerd', () => {
    const data = [
      gtinData('0001', '111', [['DietTypeCode', 'VEGAN']], ['/111/a.jpg']),
      gtinData('0002', '222', [['PackagingMarkedLabelAccreditationCode', 'BIO']], ['/222/b.jpg']),
    ];
    const index = buildIndex(data, FIXED_NOW);
    expect(index.summary.codesPresent).toEqual(['BIO', 'VEGAN']); // gesorteerd
    expect(index.universeCodeCount).toBe(UNIVERSE_CODE_COUNT);
    expect(index.summary.universeCodeCount).toBe(UNIVERSE_CODE_COUNT);
  });

  it('dedupliceert labels binnen een vermelding en sorteert ze', () => {
    const data = [
      gtinData('0001', '111', [['DietTypeCode', 'VEGAN']], ['/z.jpg', '/a.jpg', '/z.jpg', '  ']),
    ];
    const index = buildIndex(data, FIXED_NOW);
    const key = indexKey('DietTypeCode', 'VEGAN');
    expect(index.entries[key][0].labels).toEqual(['/a.jpg', '/z.jpg']);
  });

  it('voegt labels samen bij een dubbele GTIN onder dezelfde sleutel (geen dubbele rij)', () => {
    // Dezelfde GTIN twee keer in de invoer (bv. herhaalde bron) → één rij, labels-unie.
    const data = [
      gtinData('0001', '111', [['DietTypeCode', 'VEGAN']], ['/a.jpg']),
      gtinData('0001', '111', [['DietTypeCode', 'VEGAN']], ['/b.jpg']),
    ];
    const index = buildIndex(data, FIXED_NOW);
    const key = indexKey('DietTypeCode', 'VEGAN');
    expect(index.entries[key]).toHaveLength(1);
    expect(index.entries[key][0].labels).toEqual(['/a.jpg', '/b.jpg']);
    expect(index.summary.perKey[key]).toEqual({ gtins: 1, labels: 2 });
  });
});

describe('Story 19.3 — lege/onbruikbare invoer', () => {
  it('GTIN zonder declaratie draagt niet bij (etiket zonder bevestiging)', () => {
    const data = [gtinData('0001', '111', [], ['/a.jpg'])];
    const index = buildIndex(data, FIXED_NOW);
    expect(index.summary.distinctKeys).toBe(0);
    expect(index.summary.gtinsWithData).toBe(0);
    expect(index.entries).toEqual({});
  });

  it('GTIN zonder labels draagt niet bij (keurmerk zonder etiket = geen brandstof)', () => {
    const data = [gtinData('0001', '111', [['DietTypeCode', 'VEGAN']], [])];
    const index = buildIndex(data, FIXED_NOW);
    expect(index.summary.distinctKeys).toBe(0);
    expect(index.summary.gtinsWithData).toBe(0);
  });

  it('lege code (whitespace) wordt overgeslagen', () => {
    const data = [gtinData('0001', '111', [['DietTypeCode', '  ']], ['/a.jpg'])];
    const index = buildIndex(data, FIXED_NOW);
    expect(index.summary.distinctKeys).toBe(0);
  });
});

describe('Story 19.3 — idempotentie (AC2)', () => {
  it('dezelfde invoer geeft byte-identieke serialisatie (deterministische projectie)', () => {
    const data = [
      gtinData('0002', '222', [['DietTypeCode', 'VEGAN']], ['/z.jpg', '/a.jpg']),
      gtinData('0001', '111', [['PackagingMarkedLabelAccreditationCode', 'BIO']], ['/b.jpg']),
    ];
    // Zelfde now → alleen de projectie telt (builtAt gelijk).
    const a = serializeIndex(buildIndex(data, FIXED_NOW));
    const b = serializeIndex(buildIndex(data, FIXED_NOW));
    expect(a).toBe(b);
  });

  it('invoervolgorde beïnvloedt de output NIET (sleutels + vermeldingen gesorteerd)', () => {
    const d1 = gtinData('0002', '222', [['DietTypeCode', 'VEGAN']], ['/z.jpg']);
    const d2 = gtinData('0001', '111', [['DietTypeCode', 'VEGAN']], ['/a.jpg']);
    const forward = serializeIndex(buildIndex([d1, d2], FIXED_NOW));
    const reverse = serializeIndex(buildIndex([d2, d1], FIXED_NOW));
    expect(forward).toBe(reverse);
    // En de vermeldingen staan op GTIN gesorteerd (0001 vóór 0002).
    const key = indexKey('DietTypeCode', 'VEGAN');
    const index = buildIndex([d1, d2], FIXED_NOW);
    expect(index.entries[key].map((e) => e.gtin)).toEqual(['0001', '0002']);
  });
});

describe('Story 19.3 — helpers', () => {
  it('dedupSorted trimt, dedupliceert en sorteert; laat leeg weg', () => {
    expect(dedupSorted(['b', 'a', 'b', ' ', 'a', ''])).toEqual(['a', 'b']);
  });

  it('indexKey combineert fieldType en code', () => {
    expect(indexKey('DietTypeCode', 'VEGAN')).toBe('DietTypeCode/VEGAN');
  });
});
