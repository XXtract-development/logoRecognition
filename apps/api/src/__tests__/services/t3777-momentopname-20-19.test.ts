/**
 * Story 20.19 — de terugval op de geoogste momentopname.
 *
 * De opstelling volgt `t3777-declarations-19-16.test.ts`: Redis en Prisma gemockt,
 * `fetch` vervangen, zodat de echte `resolveDeclaredMarks` doorlopen wordt zonder
 * netwerk. De catalogus meldt een ONTBREKEND bestand met een HTTP 500 plus
 * "File not found at path" — geen 404 — dus dat is wat we hier nabootsen.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisStore = new Map<string, string>();
const redisGet = vi.fn(async (k: string) => redisStore.get(k) ?? null);
const redisSetex = vi.fn(async (k: string, _ttl: number, v: string) => {
  redisStore.set(k, v);
  return 'OK';
});

vi.mock('../../services/pipeline/queue', () => ({
  getRedisConnection: () => ({ get: redisGet, setex: redisSetex }),
}));
vi.mock('../../core/db', () => ({
  default: { artworkImport: { findFirst: vi.fn(async () => ({ gln: '8712345000000' })) } },
}));
vi.mock('../../services/pipeline/detection-flow', () => ({
  setDeclarationProvider: vi.fn(),
  emptyDeclarationProvider: {},
}));

import {
  lookupSnapshot,
  resetSnapshotStats,
  resolveDeclaredMarks,
  shouldTreatCacheHitAsMiss,
  snapshotAgeDays,
  snapshotStats,
  SNAPSHOT_MAX_AGE_DAYS,
} from '../../services/t3777-declarations';
import {
  TRADEITEM_SNAPSHOT,
  TRADEITEM_SNAPSHOT_META,
} from '../../services/tradeitem-declaration-snapshot';

/** Een echte sleutel uit de momentopname die keurmerken draagt. */
const MET_KEURMERK = Object.keys(TRADEITEM_SNAPSHOT).find(
  (k) => TRADEITEM_SNAPSHOT[k].length > 0
) as string;
/** Een echte sleutel die aantoonbaar niets declareert (204 van de 442). */
const ZONDER_KEURMERK = Object.keys(TRADEITEM_SNAPSHOT).find(
  (k) => TRADEITEM_SNAPSHOT[k].length === 0
) as string;

const [GLN_MET, GTIN_MET, TM] = MET_KEURMERK.split('-');
const [GLN_LEEG, GTIN_LEEG] = ZONDER_KEURMERK.split('-');

