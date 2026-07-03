/**
 * Story 16.1 — Mismatch-registratie en -aggregatie (FR-14).
 *
 * AC→test-mapping (zie ac-trace-16-1.md):
 *   AC2  → describe 'mapMismatchEvents (pure typeset)' + 'found-not-declared drempel'
 *          + 'register (crosscheck-invoer)'.
 *   AC3  → describe 'vlag-scoping (AD-8)' (4 vlag×pad-combinaties; kruischeck-uit = 0 rijen).
 *   AC5  → describe 'getMismatchTrends (aggregatie per code + per GLN + trend)' incl.
 *          cohort-filter.
 *   AC6  → alle bovenstaande (unit + aggregatie); idempotentie-gedrag gedocumenteerd
 *          (per-run-observaties, geen dedup) in 'register — per-run-observaties'.
 *
 * AC1 (migratie + down-script) en AC4 (afstemmoment n8n/12.8) zijn niet-code-ACs:
 * AC1 is geverifieerd via de migratiebestanden + `prisma migrate status`; AC4 via
 * het Dev Agent Record + de route-docblock. Beide staan in ac-trace-16-1.md.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import {
  mapMismatchEvents,
  crosscheckResultToRegisterInput,
  type MapMismatchInput,
  type MismatchEventRow,
} from '../../services/flywheel/mismatch-events';
import type { CrosscheckResult } from '../../services/artwork-crosscheck';
import {
  getMismatchTrends,
  confirmedRatio,
  UNKNOWN_GLN,
} from '../../services/flywheel/overview/mismatch-trends';

const mockPrisma = prisma as unknown as Record<string, any>;

/** Basale pure-mapping-invoer; per test overschreven waar relevant. */
function baseInput(overrides: Partial<MapMismatchInput> = {}): MapMismatchInput {
  return {
    gtin: '08718989912451',
    gln: '8718989000000',
    declared: [],
    confirmedCodes: [],
    undeclaredFindings: [],
    activeClasses: new Set<string>(),
    origin: 'crosscheck',
    runId: 'run-1',
    thresholdFor: () => 0.9,
    ...overrides,
  };
}

