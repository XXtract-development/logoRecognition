/**
 * Gold-set seed-import (Epic 13, Story 13.3, AD-4/AD-13/ARCH-4).
 *
 * Handmatig gestart, idempotent script met droge-run. Importeert de twee
 * bevroren JSON-snapshots naar `gold_set_records`:
 *   - tests/validation/gold-set-oogstrun.json   (91 crop-niveau samples)
 *   - tests/validation/declared-marks-goldset.json (74 GTINs → 212 (gtin,code))
 *
 * NOOIT automatisch bij deploy, migratie of startup (envelope §3; auto-seed is
 * bij dit team een harde overtreding). Draai handmatig:
 *
 *   # eerst het plan bekijken zonder te schrijven:
 *   DATABASE_URL=... npx tsx src/scripts/seed-gold-set.ts --dry-run
 *   # daarna de echte import:
 *   DATABASE_URL=... npx tsx src/scripts/seed-gold-set.ts
 *
 * Idempotentie (AC 2): natuurlijke sleutel per bron. Vóór insert wordt de
 * bestaande set opgehaald en gededupt:
 *   - oogstrun     : dedup op de bron-`id` (bewaard in evidence.sourceRecordId).
 *   - declared-marks: dedup op (gtin, code, source).
 * Een tweede run plant 0 inserts.
 *
 * Dit bestand exporteert PURE helpers (parsing + planning) zodat de unit-test ze
 * kan importeren zonder `main()` te draaien (`require.main`-guard onderaan). De
 * helpers doen GEEN I/O.
 */

import fs from 'fs';
import path from 'path';
import prisma from '../core/db';

// ---------------------------------------------------------------------------
// Bronformaten (geverifieerd 2026-07-02)
// ---------------------------------------------------------------------------

/** Eén record uit gold-set-oogstrun.json (crop-niveau). */
export interface OogstrunRecord {
  id: string;
  label: 'ECHT' | 'VALS';
  t3777Code: string;
  confidence?: number;
  gtin?: string;
  method?: string;
  cropPath: string;
  sourceFile?: string;
  bbox?: Record<string, number>;
  reason?: string;
}

export interface OogstrunFile {
  meta: Record<string, unknown>;
  records: OogstrunRecord[];
}

/** Eén entry uit declared-marks-goldset.json (GTIN-niveau). */
export interface DeclaredMarksEntry {
  _id: string;
  codes: string[];
}

/** Bron-labels (tevens dedup-bron in `source`). */
export const SOURCE_OOGSTRUN = 'gold-set-oogstrun';
export const SOURCE_DECLARED = 'declared-marks-goldset';

/** Een geplande INSERT-rij voor gold_set_records (vóór schrijven). */
export interface PlannedRecord {
  /** Natuurlijke dedup-sleutel binnen deze import. */
  dedupKey: string;
  label: string;
  t3777Code: string;
  cropPath: string | null;
  source: string;
  evidence: Record<string, unknown>;
}

export interface ImportPlan {
  planned: PlannedRecord[];
  skippedExisting: PlannedRecord[];
  /** Tellingen per bron / label / code, voor de --dry-run-output. */
  summary: {
    total: number;
    toInsert: number;
    alreadyPresent: number;
    perSource: Record<string, number>;
    perLabel: Record<string, number>;
    perCode: Record<string, number>;
  };
}

// ---------------------------------------------------------------------------
// PURE helpers (geen I/O — testbaar zonder main())
// ---------------------------------------------------------------------------

/** Dedup-sleutel voor een oogstrun-record: de bron-id (uniek per crop). */
export function oogstrunDedupKey(sourceRecordId: string): string {
  return `${SOURCE_OOGSTRUN}:${sourceRecordId}`;
}

/** Dedup-sleutel voor een declared-marks-record: (gtin, code, source). */
export function declaredDedupKey(gtin: string, code: string): string {
  return `${SOURCE_DECLARED}:${gtin}:${code}`;
}