/** De catalogus meldt een ontbrekend bestand met een 500, niet met een 404. */
function catalogGeenBestand(): void {
  global.fetch = vi.fn(async () => ({
    ok: false,
    status: 500,
    headers: new Headers(),
    text: async () => 'File not found at path /media/Xxml/catalog/…',
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  redisStore.clear();
  redisGet.mockClear();
  redisSetex.mockClear();
  resetSnapshotStats();
  process.env.CATALOG_API_KEY = 'test-key';
  process.env.CATALOG_API_BASE = 'https://catalog.acc.xxtract.com';
  process.env.T3777_TARGET_MARKET = TM;
  catalogGeenBestand();
});

describe('AC2 — drie uitkomsten, elk met een eigen reden', () => {
  it('sleutel MET codes levert `uit-momentopname` plus de marks', () => {
    const res = lookupSnapshot(GLN_MET, GTIN_MET, TM);
    expect(res?.reason).toBe('uit-momentopname');
    expect(res?.marks.length).toBeGreaterThan(0);
    expect(res?.snapshotHarvestedAt).toBe(TRADEITEM_SNAPSHOT_META.harvestedAt);
    expect(snapshotStats.withMarks).toBe(1);
  });

  it('sleutel met een LEGE lijst levert `lege-declaratie` — gemeten, declareert niets', () => {
    const res = lookupSnapshot(GLN_LEEG, GTIN_LEEG, TM);
    expect(res?.reason).toBe('lege-declaratie');
    expect(res?.marks).toEqual([]);
    expect(snapshotStats.empty).toBe(1);
  });

  it('ONTBREKENDE sleutel levert niets, en telt als werk voor een verse oogst', () => {
    expect(lookupSnapshot('9999999999999', '09999999999999', TM)).toBeNull();
    expect(snapshotStats.notInSnapshot).toBe(1);
  });
});

describe('AC3 — `uit-momentopname` mag nooit `ok` zijn', () => {
  it('geeft nooit reden `ok` terug, hoe echt de marks ook zijn', () => {
    // Dragend: `bootstrap-run.ts` laat alleen `ok` de klasse-zoektocht in die
    // referenties oplevert. Met `ok` zouden de 238 bevroren producten daar meteen
    // naar binnen lopen — precies wat besluit 2 uitsluit.
    for (const key of Object.keys(TRADEITEM_SNAPSHOT).slice(0, 50)) {
      const [gln, gtin, tm] = key.split('-');
      const res = lookupSnapshot(gln, gtin, tm);
      expect(res?.reason).not.toBe('ok');
    }
  });
});

describe('AC1 — de terugval staat standaard UIT', () => {
  it('zonder opties blijft de uitkomst `geen-tradeitem-bestand`', async () => {
    const res = await resolveDeclaredMarks(GTIN_MET, GLN_MET);
    expect(res.reason).toBe('geen-tradeitem-bestand');
    expect(res.marks).toEqual([]);
    expect(res.snapshotHarvestedAt).toBeUndefined();
  });

  it('met `useSnapshot` komt dezelfde GTIN wél uit de momentopname', async () => {
    const res = await resolveDeclaredMarks(GTIN_MET, GLN_MET, { useSnapshot: true });
    expect(res.reason).toBe('uit-momentopname');
    expect(res.marks.length).toBeGreaterThan(0);
  });

  it('`useSnapshot: false` is even stil als helemaal geen opties', async () => {
    const res = await resolveDeclaredMarks(GTIN_MET, GLN_MET, { useSnapshot: false });
    expect(res.reason).toBe('geen-tradeitem-bestand');
  });
});

describe('AC4 — alleen als terugval, nooit als vervanging', () => {
  it('een werkend product (`ok`) raadpleegt de momentopname niet', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '120' }),
      text: async () =>
        '<x><packagingMarkedLabelAccreditationCode>GREEN_DOT</packagingMarkedLabelAccreditationCode></x>',
    })) as unknown as typeof fetch;

    const res = await resolveDeclaredMarks(GTIN_MET, GLN_MET, { useSnapshot: true });
    expect(res.reason).toBe('ok');
    expect(res.snapshotHarvestedAt).toBeUndefined();
    // Geen enkele teller van de momentopname is geraakt.
    expect(snapshotStats).toEqual({
      withMarks: 0,
      empty: 0,
      notInSnapshot: 0,
      staleCacheDropped: 0,
    });
  });
});

describe('AC8 — de cache mag de terugval niet blokkeren', () => {
  it('een hit met `geen-tradeitem-bestand` telt als miss zodra de terugval aanstaat', () => {
    const hit = { marks: [], reason: 'geen-tradeitem-bestand' } as const;
    expect(shouldTreatCacheHitAsMiss(hit, true)).toBe(true);
    expect(shouldTreatCacheHitAsMiss(hit, false)).toBe(false);
  });

  it('een hit uit een OUDERE oogst telt als miss, zodat een verse zichzelf oppikt', () => {
    const oud = {
      marks: [{ code: 'GREEN_DOT', fieldType: 'PackagingMarkedLabelAccreditationCode' }],
      reason: 'uit-momentopname' as const,
      snapshotHarvestedAt: '2020-01-01',
    };
    const actueel = { ...oud, snapshotHarvestedAt: TRADEITEM_SNAPSHOT_META.harvestedAt };
    expect(shouldTreatCacheHitAsMiss(oud, true)).toBe(true);
    expect(shouldTreatCacheHitAsMiss(actueel, true)).toBe(false);
  });

  it('een gecachete `geen-tradeitem-bestand` houdt de terugval niet 24 uur tegen', async () => {
    // Eerst zonder terugval: de negatieve uitkomst landt in de cache.
    const eerst = await resolveDeclaredMarks(GTIN_MET, GLN_MET);
    expect(eerst.reason).toBe('geen-tradeitem-bestand');
    expect(redisSetex).toHaveBeenCalled();

    // Daarna mét terugval: de hit wordt als miss behandeld en de momentopname wint.
    const daarna = await resolveDeclaredMarks(GTIN_MET, GLN_MET, { useSnapshot: true });
    expect(daarna.reason).toBe('uit-momentopname');
    expect(snapshotStats.staleCacheDropped).toBe(1);
  });

  it('de uitkomst uit de momentopname draagt de oogstdatum de cache in', async () => {
    await resolveDeclaredMarks(GTIN_MET, GLN_MET, { useSnapshot: true });
    const geschreven = [...redisStore.values()].map((v) => JSON.parse(v));
    expect(
      geschreven.some((r) => r.snapshotHarvestedAt === TRADEITEM_SNAPSHOT_META.harvestedAt)
    ).toBe(true);
  });
});

