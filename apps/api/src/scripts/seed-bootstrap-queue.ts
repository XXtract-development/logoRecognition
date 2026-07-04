/**
 * Bootstrap-wachtrij initiële vulling (Story 17.2, AC1, ARCH-4/operationele envelope).
 *
 * Eenmalig, idempotent, handmatig gestart seed-script met droge-run dat de
 * `bootstrap_queue` (Story 16.2-tabel) vult met ÁLLE T3777-klassen ZONDER actieve
 * referenties, gerangschikt op declaratiefrequentie over het GTIN-universum
 * (frequentiedoc §3, `bootstrap-frequency.ts`). De FR-15-events (16.2) zijn een
 * AANVULLENDE bron: bestaande wachtrij-rijen worden met frequentie VERRIJKT, nooit
 * qua status overschreven.
 *
 *   # eerst het plan bekijken zonder te schrijven:
 *   DATABASE_URL=... npx tsx src/scripts/seed-bootstrap-queue.ts --dry-run
 *   # daarna de echte vulling:
 *   DATABASE_URL=... npx tsx src/scripts/seed-bootstrap-queue.ts
 *
 * IDEMPOTENTIE + STATUS-GUARD (AC1):
 *   - `t3777Code` is uniek → een bestaande rij wordt geUPDATE (alleen frequentie
 *     verrijkt), een ontbrekende rij geïNSERT. Een tweede run wijzigt niets aan de
 *     status/override en verandert een reeds-gezette frequentie alleen als de bron
 *     wijzigt (herleidbaar).
 *   - de seed zet een run-status (`gedraaid`/`gevuld`/`leeg`, 17.1-eigendom) NOOIT
 *     terug; een `uitgesloten`-rij blijft `uitgesloten` (excluded-guard, 16.2).
 *   - NIET-VISUELE codes (frequentiedoc §5.4) krijgen bij een NIEUWE rij direct
 *     status `uitgesloten` + `excluded=true` (gedocumenteerd in bootstrap-frequency.ts).
 *
 * STATUS-EIGENDOM: dit script raakt uitsluitend `wachtend`/`uitgesloten` +
 * `declarationFrequency` aan — nooit een run-status.
 *
 * Dit bestand exporteert PURE helpers (planning) zodat de unit-test ze kan
 * importeren zonder `main()` te draaien (`require.main`-guard onderaan).
 */

import prisma from '../core/db';
import {
  DECLARATION_FREQUENCY,
  FREQUENCY_SOURCE,
  frequencyForCode,
  isNonVisualCode,
  knownFrequencyCodes,
} from '../services/flywheel/bootstrap-frequency';

/** Eén geplande wachtrij-mutatie (pure planning-output, nog geen DB-schrijf). */
export interface SeedPlanItem {
  t3777Code: string;
  declarationFrequency: number;
  /** `insert` = nieuwe rij; `enrich` = bestaande rij, alleen frequentie bijwerken. */
  action: 'insert' | 'enrich' | 'skip';
  /** Beoogde status bij een nieuwe rij (`wachtend` of `uitgesloten` bij niet-visueel). */
  status: 'wachtend' | 'uitgesloten';
  /** True als deze code niet-visueel is (→ uitgesloten bij insert). */
  nonVisual: boolean;
}

/** Bestaande-rij-context die de planning nodig heeft (per code). */
export interface ExistingQueueRow {
  t3777Code: string;
  status: string;
  excluded: boolean;
  declarationFrequency: number;
}

/**
 * PURE planning (geen I/O): bepaal per code de seed-actie.
 *
 * Invoer:
 *   - `universeCodes`: alle kandidaat-codes (bekende frequentie-codes ∪ bestaande
 *     wachtrij-codes), reeds gefilterd op "zonder actieve referenties" door de caller.
 *   - `existing`: de huidige wachtrij-rijen (per code), voor de status-guard.
 *
 * Regels:
 *   - Bestaat de code nog niet → `insert` met de frequentie; niet-visueel → status
 *     `uitgesloten`, anders `wachtend`.
 *   - Bestaat de code al → `enrich` (alleen frequentie bijwerken) MITS de frequentie
 *     wijzigt EN de bestaande rij niet uitgesloten is; anders `skip` (geen mutatie,
 *     status/excluded blijven — status-guard).
 *
 * Deterministisch gesorteerd op frequentie aflopend (gelijke frequentie op code).
 */
