/**
 * Story 12.15 — Nutri-Score-declaratie-map unit-tests (AC1, AC3, AC5a).
 *
 * AC1 (gedeclareerde letter als label, hergebruik 12.7): classifyDeclaredLetter
 *      resolveert de kale A-E-letter uit fieldType `NutritionalScore`.
 * AC5a (leak-guard): categorie-codes (GENERAL_FOODS/CHEESES, de 12.7-regex-leak
 *      van `nutritionalScoreProductCategoryCode`) worden verworpen — ze zijn
 *      geen kale, enkele letter en falen de lengte-1-check.
 * AC3-geest (geen fabricatie): >1 distincte letter voor dezelfde GTIN wordt
 *      NIET gegokt maar als `ambigu` gemarkeerd en overgeslagen.
 *
 * Pure helpers only — importeren draait main() NIET (require.main-guard); geen
 * echte HTTP/DB/Prisma.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyDeclaredLetter,
  buildDeclaredMap,
  serializeDeclaredMap,
  collectDeclaredMap,
  PRIORITY_LETTERS,
  type GtinLetterResult,
} from '../../scripts/build-nutriscore-declared-map';
import type { DeclaredMark } from '../../services/t3777-declarations';

function mark(fieldType: string, code: string): DeclaredMark {
  return { fieldType, code };
}

const FIXED_NOW = new Date('2026-07-14T10:00:00.000Z');

describe('Story 12.15 — classifyDeclaredLetter (AC1)', () => {
  it('resolveert een kale letter A-E uit fieldType NutritionalScore', () => {
    expect(classifyDeclaredLetter([mark('NutritionalScore', 'C')])).toEqual({
      kind: 'resolved',
      letter: 'C',
    });
  });

  it('trimt en uppercased de code vóór classificatie', () => {
    expect(classifyDeclaredLetter([mark('NutritionalScore', ' d ')])).toEqual({
      kind: 'resolved',
      letter: 'D',
    });
  });

  it('negeert marks van andere fieldTypes (bv. DietTypeCode)', () => {
    expect(
      classifyDeclaredLetter([mark('DietTypeCode', 'VEGAN'), mark('PackagingMarkedLabelAccreditationCode', 'MSC')])
    ).toEqual({ kind: 'geen-declaratie' });
  });

  it('geen NutritionalScore-mark -> geen-declaratie', () => {
    expect(classifyDeclaredLetter([])).toEqual({ kind: 'geen-declaratie' });
  });

  // -------------------------------------------------------------------------
  // AC5a — de 12.7-regex-leak-guard: categorie-codes onder dezelfde fieldType
  // worden verworpen (ze zijn nooit een kale, enkele letter).
  // -------------------------------------------------------------------------
  it('AC5a: verwerpt categorie-codes (GENERAL_FOODS) onder fieldType NutritionalScore (leak-guard)', () => {
    expect(classifyDeclaredLetter([mark('NutritionalScore', 'GENERAL_FOODS')])).toEqual({
      kind: 'geen-declaratie',
    });
  });

  it('AC5a: verwerpt CHEESES (andere leak-waarde), FATS_NUTS_SEEDS, BEVERAGES, RED_MEAT', () => {
    for (const leaked of ['CHEESES', 'FATS_NUTS_SEEDS', 'BEVERAGES', 'RED_MEAT']) {
      expect(classifyDeclaredLetter([mark('NutritionalScore', leaked)])).toEqual({
        kind: 'geen-declaratie',
      });
    }
  });

  it('AC5a: een lekkende categorie-code náást een echte letter resolveert alsnog naar de letter (leak telt niet mee)', () => {
    expect(
      classifyDeclaredLetter([mark('NutritionalScore', 'GENERAL_FOODS'), mark('NutritionalScore', 'E')])
    ).toEqual({ kind: 'resolved', letter: 'E' });
  });

  // -------------------------------------------------------------------------
  // AC3-geest — nooit gokken bij tegenstrijdige input.
  // -------------------------------------------------------------------------
  it('twee DISTINCTE echte letters voor dezelfde GTIN -> ambigu (nooit gokken)', () => {
    expect(classifyDeclaredLetter([mark('NutritionalScore', 'B'), mark('NutritionalScore', 'C')])).toEqual({
      kind: 'ambigu',
      letters: ['B', 'C'],
    });
  });

  it('dezelfde letter twee keer gedeclareerd blijft resolved (geen valse ambiguïteit door dedup)', () => {
    expect(classifyDeclaredLetter([mark('NutritionalScore', 'A'), mark('NutritionalScore', 'A')])).toEqual({
      kind: 'resolved',
      letter: 'A',
    });
  });
});

describe('Story 12.15 — buildDeclaredMap', () => {
  function res(gtin: string, outcome: GtinLetterResult['outcome']): GtinLetterResult {
    return { gtin, outcome };
  }

  it('bouwt gtin->letter entries + perLetter-tellingen, gesorteerd op gtin', () => {
    const results = [
      res('0002', { kind: 'resolved', letter: 'C' }),
      res('0001', { kind: 'resolved', letter: 'D' }),
      res('0003', { kind: 'resolved', letter: 'C' }),
    ];
    const out = buildDeclaredMap(results, FIXED_NOW);
    expect(out.entries).toEqual({ '0001': 'D', '0002': 'C', '0003': 'C' });
    expect(out.summary.perLetter).toEqual({ C: 2, D: 1 });
    expect(out.summary.resolved).toBe(3);
    expect(out.summary.gtinsProcessed).toBe(3);
  });

  it('geen-declaratie en ambigu landen NIET in entries maar tellen wel in de samenvatting', () => {
    const results = [
      res('0001', { kind: 'geen-declaratie' }),
      res('0002', { kind: 'ambigu', letters: ['A', 'B'] }),
      res('0003', { kind: 'resolved', letter: 'E' }),
    ];
    const out = buildDeclaredMap(results, FIXED_NOW);
    expect(out.entries).toEqual({ '0003': 'E' });
    expect(out.summary.geenDeclaratie).toBe(1);
    expect(out.summary.ambigu).toBe(1);
    expect(out.summary.resolved).toBe(1);
  });

  it('lege invoer -> lege map, alle tellers 0', () => {
    const out = buildDeclaredMap([], FIXED_NOW);
    expect(out.entries).toEqual({});
    expect(out.summary).toEqual({
      gtinsProcessed: 0,
      resolved: 0,
      geenDeclaratie: 0,
      ambigu: 0,
      fout: 0,
      perLetter: {},
    });
  });

  it('fout-uitkomsten landen NIET in entries maar tellen apart (nooit gegokt bij een falende lookup)', () => {
    const results = [
      res('0001', { kind: 'fout', error: 'catalog timeout' }),
      res('0002', { kind: 'resolved', letter: 'C' }),
    ];
    const out = buildDeclaredMap(results, FIXED_NOW);
    expect(out.entries).toEqual({ '0002': 'C' });
    expect(out.summary.fout).toBe(1);
    expect(out.summary.resolved).toBe(1);
  });

  it('PRIORITY_LETTERS = C/D (story-scope)', () => {
    expect(PRIORITY_LETTERS).toEqual(['C', 'D']);
  });
});

describe('Story 12.15 — serializeDeclaredMap (idempotentie)', () => {
  it('dezelfde invoer geeft byte-identieke serialisatie, ongeacht invoervolgorde', () => {
    const a = buildDeclaredMap(
      [
        { gtin: '0002', outcome: { kind: 'resolved', letter: 'C' } },
        { gtin: '0001', outcome: { kind: 'resolved', letter: 'D' } },
      ],
      FIXED_NOW
    );
    const b = buildDeclaredMap(
      [
        { gtin: '0001', outcome: { kind: 'resolved', letter: 'D' } },
        { gtin: '0002', outcome: { kind: 'resolved', letter: 'C' } },
      ],
      FIXED_NOW
    );
    expect(serializeDeclaredMap(a)).toBe(serializeDeclaredMap(b));
  });
});

describe('Story 12.15 — collectDeclaredMap (orchestratie, geïnjecteerde deps)', () => {
  it('resolveert per GTIN via de geïnjecteerde resolveMarks en bouwt de map', async () => {
    const marksByGtin: Record<string, DeclaredMark[]> = {
      '111': [mark('NutritionalScore', 'C')],
      '222': [mark('NutritionalScore', 'D')],
      '333': [mark('NutritionalScore', 'GENERAL_FOODS')], // leak -> geen-declaratie
    };
    const out = await collectDeclaredMap(
      {
        listGtins: async () => ['111', '222', '333'],
        resolveMarks: async (gtin) => marksByGtin[gtin] ?? [],
      },
      FIXED_NOW
    );
    expect(out.entries).toEqual({ '111': 'C', '222': 'D' });
    expect(out.summary.geenDeclaratie).toBe(1);
  });

  it('lege GTIN-lijst -> lege map, resolveMarks nooit aangeroepen', async () => {
    let calls = 0;
    const out = await collectDeclaredMap(
      {
        listGtins: async () => [],
        resolveMarks: async () => {
          calls += 1;
          return [];
        },
      },
      FIXED_NOW
    );
    expect(out.entries).toEqual({});
    expect(calls).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Code-review-bevinding (Blind Hunter): één falende lookup mag de hele
  // ~2000-GTIN-run niet laten afbreken zonder output.
  // -------------------------------------------------------------------------
  it('een falende resolveMarks voor ÉÉN GTIN gooit de hele run NIET omver — de rest wordt gewoon verwerkt', async () => {
    const out = await collectDeclaredMap(
      {
        listGtins: async () => ['111', '222', '333'],
        resolveMarks: async (gtin) => {
          if (gtin === '222') throw new Error('catalog 500 (transient)');
          return [mark('NutritionalScore', gtin === '111' ? 'C' : 'D')];
        },
      },
      FIXED_NOW
    );
    expect(out.entries).toEqual({ '111': 'C', '333': 'D' });
    expect(out.summary.fout).toBe(1);
    expect(out.summary.gtinsProcessed).toBe(3);
  });

  it('een niet-Error throw (bv. een string) wordt ook gevangen (nooit een onbehandelde crash)', async () => {
    const out = await collectDeclaredMap(
      {
        listGtins: async () => ['111'],
        resolveMarks: async () => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'boom';
        },
      },
      FIXED_NOW
    );
    expect(out.entries).toEqual({});
    expect(out.summary.fout).toBe(1);
  });
});
