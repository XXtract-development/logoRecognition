/**
 * Story 16.2 — Gedeclareerd-niet-gevonden wordt werkvoorraad (FR-15).
 *
 * AC→test-mapping (zie ac-trace-16-2.md):
 *   AC2  → describe 'aggregateDeclaredNotFound (pure drempel + routering)' (N×M-matrix,
 *          wachtrij-vs-aanvul-routering, vermengde codes) + 'runMismatchWorkloadAggregation'
 *          (routering + upsert + idempotentie + excluded-guard).
 *   AC3  → describe 'getWorkloadItemTraceability (herleidbaarheid naar GTINs)'.
 *   AC4  → dit hele bestand (unit) + de integratie-achtige mock-driven runs hieronder.
 *
 * AC1 (migratie + down-script) is een niet-code-AC: geverifieerd via de migratie-
 * bestanden (0019_add_bootstrap_queue/{migration,down}.sql) + `prisma migrate status`
 * lokaal toegepast. Zie ac-trace-16-2.md.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import prisma from '../../core/db';
import {
  aggregateDeclaredNotFound,
  runMismatchWorkloadAggregation,
  getWorkloadItemTraceability,
  type DeclaredNotFoundEvent,
  type StructuralThresholds,
} from '../../services/flywheel/mismatch-workload';
import { getStructuralN, getStructuralM } from '../../services/flywheel/config';
import { getBootstrapQueueOverview } from '../../services/flywheel/overview/overview-bootstrap-queue';

const mockPrisma = prisma as unknown as Record<string, any>;

/** Bouw N events voor één code, verdeeld over `distinctGtins` verschillende GTINs. */
function eventsFor(
  code: string,
  eventCount: number,
  distinctGtins: number
): DeclaredNotFoundEvent[] {
  const rows: DeclaredNotFoundEvent[] = [];
  for (let i = 0; i < eventCount; i++) {
    rows.push({ t3777Code: code, gtin: `gtin-${i % distinctGtins}` });
  }
  return rows;
}

const DEFAULTS: StructuralThresholds = { n: 10, m: 5 };