describe('Story 16.1 AC2 — mapMismatchEvents (pure typeset)', () => {
  it('gedeclareerde + bevestigde code → confirmed (confidence null)', () => {
    const rows = mapMismatchEvents(
      baseInput({
        declared: ['GREEN_DOT'],
        confirmedCodes: ['GREEN_DOT'],
        activeClasses: new Set(['GREEN_DOT']),
      })
    );
    expect(rows).toEqual<MismatchEventRow[]>([
      {
        gtin: '08718989912451',
        gln: '8718989000000',
        t3777Code: 'GREEN_DOT',
        type: 'confirmed',
        confidence: null,
        origin: 'crosscheck',
        runId: 'run-1',
      },
    ]);
  });

  it('gedeclareerd, actieve klasse, niet bevestigd → declared-not-found', () => {
    const rows = mapMismatchEvents(
      baseInput({ declared: ['GREEN_DOT'], activeClasses: new Set(['GREEN_DOT']) })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('declared-not-found');
    expect(rows[0].confidence).toBeNull();
  });

  it('gedeclareerd, GEEN actieve klasse → not-supported (gaat vóór declared-not-found)', () => {
    const rows = mapMismatchEvents(
      baseInput({ declared: ['RARE_MARK'], activeClasses: new Set<string>() })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('not-supported');
  });

  it('niet-gedeclareerde vondst boven drempel → found-not-declared (met confidence)', () => {
    const rows = mapMismatchEvents(
      baseInput({
        declared: [],
        undeclaredFindings: [{ t3777Code: 'RECYCLABLE', confidence: 0.95, method: 'template' }],
        thresholdFor: () => 0.9,
      })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'found-not-declared', confidence: 0.95 });
  });

  it('volledige typeset in één verwerking (confirmed + declared-not-found + not-supported + found-not-declared)', () => {
    const rows = mapMismatchEvents(
      baseInput({
        declared: ['A_CONFIRMED', 'B_MISSING', 'C_UNSUPPORTED'],
        confirmedCodes: ['A_CONFIRMED'],
        activeClasses: new Set(['A_CONFIRMED', 'B_MISSING']),
        undeclaredFindings: [{ t3777Code: 'D_FOUND', confidence: 0.99, method: 'template' }],
        thresholdFor: () => 0.9,
      })
    );
    const byType = Object.fromEntries(rows.map((r) => [r.type, r.t3777Code]));
    expect(byType).toEqual({
      confirmed: 'A_CONFIRMED',
      'declared-not-found': 'B_MISSING',
      'not-supported': 'C_UNSUPPORTED',
      'found-not-declared': 'D_FOUND',
    });
  });

  it('lege declaratie + geen vondsten → geen rijen', () => {
    expect(mapMismatchEvents(baseInput())).toEqual([]);
  });
});

describe('Story 16.1 AC2 — found-not-declared drempel per methode (randgevallen)', () => {
  // Drempels: template 0.80, embedding 0.85, classifier 0.90 (fictief per test).
  const thresholdFor = (method?: string): number => {
    switch (method) {
      case 'template':
        return 0.8;
      case 'embedding':
        return 0.85;
      default:
        return 0.9; // classifier / geen methode = strengste
    }
  };

  it.each([
    { method: 'template', conf: 0.8, expected: true, label: 'op de drempel telt' },
    { method: 'template', conf: 0.79, expected: false, label: 'net onder → géén rij' },
    { method: 'template', conf: 0.81, expected: true, label: 'net boven telt' },
    { method: 'embedding', conf: 0.85, expected: true, label: 'op de drempel (embedding)' },
    { method: 'embedding', conf: 0.84, expected: false, label: 'net onder (embedding)' },
    { method: undefined, conf: 0.9, expected: true, label: 'geen methode → classifier op drempel' },
    { method: undefined, conf: 0.89, expected: false, label: 'geen methode → net onder' },
  ])('$method $conf: $label', ({ method, conf, expected }) => {
    const rows = mapMismatchEvents(
      baseInput({
        undeclaredFindings: [{ t3777Code: 'X', confidence: conf, method }],
        thresholdFor,
      })
    );
    expect(rows.some((r) => r.type === 'found-not-declared')).toBe(expected);
  });

  it('een tóch-gedeclareerde vondst wordt niet dubbelgeteld als found-not-declared', () => {
    const rows = mapMismatchEvents(
      baseInput({
        declared: ['GREEN_DOT'],
        confirmedCodes: ['GREEN_DOT'],
        activeClasses: new Set(['GREEN_DOT']),
        undeclaredFindings: [{ t3777Code: 'GREEN_DOT', confidence: 0.99, method: 'template' }],
        thresholdFor,
      })
    );
    expect(rows.filter((r) => r.type === 'found-not-declared')).toHaveLength(0);
    expect(rows).toHaveLength(1); // alleen de confirmed-rij
  });
});

describe('Story 16.1 AC2 — crosscheckResultToRegisterInput (hergebruik crosscheck-uitkomst)', () => {
  it('mapt autoAccepted → confirmedCodes en niet-gedeclareerde reviewItems → undeclaredFindings', () => {
    const result: CrosscheckResult = {
      autoAccepted: [{ t3777Code: 'GREEN_DOT', confidence: 0.95, method: 'template' }],
      reviewItems: [
        { t3777Code: 'RECYCLABLE', reason: 'gevonden maar niet verwacht', confidence: 0.92, method: 'template' },
        { t3777Code: 'GREEN_DOT', reason: 'verwacht maar niet gevonden' },
      ],
    };
    const input = crosscheckResultToRegisterInput('123', 'GLN1', ['GREEN_DOT'], result, 'run-9');
    expect(input.confirmedCodes).toEqual(['GREEN_DOT']);
    // RECYCLABLE is niet gedeclareerd → undeclaredFinding; GREEN_DOT is gedeclareerd → uitgesloten.
    expect(input.undeclaredFindings).toEqual([
      { t3777Code: 'RECYCLABLE', confidence: 0.92, method: 'template' },
    ]);
    expect(input.runId).toBe('run-9');
  });

  it('reviewItem zonder confidence wordt geen undeclaredFinding', () => {
    const result: CrosscheckResult = {
      autoAccepted: [],
      reviewItems: [{ t3777Code: 'X', reason: 'verwacht maar niet gevonden' }],
    };
    const input = crosscheckResultToRegisterInput('123', null, ['X'], result);
    expect(input.undeclaredFindings).toEqual([]);
  });
});

describe('Story 16.1 AC3 — vlag-scoping (AD-8, 4 vlag×pad-combinaties)', () => {
  const registerInput = {
    gtin: '123',
    gln: 'GLN1',
    declared: ['GREEN_DOT'],
    confirmedCodes: ['GREEN_DOT'],
    undeclaredFindings: [],
    runId: 'run-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'GREEN_DOT' }]);
    mockPrisma.mismatchEvent.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
  });

  it('crosscheck-pad, hoofdvlag AAN → schrijft', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'false';
    const { registerCrosscheckMismatchEvents } = await import('../../services/flywheel/mismatch-events');
    const n = await registerCrosscheckMismatchEvents(registerInput);
    expect(n).toBe(1);
    expect(mockPrisma.mismatchEvent.createMany).toHaveBeenCalledOnce();
  });

  it('crosscheck-pad, hoofdvlag UIT → schrijft NIETS', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'false';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'true';
    const { registerCrosscheckMismatchEvents } = await import('../../services/flywheel/mismatch-events');
    const n = await registerCrosscheckMismatchEvents(registerInput);
    expect(n).toBe(0);
    expect(mockPrisma.mismatchEvent.createMany).not.toHaveBeenCalled();
  });

  it('kruischeck-pad, kruischeck-vlag AAN (én hoofdvlag aan) → schrijft met origin kruischeck', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'true';
    const { registerKruischeckMismatchEvents } = await import('../../services/flywheel/mismatch-events');
    const n = await registerKruischeckMismatchEvents(registerInput);
    expect(n).toBe(1);
    const arg = mockPrisma.mismatchEvent.createMany.mock.calls[0][0];
    expect(arg.data[0].origin).toBe('kruischeck');
  });

  it('kruischeck-pad, kruischeck-vlag UIT (hoofdvlag aan) → schrijft NIETS (12.8-response ongewijzigd)', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'false';
    const { registerKruischeckMismatchEvents } = await import('../../services/flywheel/mismatch-events');
    const n = await registerKruischeckMismatchEvents(registerInput);
    expect(n).toBe(0);
    expect(mockPrisma.mismatchEvent.createMany).not.toHaveBeenCalled();
  });

  it('kruischeck-vlag aan maar hoofdvlag UIT → nog steeds NIETS (kruischeck eist beide)', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'false';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'true';
    const { registerKruischeckMismatchEvents } = await import('../../services/flywheel/mismatch-events');
    const n = await registerKruischeckMismatchEvents(registerInput);
    expect(n).toBe(0);
  });
});

