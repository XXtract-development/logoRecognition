/**
 * Controle-cohort seed-import (Story 16.4, AC1, ARCH-4/AD-13).
 *
 * Legt het VASTE controle-cohort (~100 GTINs) éénmalig vast in `system_settings`
 * onder de key `flywheel.control-cohort`. Het cohort voedt de maandelijkse
 * bevestigingsgraad-trend (SM-3): de lijst moet STABIEL zijn over runs heen, zodat
 * een stijgende CONFIRMED-ratio toe te schrijven is aan referentiegroei en niet
 * aan een veranderende productmix.
 *
 * Handmatig gestart, idempotent script met droge-run (envelope §3 — NOOIT
 * automatisch bij deploy/migratie/startup):
 *
 *   # eerst het plan bekijken zonder te schrijven:
 *   DATABASE_URL=... npx tsx src/scripts/seed-control-cohort.ts --dry-run
 *   # daarna de echte vastlegging:
 *   DATABASE_URL=... npx tsx src/scripts/seed-control-cohort.ts
 *
 * IDEMPOTENTIE + STABILITEIT (AC1): staat de key al in `system_settings`, dan
 * WIJZIGT dit script de lijst NIET (een tweede run is een no-op). Een bewuste
 * wijziging vereist `--force`: dat schrijft een NIEUWE definitie met een nieuwe
 * `capturedAt` en START DAARMEE EEN NIEUWE TRENDLIJN (gelogd). Zo kan de lijst
 * nooit stilzwijgend muteren.
 *
 * SELECTIE (AC1): GTINs mét artwork én mét declaratie (reason `ok`), gespreid over
 * veel-gedeclareerde codes. Bron: de bevroren `declared-marks-goldset.json` (GTINs
 * met op artwork vastgelegde declaraties, afgeleid uit prod-data) — een offline,
 * herhaalbare basis (identiek patroon als seed-gold-set.ts). De spreiding gebeurt
 * round-robin over de gedeclareerde codes zodat geen enkele code het cohort
 * domineert (frequentiedoc `tests/validation/keurmerk-declaratie-frequentie.md`
 * als context).
 *
 * Dit bestand exporteert PURE helpers (parsing + selectie) zodat de unit-test ze
 * kan importeren zonder `main()` te draaien (`require.main`-guard onderaan). De
 * helpers doen GEEN I/O.
 */

import fs from 'fs';
import path from 'path';
import prisma from '../core/db';
import { setSetting, getSetting } from '../services/flywheel/system-settings';
import {
  CONTROL_COHORT_SETTING_KEY,
  type ControlCohortDefinition,
} from '../services/flywheel/control-cohort';

/** Doel-omvang van het cohort (~100). Overschrijfbaar via `--size=N`. */
export const DEFAULT_COHORT_SIZE = 100;

/** Selectiecriterium-tekst die in de definitie wordt vastgelegd (herleidbaarheid). */
export const SELECTION_CRITERION =
  'GTINs met artwork én declaratie (reason ok), gespreid round-robin over ' +
  'veel-gedeclareerde T3777-codes; bron declared-marks-goldset.json (Story 16.4, SM-3).';

/** Eén entry uit declared-marks-goldset.json (GTIN → gedeclareerde codes). */
export interface DeclaredMarksEntry {
  _id: string;
  codes: string[];
}

// ---------------------------------------------------------------------------
// PURE selectie (geen I/O — testbaar zonder main())
// ---------------------------------------------------------------------------

/**
 * Selecteer tot `size` GTINs uit de bron, gespreid over de gedeclareerde codes.
 *
 * Algoritme (deterministisch → stabiel bij herhaalde samenstelling):
 *   1. Filter entries zonder GTIN of zonder codes weg (geen declaratie = niet
 *      bruikbaar als CONFIRMED-ratio-bron).
 *   2. Round-robin over de codes: neem beurtelings een nog niet-gekozen GTIN die
 *      die code declareert, tot `size` bereikt is of de bron op is. Zo krijgt geen
 *      enkele code een onevenredig aandeel (spreidingscheck).
 *   3. Behoud invoervolgorde als tie-break → dezelfde bron levert dezelfde lijst.
 *
 * De uitkomst is een gededupliceerde, geordende GTIN-lijst.
 */