describe('Story 16.2 AC2 — aggregateDeclaredNotFound (pure drempel + routering)', () => {
  it('9 events / 5 GTINs → niets (onder N)', () => {
    const items = aggregateDeclaredNotFound(eventsFor('A', 9, 5), new Set(), DEFAULTS);
    expect(items).toEqual([]);
  });

  it('10 events / 4 GTINs → niets (onder M)', () => {
    const items = aggregateDeclaredNotFound(eventsFor('A', 10, 4), new Set(), DEFAULTS);
    expect(items).toEqual([]);
  });

  it('10 events / 5 GTINs → precies de drempel gehaald (INCLUSIEF ≥) → item', () => {
    const items = aggregateDeclaredNotFound(eventsFor('A', 10, 5), new Set(), DEFAULTS);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      t3777Code: 'A',
      eventCount: 10,
      distinctGtins: 5,
      route: 'bootstrap-queue',
    });
  });

  it('ruim boven de drempel → item', () => {
    const items = aggregateDeclaredNotFound(eventsFor('A', 30, 12), new Set(), DEFAULTS);
    expect(items[0]).toMatchObject({ eventCount: 30, distinctGtins: 12 });
  });

  it('code MET actieve referenties → aanvul-signaal (zwakke dekking)', () => {
    const items = aggregateDeclaredNotFound(
      eventsFor('A', 15, 6),
      new Set(['A']),
      DEFAULTS
    );
    expect(items[0].route).toBe('aanvul-signaal');
  });

  it('code ZONDER actieve referenties → bootstrap-queue (lege klasse)', () => {
    const items = aggregateDeclaredNotFound(
      eventsFor('A', 15, 6),
      new Set(['ANDERE_CODE']),
      DEFAULTS
    );
    expect(items[0].route).toBe('bootstrap-queue');
  });

  it('events van meerdere codes vermengd → per code apart geteld + gerouted', () => {
    const events = [
      ...eventsFor('A', 12, 5), // haalt drempel, geen actieve ref → queue
      ...eventsFor('B', 20, 8), // haalt drempel, wel actieve ref → signaal
      ...eventsFor('C', 3, 2), // onder drempel → niets
    ];
    const items = aggregateDeclaredNotFound(events, new Set(['B']), DEFAULTS);
    expect(items.map((i) => i.t3777Code)).toEqual(['B', 'A']); // sorteer op events desc
    const a = items.find((i) => i.t3777Code === 'A')!;
    const b = items.find((i) => i.t3777Code === 'B')!;
    expect(a.route).toBe('bootstrap-queue');
    expect(b.route).toBe('aanvul-signaal');
    expect(items.find((i) => i.t3777Code === 'C')).toBeUndefined();
  });

  it('dubbele events op dezelfde GTIN tellen als 1 GTIN maar N events', () => {
    // 10 events allemaal op dezelfde GTIN → wel ≥N events, maar 1 < M GTINs → niets.
    const events: DeclaredNotFoundEvent[] = Array.from({ length: 10 }, () => ({
      t3777Code: 'A',
      gtin: 'gtin-solo',
    }));
    expect(aggregateDeclaredNotFound(events, new Set(), DEFAULTS)).toEqual([]);
  });

  it('env-overrides via andere N/M-drempels', () => {
    // Met N=3/M=2 haalt een klein patroon de drempel al.
    const items = aggregateDeclaredNotFound(eventsFor('A', 3, 2), new Set(), { n: 3, m: 2 });
    expect(items).toHaveLength(1);
    // ...maar met N=3/M=3 net niet (2 < 3 GTINs).
    expect(aggregateDeclaredNotFound(eventsFor('A', 3, 2), new Set(), { n: 3, m: 3 })).toEqual([]);
  });
});

describe('Story 16.2 AC2 — structureel-drempel config (env-defaults + overrides)', () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    delete process.env.FLYWHEEL_STRUCTURAL_N;
    delete process.env.FLYWHEEL_STRUCTURAL_M;
  });
  afterAll(() => {
    process.env = OLD;
  });

  it('defaults N=10 / M=5', () => {
    expect(getStructuralN()).toBe(10);
    expect(getStructuralM()).toBe(5);
  });

  it('env-override werkt', () => {
    process.env.FLYWHEEL_STRUCTURAL_N = '25';
    process.env.FLYWHEEL_STRUCTURAL_M = '8';
    expect(getStructuralN()).toBe(25);
    expect(getStructuralM()).toBe(8);
  });

  it('ongeldige/negatieve env → val terug op default', () => {
    process.env.FLYWHEEL_STRUCTURAL_N = 'x';
    process.env.FLYWHEEL_STRUCTURAL_M = '0';
    expect(getStructuralN()).toBe(10);
    expect(getStructuralM()).toBe(5);
  });
});