export function planSeed(
  universeCodes: string[],
  existing: ExistingQueueRow[]
): SeedPlanItem[] {
  const byCode = new Map(existing.map((r) => [r.t3777Code, r]));
  const seen = new Set<string>();
  const plan: SeedPlanItem[] = [];

  for (const code of universeCodes) {
    if (seen.has(code)) continue;
    seen.add(code);

    const freq = frequencyForCode(code);
    const nonVisual = isNonVisualCode(code);
    const row = byCode.get(code);

    if (!row) {
      plan.push({
        t3777Code: code,
        declarationFrequency: freq,
        action: 'insert',
        status: nonVisual ? 'uitgesloten' : 'wachtend',
        nonVisual,
      });
      continue;
    }

    // Bestaande rij: alleen frequentie verrijken. Status/excluded NOOIT aanraken
    // (status-guard). Een uitgesloten rij of een ongewijzigde frequentie → skip.
    const shouldEnrich = !row.excluded && row.declarationFrequency !== freq;
    plan.push({
      t3777Code: code,
      declarationFrequency: freq,
      action: shouldEnrich ? 'enrich' : 'skip',
      status: row.status === 'uitgesloten' ? 'uitgesloten' : 'wachtend',
      nonVisual,
    });
  }

  return plan.sort(
    (a, b) => b.declarationFrequency - a.declarationFrequency || a.t3777Code.localeCompare(b.t3777Code)
  );
}

// ---------------------------------------------------------------------------
// I/O-laag (alleen in main())
// ---------------------------------------------------------------------------

/** Set van T3777-codes met een actieve referentieklasse (`reference_logos WHERE active`). */
async function loadActiveClasses(): Promise<Set<string>> {
  const rows = await prisma.referenceLogo.findMany({
    where: { active: true },
    select: { t3777Code: true },
    distinct: ['t3777Code'],
  });
  return new Set(rows.map((r) => r.t3777Code));
}

/** De huidige wachtrij-rijen (voor de status-guard + universum-uitbreiding). */
async function loadExistingQueue(): Promise<ExistingQueueRow[]> {
  return prisma.bootstrapQueue.findMany({
    select: { t3777Code: true, status: true, excluded: true, declarationFrequency: true },
  });
}

/**
 * Bouw het kandidaat-universum: de bekende frequentie-codes (§3) ∪ de codes die al
 * in de wachtrij staan (FR-15-events, 16.2), MINUS de codes met actieve referenties
 * ("alle klassen zonder actieve referenties", AC1).
 */
export function buildUniverse(
  existing: ExistingQueueRow[],
  activeClasses: Set<string>
): string[] {
  const codes = new Set<string>(knownFrequencyCodes());
  for (const r of existing) codes.add(r.t3777Code);
  for (const active of activeClasses) codes.delete(active);
  return Array.from(codes);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const [activeClasses, existing] = await Promise.all([
    loadActiveClasses(),
    loadExistingQueue(),
  ]);

  const universe = buildUniverse(existing, activeClasses);
  const plan = planSeed(universe, existing);

  const inserts = plan.filter((p) => p.action === 'insert');
  const enrichments = plan.filter((p) => p.action === 'enrich');
  const excluded = inserts.filter((p) => p.status === 'uitgesloten');

  /* eslint-disable no-console */
  console.log('=== Bootstrap-wachtrij seed (initiële vulling) ===');
  console.log(`  Modus              : ${dryRun ? 'DROGE RUN (schrijft niets)' : 'ECHTE VULLING'}`);
  console.log(`  Frequentiebron     : ${FREQUENCY_SOURCE}`);
  console.log(`  Frequentie-codes   : ${Object.keys(DECLARATION_FREQUENCY).length}`);
  console.log(`  Actieve klassen    : ${activeClasses.size} (uitgefilterd)`);
  console.log(`  Universum          : ${universe.length} codes zonder actieve referenties`);
  console.log(`  Nieuwe rijen       : ${inserts.length} (waarvan ${excluded.length} niet-visueel → uitgesloten)`);
  console.log(`  Frequentie-verrijkt: ${enrichments.length} bestaande rijen`);

  if (dryRun) {
    console.log('Droge run — er is niets naar bootstrap_queue geschreven. Plan (top-10):');
    for (const p of plan.slice(0, 10)) {
      console.log(`    ${p.action.padEnd(7)} ${p.t3777Code} · freq ${p.declarationFrequency} · ${p.status}`);
    }
    /* eslint-enable no-console */
    return;
  }

  let written = 0;
  for (const p of plan) {
    if (p.action === 'skip') continue;
    if (p.action === 'insert') {
      await prisma.bootstrapQueue.upsert({
        where: { t3777Code: p.t3777Code },
        create: {
          t3777Code: p.t3777Code,
          declarationFrequency: p.declarationFrequency,
          status: p.status,
          excluded: p.nonVisual,
        },
        // Race-veilig: bestaat de rij toch al (parallelle 16.2-aggregatie), verrijk
        // alleen de frequentie — status/excluded NOOIT overschrijven (status-guard).
        update: { declarationFrequency: p.declarationFrequency },
      });
      written += 1;
    } else if (p.action === 'enrich') {
      await prisma.bootstrapQueue.update({
        where: { t3777Code: p.t3777Code },
        data: { declarationFrequency: p.declarationFrequency },
      });
      written += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Bootstrap-wachtrij gevuld — ${written} rijen geschreven (${inserts.length} nieuw, ${enrichments.length} verrijkt).`);
}

// require.main-guard: importeren van dit bestand (in tests) draait main() NIET.
if (require.main === module) {
  main()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Bootstrap-wachtrij seed faalde:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