/**
 * Bouw de kandidaat-rijen uit de oogstrun-bron. Elk record wordt één crop-niveau
 * gold-set-record met de volledige bron-evidence (AD-13).
 */
export function planOogstrunRecords(file: OogstrunFile): PlannedRecord[] {
  return file.records.map((r) => ({
    dedupKey: oogstrunDedupKey(r.id),
    label: r.label,
    t3777Code: r.t3777Code,
    cropPath: r.cropPath,
    source: SOURCE_OOGSTRUN,
    evidence: {
      sourceRecordId: r.id,
      gtin: r.gtin ?? null,
      confidence: r.confidence ?? null,
      method: r.method ?? null,
      sourceFile: r.sourceFile ?? null,
      bbox: r.bbox ?? null,
      reason: r.reason ?? null,
    },
  }));
}

/**
 * Bouw de kandidaat-rijen uit de declared-marks-bron. Elke (gtin, code)-paar
 * wordt één GTIN-niveau record: label ECHT, cropPath NULL (declaratie-anker).
 */
export function planDeclaredMarks(entries: DeclaredMarksEntry[]): PlannedRecord[] {
  const planned: PlannedRecord[] = [];
  for (const entry of entries) {
    for (const code of entry.codes) {
      planned.push({
        dedupKey: declaredDedupKey(entry._id, code),
        label: 'ECHT',
        t3777Code: code,
        cropPath: null,
        source: SOURCE_DECLARED,
        evidence: {
          gtin: entry._id,
          codes: entry.codes,
        },
      });
    }
  }
  return planned;
}

/**
 * Combineer beide bronnen tot één import-plan, gededupt tegen de reeds
 * aanwezige dedup-sleutels (idempotentie). Zowel binnen deze run als tegen de
 * bestaande database: een dedupKey die al bestaat OF al eerder in dezelfde run
 * gepland is, wordt overgeslagen.
 */
export function buildImportPlan(
  oogstrun: OogstrunFile,
  declared: DeclaredMarksEntry[],
  existingKeys: Set<string>
): ImportPlan {
  const candidates = [...planOogstrunRecords(oogstrun), ...planDeclaredMarks(declared)];

  const planned: PlannedRecord[] = [];
  const skippedExisting: PlannedRecord[] = [];
  const seenThisRun = new Set<string>();

  for (const c of candidates) {
    if (existingKeys.has(c.dedupKey) || seenThisRun.has(c.dedupKey)) {
      skippedExisting.push(c);
      continue;
    }
    seenThisRun.add(c.dedupKey);
    planned.push(c);
  }

  const perSource: Record<string, number> = {};
  const perLabel: Record<string, number> = {};
  const perCode: Record<string, number> = {};
  for (const p of planned) {
    perSource[p.source] = (perSource[p.source] ?? 0) + 1;
    perLabel[p.label] = (perLabel[p.label] ?? 0) + 1;
    perCode[p.t3777Code] = (perCode[p.t3777Code] ?? 0) + 1;
  }

  return {
    planned,
    skippedExisting,
    summary: {
      total: candidates.length,
      toInsert: planned.length,
      alreadyPresent: skippedExisting.length,
      perSource,
      perLabel,
      perCode,
    },
  };
}

/**
 * Leid de dedup-sleutel van een reeds opgeslagen gold-set-record af, zodat een
 * tweede run 'm herkent. Spiegelt de plan-sleutels: oogstrun op
 * evidence.sourceRecordId, declared-marks op (gtin, code).
 */
