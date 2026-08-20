/**
 * Story 20.20 — de bouwer van de declaratie-oogst-kaart (ATDD).
 *
 * De kaart die de declaratie-oogst leest werd tot nu toe MET DE HAND gemaakt en
 * stond daarom sinds 16 juli stil terwijl de keurmerkindex doorgroeide. Deze
 * suite legt het gedrag van de vastgelegde bouwer vast:
 *
 *   AC1  vorm, herkomst en modus (--dry-run is de standaard, --apply schrijft)
 *   AC2  drie uitsluitingen, elk met de reden erbij + de wachtlijst
 *   AC3  botsende codes worden samengevoegd, niet overschreven
 *   AC5  wanneer de teller van de oogst terug moet, en wat er gebeurt als er een
 *        run loopt
 *   AC6  krimpbescherming met een getal, --force, eerste run en droogloop
 *   AC7  de aandrijving ligt vastgelegd — inhalen en bijhouden apart, de kaart
 *        wordt periodiek herbouwd, en de starttijd botst niet met de volume-oogst
 *
 * AC7 staat in DEZE suite en niet in de ml-suite: vitest draait vanuit de
 * repository, terwijl de Python-toetsen in een container draaien waarin alleen
 * `app/` en `tests/` gekoppeld zijn — `_bmad-output/` is daar onbereikbaar.
 *
 * Alle helpers zijn puur en doen geen I/O — precies zoals
 * build-nutriscore-declared-map.ts en build-keurmerk-index.ts (`require.main`-
 * guard onderaan het script), zodat de test ze zonder main() kan importeren.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  splitIndexKey,
  buildDeclaredHarvestMap,
  serializeDeclaredHarvestMap,
  evaluateShrink,
  describeCounterPlan,
  runBuild,
  DECLARED_HARVEST_MAP_OBJECT_KEY,
  SOURCE_INDEX_OBJECT_KEY,
  EXCLUDED_FIELD_TYPES,
  FLOOD_EXCLUDED_CODES,
  SHRINK_TOLERANCE,
  type SourceIndexLike,
} from '../../scripts/build-declared-harvest-map';

const NOW = new Date('2026-08-20T09:00:00.000Z');

/** Minimale index-vorm: sleutel `<veldsoort>/<code>` → vermeldingen met gtin. */
function index(entries: Record<string, string[]>, extra: Partial<SourceIndexLike> = {}): SourceIndexLike {
  const built: SourceIndexLike['entries'] = {};
  for (const [key, gtins] of Object.entries(entries)) {
    built[key] = gtins.map((gtin) => ({ gtin, gln: '8712345000000', labels: [`${gtin}.pdf`] }));
  }
  return { builtAt: '2026-08-19T10:00:00.000Z', entries: built, ...extra };
}

// ===========================================================================
// AC1 — vorm, herkomst, modus
// ===========================================================================

