/**
 * Reference category backfill: SELECT-only planning by default.
 * --manifest-output <file> saves the exact versioned plan for review.
 * --apply --manifest <approved-file> applies only that validated scope;
 * it never reloads the library to enlarge the plan. External execution requires
 * separate authorization. Only category metadata is writable.
 */

import fs from 'node:fs';
import { Prisma } from '@prisma/client';
import prisma from '../core/db';
import { resolveFieldType, type FieldTypeResolution } from '../services/field-type-mapping';

/** Ruwe (huidige) toestand van één actieve reference_logo-rij. */
export interface ReferenceLogoRow {
  id: string;
  t3777Code: string;
  fieldType: string;
  gs1Field: string | null;
  active?: boolean;
}

export type BackfillAction = 'update' | 'skip-unchanged' | 'skip-ambiguous-unresolved';

export interface BackfillPlanItem {
  id: string;
  t3777Code: string;
  currentFieldType: string;
  currentGs1Field: string | null;
  /** Planner reads active rows; manifest must preserve that precondition. */
  currentActive: boolean;
  /** `null` zolang de actie geen write is (unchanged of onopgeloste ambiguïteit). */
  targetFieldType: string | null;
  targetGs1Field: string | null;
  action: BackfillAction;
  resolution: FieldTypeResolution;
}

/**
 * PURE planning (geen I/O): bepaal per rij de backfill-actie uit de huidige
 * waarden + de geresolveerde mapping.
 */
export function planBackfill(rows: ReferenceLogoRow[]): BackfillPlanItem[] {
  return rows.map((row) => {
    const resolution = resolveFieldType(row.t3777Code);

    if (resolution.resolution === 'unresolved') {
      return {
        id: row.id,
        t3777Code: row.t3777Code,
        currentFieldType: row.fieldType,
        currentGs1Field: row.gs1Field,
        currentActive: row.active ?? true,
        targetFieldType: null,
        targetGs1Field: null,
        action: 'skip-ambiguous-unresolved',
        resolution,
      };
    }

    const unchanged =
      row.fieldType === resolution.fieldType && (row.gs1Field ?? null) === (resolution.gs1Field ?? null);

    return {
      id: row.id,
      t3777Code: row.t3777Code,
      currentFieldType: row.fieldType,
      currentGs1Field: row.gs1Field,
      currentActive: row.active ?? true,
      targetFieldType: resolution.fieldType,
      targetGs1Field: resolution.gs1Field,
      action: unchanged ? 'skip-unchanged' : 'update',
      resolution,
    };
  });
}

/** Ambigue plan-items (opgelost of niet) — voor het rapport (AC1/AC2/AC6). */
export function ambiguousItems(plan: BackfillPlanItem[]): BackfillPlanItem[] {
  return plan.filter((p) => p.resolution.ambiguous);
}

// ---------------------------------------------------------------------------
// I/O-laag (alleen in main())
// ---------------------------------------------------------------------------

let databaseAccessed = false;

async function loadActiveRows(): Promise<ReferenceLogoRow[]> {
  databaseAccessed = true;
  const rows = await prisma.referenceLogo.findMany({
    where: { active: true },
    select: { id: true, t3777Code: true, fieldType: true, gs1Field: true, active: true },
  });
  return rows;
}

/**
 * Voer één geplande update uit binnen een transactie: `SELECT ... FOR UPDATE`
 * herleest de rij ín de transactie (concurrency-guard), en de UPDATE schrijft
 * uitsluitend als de rij nog exact de geplande brontoestand heeft — anders is
 * de rij ondertussen elders gemuteerd en slaat dit item over (geen stomp).
 */
interface RowOutcome {
  id: string;
  status: 'written' | 'skipped-race' | 'already-correct';
  reason: 'updated' | 'missing-row' | 'code-changed' | 'active-changed' | 'metadata-changed' | 'already-correct';
}
async function applyOne(item: BackfillPlanItem): Promise<RowOutcome> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ t3777_code: string; active: boolean; field_type: string; gs1_field: string | null }>>(Prisma.sql`
      SELECT t3777_code, active, field_type, gs1_field FROM reference_logos WHERE id = ${item.id}::uuid FOR UPDATE
    `);
    const current = rows[0];
    const skip = (reason: RowOutcome['reason']): RowOutcome => ({ id: item.id, status: 'skipped-race', reason });
    if (!current) return skip('missing-row');
    if (current.t3777_code !== item.t3777Code) return skip('code-changed');
    if (current.active !== item.currentActive) return skip('active-changed');
    if (current.field_type === item.targetFieldType && current.gs1_field === item.targetGs1Field) {
      return { id: item.id, status: 'already-correct', reason: 'already-correct' };
    }
    if (current.field_type !== item.currentFieldType || (current.gs1_field ?? null) !== item.currentGs1Field) return skip('metadata-changed');
    await tx.referenceLogo.update({
      where: { id: item.id },
      data: { fieldType: item.targetFieldType as string, gs1Field: item.targetGs1Field },
    });
    return { id: item.id, status: 'written', reason: 'updated' };
  });
}
export interface BackfillTarget {
  database: string;
  serverAddress: string;
  serverPort: number;
}
export interface BackfillManifest {
  version: 2;
  environment: string;
  target: BackfillTarget;
  items: BackfillPlanItem[];
}
function validateTarget(value: unknown): BackfillTarget {
  if (!value || typeof value !== 'object') throw new Error('Manifest requires database target identity');
  const target = value as BackfillTarget;
  if (typeof target.database !== 'string' || !target.database.trim() ||
      typeof target.serverAddress !== 'string' || !target.serverAddress.trim() ||
      !Number.isInteger(target.serverPort) || target.serverPort < 1 || target.serverPort > 65535) throw new Error('Invalid database target identity');
  return { database: target.database, serverAddress: target.serverAddress, serverPort: target.serverPort };
}
async function readTarget(): Promise<BackfillTarget> {
  databaseAccessed = true;
  const rows = await prisma.$queryRaw<BackfillTarget[]>(Prisma.sql`
    SELECT current_database() AS database, inet_server_addr()::text AS "serverAddress", inet_server_port() AS "serverPort"
  `);
  return validateTarget(rows[0]);
}

