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
 *   AC7  de aandrijving is UITVOERBAAR — de commando's in de startscripts worden
 *        naast de werkelijke beschikbaarheid gelegd (het gecompileerde bestand,
 *        de inhoud van het beeld, de bestaande python-module), niet naast een
 *        markdownbestand
 *
 * AC7 staat in DEZE suite en niet in de ml-suite: vitest draait vanuit de
 * repository, terwijl de Python-toetsen in een container draaien waarin alleen
 * `app/` en `tests/` gekoppeld zijn — `_bmad-output/`, `scripts/` en de
 * `Dockerfile` zijn daar onbereikbaar.
 *
 * Alle helpers zijn puur en doen geen I/O — precies zoals
 * build-nutriscore-declared-map.ts en build-keurmerk-index.ts (`require.main`-
 * guard onderaan het script), zodat de test ze zonder main() kan importeren.
 */

import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  readFileSync,
  existsSync,
  statSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

import {
  splitIndexKey,
  buildDeclaredHarvestMap,
  serializeDeclaredHarvestMap,
  evaluateShrink,
  describeCounterPlan,
  declaredHarvestMapSignature,
  parseHarvestState,
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
function index(
  entries: Record<string, string[]>,
  extra: Partial<SourceIndexLike> = {}
): SourceIndexLike {
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
    expect(map.exclusions.overstroming.codes).toEqual(['RECYCLABLE_GENERAL_CLAIM', 'TRIMAN']);
    expect([...FLOOD_EXCLUDED_CODES].sort()).toEqual(['RECYCLABLE_GENERAL_CLAIM', 'TRIMAN']);
  });

  it('telt een uitgesloten paar niet mee als het via een andere veldsoort tóch in de kaart staat', () => {
    // Dezelfde code onder twee veldsoorten, met een overlappend product. Het
    // paar (A, 111) BLIJFT in de kaart — de uitsluiting geldt de sleutel, niet
    // de code — dus het als "uitgesloten" tellen zou hetzelfde paar twee keer
    // meetellen en het uitsluitingscijfer misleidend maken.
    const map = buildDeclaredHarvestMap(
      index({
        'NutritionalScore/A': ['111', '222'],
        'PackagingMarkedLabelAccreditationCode/A': ['111'],
      }),
      ['A'],
      NOW
    );

    expect(map.codes).toEqual({ A: ['111'] });
    // Alleen 222 valt er echt uit; 111 staat gewoon in de kaart.
    expect(map.exclusions.veldsoort.paren).toBe(1);
    expect(map.exclusions.veldsoort.codes).toEqual(['A']);
  });

  it('rekent een referentiecode met een andere schrijfwijze niet als actief', () => {
    // De kaart draagt hoofdletters en de matchquery van de oogst vergelijkt
    // HOOFDLETTERGEVOELIG (`rl.t3777_code = ANY($3::text[])`). Zou de bouwer
    // `fsc` als actief voor `FSC` tellen, dan kwam FSC in de kaart en leverde
    // hij daar per definitie stil nul matches op — de dure lege ronde die deze
    // story juist wegneemt. Nu staat hij zichtbaar op de wachtlijst.
    const map = buildDeclaredHarvestMap(
      index({ 'PackagingMarkedLabelAccreditationCode/FSC': ['111'] }),
      ['fsc'],
      NOW
    );

    expect(map.codes).toEqual({});
    expect(map.awaitingFirstReference).toEqual(['FSC']);
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
  /**
   * De vingerafdrukken hieronder zijn GEMETEN aan de draaiende python-module
   * (`_map_signature` in queue_harvest_declared.py, uitvoer van de ml-suite in
   * de wegwerpcontainer), niet in TypeScript nagerekend. Wijkt de bouwer af van
   * de oogst, dan valt deze toets om.
   */
  const GEMETEN_IN_PYTHON: Array<[Record<string, string[]>, string]> = [
    [{ A: ['111'] }, '1|ad368640e1c6a909185d65ab45596a8e'],
    [{ A: ['111', '222', '333'] }, '3|32c3bcf1cd29a9d131d0db65452bfba0'],
    [{ A: ['111', '222', '333'], B: ['444'] }, '4|4b6ac11b3d0e830623c8bd6c3e410a8b'],
  ];

  it('rekent dezelfde vingerafdruk uit als de oogst', () => {
    for (const [kaart, verwacht] of GEMETEN_IN_PYTHON) {
      expect(declaredHarvestMapSignature(kaart)).toBe(verwacht);
    }
  });

  it('de vingerafdruk hangt niet van de sleutelvolgorde af, wél van de paren', () => {
    expect(declaredHarvestMapSignature({ B: ['333'], A: ['222', '111'] })).toBe(
      declaredHarvestMapSignature({ A: ['111', '222'], B: ['333'] })
    );
    expect(declaredHarvestMapSignature({ A: ['111', '999'] })).not.toBe(
      declaredHarvestMapSignature({ A: ['111', '222'] })
    );
  });

  it('meldt dat de teller terug moet zodra de parenlijst in de KAART verandert', () => {
    const plan = describeCounterPlan({
      mapPairs: 1349,
      mapSignature: declaredHarvestMapSignature({ A: ['111'] }),
      statePairs: 1521,
      stateSignature: declaredHarvestMapSignature({ A: ['222'] }),
      inProgress: false,
    });
    expect(plan.reset).toBe(true);
    expect(plan.message).toContain('1521');
    expect(plan.message).toContain('1349');
  });

  it('meldt de teruggang OOK bij evenveel paren met een andere lijst', () => {
    // Eén product eruit, één erin — bij een wekelijkse herbouw uit een levende
    // index geen uitzondering. Op een TELLING meldde de bouwer hier "de teller
    // blijft staan" terwijl de oogst hem terugzet: het tegenovergestelde van
    // wat er gebeurt, op het scherm waarop een mens over --apply beslist.
    const plan = describeCounterPlan({
      mapPairs: 3,
      mapSignature: declaredHarvestMapSignature({ A: ['111', '999'], B: ['333'] }),
      statePairs: 3,
      stateSignature: declaredHarvestMapSignature({ A: ['111', '222'], B: ['333'] }),
      inProgress: false,
    });
    expect(plan.reset).toBe(true);
    expect(plan.message.toUpperCase()).toContain('ANDERE');
  });

  it('laat de teller staan als de kaart dezelfde parenlijst houdt', () => {
    const zelfde = declaredHarvestMapSignature({ A: ['111', '222'], B: ['333'] });
    const plan = describeCounterPlan({
      mapPairs: 3,
      mapSignature: zelfde,
      statePairs: 3,
      stateSignature: zelfde,
      inProgress: false,
    });
    expect(plan.reset).toBe(false);
  });

  it('zet de teller NIET terug als er een oogstrun loopt, en meldt dat — hij wacht niet', () => {
    const plan = describeCounterPlan({
      mapPairs: 1349,
      mapSignature: declaredHarvestMapSignature({ A: ['111'] }),
      statePairs: 1521,
      stateSignature: declaredHarvestMapSignature({ A: ['222'] }),
      inProgress: true,
    });
    expect(plan.reset).toBe(false);
    expect(plan.message.toLowerCase()).toContain('loopt');
  });

  it('doet geen uitspraak als het voortgangsbestand nog geen vingerafdruk draagt', () => {
    // Dezelfde regel als `_counter_reset_needed`: zonder vastgelegde vingerafdruk
    // zet de oogst niets terug — dat is de eerste run ná 20.20.
    const plan = describeCounterPlan({
      mapPairs: 1349,
      mapSignature: declaredHarvestMapSignature({ A: ['111'] }),
      statePairs: 1521,
      stateSignature: null,
      inProgress: false,
    });
    expect(plan.reset).toBe(false);
    expect(plan.message).toContain('vingerafdruk');
  });
});