describe('AC1 — de kaart is een eerlijke afgeleide van de index', () => {
  it('bouwt {codes: {code: [gtin, ...]}} uit de index', () => {
    const map = buildDeclaredHarvestMap(
      index({ 'PackagingMarkedLabelAccreditationCode/FSC': ['111', '222'] }),
      ['FSC'],
      NOW
    );

    expect(map.codes).toEqual({ FSC: ['111', '222'] });
    expect(map.summary).toMatchObject({ codes: 1, products: 2, pairs: 2 });
  });

  it('draagt builtAt, de sleutel van de bronindex en de toegepaste uitsluitingen', () => {
    const map = buildDeclaredHarvestMap(
      index({ 'PackagingMarkedLabelAccreditationCode/FSC': ['111'] }),
      ['FSC'],
      NOW
    );

    expect(map.builtAt).toBe(NOW.toISOString());
    expect(map.sourceIndex.key).toBe(SOURCE_INDEX_OBJECT_KEY);
    expect(map.sourceIndex.builtAt).toBe('2026-08-19T10:00:00.000Z');
    // Alle drie de uitsluitingen staan er, elk met een reden — ook als ze in
    // deze run niets weghaalden. Anders is niet af te lezen wat er is toegepast.
    expect(Object.keys(map.exclusions).sort()).toEqual([
      'overstroming',
      'veldsoort',
      'zonderActieveReferentie',
    ]);
    for (const record of Object.values(map.exclusions)) {
      expect(record.reden.length).toBeGreaterThan(10);
      expect(typeof record.paren).toBe('number');
    }
  });

  it('splitst de indexsleutel op de EERSTE schuine streep', () => {
    // Een code die zelf een schuine streep draagt hoort heel te blijven; splitsen
    // op de laatste streep zou de veldsoort meesleuren in de code.
    expect(splitIndexKey('EU_consumerUsageLabelCodeList/AGE_18')).toEqual({
      fieldType: 'EU_consumerUsageLabelCodeList',
      code: 'AGE_18',
    });
    expect(splitIndexKey('NutritionalScore/A/B')).toEqual({
      fieldType: 'NutritionalScore',
      code: 'A/B',
    });
  });

  it('schrijft naar de sleutel die de oogst leest', () => {
    expect(DECLARED_HARVEST_MAP_OBJECT_KEY).toBe('flywheel-index/declared-harvest-map.json');
  });

  it('serialiseert deterministisch — dezelfde invoer geeft dezelfde bytes', () => {
    const bron = index({
      'PackagingMarkedLabelAccreditationCode/ZZZ': ['222', '111'],
      'PackagingMarkedLabelAccreditationCode/AAA': ['333'],
    });
    const a = serializeDeclaredHarvestMap(buildDeclaredHarvestMap(bron, ['ZZZ', 'AAA'], NOW));
    const b = serializeDeclaredHarvestMap(buildDeclaredHarvestMap(bron, ['AAA', 'ZZZ'], NOW));
    expect(a).toBe(b);
    expect(Object.keys(JSON.parse(a).codes)).toEqual(['AAA', 'ZZZ']);
  });
});

// ===========================================================================
// AC2 — drie uitsluitingen, elk met de reden erbij
// ===========================================================================

describe('AC2 — kansloos rekenwerk gaat eruit, met de reden erbij', () => {
  it('sluit de veldsoort NutritionalScore uit', () => {
    // Sleutel geeft A..E, de referenties heten NUTRISCORE_A..E; en er bestaat al
    // een eigen Nutri-Score-oogst met een eigen markering.
    const map = buildDeclaredHarvestMap(
      index({
        'NutritionalScore/A': ['111', '222'],
        'PackagingMarkedLabelAccreditationCode/FSC': ['333'],
      }),
      ['A', 'FSC'],
      NOW
    );

    expect(map.codes).toEqual({ FSC: ['333'] });
    expect(map.exclusions.veldsoort.paren).toBe(2);
    expect(map.exclusions.veldsoort.codes).toEqual(['A']);
    expect(EXCLUDED_FIELD_TYPES.has('NutritionalScore')).toBe(true);
  });

  it('sluit codes zonder ook maar één actieve referentie uit en zet ze op de wachtlijst', () => {
    // De oogst zoekt strikt in de eigen referentiepool van een code — zonder
    // referentie levert die zoektocht per definitie niets op.
    const map = buildDeclaredHarvestMap(
      index({
        'PackagingMarkedLabelAccreditationCode/FSC': ['111'],
        'PackagingMarkedLabelAccreditationCode/NOG_NIETS': ['111', '222', '333'],
      }),
      ['FSC'],
      NOW
    );

    expect(map.codes).toEqual({ FSC: ['111'] });
    expect(map.exclusions.zonderActieveReferentie.paren).toBe(3);
    expect(map.exclusions.zonderActieveReferentie.codes).toEqual(['NOG_NIETS']);
    // Zichtbaar blijven wat er blijft liggen: de brug naar de vervolgstory.
    expect(map.awaitingFirstReference).toEqual(['NOG_NIETS']);
  });

  it('sluit de twee overstromingscodes uit, ook al hébben ze een actieve referentie', () => {
    // Precies het gat uit de tegenleesronde: geen van de andere twee
    // uitsluitingen ving RECYCLABLE_GENERAL_CLAIM en TRIMAN.
    const map = buildDeclaredHarvestMap(
      index({
        'PackagingMarkedLabelAccreditationCode/RECYCLABLE_GENERAL_CLAIM': ['111', '222'],
        'PackagingMarkedLabelAccreditationCode/TRIMAN': ['111'],
        'PackagingMarkedLabelAccreditationCode/FSC': ['333'],
      }),
      ['RECYCLABLE_GENERAL_CLAIM', 'TRIMAN', 'FSC'],
      NOW
    );

    expect(map.codes).toEqual({ FSC: ['333'] });
    expect(map.exclusions.overstroming.paren).toBe(3);
    expect(map.exclusions.overstroming.codes).toEqual([
      'RECYCLABLE_GENERAL_CLAIM',
      'TRIMAN',
    ]);
    expect([...FLOOD_EXCLUDED_CODES].sort()).toEqual([
      'RECYCLABLE_GENERAL_CLAIM',
      'TRIMAN',
    ]);
  });

  it('zet een overstromingscode nooit op de wachtlijst voor een eerste referentie', () => {
    // De overstroming is een absolute uitsluiting; hem als "wacht op een eerste
    // referentie" tonen zou beloven dat hij ooit terugkomt.
    const map = buildDeclaredHarvestMap(
      index({ 'PackagingMarkedLabelAccreditationCode/TRIMAN': ['111'] }),
      [],
      NOW
    );
    expect(map.awaitingFirstReference).toEqual([]);
    expect(map.exclusions.overstroming.codes).toEqual(['TRIMAN']);
  });
});