describe('Story 16.1 AC6 — register: per-run-observaties + fail-safe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'false';
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'GREEN_DOT' }]);
    mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
  });

  it('herverwerking van dezelfde GTIN schrijft opnieuw (geen dedup — per-run-observatie)', async () => {
    mockPrisma.mismatchEvent.createMany.mockResolvedValue({ count: 1 });
    const { registerCrosscheckMismatchEvents } = await import('../../services/flywheel/mismatch-events');
    const input = {
      gtin: '123', gln: 'GLN1', declared: ['GREEN_DOT'],
      confirmedCodes: ['GREEN_DOT'], undeclaredFindings: [], runId: 'run-2',
    };
    await registerCrosscheckMismatchEvents(input);
    await registerCrosscheckMismatchEvents({ ...input, runId: 'run-3' });
    expect(mockPrisma.mismatchEvent.createMany).toHaveBeenCalledTimes(2);
  });

  it('een DB-fout bij persist is non-fataal (registratie is aanvullend werk)', async () => {
    mockPrisma.mismatchEvent.createMany.mockRejectedValue(new Error('db down'));
    const { registerCrosscheckMismatchEvents } = await import('../../services/flywheel/mismatch-events');
    const n = await registerCrosscheckMismatchEvents({
      gtin: '123', gln: null, declared: ['GREEN_DOT'],
      confirmedCodes: [], undeclaredFindings: [], runId: 'run-4',
    });
    expect(n).toBe(0); // gevangen, geen throw
  });

  it('lege declaratie + geen vondsten → geen persist-aanroep', async () => {
    mockPrisma.mismatchEvent.createMany.mockResolvedValue({ count: 0 });
    const { registerCrosscheckMismatchEvents } = await import('../../services/flywheel/mismatch-events');
    const n = await registerCrosscheckMismatchEvents({
      gtin: '123', gln: 'GLN1', declared: [], confirmedCodes: [], undeclaredFindings: [], runId: 'r',
    });
    expect(n).toBe(0);
    expect(mockPrisma.mismatchEvent.createMany).not.toHaveBeenCalled();
  });
});

