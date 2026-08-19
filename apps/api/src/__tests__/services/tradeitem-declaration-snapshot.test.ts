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
  TRADEITEM_SNAPSHOT,
  TRADEITEM_SNAPSHOT_META,
} from '../../services/tradeitem-declaration-snapshot';

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
      healthRelatedInformationModule: moduleWith(
        node('nutritionalScore', SCORE_XPATH, 'NUTRISCORE_A')
      ),
    };

    expect(extractMarks(doc)).toEqual([
      { fieldType: 'DietTypeCode', code: 'VEGAN' },
      { fieldType: 'NutritionalScore', code: 'NUTRISCORE_A' },
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

describe('de gecommitte momentopname is intern consistent', () => {
  const entries = Object.entries(TRADEITEM_SNAPSHOT);
  const knownFieldTypes = new Set(Object.values(GDSN_TO_FIELD_TYPE));

  it('bevat het aantal sleutels dat de meta belooft', () => {
    expect(entries).toHaveLength(TRADEITEM_SNAPSHOT_META.keys);
  });

  it('telt evenveel sleutels met keurmerk als de meta belooft', () => {
    const withMarks = entries.filter(([, marks]) => marks.length > 0);
    expect(withMarks).toHaveLength(TRADEITEM_SNAPSHOT_META.keysWithMarks);
  });

  it('telt evenveel code-instanties als de meta belooft, ook per veldsoort', () => {
    const perFieldType: Record<string, number> = {};
    let total = 0;
    for (const [, marks] of entries) {
      for (const mark of marks) {
        total += 1;
        perFieldType[mark.fieldType] = (perFieldType[mark.fieldType] ?? 0) + 1;
      }
    }

    expect(total).toBe(TRADEITEM_SNAPSHOT_META.markInstances);
    for (const [fieldType, expected] of Object.entries(
      TRADEITEM_SNAPSHOT_META.instancesByFieldType
    )) {
      expect(perFieldType[fieldType] ?? 0).toBe(expected);
    }
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