describe('AC10 — de momentopname is doelmarkt-gebonden', () => {
  it('een andere doelmarkt levert niets in plaats van stilzwijgend de verkeerde sleutel', () => {
    expect(lookupSnapshot(GLN_MET, GTIN_MET, '999')).toBeNull();
    // En het telt NIET als "niet geoogst" — dat zou het getal voor een verse oogst
    // vervuilen met producten die gewoon buiten deze momentopname vallen.
    expect(snapshotStats.notInSnapshot).toBe(0);
  });

  it('alle sleutels delen de doelmarkt die de meta noemt', () => {
    for (const id of Object.keys(TRADEITEM_SNAPSHOT)) {
      expect(id.endsWith(`-${TRADEITEM_SNAPSHOT_META.targetMarket}`)).toBe(true);
    }
  });
});

describe('AC9 — de veroudering is meetbaar', () => {
  it('rekent de ouderdom in hele dagen vanaf de oogstdatum', () => {
    const geoogst = new Date(`${TRADEITEM_SNAPSHOT_META.harvestedAt}T00:00:00Z`);
    expect(snapshotAgeDays(geoogst)).toBe(0);
    expect(snapshotAgeDays(new Date(geoogst.getTime() + 200 * 86_400_000))).toBe(200);
  });

  it('kent een grens waarboven de indexbouwer luidruchtig hoort te worden', () => {
    expect(SNAPSHOT_MAX_AGE_DAYS).toBe(180);
  });
});

describe('AC1 — besluit 2 is vastgepind op de aanroepers, niet op goed vertrouwen', () => {
  // Deze toets leest de bron. Dat is met opzet: `useSnapshot` staat standaard uit,
  // dus een aanroeper die hem PER ONGELUK aanzet is met gedrag niet te betrappen —
  // je zou elke aanroeper apart moeten naspelen. Wie hier een regel toevoegt, moet
  // bewust door deze toets heen.
  const wortel = join(__dirname, '..', '..', '..');
  const lees = (rel: string): string => readFileSync(join(wortel, rel), 'utf8');

  const MOETEN_UIT = [
    // Voegt Nutri-Score-letters samen in `declaredCodes`; die lopen door naar
    // runFlywheelHooks -> nominateFromKruischeck en worden kandidaat-referenties.
    'src/services/pipeline/verify-flow.ts',
    // De guard vóór de klasse-zoektocht die referenties oplevert.
    'src/services/flywheel/bootstrap-run.ts',
    // Schrijft de declaratiemap naar de MinIO-trainingsbucket.
    'src/scripts/build-nutriscore-declared-map.ts',
  ];

  const MOETEN_AAN = [
    // Vult de beoordeelwachtrij — het doel van deze story.
    'src/scripts/build-keurmerk-index.ts',
    // Leest alleen; voedt de declaratie-prior van het beoordeelscherm.
    'src/api/v1/artwork-pipeline.ts',
  ];

  it.each(MOETEN_UIT)('%s zet de momentopname NIET aan', (rel) => {
    const bron = lees(rel);
    expect(bron).toContain('resolveDeclaredMarks(');
    expect(bron).not.toContain('useSnapshot');
  });

  it.each(MOETEN_AAN)('%s zet de momentopname bewust WEL aan', (rel) => {
    expect(lees(rel)).toContain('useSnapshot: true');
  });

  it('kent alle vijf de aanroepers — een zesde moet hier langs', () => {
    expect([...MOETEN_UIT, ...MOETEN_AAN]).toHaveLength(5);
  });
});