describe('Story 16.2 AC2 — runMismatchWorkloadAggregation (routering + upsert + idempotentie + excluded-guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FLYWHEEL_STRUCTURAL_N;
    delete process.env.FLYWHEEL_STRUCTURAL_M;
    // Standaard: geen actieve referenties, geen excluded rijen.
    mockPrisma.referenceLogo.findMany.mockResolvedValue([]);
    mockPrisma.bootstrapQueue.findMany.mockResolvedValue([]);
    mockPrisma.bootstrapQueue.upsert.mockResolvedValue({ id: 'bq-1' });
  });

  it('lege klasse boven drempel → upsert bootstrap_queue (status wachtend)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { t3777_code: 'A', event_count: 12n, distinct_gtins: 6n },
    ]);
    const result = await runMismatchWorkloadAggregation();

    expect(result.queued.map((q) => q.t3777Code)).toEqual(['A']);
    expect(result.refillSignals).toEqual([]);
    expect(mockPrisma.bootstrapQueue.upsert).toHaveBeenCalledOnce();
    const arg = mockPrisma.bootstrapQueue.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ t3777Code: 'A' });
    expect(arg.create).toMatchObject({ t3777Code: 'A', status: 'wachtend' });
    expect(arg.update).toMatchObject({ status: 'wachtend' });
  });

  it('zwakke klasse (actieve ref) boven drempel → aanvul-signaal, GEEN upsert', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { t3777_code: 'A', event_count: 20n, distinct_gtins: 8n },
    ]);
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'A' }]);

    const result = await runMismatchWorkloadAggregation();
    expect(result.queued).toEqual([]);
    expect(result.refillSignals).toEqual([
      { t3777Code: 'A', eventCount: 20, distinctGtins: 8 },
    ]);
    expect(mockPrisma.bootstrapQueue.upsert).not.toHaveBeenCalled();
  });

  it('idempotent: tweede run over dezelfde events upsert opnieuw (geen duplicaat — t3777Code uniek)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { t3777_code: 'A', event_count: 12n, distinct_gtins: 6n },
    ]);
    await runMismatchWorkloadAggregation();
    await runMismatchWorkloadAggregation();
    // Twee runs → twee upsert-calls op DEZELFDE where-sleutel (status-update, geen insert-dup).
    expect(mockPrisma.bootstrapQueue.upsert).toHaveBeenCalledTimes(2);
    for (const call of mockPrisma.bootstrapQueue.upsert.mock.calls) {
      expect(call[0].where).toEqual({ t3777Code: 'A' });
    }
  });

  it('excluded-guard: een uitgesloten code wordt NIET opnieuw geupsert', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { t3777_code: 'A', event_count: 12n, distinct_gtins: 6n },
      { t3777_code: 'B', event_count: 15n, distinct_gtins: 7n },
    ]);
    // A is uitgesloten (17.2), B niet.
    mockPrisma.bootstrapQueue.findMany.mockResolvedValue([{ t3777Code: 'A' }]);

    const result = await runMismatchWorkloadAggregation();
    expect(result.skippedExcluded).toEqual(['A']);
    expect(result.queued.map((q) => q.t3777Code)).toEqual(['B']);
    // Alleen B geupsert; A overgeslagen (blijft uitgesloten).
    expect(mockPrisma.bootstrapQueue.upsert).toHaveBeenCalledOnce();
    expect(mockPrisma.bootstrapQueue.upsert.mock.calls[0][0].where).toEqual({
      t3777Code: 'B',
    });
  });

  it('gemengde run: queue + signaal + excluded tegelijk correct gerouted', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { t3777_code: 'QUEUE', event_count: 30n, distinct_gtins: 10n },
      { t3777_code: 'SIGNAAL', event_count: 25n, distinct_gtins: 9n },
      { t3777_code: 'UITGESLOTEN', event_count: 20n, distinct_gtins: 8n },
    ]);
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'SIGNAAL' }]);
    mockPrisma.bootstrapQueue.findMany.mockResolvedValue([{ t3777Code: 'UITGESLOTEN' }]);

    const result = await runMismatchWorkloadAggregation();
    expect(result.queued.map((q) => q.t3777Code)).toEqual(['QUEUE']);
    expect(result.refillSignals.map((s) => s.t3777Code)).toEqual(['SIGNAAL']);
    expect(result.skippedExcluded).toEqual(['UITGESLOTEN']);
  });

  it('geen drempel-halende codes → geen upsert, lege uitkomst', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await runMismatchWorkloadAggregation();
    expect(result).toEqual({ queued: [], refillSignals: [], skippedExcluded: [] });
    expect(mockPrisma.bootstrapQueue.upsert).not.toHaveBeenCalled();
  });

  it('de aggregatie-query filtert op declared-not-found + sluit cohort uit', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await runMismatchWorkloadAggregation();
    const sql = mockPrisma.$queryRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain("type = 'declared-not-found'");
    expect(sql).toContain("NOT LIKE 'cohort-%'");
    expect(sql).toContain('COUNT(DISTINCT gtin)');
  });
});