// ===========================================================================
// AC3 — botsende codes
// ===========================================================================

describe('AC3 — botsende codes worden samengevoegd, niet overschreven', () => {
  it('voegt dezelfde code onder twee veldsoorten samen en ontdubbelt', () => {
    // PREGNANCY_WARNING komt onder EU_consumerUsageLabelCodeList (130 producten)
    // én PackagingMarkedLabelAccreditationCode (2) voor. Naïef omzetten gooit
    // 130 producten weg voor 2.
    const veel = Array.from({ length: 130 }, (_, i) => String(1000 + i));
    const map = buildDeclaredHarvestMap(
      index({
        'EU_consumerUsageLabelCodeList/PREGNANCY_WARNING': veel,
        // '1000' zit in beide lijsten — mag maar één keer in de kaart staan.
        'PackagingMarkedLabelAccreditationCode/PREGNANCY_WARNING': ['1000', '9999'],
      }),
      ['PREGNANCY_WARNING'],
      NOW
    );

    expect(map.codes.PREGNANCY_WARNING).toHaveLength(131);
    expect(map.codes.PREGNANCY_WARNING).toContain('9999');
    expect(map.codes.PREGNANCY_WARNING).toContain('1000');
    expect(new Set(map.codes.PREGNANCY_WARNING).size).toBe(131);
    expect(map.summary.pairs).toBe(131);
  });
});

// ===========================================================================
// AC6 — krimpbescherming
// ===========================================================================

describe('AC6 — krimpbescherming met een getal', () => {
  it('blokkeert een kaart die meer dan 10% kleiner is in paren', () => {
    const verdict = evaluateShrink({ freshPairs: 800, existingPairs: 1000, force: false });
    expect(verdict.blocked).toBe(true);
    expect(verdict.shrinkPct).toBeCloseTo(0.2, 5);
    expect(verdict.message).toContain('800');
    expect(verdict.message).toContain('1000');
  });

  it('laat precies 10% krimp door — de grens blokkeert niet zelf', () => {
    expect(evaluateShrink({ freshPairs: 900, existingPairs: 1000, force: false }).blocked).toBe(
      false
    );
    expect(evaluateShrink({ freshPairs: 899, existingPairs: 1000, force: false }).blocked).toBe(
      true
    );
    expect(SHRINK_TOLERANCE).toBe(0.1);
  });

  it('laat groei altijd door', () => {
    expect(evaluateShrink({ freshPairs: 1400, existingPairs: 1000, force: false }).blocked).toBe(
      false
    );
  });

  it('--force overschrijft de blokkade bewust, maar meldt de krimp nog steeds', () => {
    const verdict = evaluateShrink({ freshPairs: 800, existingPairs: 1000, force: true });
    expect(verdict.blocked).toBe(false);
    expect(verdict.shrinkPct).toBeCloseTo(0.2, 5);
    expect(verdict.message).toBeTruthy();
  });

  it('blokkeert niet als er nog geen kaart is (eerste run)', () => {
    const verdict = evaluateShrink({ freshPairs: 10, existingPairs: null, force: false });
    expect(verdict.blocked).toBe(false);
    expect(verdict.shrinkPct).toBeNull();
  });

  it('blokkeert niet als de bestaande kaart nul paren had', () => {
    // Delen door nul mag geen krimppercentage verzinnen.
    const verdict = evaluateShrink({ freshPairs: 10, existingPairs: 0, force: false });
    expect(verdict.blocked).toBe(false);
    expect(verdict.shrinkPct).toBeNull();
  });
});

