/**
 * Story 12.10 (AC1, AC2, AC5b) — backfill reference_logos.field_type/gs1_field.
 *
 * Test de PURE planning-helpers (`planBackfill`/`ambiguousItems`) zonder main()
 * te draaien (require.main-guard, patroon `seed-bootstrap-queue.test.ts`). Dekt:
 * dry-run-plan berekent updates uit de huidige (foute) waarden, rijen die al
 * correct staan blijven `skip-unchanged` (idempotentie — een tweede plan op de
 * bijgewerkte staat levert NUL updates op), en een onopgeloste ambigue code wordt
 * gerapporteerd maar NIET in het update-plan gezet.
 */

import { describe, it, expect } from 'vitest';
import {
  planBackfill,
  ambiguousItems,
  type ReferenceLogoRow,
} from '../../scripts/backfill-reference-logo-field-type';

describe('planBackfill (AC1/AC5b) — plan uit de huidige (foute) staat', () => {
  it('een echte NutriScore-crop op de default-bak wordt gepland naar NutritionalScore', () => {
    const rows: ReferenceLogoRow[] = [
      { id: 'r1', t3777Code: 'NUTRISCORE_A', fieldType: 'PackagingMarkedLabelAccreditationCode', gs1Field: null },
    ];
    const plan = planBackfill(rows);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      action: 'update',
      targetFieldType: 'NutritionalScore',
      targetGs1Field: 'nutritionalScore',
    });
    expect(plan[0].resolution.ambiguous).toBe(true);
  });

  it('een DietType-crop (VEGAN) op de default-bak wordt gepland naar DietTypeCode', () => {
    const rows: ReferenceLogoRow[] = [
      { id: 'r2', t3777Code: 'VEGAN', fieldType: 'PackagingMarkedLabelAccreditationCode', gs1Field: null },
    ];
    const plan = planBackfill(rows);
    expect(plan[0]).toMatchObject({ action: 'update', targetFieldType: 'DietTypeCode', targetGs1Field: 'dietTypeCode' });
  });

  it('een rij die al correct staat blijft skip-unchanged (geen write nodig)', () => {
    const rows: ReferenceLogoRow[] = [
      { id: 'r3', t3777Code: 'GREEN_DOT', fieldType: 'PackagingMarkedLabelAccreditationCode', gs1Field: 'packagingMarkedLabelAccreditationCode' },
    ];
    const plan = planBackfill(rows);
    expect(plan[0].action).toBe('skip-unchanged');
  });

  it('IDEMPOTENTIE (AC5b): het plan toegepast + opnieuw gepland levert NUL updates op', () => {
    const rows: ReferenceLogoRow[] = [
      { id: 'r1', t3777Code: 'NUTRISCORE_A', fieldType: 'PackagingMarkedLabelAccreditationCode', gs1Field: null },
      { id: 'r2', t3777Code: 'VEGAN', fieldType: 'PackagingMarkedLabelAccreditationCode', gs1Field: null },
    ];
    const firstPlan = planBackfill(rows);
    expect(firstPlan.every((p) => p.action === 'update')).toBe(true);

    // Simuleer de --apply-write: elke rij krijgt zijn target-waarden.
    const appliedRows: ReferenceLogoRow[] = firstPlan.map((p) => ({
      id: p.id,
      t3777Code: p.t3777Code,
      fieldType: p.targetFieldType as string,
      gs1Field: p.targetGs1Field,
    }));

    const secondPlan = planBackfill(appliedRows);
    expect(secondPlan.every((p) => p.action === 'skip-unchanged')).toBe(true);
  });
});

describe('planBackfill (AC2) — onopgeloste ambiguïteit wordt NIET gezet', () => {
  it('gebruikt classifyCode-achtig gedrag via de echte resolveFieldType (geen synthetisch echt geval vandaag) — regressie: geen enkele echte code resolveert vandaag naar unresolved', () => {
    // Documentatie-test: met de huidige statische data is er GEEN "twee specifieke
    // codelijsten botsen"-geval (zie field-type-mapping.test.ts voor de synthetische
    // dekking van die tak via classifyCode). Dit bevestigt dat een normale run geen
    // rijen ongepland laat staan die WEL een eenduidige regel hebben.
    const rows: ReferenceLogoRow[] = [
      { id: 'r1', t3777Code: 'HALAL_CORRECT', fieldType: 'PackagingMarkedLabelAccreditationCode', gs1Field: null },
    ];
    const plan = planBackfill(rows);
    expect(plan[0].action).not.toBe('skip-ambiguous-unresolved');
  });
});

describe('ambiguousItems (AC1/AC2/AC6) — ambigu-rapport', () => {
  it('filtert alleen de ambigue plan-items (opgelost én onopgelost)', () => {
    const rows: ReferenceLogoRow[] = [
      { id: 'r1', t3777Code: 'NUTRISCORE_A', fieldType: 'PackagingMarkedLabelAccreditationCode', gs1Field: null },
      { id: 'r2', t3777Code: 'GREEN_DOT', fieldType: 'PackagingMarkedLabelAccreditationCode', gs1Field: 'packagingMarkedLabelAccreditationCode' },
    ];
    const plan = planBackfill(rows);
    const ambiguous = ambiguousItems(plan);
    expect(ambiguous.map((a) => a.t3777Code)).toEqual(['NUTRISCORE_A']);
  });
});
