/**
 * Story 20.19 — toetsen op de geoogste momentopname en op de uitlezer die hem maakt.
 *
 * Twee zorgen, bewust gescheiden:
 *   1. `extractMarks` haalt de juiste waarden uit de werkelijke documentstructuur;
 *   2. het gecommitte bestand is intern consistent (meta klopt met de inhoud, geen
 *      lege codes, geen dubbele paren, geen onbekende fieldTypes).
 *
 * De opstelling hieronder volgt de ECHTE nesting uit `application.tradeItems`, met
 * de paden zoals ze op 19 augustus 2026 in de productiedocumenten stonden:
 * `{module}.group[0].fields[0][0].fields[N][0].fields[M]`, waarbij elke knoop
 * `meta.gdsn`, `meta.xpath`, `value`, `oldValue` en `remark` draagt. Een vast pad
 * werkt daarom niet — de uitlezer moet de boom aflopen.
 */

import { describe, expect, it } from 'vitest';

import {
  extractMarks,
  GDSN_TO_FIELD_TYPE,
  type TradeItemDocument,
} from '../../../scripts/harvest-tradeitem-snapshot';
import {
  CONSUMER_USAGE_FIELD_TYPE,
  MARK_FIELDS,
  nutriscoreDeclaredCodes,
} from '../../services/t3777-declarations';
import {
  TRADEITEM_SNAPSHOT,
  TRADEITEM_SNAPSHOT_META,
} from '../../services/tradeitem-declaration-snapshot';

/**
 * De gemeten werkelijkheid van 19 augustus 2026, vier keer onafhankelijk geteld
 * (twee keer in de database, twee keer in de client). Deze getallen staan hier
 * LETTERLIJK en niet afgeleid uit de meta van het bestand: anders toetst de meta
 * zichzelf en haalt een oogst die de helft van de sleutels verliest deze toetsen
 * glansrijk.
 */
const GEMETEN = {
  keys: 442,
  withMarks: 238,
  empty: 204,
  markInstances: 475,
  uniquePairs: 52,
  packagingInstances: 292,
  packagingProducts: 177,
  targetMarket: '528',
} as const;

/** Bouwt een knoop in de vorm die de echte documenten hebben. */
function node(gdsn: string, xpath: string, value: string, oldValue = ''): Record<string, unknown> {
  return { meta: { gdsn, xpath }, xpath, oldValue, remark: '', value };
}

/** Verpakt knopen in de onregelmatige nesting van een echte module. */
function moduleWith(...nodes: Array<Record<string, unknown>>): Record<string, unknown> {
  return { group: [{ fields: [[{ fields: nodes.map((n) => [{ fields: [n] }]) }]] }] };
}

const PM_XPATH =
  "//*[local-name()='packagingMarkingModule']/packagingMarking/packagingMarkedLabelAccreditationCode";
const DIET_XPATH =
  "//*[local-name()='dietInformationModule']/dietInformation/dietTypeInformation/dietTypeCode";
const SCORE_XPATH =
  "//*[local-name()='healthRelatedInformationModule']/healthRelatedInformation/nutritionalProgram/nutritionalScore";
const USAGE_XPATH =
  "//*[local-name()='consumerInstructionsModule']/consumerInstructions/consumerUsageLabelCode/enumerationValueInformation/enumerationValue";

