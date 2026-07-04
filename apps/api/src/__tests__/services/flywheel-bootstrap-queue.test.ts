/**
 * Story 17.2 — Bootstrap-wachtrij: prioritering en beheer (FR-13).
 *
 * AC→test-mapping (zie ac-trace-17-2.md):
 *   AC1 (seed) → flywheel-seed-bootstrap-queue.test.ts (planSeed idempotentie +
 *                status-guard + niet-visueel).
 *   AC2 (volgorde + mutaties + logging) → dit bestand:
 *                'effectiveQueueOrder' (override > frequentie > deterministisch) +
 *                'mutaties' (override/excluded/add + audit-logging via threshold_changes).
 *   AC3 (nieuw geactiveerde klasse, read-side) → 'determineNewlyActivatedCodes'.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import prisma from '../../core/db';
import {
  effectiveQueueOrder,
  determineNewlyActivatedCodes,
  getBootstrapQueue,
  setPriorityOverride,
  setExcluded,
  addClass,
  bootstrapAuditKeyForCode,
  BootstrapQueueCodeNotFoundError,
  BootstrapQueueInvalidCodeError,
  type SortableQueueRow,
} from '../../services/flywheel/bootstrap-queue';

const mockPrisma = prisma as unknown as Record<string, any>;

afterAll(() => {
  vi.clearAllMocks();
});

// ── AC2: effectieve volgorde (pure) ──────────────────────────────────────────

describe('Story 17.2 AC2 — effectiveQueueOrder (override > frequentie > deterministisch)', () => {
  const row = (t3777Code: string, declarationFrequency: number, priorityOverride: number | null = null): SortableQueueRow => ({
    t3777Code,
    declarationFrequency,
    priorityOverride,
  });

  it('sorteert op frequentie aflopend zonder overrides', () => {
    const out = effectiveQueueOrder([row('A', 10), row('B', 100), row('C', 50)]);
    expect(out.map((r) => r.t3777Code)).toEqual(['B', 'C', 'A']);
  });

  it('override wint van frequentie (override-rijen eerst, onderling aflopend)', () => {
    const out = effectiveQueueOrder([
      row('HIGHFREQ', 9999),
      row('OV1', 1, 5),
      row('OV2', 1, 10),
    ]);
    expect(out.map((r) => r.t3777Code)).toEqual(['OV2', 'OV1', 'HIGHFREQ']);
  });

  it('gelijke frequentie → deterministisch alfabetisch op code', () => {
    const out = effectiveQueueOrder([row('ZED', 50), row('ALPHA', 50), row('MID', 50)]);
    expect(out.map((r) => r.t3777Code)).toEqual(['ALPHA', 'MID', 'ZED']);
  });

  it('muteert de invoer niet', () => {
    const input = [row('A', 10), row('B', 100)];
    const snapshot = input.map((r) => r.t3777Code);
    effectiveQueueOrder(input);
    expect(input.map((r) => r.t3777Code)).toEqual(snapshot);
  });
});

// ── AC3: nieuw geactiveerde klasse (read-side) ───────────────────────────────

describe('Story 17.2 AC3 — determineNewlyActivatedCodes (read-side)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lege invoer → geen query, lege set', async () => {
    const out = await determineNewlyActivatedCodes([]);
    expect(out.size).toBe(0);
    expect(mockPrisma.referenceCandidate.findMany).not.toHaveBeenCalled();
  });

  it('code met actieve bootstrap-promotie → wél nieuw geactiveerd, met promotie-batch-id (AC4)', async () => {
    mockPrisma.referenceCandidate.findMany.mockResolvedValue([
      { t3777Code: 'FILLED', promotionBatchId: 'batch-uuid-1' },
    ]);
    const out = await determineNewlyActivatedCodes(['FILLED']);
    expect(out.has('FILLED')).toBe(true);
    // AC4: het doorklik-doel is het promotie-batch-id (UUID), niet de T3777-code.
    expect(out.get('FILLED')).toBe('batch-uuid-1');
    // Query eist origin=bootstrap + actieve, via-promotie referentie (AC3-contract)
    // en selecteert het batch-id, nieuwste eerst (AC4-doorklik-doel).
    const arg = mockPrisma.referenceCandidate.findMany.mock.calls[0][0];
    expect(arg.where.origin).toBe('bootstrap');
    expect(arg.where.referenceLogo).toEqual({ active: true, source: 'flywheel-promotion' });
    expect(arg.where.t3777Code).toEqual({ in: ['FILLED'] });
    expect(arg.select.promotionBatchId).toBe(true);
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('meerdere promoties per code → nieuwste batch wint (AC4)', async () => {
    // Nieuwste eerst (orderBy createdAt desc); de eerste rij per code wint.
    mockPrisma.referenceCandidate.findMany.mockResolvedValue([
      { t3777Code: 'FILLED', promotionBatchId: 'batch-new' },
      { t3777Code: 'FILLED', promotionBatchId: 'batch-old' },
    ]);
    const out = await determineNewlyActivatedCodes(['FILLED']);
    expect(out.get('FILLED')).toBe('batch-new');
  });

  it('code zonder actieve bootstrap-promotie → NIET nieuw geactiveerd', async () => {
    mockPrisma.referenceCandidate.findMany.mockResolvedValue([]);
    const out = await determineNewlyActivatedCodes(['FILLED']);
    expect(out.has('FILLED')).toBe(false);
  });
});

// ── AC2/AC3: GET-view ────────────────────────────────────────────────────────

describe('Story 17.2 AC2/AC3 — getBootstrapQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('levert rijen in effectieve volgorde + newlyActivated-markering', async () => {
    mockPrisma.bootstrapQueue.findMany.mockResolvedValue([
      { t3777Code: 'LOW', status: 'wachtend', declarationFrequency: 10, priorityOverride: null, excluded: false, lastRunAt: null, createdAt: new Date('2026-07-01') },
      { t3777Code: 'FILLED', status: 'gevuld', declarationFrequency: 5, priorityOverride: null, excluded: false, lastRunAt: new Date('2026-07-02'), createdAt: new Date('2026-07-01') },
      { t3777Code: 'HIGH', status: 'wachtend', declarationFrequency: 100, priorityOverride: null, excluded: false, lastRunAt: null, createdAt: new Date('2026-07-01') },
    ]);
    mockPrisma.referenceCandidate.findMany.mockResolvedValue([
      { t3777Code: 'FILLED', promotionBatchId: 'batch-uuid-1' },
    ]);

    const view = await getBootstrapQueue();
    expect(view.items.map((i) => i.t3777Code)).toEqual(['HIGH', 'LOW', 'FILLED']);
    expect(view.newlyActivatedCodes).toEqual(['FILLED']);
    const filled = view.items.find((i) => i.t3777Code === 'FILLED')!;
    expect(filled.newlyActivated).toBe(true);
    // AC4: de view draagt het promotie-batch-id voor de doorklik.
    expect(filled.activatedBatchId).toBe('batch-uuid-1');
    // Niet-geactiveerde rijen dragen geen batch-id.
    expect(view.items.find((i) => i.t3777Code === 'HIGH')!.activatedBatchId).toBeNull();
  });
});

// ── AC2: mutaties + audit-logging ────────────────────────────────────────────

describe('Story 17.2 AC2 — mutaties (override/excluded/add) + audit-logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.bootstrapQueue.update.mockResolvedValue({
      t3777Code: 'A', status: 'wachtend', declarationFrequency: 50, priorityOverride: 7, excluded: false, lastRunAt: null, createdAt: new Date('2026-07-01'),
    });
  });

  it('setPriorityOverride zet override + logt de mutatie (gebruiker + tijdstempel)', async () => {
    mockPrisma.bootstrapQueue.findUnique.mockResolvedValue({
      t3777Code: 'A', status: 'wachtend', declarationFrequency: 50, priorityOverride: null, excluded: false,
    });
    await setPriorityOverride('A', 7, 'user-1');

    expect(mockPrisma.bootstrapQueue.update).toHaveBeenCalledWith({
      where: { t3777Code: 'A' },
      data: { priorityOverride: 7 },
    });
    expect(mockPrisma.thresholdChange.create).toHaveBeenCalledOnce();
    const log = mockPrisma.thresholdChange.create.mock.calls[0][0].data;
    expect(log.thresholdKey).toBe(bootstrapAuditKeyForCode('A'));
    expect(log.userId).toBe('user-1');
    expect(log.reason).toBe('override-gezet');
    expect(log.newValue).toBe('7');
  });

  it('setPriorityOverride(null) wist de override + logt override-gewist', async () => {
    mockPrisma.bootstrapQueue.findUnique.mockResolvedValue({
      t3777Code: 'A', status: 'wachtend', declarationFrequency: 50, priorityOverride: 7, excluded: false,
    });
    await setPriorityOverride('A', null, 'user-1');
    const log = mockPrisma.thresholdChange.create.mock.calls[0][0].data;
    expect(log.reason).toBe('override-gewist');
    expect(log.newValue).toBe('(geen)');
  });

  it('setExcluded(true) zet excluded + status uitgesloten + logt', async () => {
    mockPrisma.bootstrapQueue.findUnique.mockResolvedValue({
      t3777Code: 'A', status: 'wachtend', declarationFrequency: 50, priorityOverride: null, excluded: false,
    });
    await setExcluded('A', true, 'user-1');
    expect(mockPrisma.bootstrapQueue.update).toHaveBeenCalledWith({
      where: { t3777Code: 'A' },
      data: { excluded: true, status: 'uitgesloten' },
    });
    const log = mockPrisma.thresholdChange.create.mock.calls[0][0].data;
    expect(log.reason).toBe('uitgesloten');
  });

  it('setExcluded(false) includeert weer → status wachtend', async () => {
    mockPrisma.bootstrapQueue.findUnique.mockResolvedValue({
      t3777Code: 'A', status: 'uitgesloten', declarationFrequency: 50, priorityOverride: null, excluded: true,
    });
    await setExcluded('A', false, 'user-1');
    expect(mockPrisma.bootstrapQueue.update).toHaveBeenCalledWith({
      where: { t3777Code: 'A' },
      data: { excluded: false, status: 'wachtend' },
    });
  });

  it('mutatie op onbekende code → BootstrapQueueCodeNotFoundError', async () => {
    mockPrisma.bootstrapQueue.findUnique.mockResolvedValue(null);
    await expect(setPriorityOverride('NOPE', 1, 'user-1')).rejects.toBeInstanceOf(
      BootstrapQueueCodeNotFoundError
    );
    await expect(setExcluded('NOPE', true, 'user-1')).rejects.toBeInstanceOf(
      BootstrapQueueCodeNotFoundError
    );
  });

  it('addClass voegt een nieuwe klasse toe (status wachtend) + logt', async () => {
    mockPrisma.bootstrapQueue.findUnique.mockResolvedValue(null);
    mockPrisma.bootstrapQueue.create.mockResolvedValue({
      t3777Code: 'NEW', status: 'wachtend', declarationFrequency: 42, priorityOverride: null, excluded: false, lastRunAt: null, createdAt: new Date('2026-07-03'),
    });
    const item = await addClass('NEW', 42, 'user-1');
    expect(item.t3777Code).toBe('NEW');
    expect(mockPrisma.bootstrapQueue.create).toHaveBeenCalledOnce();
    const log = mockPrisma.thresholdChange.create.mock.calls[0][0].data;
    expect(log.reason).toBe('klasse-toegevoegd');
  });

  it('addClass idempotent: bestaande code → geen create, geen overschrijving', async () => {
    mockPrisma.bootstrapQueue.findUnique.mockResolvedValue({
      t3777Code: 'EXISTS', status: 'gevuld', declarationFrequency: 5, priorityOverride: 3, excluded: false, lastRunAt: null, createdAt: new Date('2026-07-01'),
    });
    const item = await addClass('EXISTS', 999, 'user-1');
    expect(mockPrisma.bootstrapQueue.create).not.toHaveBeenCalled();
    expect(item.status).toBe('gevuld');
    expect(item.declarationFrequency).toBe(5); // niet overschreven
  });

  it('addClass met lege code → BootstrapQueueInvalidCodeError', async () => {
    await expect(addClass('  ', 1, 'user-1')).rejects.toBeInstanceOf(
      BootstrapQueueInvalidCodeError
    );
  });
});