// ===========================================================================
// AC5 — de teller van de oogst
// ===========================================================================

describe('AC5 — wanneer de teller terug moet', () => {
  it('meldt dat de teller terug moet zodra de paren in de KAART veranderen', () => {
    const plan = describeCounterPlan({ mapPairs: 1349, statePairs: 1521, inProgress: false });
    expect(plan.reset).toBe(true);
    expect(plan.message).toContain('1521');
    expect(plan.message).toContain('1349');
  });

  it('laat de teller staan als de kaart dezelfde paren houdt', () => {
    expect(describeCounterPlan({ mapPairs: 1349, statePairs: 1349, inProgress: false }).reset).toBe(
      false
    );
  });

  it('zet de teller NIET terug als er een oogstrun loopt, en meldt dat — hij wacht niet', () => {
    const plan = describeCounterPlan({ mapPairs: 1349, statePairs: 1521, inProgress: true });
    expect(plan.reset).toBe(false);
    expect(plan.message.toLowerCase()).toContain('loopt');
  });

  it('doet geen uitspraak als het voortgangsbestand nog geen parenaantal draagt', () => {
    const plan = describeCounterPlan({ mapPairs: 1349, statePairs: null, inProgress: false });
    expect(plan.reset).toBe(false);
  });
});

// ===========================================================================
// AC7 — de aandrijving
// ===========================================================================

describe('AC7 — de aandrijving ligt vastgelegd', () => {
  const repoRoot = resolve(__dirname, '../../../../..');
  const runbook = resolve(repoRoot, '_bmad-output/implementation-artifacts/20-20-aandrijving.md');

  it('beschrijft wie start, hoe vaak en met welk tijdsbudget', () => {
    expect(existsSync(runbook)).toBe(true);
    const tekst = readFileSync(runbook, 'utf8');

    // Inhalen en bijhouden zijn twee verschillende dingen met twee budgetten.
    expect(tekst).toContain('DECLARED_HARVEST_MAX_SECONDS');
    expect(tekst).toContain('36000'); // de eenmalige inhaalronde
    expect(tekst).toContain('1000'); // het nachtelijke budget
    // Wat er gestart wordt, en waar.
    expect(tekst).toContain('queue_harvest_declared');
    expect(tekst).toContain('vanilla');
    // De kaart wordt óók periodiek herbouwd, niet alleen de oogst gestart.
    expect(tekst).toContain('build-declared-harvest-map');
  });

  it('laat de declaratie-oogst niet op 3:37 starten — dat is de volume-oogst', () => {
    const tekst = readFileSync(runbook, 'utf8');
    const cronregels = [...tekst.matchAll(/^\s*(\d+)\s+(\d+)\s+\*\s+\*\s+\*/gm)].map(
      (m) => `${m[1]} ${m[2]}`
    );
    // De bestaande volume-start hoort erin te staan als de botsing die vermeden wordt.
    expect(cronregels).toContain('37 3');
    // En er moet minstens één EIGEN dagelijkse start zijn, op een ander tijdstip.
    const eigen = cronregels.filter((r) => r !== '37 3');
    expect(eigen.length).toBeGreaterThan(0);
  });

  it('benoemt per instelling in welke container hij gezet wordt', () => {
    const tekst = readFileSync(runbook, 'utf8');
    // De twee diensten draaien in aparte containers; "op een plek" bestaat niet.
    expect(tekst).toContain('ml-service-container');
    expect(tekst).toMatch(/\*\*api\*\*-container|api-container/);
  });

  it('legt vast dat de ml-service het voortgangsbestand schrijft, niet de bouwer', () => {
    const tekst = readFileSync(runbook, 'utf8');
    expect(tekst).toContain('declared-harvest-state.json');
    expect(tekst).toMatch(/declared-harvest-state\.json[^|]*\|[^|]*ml-service/);
  });

  it('levert de twee startscripts mee, zodat plaatsen een kopieeractie is', () => {
    for (const naam of ['declared-harvest.sh', 'build-declared-harvest-map.sh']) {
      const pad = resolve(repoRoot, 'scripts/deployment', naam);
      expect(existsSync(pad), `${naam} ontbreekt`).toBe(true);
    }
  });
});