/** Validate the entire approved scope before any database operation. */
export function validateManifest(input: unknown): BackfillPlanItem[] {
  if (!input || typeof input !== 'object') throw new Error('Invalid backfill manifest');
  const manifest = input as Record<string, unknown>;
  if (manifest.version !== 2 || !Array.isArray(manifest.items)) throw new Error('Manifest requires version 2 and items');
  if (typeof manifest.environment !== 'string' || !manifest.environment.trim()) throw new Error('Manifest requires environment label');
  validateTarget(manifest.target);
  const seen = new Set<string>();
  return manifest.items.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid manifest item');
    const row = value as BackfillPlanItem;
    if (typeof row.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) || seen.has(row.id.toLowerCase())) {
      throw new Error('Manifest IDs must be unique UUIDs');
    }
    seen.add(row.id.toLowerCase());
    if (row.currentActive !== true || row.action !== 'update' ||
        typeof row.currentFieldType !== 'string' || !row.currentFieldType ||
        !(row.currentGs1Field === null || typeof row.currentGs1Field === 'string')) {
      throw new Error('Manifest requires original active/category preconditions and update action');
    }
    const resolution = resolveFieldType(row.t3777Code);
    if (!resolution.fieldType || !resolution.gs1Field || row.targetFieldType !== resolution.fieldType || row.targetGs1Field !== resolution.gs1Field) {
      throw new Error('Manifest target must match canonical category');
    }
    if (row.currentFieldType === row.targetFieldType && row.currentGs1Field === row.targetGs1Field) throw new Error('Manifest item is already correct');
    // Ignore no fields used by the write guard; resolution is reporting metadata.
    return { ...row, resolution };
  });
}

export async function applyManifest(input: unknown): Promise<{
  written: number; skippedRace: number; alreadyCorrect: number;
  status: 'complete' | 'incomplete'; results: RowOutcome[];
}> {
  const items = validateManifest(input);
  const expected = validateTarget((input as BackfillManifest).target);
  const actual = await readTarget();
  if (actual.database !== expected.database || actual.serverAddress !== expected.serverAddress || actual.serverPort !== expected.serverPort) throw new Error('Database target mismatch; no updates attempted');
  const results: RowOutcome[] = [];
  for (const item of items) results.push(await applyOne(item));
  const written = results.filter(row => row.status === 'written').length;
  const skippedRace = results.filter(row => row.status === 'skipped-race').length;
  const alreadyCorrect = results.filter(row => row.status === 'already-correct').length;
  return { written, skippedRace, alreadyCorrect, status: skippedRace ? 'incomplete' : 'complete', results };
}
/** Keep resolved overlaps and unresolved ambiguity outside writable scope. */
export function ambiguityEvidence(plan: BackfillPlanItem[]) {
  return ambiguousItems(plan).map(item => ({ id: item.id, t3777Code: item.t3777Code, resolution: item.resolution, action: item.action }));
}

function argumentValue(args: string[], name: string): string | undefined {
  const position = args.indexOf(name);
  if (position === -1) return undefined;
  const value = args[position + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a file path`);
  return value;
}

export async function runBackfill(args: string[] = process.argv.slice(2)): Promise<void> {
  const apply = args.includes('--apply');
  const manifestPath = argumentValue(args, '--manifest');
  const outputPath = argumentValue(args, '--manifest-output');
  const environment = argumentValue(args, '--environment');
  if (outputPath && (!environment || !environment.trim())) throw new Error('--manifest-output requires explicit --environment label');
  if (apply && (!manifestPath || outputPath)) throw new Error('--apply requires --manifest and cannot regenerate a manifest');
  if (manifestPath && outputPath) throw new Error('Cannot combine manifest input and generation');

  if (manifestPath) {
    const input: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const items = validateManifest(input);
    if (!apply) {
      console.log(`Validated manifest: ${items.length} exact updates. Dry run; no writes.`);
      return;
    }
    const result = await applyManifest(input);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'incomplete') process.exitCode = 1;
    return;
  }

  const plan = planBackfill(await loadActiveRows());
  const updates = plan.filter(item => item.action === 'update');
  console.log(`Dry run: ${plan.length} active rows, ${updates.length} category updates, ${ambiguousItems(plan).length} ambiguous codes.`);
  if (outputPath) {
    const manifest: BackfillManifest = { version: 2, environment: environment!, target: await readTarget(), items: updates };
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ ambiguityEvidence: ambiguityEvidence(plan) }, null, 2));
    console.log(`Exact manifest saved to ${outputPath}. No database writes.`);
  } else {
    console.log(JSON.stringify({ items: updates, ambiguityEvidence: ambiguityEvidence(plan) }, null, 2));
  }
}

if (require.main === module) {
  runBackfill()
    .catch((err) => {
      console.error('Backfill field_type/gs1_field failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => { if (databaseAccessed) await prisma.$disconnect(); });
}