// ===========================================================================
// AC7 — de aandrijving
// ===========================================================================

describe('AC7 — de aandrijving is uitvoerbaar, niet alleen opgeschreven', () => {
  const repoRoot = resolve(__dirname, '../../../../..');
  const runbook = resolve(repoRoot, '_bmad-output/implementation-artifacts/20-20-aandrijving.md');
  const mapScript = resolve(repoRoot, 'scripts/deployment/build-declared-harvest-map.sh');
  const harvestScript = resolve(repoRoot, 'scripts/deployment/declared-harvest.sh');

  /**
   * Draait een startscript ECHT, met een NAGEMAAKTE `docker` vóór in `PATH`.
   *
   * Her-review ronde 3 (L2): drie toetsen hieronder beweerden iets over gedrag
   * maar zochten een tekenreeks in het script (`PIPESTATUS`, `MEER DAN EEN`).
   * Zo'n toets blijft groen bij een `PIPESTATUS` die op de verkeerde plek staat
   * en valt om bij elke onschuldige herformulering. Bash draaien kost hier één
   * wegwerpmap en meet wél wat er gebeurt.
   *
   * Er wordt geen enkele echte container aangeraakt: de nagemaakte `docker`
   * antwoordt op `ps` met de namen die de toets kiest, schrijft bij `exec` zijn
   * argumenten weg en geeft de exitcode terug die de toets voorschrijft.
   */
  function draaiScript(
    script: string,
    opties: {
      containers?: string[];
      werkExitcode?: number;
      logbestand?: 'schrijfbaar' | 'onschrijfbaar';
      env?: Record<string, string>;
    } = {}
  ): { code: number; uitvoer: string; execArgs: string } {
    const {
      containers = ['ml-service-qsookwow8koko0kwg00g0cwk-203251989081'],
      werkExitcode = 0,
      logbestand = 'schrijfbaar',
      env = {},
    } = opties;

    const werkmap = mkdtempSync(join(tmpdir(), 'declared-harvest-toets-'));
    const binmap = join(werkmap, 'bin');
    mkdirSync(binmap);
    const argvBestand = join(werkmap, 'exec-argv');
    const namen = containers.map((n) => `'${n}'`).join(' ');
    const nepDocker = join(binmap, 'docker');
    writeFileSync(
      nepDocker,
      [
        '#!/usr/bin/env bash',
        'if [ "$1" = "ps" ]; then',
        containers.length ? `  printf '%s\n' ${namen}` : '  :',
        '  exit 0',
        'fi',
        'if [ "$1" = "exec" ]; then',
        `  printf '%s\n' "$@" > ${JSON.stringify(argvBestand)}`,
        `  exit ${werkExitcode}`,
        'fi',
        'exit 0',
        '',
      ].join('\n')
    );
    chmodSync(nepDocker, 0o755);

    // Een pad waarvan een DEEL geen map is: `mkdir -p` faalt en `tee` kan er niet
    // bij — precies het geval waarin `pipefail` de exitcode omdraaide.
    const log =
      logbestand === 'schrijfbaar'
        ? join(werkmap, 'run.log')
        : join(werkmap, 'run.log', 'kan-niet', 'run.log');
    if (logbestand === 'onschrijfbaar') writeFileSync(join(werkmap, 'run.log'), '');

    const res = spawnSync('bash', [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binmap}:${process.env.PATH ?? ''}`,
        DECLARED_HARVEST_LOG: log,
        DECLARED_HARVEST_MAP_LOG: log,
        ...env,
      },
    });

    return {
      code: res.status ?? -1,
      uitvoer: `${res.stdout ?? ''}${res.stderr ?? ''}`,
      execArgs: existsSync(argvBestand) ? readFileSync(argvBestand, 'utf8') : '',
    };
  }

  /**
   * DE KERN VAN DEZE BESCHRIJVING (code-review 20 aug 2026): de vorige AC7-toetsen
   * lazen `20-20-aandrijving.md` en controleerden of daar een paar woorden in
   * stonden. Zo'n toets houdt het artefact tegen zichzelf en bewijst niets: het
   * herbouwscript riep `npx tsx src/scripts/…` aan, een commando dat in het
   * beeld op acceptatie NIET kan draaien (de runtime-laag kopieert alleen `dist`,
   * en `tsx` staat in geen enkele package.json), en de toetsen kwamen er
   * ongehinderd doorheen. Wat hieronder staat legt elk commando uit de scripts
   * naast wat er werkelijk beschikbaar is.
   */

  it('roept het GECOMPILEERDE bestand aan, en dat bestand komt uit een bron die bestaat', () => {
    const script = readFileSync(mapScript, 'utf8');
    // Alleen de UITVOERBARE regels tellen; de kop legt bewust uit dat
    // `npx tsx src/…` de LOKALE route is en waarom hij op de omgeving niet werkt.
    const uitvoerbaar = script
      .split('\n')
      .filter((r) => !r.trimStart().startsWith('#'))
      .join('\n');

    // 1. Het commando zelf, letterlijk uit het script gehaald.
    const commando = uitvoerbaar.match(/docker exec[^\n]*\n?[^\n]*node\s+(\S+\.js)/);
    expect(commando, 'het script moet een node-commando met een .js-pad bevatten').not.toBeNull();
    const jsPad = commando![1];

    // 2. `npx tsx` en `src/` mogen er niet meer in staan — die route bestaat in
    //    het beeld niet.
    expect(uitvoerbaar).not.toContain('npx tsx');
    expect(uitvoerbaar).not.toMatch(/\bsrc\/scripts\//);

    // 3. Het aangeroepen dist-pad moet terug te voeren zijn op een bestaand
    //    bronbestand, via outDir/rootDir uit de echte tsconfig.
    const tsconfig = JSON.parse(
      readFileSync(resolve(repoRoot, 'apps/api/tsconfig.json'), 'utf8')
    ) as { compilerOptions: { outDir: string; rootDir: string } };
    const outDir = tsconfig.compilerOptions.outDir.replace(/^\.\//, '');
    const rootDir = tsconfig.compilerOptions.rootDir.replace(/^\.\//, '');
    expect(jsPad.startsWith(`${outDir}/`)).toBe(true);
    const bronPad = resolve(
      repoRoot,
      'apps/api',
      jsPad.replace(new RegExp(`^${outDir}/`), `${rootDir}/`).replace(/\.js$/, '.ts')
    );
    expect(existsSync(bronPad), `${jsPad} heeft geen bron ${bronPad}`).toBe(true);

    // 4. En dat `dist` zit ook echt in het beeld dat op acceptatie draait.
    const dockerfile = readFileSync(resolve(repoRoot, 'Dockerfile'), 'utf8');
    const runtime = dockerfile.slice(dockerfile.lastIndexOf('FROM '));
    expect(runtime).toMatch(/COPY[^\n]*\/dist \.\/dist/);
    // Het tegenbewijs: er wordt géén src gekopieerd.
    expect(runtime).not.toMatch(/COPY[^\n]*\/src /);
  });

  it('kan niet op `tsx` leunen, want dat pakket staat in geen enkele package.json', () => {
    // Dit is de reden dat de vorige route ook met een gemount `src/` niet werkte:
    // `npx` zou tsx tijdens de cron-run van het net moeten halen, als appuser,
    // met NODE_ENV=production.
    for (const pkg of ['package.json', 'apps/api/package.json', 'apps/web/package.json']) {
      const inhoud = JSON.parse(readFileSync(resolve(repoRoot, pkg), 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const alles = { ...(inhoud.dependencies ?? {}), ...(inhoud.devDependencies ?? {}) };
      expect(Object.keys(alles), `${pkg} zou tsx moeten missen`).not.toContain('tsx');
    }
  });

  it('zoekt de containernaam op in plaats van hem te raden', () => {
    const script = readFileSync(mapScript, 'utf8');
    const uitvoerbaar = script
      .split('\n')
      .filter((r) => !r.trimStart().startsWith('#'))
      .join('\n');
    // Coolify zet bij elke deploy een nieuw tijdstempel achter de naam, dus een
    // vaste naam klopt na de eerstvolgende deploy niet meer.
    expect(uitvoerbaar).toMatch(/docker ps[^\n]*--filter[^\n]*name=\^/);
    expect(uitvoerbaar).not.toContain('logo-recognition-api');
    // En als er niets gevonden wordt: stoppen met een melding, niet doorgaan.
    expect(uitvoerbaar).toMatch(/exit 1/);
  });

  it('start een oogstmodule die bestaat', () => {
    const script = readFileSync(harvestScript, 'utf8');
    const m = script.match(/python -m (\S+)/);
    expect(m, 'het script moet een python-module starten').not.toBeNull();
    const pad = resolve(repoRoot, 'apps/ml-service', `${m![1].replace(/\./g, '/')}.py`);
    expect(existsSync(pad), `${m![1]} bestaat niet als ${pad}`).toBe(true);
  });

  it('levert twee startscripts die uitvoerbaar zijn en een shebang hebben', () => {
    for (const pad of [harvestScript, mapScript]) {
      expect(existsSync(pad), `${pad} ontbreekt`).toBe(true);
      expect(readFileSync(pad, 'utf8').startsWith('#!')).toBe(true);
      // eslint-disable-next-line no-bitwise
      expect(statSync(pad).mode & 0o111, `${pad} is niet uitvoerbaar`).toBeGreaterThan(0);
    }
  });

  it('de prefix van het KAARTSCRIPT hoort bij de echte api-containernaamgeving', () => {
    // Symmetrisch aan de ml-prefix hieronder, en met dezelfde soort bewijs: dit
    // zijn namen waarop op acceptatie werkelijk `docker exec` is gedraaid
    // (review-20-18.md, review-20-19.md, 20-19-declaraties-uit-de-tradeitem-
    // database.md:449). De api-prefix was tot nu toe alleen als TEGENvoorbeeld
    // in de ml-toets getoetst — of hij zelf klopte, stond nergens.
    const bron = readFileSync(mapScript, 'utf8')
      .split('\n')
      .filter((r) => !r.trimStart().startsWith('#'))
      .join('\n');
    const prefix = bron.match(/API_CONTAINER_PREFIX:-([^}"]+)/)?.[1];
    expect(prefix, 'het script moet een prefix als standaardwaarde hebben').toBeTruthy();
    for (const gemeten of [
      'app-qsookwow8koko0kwg00g0cwk-134318329338',
      'app-qsookwow8koko0kwg00g0cwk-165822722086',
    ]) {
      expect(gemeten.startsWith(prefix!), `${gemeten} valt buiten de prefix`).toBe(true);
    }
    // En hij mag de ML-container niet vangen: die draait een ander commando.
    expect('ml-service-qsookwow8koko0kwg00g0cwk-203251989081'.startsWith(prefix!)).toBe(false);
  });

  it('stopt allebei de scripts bij MEER DAN EEN treffer in plaats van er een te gokken', () => {
    // Tijdens een blauw/groen-uitrol draaien er twee containers met dezelfde
    // prefix; `head -n 1` koos er dan willekeurig een, mogelijk juist de
    // container die wordt weggehaald. Gemeten in plaats van gelezen: het script
    // draait echt, met twee namen in de nagemaakte `docker`.
    for (const pad of [harvestScript, mapScript]) {
      const twee = draaiScript(pad, { containers: ['stack-aaa-111', 'stack-aaa-222'] });
      expect(twee.code, `${pad} koos er stilletjes een`).toBe(1);
      expect(twee.uitvoer).toContain('MEER DAN EEN');
      expect(twee.execArgs, `${pad} draaide het werk tóch`).toBe('');

      // En met precies één treffer draait hij gewoon door.
      const een = draaiScript(pad, { containers: ['stack-aaa-111'] });
      expect(een.code).toBe(0);
      expect(een.execArgs).toContain('stack-aaa-111');
    }
  });

  it('stopt allebei de scripts als er GEEN container is', () => {
    for (const pad of [harvestScript, mapScript]) {
      const geen = draaiScript(pad, { containers: [] });
      expect(geen.code).toBe(1);
      expect(geen.uitvoer).toMatch(/GEEN (ml|api)-container gevonden/);
      expect(geen.execArgs).toBe('');
    }
  });

  it('laat een onschrijfbaar logbestand de exitcode van het werk niet omdraaien', () => {
    // Met `pipefail` bepaalt de laatste falende schakel de uitkomst, en `tee`
    // faalt zodra het logpad niet schrijfbaar is — terwijl het werk gewoon
    // draait en de uitvoer op stdout staat. Een geslaagde run rapporteerde zo
    // een mislukking, in de enige richting die telt.
    for (const pad of [harvestScript, mapScript]) {
      const geslaagd = draaiScript(pad, { logbestand: 'onschrijfbaar' });
      expect(geslaagd.code, `${pad} meldt een geslaagde run als mislukt`).toBe(0);
      expect(geslaagd.uitvoer).toContain('niet schrijfbaar');
      expect(geslaagd.execArgs, `${pad} draaide het werk niet`).not.toBe('');

      // Andersom mag de eigen foutcode van het werk niet platgeslagen worden.
      const mislukt = draaiScript(pad, { logbestand: 'onschrijfbaar', werkExitcode: 3 });
      expect(mislukt.code, `${pad} verliest de foutcode van het werk`).toBe(3);

      // En met een schrijfbaar log verandert er niets aan de uitkomst.
      expect(draaiScript(pad, { werkExitcode: 3 }).code).toBe(3);
      expect(draaiScript(pad).code).toBe(0);
    }
  });

  it('laat allebei de scripts hun melding ergens aankomen', () => {
    // AC6 wil dat een geblokkeerde krimp "gemeld" wordt en AC8 dat een geweigerde
    // run "stopt met een melding". Een cron-proces heeft geen terminal: zonder
    // logbestemming is dat geen melding maar een geluidloze mislukking.
    for (const pad of [harvestScript, mapScript]) {
      const script = readFileSync(pad, 'utf8');
      expect(script, `${pad} schrijft nergens naartoe`).toMatch(/tee -a/);
      expect(script).toMatch(/LOG_FILE=/);
    }
  });

  it('geeft het tijdsbudget uit de runbook echt aan de container mee', () => {
    // De runbook schrijft voor de inhaalronde een tijdsbudget van tien uur voor,
    // en dáár hangt de vervaltijd van het slot aan: ging die niet mee, dan startte
    // de nachtelijke cron een tweede oogst midden in de inhaalronde.
    //
    // Deze toets pinde eerst de BRONTEKST van de python-module ('MAX_SECONDS +
    // LOCK_GRACE_SECONDS'), wat bij elke herformulering omvalt en niets meet. Het
    // numerieke bewijs dat de vervaltijd uit het budget volgt staat in de ml-suite
    // (`test_ac8_slot_dekt_een_inhaalronde_die_langer_duurt…`, die de functie echt
    // aanroept met dit budget). Hier hoort het stuk dat de ml-suite níet kan zien:
    // dat de runbook dat budget noemt en dat het startscript het ook werkelijk aan
    // de container doorgeeft in plaats van het aan de container-omgeving te laten.
    const tekst = readFileSync(runbook, 'utf8');
    const budget = Number(tekst.match(/DECLARED_HARVEST_MAX_SECONDS=(\d+)/)![1]);
    expect(budget).toBe(36000);

    const inhaal = draaiScript(harvestScript, {
      env: { DECLARED_HARVEST_MAX_SECONDS: String(budget) },
    });
    expect(inhaal.code).toBe(0);
    expect(inhaal.execArgs).toContain(`DECLARED_HARVEST_MAX_SECONDS=${budget}`);
    expect(inhaal.execArgs).toContain('app.services.queue_harvest_declared');

    // Zonder eigen budget draait de nachtelijke run op zijn kleine standaard —
    // die twee mogen elkaar niet overschrijven.
    expect(draaiScript(harvestScript).execArgs).toContain(
      'DECLARED_HARVEST_MAX_SECONDS=1000'
    );
  });

  it('leest het vingerafdrukveld dat de oogst ook echt schrijft', () => {
    // De bouwer meldt in de droogloop wat er met de teller gebeurt, en beslist
    // daarvoor op dezelfde vingerafdruk als de oogst. Wordt dat veld hernoemd,
    // dan meldt de droogloop stilletjes "nog geen vingerafdruk" en klopt het
    // scherm waarop een mens over --apply beslist niet meer.
    //
    // Het document hieronder is GEMETEN: letterlijk wat queue_harvest_declared.py
    // wegschreef in de wegwerpcontainer bij een gescopete debugrun naast een
    // nachtelijke stand. Deze toets zocht eerder de brontekst van die module af;
    // dat blijft groen bij een hernoemd veld met dezelfde regel eromheen.
    const gemetenStand = Buffer.from(
      JSON.stringify({
        map_pairs: 2,
        map_signature: '1349|nachtelijk',
        'map_signature:FSC': '2|045dbb622b3f93f005696e70ea457cf5',
        next_offset: 1,
        'next_offset:FSC': 2,
        total_pairs: 1349,
        'total_pairs:FSC': 2,
      }),
      'utf8'
    );

    const gelezen = parseHarvestState(gemetenStand);
    expect(gelezen.signature).toBe('1349|nachtelijk');
    expect(gelezen.signature, 'de bouwer leest de zijteller van een debugrun').not.toBe(
      '2|045dbb622b3f93f005696e70ea457cf5'
    );
    expect(gelezen.unavailable).toBeUndefined();
    expect(gelezen.inProgress).toBe(false);

    // Ontbreekt het bestand, dan is er niets te melden — en dat is iets anders
    // dan een leesfout, die `unavailable` zet.
    expect(parseHarvestState(null).signature).toBeNull();
    expect(parseHarvestState(null).unavailable).toBeUndefined();
    expect(parseHarvestState(Buffer.from('{ dit is geen json', 'utf8')).unavailable).toBeTruthy();
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
});

// ===========================================================================
// AC1 — de modus: droogloop is de STANDAARD, --apply schrijft
// ===========================================================================

describe('AC1 — droogloop is de standaard', () => {
  /** Alle I/O geïnjecteerd; deze suite raakt nooit de echte opslag of database. */
  function deps(over: Partial<Parameters<typeof runBuild>[0]> = {}) {
    return {
      readIndex: vi
        .fn()
        .mockResolvedValue(index({ 'PackagingMarkedLabelAccreditationCode/FSC': ['111', '222'] })),
      listActiveReferenceCodes: vi.fn().mockResolvedValue(['FSC']),
      readExistingPairs: vi.fn().mockResolvedValue({ soort: 'geen' }),
      readHarvestState: vi
        .fn()
        .mockResolvedValue({ pairs: null, signature: null, inProgress: false }),
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
    const d = deps({
      readExistingPairs: vi.fn().mockResolvedValue({ soort: 'gelezen', paren: 100 }),
    });
    expect(await runBuild(d, { apply: true, force: false }, NOW)).toBe(1);
    expect(d.writeMap).not.toHaveBeenCalled();
  });

  it('AC6 — --force zet de blokkade bewust opzij en schrijft wél', async () => {
    const d = deps({
      readExistingPairs: vi.fn().mockResolvedValue({ soort: 'gelezen', paren: 100 }),
    });
    expect(await runBuild(d, { apply: true, force: true }, NOW)).toBe(0);
    expect(d.writeMap).toHaveBeenCalledTimes(1);
  });

  it('AC6 — de droogloop geeft GEEN foutcode bij een geblokkeerde krimp', async () => {
    // Een run die per definitie niets schrijft is niet kapot omdat het schrijven
    // zou zijn tegengehouden. Exitcode 1 leest in een cron-keten of in CI als
    // "stuk" in plaats van als "let op".
    const d = deps({
      readExistingPairs: vi.fn().mockResolvedValue({ soort: 'gelezen', paren: 100 }),
    });
    expect(await runBuild(d, { apply: false, force: false }, NOW)).toBe(0);
    expect(d.writeMap).not.toHaveBeenCalled();
  });

  it('AC6 — de droogloop MELDT de krimp, zodat je hem niet pas bij het schrijven ontdekt', async () => {
    const d = deps({
      readExistingPairs: vi.fn().mockResolvedValue({ soort: 'gelezen', paren: 100 }),
    });
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

describe('AC7 — ook het OOGST-script moet zijn container kunnen vinden', () => {
  // Dezelfde fout als in het kaartscript, alleen niet door de code review genoemd:
  // de containernaam draagt een deploy-tijdstempel en verandert bij elke uitrol.
  // Gemeten op acceptatie: `ml-service-qsookwow8koko0kwg00g0cwk-203251989081`.
  // Een vaste naam raden geeft "no such container" — en dat leest een week lang
  // als "er gebeurt niets" in plaats van als een fout.
  const oogstScript = resolve(
    __dirname,
    '../../../../..',
    'scripts/deployment/declared-harvest.sh'
  );

  const uitvoerbaar = (): string =>
    readFileSync(oogstScript, 'utf8')
      .split('\n')
      .filter((r) => !r.trimStart().startsWith('#'))
      .join('\n');

  it('zoekt de container op prefix in plaats van een vaste naam te raden', () => {
    const bron = uitvoerbaar();
    expect(bron).toMatch(/docker ps --filter "name=\^\$\{CONTAINER_PREFIX\}"/);
    // Geen hardgecodeerde naam meer als standaardwaarde.
    expect(bron).not.toMatch(/ML_CONTAINER:-logo-recognition-ml/);
  });

  it('stopt met een melding als er geen container gevonden wordt', () => {
    const bron = uitvoerbaar();
    expect(bron).toMatch(/GEEN ml-container gevonden/);
    expect(bron).toMatch(/exit 1/);
  });

  it('de prefix die het script gebruikt hoort bij de echte containernaamgeving', () => {
    // De naam is `ml-service-<stack>-<tijdstempel>`; de prefix moet daar op passen
    // en mag niet per ongeluk de api-container vangen.
    const bron = uitvoerbaar();
    const prefix = bron.match(/ML_CONTAINER_PREFIX:-([^}"]+)/)?.[1];
    expect(prefix, 'het script moet een prefix als standaardwaarde hebben').toBeTruthy();
    expect('ml-service-qsookwow8koko0kwg00g0cwk-203251989081'.startsWith(prefix!)).toBe(true);
    expect('app-qsookwow8koko0kwg00g0cwk-172947820858'.startsWith(prefix!)).toBe(false);
  });
});

describe('her-review ronde 3 — een ONLEESBARE kaart is geen eerste run', () => {
  // `readExistingPairs` gaf `null` voor "bestaat niet" én "onleesbaar". Bij `null`
  // slaat de krimpbescherming van AC6 over, dus één leesfout tijdens de onbewaakte
  // wekelijkse `--apply` zou de kaart ongecontroleerd overschrijven. Precies het
  // onderscheid dat in de oogst al twee keer wél is aangebracht.
  function deps(over: Partial<Parameters<typeof runBuild>[0]> = {}) {
    return {
      readIndex: vi
        .fn()
        .mockResolvedValue(index({ 'PackagingMarkedLabelAccreditationCode/FSC': ['111', '222'] })),
      listActiveReferenceCodes: vi.fn().mockResolvedValue(['FSC']),
      readExistingPairs: vi.fn().mockResolvedValue({ soort: 'geen' }),
      readHarvestState: vi
        .fn()
        .mockResolvedValue({ pairs: null, signature: null, inProgress: false }),
      writeMap: vi.fn().mockResolvedValue(undefined),
      ...over,
    };
  }

  const onleesbaar = { soort: 'onleesbaar' as const, reden: 'onleesbare JSON' };

  it('weigert te schrijven en geeft een foutcode', async () => {
    const d = deps({ readExistingPairs: vi.fn().mockResolvedValue(onleesbaar) });
    expect(await runBuild(d, { apply: true, force: false })).not.toBe(0);
    expect(d.writeMap).not.toHaveBeenCalled();
  });

  it('gaat wél door met --force, want dan is het een bewuste keuze', async () => {
    const d = deps({ readExistingPairs: vi.fn().mockResolvedValue(onleesbaar) });
    expect(await runBuild(d, { apply: true, force: true })).toBe(0);
    expect(d.writeMap).toHaveBeenCalled();
  });

  it('een ECHTE eerste run (geen kaart) mag gewoon schrijven', async () => {
    const d = deps({ readExistingPairs: vi.fn().mockResolvedValue({ soort: 'geen' }) });
    expect(await runBuild(d, { apply: true, force: false })).toBe(0);
    expect(d.writeMap).toHaveBeenCalled();
  });

  it('een onleesbaar voortgangsbestand laat de bouwer niets voorspellen', async () => {
    // De oogst zet de teller bij een leesfout terug; voorspellen dat hij blijft
    // staan is dan het tegenovergestelde van wat er gebeurt.
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));
    const d = deps({
      readHarvestState: vi.fn().mockResolvedValue({
        pairs: null,
        signature: null,
        inProgress: false,
        unavailable: 'leesfout',
      }),
    });
    await runBuild(d, { apply: false, force: false });
    spy.mockRestore();

    const regel = logs.find((l) => l.includes('Teller van de oogst'));
    expect(regel).toMatch(/ONLEESBAAR/);
    expect(regel).not.toMatch(/blijft staan/);
  });
});

describe('her-review ronde 3 — de nachtelijke oogst mag niet in een zijteller belanden', () => {
  it('maakt DECLARED_HARVEST_CODES expliciet leeg', () => {
    // Sinds de teller scope-bewust is, schrijft een gescopete run zijn voortgang
    // onder een eigen veld. Een blijvende debug-instelling in de container zou de
    // nachtelijke voortgang daar stil in parkeren.
    const bron = readFileSync(
      resolve(__dirname, '../../../../..', 'scripts/deployment/declared-harvest.sh'),
      'utf8'
    )
      .split('\n')
      .filter((r) => !r.trimStart().startsWith('#'))
      .join('\n');

    expect(bron).toMatch(/-e DECLARED_HARVEST_CODES=""/);
  });
});