// ===========================================================================
// AC1 — de modus: droogloop is de STANDAARD, --apply schrijft
// ===========================================================================

describe('AC1 — droogloop is de standaard', () => {
  /** Alle I/O geïnjecteerd; deze suite raakt nooit de echte opslag of database. */
  function deps(over: Partial<Parameters<typeof runBuild>[0]> = {}) {
    return {
      readIndex: vi.fn().mockResolvedValue(
        index({ 'PackagingMarkedLabelAccreditationCode/FSC': ['111', '222'] })
      ),
      listActiveReferenceCodes: vi.fn().mockResolvedValue(['FSC']),
      readExistingPairs: vi.fn().mockResolvedValue(null),
      readHarvestState: vi.fn().mockResolvedValue({ pairs: null, inProgress: false }),
      writeMap: vi.fn().mockResolvedValue(undefined),
      ...over,
    };
  }

  it('schrijft NIETS zonder --apply', async () => {
    const d = deps();
    const code = await runBuild(d, { apply: false, force: false }, NOW);
    expect(code).toBe(0);
    expect(d.writeMap).not.toHaveBeenCalled();
  });

  it('schrijft de kaart met --apply', async () => {
    const d = deps();
    const code = await runBuild(d, { apply: true, force: false }, NOW);
    expect(code).toBe(0);
    expect(d.writeMap).toHaveBeenCalledTimes(1);
    const geschreven = JSON.parse((d.writeMap.mock.calls[0][0] as Buffer).toString('utf8'));
    expect(geschreven.codes).toEqual({ FSC: ['111', '222'] });
  });

  it('stopt met een foutcode als de bronindex ontbreekt', async () => {
    const d = deps({ readIndex: vi.fn().mockResolvedValue(null) });
    expect(await runBuild(d, { apply: true, force: false }, NOW)).toBe(1);
    expect(d.writeMap).not.toHaveBeenCalled();
  });

  it('AC6 — een geblokkeerde krimp schrijft niet en geeft een foutcode', async () => {
    const d = deps({ readExistingPairs: vi.fn().mockResolvedValue(100) });
    expect(await runBuild(d, { apply: true, force: false }, NOW)).toBe(1);
    expect(d.writeMap).not.toHaveBeenCalled();
  });

  it('AC6 — --force zet de blokkade bewust opzij en schrijft wél', async () => {
    const d = deps({ readExistingPairs: vi.fn().mockResolvedValue(100) });
    expect(await runBuild(d, { apply: true, force: true }, NOW)).toBe(0);
    expect(d.writeMap).toHaveBeenCalledTimes(1);
  });

  it('AC6 — de droogloop MELDT de krimp, zodat je hem niet pas bij het schrijven ontdekt', async () => {
    const d = deps({ readExistingPairs: vi.fn().mockResolvedValue(100) });
    const gemeld: string[] = [];
    const err = vi.spyOn(console, 'error').mockImplementation((m) => gemeld.push(String(m)));
    const log = vi.spyOn(console, 'log').mockImplementation((m) => gemeld.push(String(m)));
    await runBuild(d, { apply: false, force: false }, NOW);
    err.mockRestore();
    log.mockRestore();
    expect(gemeld.join('\n')).toContain('krimp');
    expect(d.writeMap).not.toHaveBeenCalled();
  });
});