describe('Story 16.2 AC3 — getWorkloadItemTraceability (herleidbaarheid naar GTINs + verwerkingen)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('levert de onderliggende GTINs (uniek, gesorteerd) + verwerkingen', async () => {
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([
      { gtin: '2', gln: 'GLN_A', origin: 'crosscheck', runId: 'r2', createdAt: new Date('2026-07-02') },
      { gtin: '1', gln: null, origin: 'kruischeck', runId: 'r1', createdAt: new Date('2026-07-01') },
      { gtin: '2', gln: 'GLN_A', origin: 'crosscheck', runId: 'r3', createdAt: new Date('2026-07-03') },
    ]);

    const trace = await getWorkloadItemTraceability('A');
    expect(trace.t3777Code).toBe('A');
    expect(trace.gtins).toEqual(['1', '2']); // uniek + gesorteerd
    expect(trace.distinctGtins).toBe(2);
    expect(trace.events).toHaveLength(3);
    // De runId's zijn herleidbaar meegestuurd.
    expect(trace.events.map((e) => e.runId)).toEqual(['r2', 'r1', 'r3']);
  });

  it('query beperkt zich tot declared-not-found + sluit cohort uit', async () => {
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([]);
    await getWorkloadItemTraceability('A');
    const arg = mockPrisma.mismatchEvent.findMany.mock.calls[0][0];
    expect(arg.where.type).toBe('declared-not-found');
    expect(arg.where.NOT).toEqual({ origin: { startsWith: 'cohort-' } });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('geen onderliggende events → lege traceability (endpoint geeft dan 404)', async () => {
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([]);
    const trace = await getWorkloadItemTraceability('LEEG');
    expect(trace.events).toEqual([]);
    expect(trace.gtins).toEqual([]);
    expect(trace.distinctGtins).toBe(0);
  });
});

describe('Story 16.2 AC2 — getBootstrapQueueOverview (paneel: wachtrij + aanvul-signalen, sectie-lokaal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FLYWHEEL_STRUCTURAL_N;
    delete process.env.FLYWHEEL_STRUCTURAL_M;
    mockPrisma.referenceLogo.findMany.mockResolvedValue([]);
    mockPrisma.bootstrapQueue.upsert.mockResolvedValue({ id: 'bq-1' });
  });

  it('draait de aggregatie on-read en levert de actuele wachtrij + signalen', async () => {
    // 1e findMany: excluded-set (leeg); 2e findMany: de wachtrij-rijen.
    mockPrisma.$queryRaw.mockResolvedValue([
      { t3777_code: 'QUEUE', event_count: 30n, distinct_gtins: 10n },
      { t3777_code: 'SIGNAAL', event_count: 20n, distinct_gtins: 8n },
    ]);
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'SIGNAAL' }]);
    mockPrisma.bootstrapQueue.findMany
      .mockResolvedValueOnce([]) // excluded-set
      .mockResolvedValueOnce([
        {
          t3777Code: 'QUEUE',
          status: 'wachtend',
          declarationFrequency: 0,
          excluded: false,
          priorityOverride: null,
          lastRunAt: null,
          createdAt: new Date('2026-07-03T10:00:00Z'),
        },
      ]);

    const panel = await getBootstrapQueueOverview();
    expect(panel.available).toBe(true);
    expect(panel.items.map((i) => i.t3777Code)).toEqual(['QUEUE']);
    expect(panel.items[0].status).toBe('wachtend');
    expect(panel.refillSignals.map((s) => s.t3777Code)).toEqual(['SIGNAAL']);
  });

  it('een fout in de aggregatie → leeg-maar-available paneel (sectie-lokale degradatie)', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('read fail'));
    const panel = await getBootstrapQueueOverview();
    expect(panel).toEqual({ available: true, items: [], refillSignals: [] });
  });
});