describe('extractMarks — uitlezen uit de werkelijke documentstructuur', () => {
  it('vindt waarden die diep en onregelmatig genest zitten', () => {
    const doc: TradeItemDocument = {
      _id: '8712423032132-07611480011566-528',
      packagingMarkingModule: moduleWith(
        node('packagingMarkedLabelAccreditationCode', PM_XPATH, 'GREEN_DOT')
      ),
      dietInformationModule: moduleWith(node('dietTypeCode', DIET_XPATH, 'VEGAN')),
      healthRelatedInformationModule: moduleWith(node('nutritionalScore', SCORE_XPATH, 'A')),
    };

    expect(extractMarks(doc)).toEqual([
      { fieldType: 'DietTypeCode', code: 'VEGAN' },
      { fieldType: 'NutritionalScore', code: 'A' },
      { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    ]);
  });

  it('trimt en zet om naar hoofdletters, net als parseDeclaredMarks', () => {
    const doc: TradeItemDocument = {
      _id: 'x',
      packagingMarkingModule: moduleWith(
        node('packagingMarkedLabelAccreditationCode', PM_XPATH, '  triman \n')
      ),
    };

    expect(extractMarks(doc)).toEqual([
      { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
    ]);
  });

  it('ontdubbelt per (fieldType, code) — dezelfde code in twee verpakkingslagen telt één keer', () => {
    const doc: TradeItemDocument = {
      _id: 'x',
      packagingMarkingModule: moduleWith(
        node('packagingMarkedLabelAccreditationCode', PM_XPATH, 'TRIMAN'),
        node('packagingMarkedLabelAccreditationCode', PM_XPATH, 'triman')
      ),
    };

    expect(extractMarks(doc)).toHaveLength(1);
  });

  it('houdt dezelfde code onder twee verschillende fieldTypes wél apart', () => {
    const doc: TradeItemDocument = {
      _id: 'x',
      packagingMarkingModule: moduleWith(
        node('packagingMarkedLabelAccreditationCode', PM_XPATH, 'X1')
      ),
      dietInformationModule: moduleWith(node('dietTypeCode', DIET_XPATH, 'X1')),
    };

    expect(extractMarks(doc)).toEqual([
      { fieldType: 'DietTypeCode', code: 'X1' },
      { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'X1' },
    ]);
  });

  it('slaat lege waarden over — 204 van de 442 producten bestaan uit niets anders', () => {
    const doc: TradeItemDocument = {
      _id: 'x',
      packagingMarkingModule: moduleWith(
        node('packagingMarkedLabelAccreditationCode', PM_XPATH, '')
      ),
      dietInformationModule: moduleWith(node('dietTypeCode', DIET_XPATH, '   ')),
    };

    expect(extractMarks(doc)).toEqual([]);
  });

  it('negeert oldValue, ook als value leeg is', () => {
    // 17 code-instanties staan uitsluitend in oldValue. Dat is een VÓRIGE waarde;
    // als declaratie gebruiken levert valse akkoorden in de kruischeck op.
    const doc: TradeItemDocument = {
      _id: 'x',
      packagingMarkingModule: moduleWith(
        node('packagingMarkedLabelAccreditationCode', PM_XPATH, '', 'FSC_MIX')
      ),
    };

    expect(extractMarks(doc)).toEqual([]);
  });

  it('neemt enumerationValue alleen binnen consumerUsageLabelCode', () => {
    const binnen: TradeItemDocument = {
      _id: 'x',
      consumerInstructionsModule: moduleWith(node('enumerationValue', USAGE_XPATH, 'AISE_1')),
    };
    const buiten: TradeItemDocument = {
      _id: 'y',
      andereModule: moduleWith(
        node('enumerationValue', "//*[local-name()='ietsAnders']/enumerationValue", 'AISE_1')
      ),
    };

    expect(extractMarks(binnen)).toEqual([
      { fieldType: 'EU_consumerUsageLabelCodeList', code: 'AISE_1' },
    ]);
    expect(extractMarks(buiten)).toEqual([]);
  });

  it('valt niet over een knoop zonder meta, of met een niet-tekstuele value', () => {
    const doc: TradeItemDocument = {
      _id: 'x',
      losseTroep: [{ geen: 'meta' }, null, 42, 'tekst'],
      packagingMarkingModule: moduleWith({
        meta: { gdsn: 'packagingMarkedLabelAccreditationCode', xpath: PM_XPATH },
        value: 42,
      }),
    };

    expect(extractMarks(doc)).toEqual([]);
  });
});

describe('de veldtabel van de generator is vastgepind op de XML-route', () => {
  // Het oogstscript waarschuwt hier zelf voor: wijkt deze map af van MARK_FIELDS,
  // dan koppelen geoogste marks niet aan een logo. Zonder deze toets drijft die
  // afwijking mee in plaats van dat hij gevangen wordt.
  it('kent exact dezelfde gdsn-naam -> fieldType-paren als de XML-route', () => {
    const uitDeXmlRoute: Record<string, string> = {};
    for (const field of MARK_FIELDS) uitDeXmlRoute[field.tag] = field.fieldType;
    uitDeXmlRoute.enumerationValue = CONSUMER_USAGE_FIELD_TYPE;

    expect(GDSN_TO_FIELD_TYPE).toEqual(uitDeXmlRoute);
  });
});

describe('de gecommitte momentopname klopt met de meting', () => {
  const entries = Object.entries(TRADEITEM_SNAPSHOT);
  const knownFieldTypes = new Set(Object.values(GDSN_TO_FIELD_TYPE));

  it('draagt de gemeten aantallen, niet slechts zijn eigen meta', () => {
    const withMarks = entries.filter(([, marks]) => marks.length > 0);
    const perFieldType: Record<string, number> = {};
    const pairs = new Set<string>();
    let total = 0;
    for (const [, marks] of entries) {
      for (const mark of marks) {
        total += 1;
        perFieldType[mark.fieldType] = (perFieldType[mark.fieldType] ?? 0) + 1;
        pairs.add(`${mark.fieldType}|${mark.code}`);
      }
    }
    const packagingProducts = entries.filter(([, marks]) =>
      marks.some((m) => m.fieldType === 'PackagingMarkedLabelAccreditationCode')
    );

    expect(entries).toHaveLength(GEMETEN.keys);
    expect(withMarks).toHaveLength(GEMETEN.withMarks);
    expect(entries.length - withMarks.length).toBe(GEMETEN.empty);
    expect(total).toBe(GEMETEN.markInstances);
    expect(pairs.size).toBe(GEMETEN.uniquePairs);
    expect(perFieldType.PackagingMarkedLabelAccreditationCode).toBe(GEMETEN.packagingInstances);
    // De opbrengst die AC4 aan de automatische bevestiging belooft.
    expect(packagingProducts).toHaveLength(GEMETEN.packagingProducts);
  });

  it('heeft een meta die de inhoud eerlijk beschrijft', () => {
    // De meta blijft nuttig — hij wordt gelezen door de indexbouwer — maar hij
    // wordt hier tegen de GEMETEN waarheid gehouden, niet tegen zichzelf.
    expect(TRADEITEM_SNAPSHOT_META.keys).toBe(GEMETEN.keys);
    expect(TRADEITEM_SNAPSHOT_META.keysWithMarks).toBe(GEMETEN.withMarks);
    expect(TRADEITEM_SNAPSHOT_META.markInstances).toBe(GEMETEN.markInstances);
    expect(TRADEITEM_SNAPSHOT_META.targetMarket).toBe(GEMETEN.targetMarket);
    expect(TRADEITEM_SNAPSHOT_META.instancesByFieldType.PackagingMarkedLabelAccreditationCode).toBe(
      GEMETEN.packagingInstances
    );
  });

  it('gaat over een doelmarkt, en elke sleutel eindigt erop', () => {
    // Staat T3777_TARGET_MARKET ooit op iets anders, dan mist elke opzoeking
    // stilzwijgend. De momentopname is dus doelmarkt-gebonden en zegt dat ook.
    for (const id of Object.keys(TRADEITEM_SNAPSHOT)) {
      expect(
        id.endsWith(`-${TRADEITEM_SNAPSHOT_META.targetMarket}`),
        `andere doelmarkt: ${id}`
      ).toBe(true);
    }
  });

  it('levert Nutri-Score-codes in de vorm waar de kruischeck op rekent', () => {
    // nutriscoreDeclaredCodes accepteert uitsluitend een kale letter A-E.
    const scores = entries.flatMap(([, marks]) =>
      marks.filter((m) => m.fieldType === 'NutritionalScore')
    );
    expect(scores.length).toBeGreaterThan(0);
    for (const score of scores) expect(score.code).toMatch(/^[A-E]$/);
    expect(nutriscoreDeclaredCodes([...scores])).not.toHaveLength(0);
  });

  it('kent geen lege codes en geen onbekende fieldTypes', () => {
    for (const [id, marks] of entries) {
      for (const mark of marks) {
        expect(mark.code, `lege code bij ${id}`).not.toBe('');
        expect(mark.code, `code niet genormaliseerd bij ${id}`).toBe(
          mark.code.trim().toUpperCase()
        );
        expect(
          knownFieldTypes.has(mark.fieldType),
          `onbekend fieldType ${mark.fieldType} bij ${id}`
        ).toBe(true);
      }
    }
  });

  it('kent geen dubbele (fieldType, code)-paren binnen één sleutel', () => {
    for (const [id, marks] of entries) {
      const pairs = marks.map((m) => `${m.fieldType}|${m.code}`);
      expect(new Set(pairs).size, `dubbel paar bij ${id}`).toBe(pairs.length);
    }
  });

  it('heeft sleutels in de vorm {gln}-{gtin}-{targetMarket}', () => {
    for (const id of Object.keys(TRADEITEM_SNAPSHOT)) {
      expect(id, `sleutelvorm klopt niet: ${id}`).toMatch(/^\d+-\d+-\d+$/);
    }
  });

  it('draagt een oogstdatum, zodat de veroudering afleesbaar is', () => {
    expect(TRADEITEM_SNAPSHOT_META.harvestedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
