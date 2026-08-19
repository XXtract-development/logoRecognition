/**
 * Story 20.19 — de terugval op de geoogste momentopname.
 *
 * De opstelling volgt `t3777-declarations-19-16.test.ts`: Redis en Prisma gemockt,
 * `fetch` vervangen, zodat de echte `resolveDeclaredMarks` doorlopen wordt zonder
 * netwerk. De catalogus meldt een ONTBREKEND bestand met een HTTP 500 plus
 * "File not found at path" — geen 404 — dus dat is wat we hier nabootsen.
 */

import { execSync } from 'node:child_process';
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

  it('een gecachete `geen-tradeitem-bestand` op het momentopname-pad blokkeert een VERSE oogst niet', async () => {
    // Het scenario dat er sinds de gescheiden sleutels toe doet: een eerdere run mét
    // de terugval vond dit product nog niet in de momentopname en schreef
    // `geen-tradeitem-bestand` naar de `:snap`-sleutel. Daarna is er opnieuw geoogst
    // en staat het er wél in. Zonder de hit-als-miss-regel zou dat een etmaal duren.
    const snapSleutel = `marks:acc:${GLN_MET}:${GTIN_MET}:${TM}:snap`;
    redisStore.set(snapSleutel, JSON.stringify({ marks: [], reason: 'geen-tradeitem-bestand' }));

    const res = await resolveDeclaredMarks(GTIN_MET, GLN_MET, { useSnapshot: true });
    expect(res.reason).toBe('uit-momentopname');
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
  /**
   * Leest de bron ZONDER commentaar. Punt 9 uit de code review: anders zou een
   * toelichting als "we zetten useSnapshot hier bewust niet aan" deze toets laten
   * omvallen — precies de zin die iemand zou schrijven om het goed te doen.
   */
  const lees = (rel: string): string =>
    readFileSync(join(wortel, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

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

  it('kent ALLE aanroepers in de codebase — een zesde moet hier langs', () => {
    // De vorige versie van deze toets vergeleek de lijst met zichzelf
    // (`toHaveLength(5)`) en bewees dus niets. Nu zoeken we de aanroepers echt op:
    // verschijnt er ergens een zesde, dan valt deze toets om en moet iemand er
    // bewust over nadenken.
    // Scant de HELE repository, niet alleen apps/api/src: een aanroeper kan overal
    // opduiken, en de vorige versie keek maar in één map.
    const gevonden = execSync(
      "grep -rln 'resolveDeclaredMarks(' apps --include='*.ts' --include='*.tsx' " +
        "| grep -v __tests__ | grep -v '/dist/' | sed 's|^apps/api/||' | sort",
      { cwd: join(__dirname, '..', '..', '..', '..', '..'), encoding: 'utf8' }
    )
      .trim()
      .split('\n')
      .filter((f) => !f.endsWith('services/t3777-declarations.ts')); // de definitie zelf

    expect(gevonden.sort()).toEqual([...MOETEN_UIT, ...MOETEN_AAN].sort());
  });
});

describe('AC1 — GEDRAG: de bevroren gegevens bereiken een niet-deelnemer nooit', () => {
  // Dit is de toets die er eerst niet was. De vastpin-toets hierboven leest bron en
  // bewijst alleen dat niemand het woord `useSnapshot` opschrijft — dat bleef waar
  // terwijl de gegevens er via de GEDEELDE CACHE alsnog doorheen liepen: een aanroep
  // met de vlag schreef `uit-momentopname` weg, en de volgende zonder vlag kreeg dat
  // uit de cache terug, marks en al. Alleen gedrag betrapt zoiets.
  it('een aanroep zonder de vlag krijgt niets, ook niet nadat een aanroep MET de vlag heeft gecachet', async () => {
    const met = await resolveDeclaredMarks(GTIN_MET, GLN_MET, { useSnapshot: true });
    expect(met.reason).toBe('uit-momentopname');
    expect(met.marks.length).toBeGreaterThan(0);

    const zonder = await resolveDeclaredMarks(GTIN_MET, GLN_MET);
    expect(zonder.reason).toBe('geen-tradeitem-bestand');
    expect(zonder.marks).toEqual([]);
    expect(zonder.snapshotHarvestedAt).toBeUndefined();
  });

  it('en andersom: een gecachete negatieve uitkomst blokkeert de terugval niet', async () => {
    const zonder = await resolveDeclaredMarks(GTIN_MET, GLN_MET);
    expect(zonder.reason).toBe('geen-tradeitem-bestand');

    const met = await resolveDeclaredMarks(GTIN_MET, GLN_MET, { useSnapshot: true });
    expect(met.reason).toBe('uit-momentopname');
  });

  it('de twee paden gebruiken gescheiden cachesleutels', async () => {
    await resolveDeclaredMarks(GTIN_MET, GLN_MET, { useSnapshot: true });
    await resolveDeclaredMarks(GTIN_MET, GLN_MET);
    const sleutels = [...redisStore.keys()];
    expect(sleutels.some((k) => k.endsWith(':snap'))).toBe(true);
    expect(sleutels.some((k) => !k.endsWith(':snap'))).toBe(true);
  });

  it('een momentopname-uitkomst wordt geweigerd als de aanroeper er niet om vraagt', () => {
    // De TWEEDE grendel, los van de gescheiden cachesleutels. Die twee dekken elkaar
    // af — precies de bedoeling — maar daardoor betrapt geen enkele gedragstoets
    // deze regel als je hem alleen weghaalt. Hier wordt hij rechtstreeks getoetst,
    // zodat hij niet ongemerkt kan verdwijnen.
    const uitMomentopname = {
      marks: [{ code: 'GREEN_DOT', fieldType: 'PackagingMarkedLabelAccreditationCode' }],
      reason: 'uit-momentopname' as const,
      snapshotHarvestedAt: TRADEITEM_SNAPSHOT_META.harvestedAt,
    };
    expect(shouldTreatCacheHitAsMiss(uitMomentopname, false)).toBe(true);
    expect(shouldTreatCacheHitAsMiss(uitMomentopname, true)).toBe(false);
  });

  it('een momentopname-uitkomst zonder oogstdatum telt als verlopen', () => {
    // Een entry van voor deze story, of met de hand geschreven. Die mag niet als
    // geldig doorgaan: we weten niet uit welke oogst hij komt.
    const zonderDatum = {
      marks: [{ code: 'GREEN_DOT', fieldType: 'PackagingMarkedLabelAccreditationCode' }],
      reason: 'uit-momentopname' as const,
    };
    expect(shouldTreatCacheHitAsMiss(zonderDatum, true)).toBe(true);
  });
});

describe('de reparatie mag de cache niet voor de hele populatie breken', () => {
  // De eerste versie van de eigen cachesleutel gaf hem aan ELK product zodra de vlag
  // aanstond. Gemeten: twee catalogus-aanroepen en twee cachesleutels voor een gewoon
  // werkend product dat niets met de momentopname te maken heeft — de cache was
  // daarmee gebroken voor ~1870 producten om er 442 te beschermen. Zonder deze toets
  // sluipt dat er zo weer in.
  const NIET_GEOOGST = '01111111111111';

  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '90' }),
      text: async () =>
        '<x><packagingMarkedLabelAccreditationCode>GREEN_DOT</packagingMarkedLabelAccreditationCode></x>',
    })) as unknown as typeof fetch;
  });

  it('een product dat NIET geoogst is deelt zijn cachesleutel tussen beide paden', async () => {
    await resolveDeclaredMarks(NIET_GEOOGST, GLN_MET, { useSnapshot: true });
    await resolveDeclaredMarks(NIET_GEOOGST, GLN_MET);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect([...redisStore.keys()]).toHaveLength(1);
    expect([...redisStore.keys()][0].endsWith(':snap')).toBe(false);
  });

  it('een product dat WEL geoogst is houdt zijn eigen naamruimte', async () => {
    await resolveDeclaredMarks(GTIN_MET, GLN_MET, { useSnapshot: true });
    expect([...redisStore.keys()].some((k) => k.endsWith(':snap'))).toBe(true);
  });
});

describe('de begrenzing van de cache-omzeiling is toetsbaar (punt 4)', () => {
  // De derde parameter kreeg standaard `true` en werd door geen enkele toets
  // meegegeven — draai je de begrenzing terug, dan bleef de suite groen. Precies het
  // faalpatroon van de vorige ronde, dus hier expliciet.
  const negatieveHit = { marks: [], reason: 'geen-tradeitem-bestand' } as const;

  it('een NIET-geoogst product gaat gewoon langs de cache in plaats van eromheen', () => {
    expect(shouldTreatCacheHitAsMiss(negatieveHit, true, false)).toBe(false);
  });

  it('een WEL geoogst product mag de cache omzeilen, anders bereikt de terugval hem nooit', () => {
    expect(shouldTreatCacheHitAsMiss(negatieveHit, true, true)).toBe(true);
  });

  it('zonder de vlag verandert er niets, ongeacht de momentopname', () => {
    expect(shouldTreatCacheHitAsMiss(negatieveHit, false, true)).toBe(false);
    expect(shouldTreatCacheHitAsMiss(negatieveHit, false, false)).toBe(false);
  });
});