describe('Story 16.1 AC5 — confirmedRatio (bevestigd / bevestigd+niet-gevonden)', () => {
  it('telt not-supported en found-not-declared NIET mee', () => {
    expect(
      confirmedRatio({ confirmed: 3, declaredNotFound: 1, notSupported: 5, foundNotDeclared: 9 })
    ).toBe(0.75);
  });
  it('noemer 0 → null', () => {
    expect(
      confirmedRatio({ confirmed: 0, declaredNotFound: 0, notSupported: 4, foundNotDeclared: 2 })
    ).toBeNull();
  });
});

describe('Story 16.1 AC5 — getMismatchTrends (aggregatie per code + per GLN + trend, cohort uitgesloten)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRaw.mockReset();
  });

  it('aggregeert per code + per GLN + trend en berekent de ratio', async () => {
    // Drie $queryRaw-aanroepen in volgorde: byCode, byGln, trend.
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        { key: 'GREEN_DOT', type: 'confirmed', n: 3n },
        { key: 'GREEN_DOT', type: 'declared-not-found', n: 1n },
        { key: 'RARE', type: 'not-supported', n: 2n },
      ])
      .mockResolvedValueOnce([
        { key: 'GLN_A', type: 'confirmed', n: 4n },
        { key: UNKNOWN_GLN, type: 'declared-not-found', n: 2n },
      ])
      .mockResolvedValueOnce([
        { period: new Date('2026-07-01T00:00:00Z'), type: 'confirmed', n: 2n },
        { period: new Date('2026-07-01T00:00:00Z'), type: 'declared-not-found', n: 2n },
      ]);

    const panel = await getMismatchTrends();
    expect(panel.available).toBe(true);

    const green = panel.byCode.find((r) => r.key === 'GREEN_DOT')!;
    expect(green.counts).toMatchObject({ confirmed: 3, declaredNotFound: 1, notSupported: 0 });
    expect(green.confirmedRatio).toBe(0.75);

    const rare = panel.byCode.find((r) => r.key === 'RARE')!;
    expect(rare.counts.notSupported).toBe(2);
    expect(rare.confirmedRatio).toBeNull(); // geen declaratie-uitkomsten

    expect(panel.byGln.find((r) => r.key === UNKNOWN_GLN)).toBeDefined();

    expect(panel.trend).toHaveLength(1);
    expect(panel.trend[0]).toMatchObject({ period: '2026-07-01', confirmedRatio: 0.5 });
  });

  it('sluit cohort-herkomst uit via de WHERE-clause (origin NOT LIKE cohort-%)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await getMismatchTrends();
    // De tagged-template-strings bevatten de cohort-uitsluiting in elke query.
    const calls = mockPrisma.$queryRaw.mock.calls;
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      const sql = call[0].join(' ');
      expect(sql).toContain("NOT LIKE 'cohort-%'");
    }
  });

  it('een leesfout levert een leeg-maar-available paneel (sectie-lokale degradatie)', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('read fail'));
    const panel = await getMismatchTrends();
    expect(panel).toEqual({ available: true, byCode: [], byGln: [], trend: [] });
  });
});
