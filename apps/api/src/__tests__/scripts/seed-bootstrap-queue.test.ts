/**
 * Story 17.2 AC1 — Bootstrap-wachtrij initiële vulling (seed).
 *
 * Test de PURE planning-helpers (planSeed/buildUniverse) zonder main() te draaien
 * (require.main-guard). Dekt: rangschikking op declaratiefrequentie, idempotentie
 * (tweede run wijzigt niets), status-guard (uitgesloten/run-status nooit terug),
 * niet-visuele codes → uitgesloten.
 */

import { describe, it, expect } from 'vitest';
import {
  planSeed,
  buildUniverse,
  type ExistingQueueRow,
} from '../../scripts/seed-bootstrap-queue';
import {
  frequencyForCode,
  isNonVisualCode,
} from '../../services/flywheel/bootstrap-frequency';

describe('Story 17.2 AC1 — planSeed (initiële vulling op declaratiefrequentie)', () => {
  it('nieuwe codes → insert, gesorteerd op frequentie aflopend', () => {
    const plan = planSeed(['EU_ORGANIC_FARMING', 'GREEN_DOT', 'TRIMAN'], []);
    // GREEN_DOT (11169) > TRIMAN (3886) > EU_ORGANIC_FARMING (1664).
    expect(plan.map((p) => p.t3777Code)).toEqual(['GREEN_DOT', 'TRIMAN', 'EU_ORGANIC_FARMING']);
    expect(plan.every((p) => p.action === 'insert')).toBe(true);
    expect(plan[0].declarationFrequency).toBe(frequencyForCode('GREEN_DOT'));
  });

  it('onbekende (staart-)code → insert met frequentie 0', () => {
    const plan = planSeed(['SOME_UNKNOWN_TAIL_CODE'], []);
    expect(plan[0]).toMatchObject({ action: 'insert', declarationFrequency: 0, status: 'wachtend' });
  });

  it('niet-visuele code → insert met status uitgesloten', () => {
    expect(isNonVisualCode('PREGNANCY_WARNING')).toBe(true);
    const plan = planSeed(['PREGNANCY_WARNING'], []);
    expect(plan[0]).toMatchObject({ action: 'insert', status: 'uitgesloten', nonVisual: true });
  });

  it('idempotentie: tweede run over gelijke frequentie → skip (geen mutatie)', () => {
    const existing: ExistingQueueRow[] = [
      { t3777Code: 'GREEN_DOT', status: 'wachtend', excluded: false, declarationFrequency: frequencyForCode('GREEN_DOT') },
    ];
    const plan = planSeed(['GREEN_DOT'], existing);
    expect(plan[0].action).toBe('skip');
  });

  it('verrijking: bestaande rij met verouderde frequentie → enrich (alleen frequentie)', () => {
    const existing: ExistingQueueRow[] = [
      { t3777Code: 'GREEN_DOT', status: 'wachtend', excluded: false, declarationFrequency: 0 },
    ];
    const plan = planSeed(['GREEN_DOT'], existing);
    expect(plan[0]).toMatchObject({ action: 'enrich', declarationFrequency: frequencyForCode('GREEN_DOT') });
  });

  it('status-guard: bestaande run-status (gevuld) → enrich frequentie maar status blijft, geen insert', () => {
    const existing: ExistingQueueRow[] = [
      { t3777Code: 'GREEN_DOT', status: 'gevuld', excluded: false, declarationFrequency: 0 },
    ];
    const plan = planSeed(['GREEN_DOT'], existing);
    // Alleen frequentie-verrijking; het plan raakt de status niet aan (main() update alleen declarationFrequency).
    expect(plan[0].action).toBe('enrich');
  });

  it('status-guard: uitgesloten rij → skip (nooit terug naar wachtend, geen frequentie-verrijking)', () => {
    const existing: ExistingQueueRow[] = [
      { t3777Code: 'GREEN_DOT', status: 'uitgesloten', excluded: true, declarationFrequency: 0 },
    ];
    const plan = planSeed(['GREEN_DOT'], existing);
    expect(plan[0].action).toBe('skip');
    expect(plan[0].status).toBe('uitgesloten');
  });
});

describe('Story 17.2 AC1 — buildUniverse (alle klassen zonder actieve referenties)', () => {
  it('bevat bekende frequentie-codes ∪ bestaande wachtrij-codes, minus actieve klassen', () => {
    const existing: ExistingQueueRow[] = [
      { t3777Code: 'CUSTOM_FR15_CODE', status: 'wachtend', excluded: false, declarationFrequency: 0 },
    ];
    const active = new Set<string>(['GREEN_DOT']); // GREEN_DOT heeft nu actieve referentie
    const universe = buildUniverse(existing, active);

    expect(universe).toContain('CUSTOM_FR15_CODE'); // uit bestaande wachtrij
    expect(universe).toContain('TRIMAN'); // uit frequentie-tabel
    expect(universe).not.toContain('GREEN_DOT'); // actief → uitgefilterd
  });
});