export function dedupKeyForExisting(row: {
  source: string;
  t3777Code: string;
  evidence: unknown;
}): string | null {
  const ev = (row.evidence ?? {}) as Record<string, unknown>;
  if (row.source === SOURCE_OOGSTRUN) {
    const id = ev.sourceRecordId;
    return typeof id === 'string' ? oogstrunDedupKey(id) : null;
  }
  if (row.source === SOURCE_DECLARED) {
    const gtin = ev.gtin;
    return typeof gtin === 'string' ? declaredDedupKey(gtin, row.t3777Code) : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// I/O-laag (alleen in main())
// ---------------------------------------------------------------------------

/** Absolute paden naar de twee bevroren snapshots (repo-root/tests/validation). */
export function resolveSourcePaths(): { oogstrun: string; declared: string } {
  // Dit bestand: apps/api/src/scripts/ → repo-root = ../../../../ (4 op).
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const dir = path.join(repoRoot, 'tests', 'validation');
  return {
    oogstrun: path.join(dir, 'gold-set-oogstrun.json'),
    declared: path.join(dir, 'declared-marks-goldset.json'),
  };
}

function loadSources(): { oogstrun: OogstrunFile; declared: DeclaredMarksEntry[] } {
  const paths = resolveSourcePaths();
  const oogstrun = JSON.parse(fs.readFileSync(paths.oogstrun, 'utf-8')) as OogstrunFile;
  const declared = JSON.parse(fs.readFileSync(paths.declared, 'utf-8')) as DeclaredMarksEntry[];
  return { oogstrun, declared };
}

/** Haal alle bestaande dedup-sleutels op zodat de import idempotent is. */
async function loadExistingKeys(): Promise<Set<string>> {
  const rows = await prisma.goldSetRecord.findMany({
    select: { source: true, t3777Code: true, evidence: true },
  });
  const keys = new Set<string>();
  for (const row of rows) {
    const key = dedupKeyForExisting(row as { source: string; t3777Code: string; evidence: unknown });
    if (key) keys.add(key);
  }
  return keys;
}

function printPlan(plan: ImportPlan, dryRun: boolean): void {
  const { summary } = plan;
  /* eslint-disable no-console */
  console.log('=== Gold-set seed-import plan ===');
  console.log(`  Modus            : ${dryRun ? 'DROGE RUN (schrijft niets)' : 'ECHTE IMPORT'}`);
  console.log(`  Bron-kandidaten  : ${summary.total}`);
  console.log(`  Nieuw in te voegen: ${summary.toInsert}`);
  console.log(`  Al aanwezig      : ${summary.alreadyPresent}`);
  console.log('  Per bron         :', JSON.stringify(summary.perSource));
  console.log('  Per label        :', JSON.stringify(summary.perLabel));
  console.log(`  Per code         : ${Object.keys(summary.perCode).length} unieke codes`);
  /* eslint-enable no-console */
}

/**
 * Voer de import uit binnen één transactie (alles of niets). Alleen aangeroepen
 * in de echte run — nooit bij --dry-run.
 */
async function writePlan(plan: ImportPlan): Promise<number> {
  if (plan.planned.length === 0) return 0;
  await prisma.$transaction(async (tx) => {
    for (const p of plan.planned) {
      await tx.goldSetRecord.create({
        data: {
          label: p.label,
          t3777Code: p.t3777Code,
          cropPath: p.cropPath,
          source: p.source,
          evidence: p.evidence as object,
        },
      });
    }
  });
  return plan.planned.length;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const { oogstrun, declared } = loadSources();
  const existingKeys = await loadExistingKeys();
  const plan = buildImportPlan(oogstrun, declared, existingKeys);

  printPlan(plan, dryRun);

  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log('Droge run — er is niets naar de database geschreven.');
    return;
  }

  const inserted = await writePlan(plan);
  // eslint-disable-next-line no-console
  console.log(`Import voltooid: ${inserted} record(s) toegevoegd, ${plan.summary.alreadyPresent} overgeslagen (al aanwezig).`);
}

// require.main-guard: importeren van dit bestand (in tests) draait main() NIET.
if (require.main === module) {
  main()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Gold-set seed-import faalde:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