export function selectCohortGtins(
  entries: DeclaredMarksEntry[],
  size: number = DEFAULT_COHORT_SIZE
): string[] {
  // Genormaliseerde, bruikbare entries (GTIN + ≥1 code), invoervolgorde behouden.
  const usable = entries
    .map((e) => ({
      gtin: typeof e._id === 'string' ? e._id.trim() : '',
      codes: Array.isArray(e.codes)
        ? e.codes.filter((c): c is string => typeof c === 'string' && c.length > 0)
        : [],
    }))
    .filter((e) => e.gtin.length > 0 && e.codes.length > 0);

  // GTINs per code (round-robin-buckets), invoervolgorde behouden.
  const gtinsByCode = new Map<string, string[]>();
  const codeOrder: string[] = [];
  const gtinFirstSeen = new Set<string>();
  for (const e of usable) {
    for (const code of e.codes) {
      if (!gtinsByCode.has(code)) {
        gtinsByCode.set(code, []);
        codeOrder.push(code);
      }
      gtinsByCode.get(code)!.push(e.gtin);
    }
    gtinFirstSeen.add(e.gtin);
  }

  const chosen: string[] = [];
  const chosenSet = new Set<string>();
  const cursor = new Map<string, number>();

  // Round-robin: één beurt per code per ronde, tot `size` of niets meer te kiezen.
  let progressed = true;
  while (chosen.length < size && progressed) {
    progressed = false;
    for (const code of codeOrder) {
      if (chosen.length >= size) break;
      const bucket = gtinsByCode.get(code)!;
      let idx = cursor.get(code) ?? 0;
      // Sla reeds-gekozen GTINs over binnen deze bucket.
      while (idx < bucket.length && chosenSet.has(bucket[idx])) idx += 1;
      cursor.set(code, idx + 1);
      if (idx < bucket.length) {
        const gtin = bucket[idx];
        if (!chosenSet.has(gtin)) {
          chosen.push(gtin);
          chosenSet.add(gtin);
          progressed = true;
        }
      }
    }
  }

  return chosen;
}

/** Bouw de vast te leggen cohort-definitie (met tijdstempel + criterium). */
export function buildCohortDefinition(
  gtins: string[],
  now: Date = new Date()
): ControlCohortDefinition {
  return {
    gtins,
    capturedAt: now.toISOString(),
    selectionCriterion: SELECTION_CRITERION,
  };
}

// ---------------------------------------------------------------------------
// I/O-laag (alleen in main())
// ---------------------------------------------------------------------------

/** Absolute pad naar de bevroren declared-marks-bron (repo-root/tests/validation). */
export function resolveSourcePath(): string {
  // Dit bestand: apps/api/src/scripts/ → repo-root = ../../../../ (4 op).
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  return path.join(repoRoot, 'tests', 'validation', 'declared-marks-goldset.json');
}

function loadSource(): DeclaredMarksEntry[] {
  const src = resolveSourcePath();
  return JSON.parse(fs.readFileSync(src, 'utf-8')) as DeclaredMarksEntry[];
}

function parseSizeArg(): number {
  const arg = process.argv.find((a) => a.startsWith('--size='));
  if (!arg) return DEFAULT_COHORT_SIZE;
  const v = parseInt(arg.slice('--size='.length), 10);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_COHORT_SIZE;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const size = parseSizeArg();

  const existing = await getSetting<ControlCohortDefinition>(
    CONTROL_COHORT_SETTING_KEY,
    { fresh: true }
  );

  const entries = loadSource();
  const gtins = selectCohortGtins(entries, size);
  const definition = buildCohortDefinition(gtins);

  /* eslint-disable no-console */
  console.log('=== Controle-cohort seed ===');
  console.log(`  Modus            : ${dryRun ? 'DROGE RUN (schrijft niets)' : 'ECHTE VASTLEGGING'}`);
  console.log(`  Bron-entries     : ${entries.length}`);
  console.log(`  Doel-omvang      : ${size}`);
  console.log(`  Geselecteerd     : ${gtins.length} GTINs`);
  console.log(`  Al vastgelegd    : ${existing ? `ja (${existing.gtins?.length ?? 0} GTINs, ${existing.capturedAt})` : 'nee'}`);

  if (existing && !force) {
    console.log(
      'Cohort is al vastgelegd — geen wijziging (idempotent, stabiliteit SM-3). ' +
        'Gebruik --force om bewust een NIEUWE trendlijn te starten.'
    );
    /* eslint-enable no-console */
    return;
  }

  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log('Droge run — er is niets naar system_settings geschreven.');
    return;
  }

  await setSetting(CONTROL_COHORT_SETTING_KEY, definition, 'seed-control-cohort');
  // eslint-disable-next-line no-console
  console.log(
    force && existing
      ? `Nieuwe cohort-definitie vastgelegd (${gtins.length} GTINs) — NIEUWE trendlijn gestart.`
      : `Cohort-definitie vastgelegd (${gtins.length} GTINs).`
  );
}

// require.main-guard: importeren van dit bestand (in tests) draait main() NIET.
if (require.main === module) {
  main()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Controle-cohort seed faalde:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
