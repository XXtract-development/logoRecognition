/**
 * Story 12.10 (AC1, AC2, AC5a) — code→field_type-resolutie.
 *
 * Dekt:
 *  - unieke code in een specifieke codelijst (DietType/GHS/ConsumerUsage/NutriScore);
 *  - code niet in een specifieke lijst → default T3777-bak;
 *  - AMBIGU + OPGELOST (real-world geval: NUTRISCORE_A zit ook in het T3777-
 *    default-universum) → primaire regel "specifiek wint van default" toegepast,
 *    gerapporteerd, WEL gezet;
 *  - AMBIGU + ONOPGELOST (twee specifieke codelijsten botsen, synthetisch via de
 *    geïnjecteerde classifyCode-lookups) → gerapporteerd, NIET gezet (fieldType null).
 */

import { describe, it, expect } from 'vitest';
import {
  resolveFieldType,
  classifyCode,
  DEFAULT_FIELD_TYPE,
  DEFAULT_GS1_FIELD,
  GS1_FIELD_BY_FIELD_TYPE,
} from '../../services/field-type-mapping';

describe('resolveFieldType (AC1) — unieke resoluties', () => {
  it('resolveert een DietTypeCode-code', () => {
    const r = resolveFieldType('VEGAN');
    expect(r).toMatchObject({
      fieldType: 'DietTypeCode',
      gs1Field: 'dietTypeCode',
      ambiguous: false,
      resolution: 'unique',
    });
  });

  it('resolveert een GHSSymbolDescriptionCode-code', () => {
    const r = resolveFieldType('SKULL_AND_CROSSBONES');
    expect(r.fieldType).toBe('GHSSymbolDescriptionCode');
    expect(r.gs1Field).toBe(GS1_FIELD_BY_FIELD_TYPE.GHSSymbolDescriptionCode);
    expect(r.ambiguous).toBe(false);
  });

  it('resolveert een EU_consumerUsageLabelCodeList-code', () => {
    const r = resolveFieldType('PREGNANCY_WARNING');
    expect(r.fieldType).toBe('EU_consumerUsageLabelCodeList');
    expect(r.gs1Field).toBe('enumerationValue');
  });

  it('normaliseert (trim + uppercase) vóór resolutie', () => {
    const r = resolveFieldType('  vegan  ');
    expect(r.code).toBe('VEGAN');
    expect(r.fieldType).toBe('DietTypeCode');
  });

  it('valt terug op de T3777-default voor een onbekende/keurmerk-code', () => {
    const r = resolveFieldType('RECYCLABLE_GENERAL_CLAIM');
    expect(r).toMatchObject({
      fieldType: DEFAULT_FIELD_TYPE,
      gs1Field: DEFAULT_GS1_FIELD,
      ambiguous: false,
      resolution: 'default',
    });
  });
});

describe('resolveFieldType (AC1/AC2) — ambigu, OPGELOST via primaire regel', () => {
  it('NUTRISCORE_A zit ook in het T3777-default-universum — specifiek wint, WEL gezet', () => {
    const r = resolveFieldType('NUTRISCORE_A');
    expect(r.ambiguous).toBe(true);
    expect(r.resolution).toBe('default-overlap-resolved');
    expect(r.fieldType).toBe('NutritionalScore');
    expect(r.gs1Field).toBe('nutritionalScore');
    expect(r.note).toMatch(/T3777-default-universum/);
  });

  it('FODMAP idem — DietTypeCode wint van de T3777-default', () => {
    const r = resolveFieldType('FODMAP');
    expect(r.ambiguous).toBe(true);
    expect(r.resolution).toBe('default-overlap-resolved');
    expect(r.fieldType).toBe('DietTypeCode');
  });
});

describe('classifyCode (AC2/AC5a) — ambigu, ONOPGELOST (niet gezet)', () => {
  it('een code in twee specifieke codelijsten wordt gerapporteerd maar NIET gezet', () => {
    const r = classifyCode(
      'SYNTHETIC_CLASH',
      () => ['DietTypeCode', 'GHSSymbolDescriptionCode'],
      () => false
    );
    expect(r.ambiguous).toBe(true);
    expect(r.resolution).toBe('unresolved');
    expect(r.fieldType).toBeNull();
    expect(r.gs1Field).toBeNull();
    expect(r.note).toMatch(/handmatige beslissing nodig/);
  });

  it('een code in exact één lijst is nooit "unresolved", ook niet met een overlap-flag', () => {
    const r = classifyCode(
      'SINGLE',
      () => ['DietTypeCode'],
      () => true
    );
    expect(r.resolution).toBe('default-overlap-resolved');
    expect(r.fieldType).toBe('DietTypeCode');
  });

  it('geen specifieke match → default, ongeacht de overlap-lookup', () => {
    const r = classifyCode(
      'NOTHING',
      () => [],
      () => true
    );
    expect(r.resolution).toBe('default');
    expect(r.fieldType).toBe(DEFAULT_FIELD_TYPE);
  });
});
