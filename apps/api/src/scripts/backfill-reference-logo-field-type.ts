/**
 * Story 12.10 — Backfill `reference_logos.field_type`/`gs1_field` uit de
 * autoritatieve code→field_type-mapping (`services/field-type-mapping.ts`).
 *
 * Achtergrond (read-only ACC-meting 2026-07-12,
 * `_bmad-output/implementation-artifacts/keurmerk-dekking-per-categorie-2026-07-12.md`):
 * 236/241 actieve referenties zitten in de default-bak
 * `PackagingMarkedLabelAccreditationCode`, óók echte DietType-/EU-usage-/
 * Nutri-Score-crops. Dit script zet elke actieve referentie op zijn juiste
 * `field_type`/`gs1_field`. AMBIGUE codes (>1 codelijst) worden NOOIT blind
 * gezet — zie `resolveFieldType` (AC1/AC2): een resolvebare ambiguïteit
 * (specifieke codelijst overlapt met de T3777-default) wordt via de
 * gedocumenteerde primaire regel gezet ÉN gerapporteerd; een onoplosbare
 * ambiguïteit (twee specifieke codelijsten botsen) wordt uitsluitend
 * gerapporteerd, NOOIT gezet.
 *
 * Patroon (12.9 `correct_nutriscore_labels.py` / 19.13 `restore_recyclable_refs.py`):
 * dry-run is de default (GEEN writes); `--apply` voert de writes uit. Anders dan
 * die twee scripts (die een vaste, hardcoded id-scope hebben) moet de dry-run
 * hier WEL de huidige `reference_logos`-rijen lezen om het plan te kunnen tonen
 * (er is geen statische scope vooraf) — dat is een SELECT, geen write, en dus nog
 * steeds veilig als eerste stap (spiegelt `seed-bootstrap-queue.ts`, dat om
 * dezelfde reden ook in dry-run leest zonder te schrijven).
 *
 * IDEMPOTENTIE (AC5b): een tweede `--apply`-run met ongewijzigde data plant NUL
 * updates (elke rij staat al op zijn doelwaarde) — geen dubbele/no-op writes.
 * Per-rij transactie met `SELECT ... FOR UPDATE` (patroon
 * `guardrails.ts#assertClassCapWithinTx`) + een conditionele UPDATE die alleen
 * schrijft als de rij nog exact de geplande brontoestand heeft — een
 * gelijktijdige mutatie tussen plan en apply wordt zo nooit overschreven.
 *
 * Gebruik::
 *   DATABASE_URL=... npx tsx src/scripts/backfill-reference-logo-field-type.ts             # DRY-RUN
 *   DATABASE_URL=... npx tsx src/scripts/backfill-reference-logo-field-type.ts --apply       # writes
 *
 * ACC-schrijf alleen met expliciete toestemming Friso, per geval (permission-gate,
 * zie de story). Alleen `field_type`/`gs1_field` worden gemuteerd — nooit
 * `t3777_code`/`active`/`source`/embeddings.
 *
 * Dit bestand exporteert PURE helpers (`planBackfill`) zodat de unit-test ze
 * zonder `main()` kan importeren (`require.main`-guard onderaan). De helpers
 * doen GEEN I/O.
 */

import { Prisma } from '@prisma/client';
import prisma from '../core/db';
import { resolveFieldType, type FieldTypeResolution } from '../services/field-type-mapping';

/** Ruwe (huidige) toestand van één actieve reference_logo-rij. */
export interface ReferenceLogoRow {
  id: string;
  t3777Code: string;
  fieldType: string;
  gs1Field: string | null;
}

export type BackfillAction = 'update' | 'skip-unchanged' | 'skip-ambiguous-unresolved';

export interface BackfillPlanItem {
  id: string;
  t3777Code: string;
  currentFieldType: string;
  currentGs1Field: string | null;
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

async function loadActiveRows(): Promise<ReferenceLogoRow[]> {
  const rows = await prisma.referenceLogo.findMany({
    where: { active: true },
    select: { id: true, t3777Code: true, fieldType: true, gs1Field: true },
  });
  return rows;
}

/**
 * Voer één geplande update uit binnen een transactie: `SELECT ... FOR UPDATE`
 * herleest de rij ín de transactie (concurrency-guard), en de UPDATE schrijft
 * uitsluitend als de rij nog exact de geplande brontoestand heeft — anders is
 * de rij ondertussen elders gemuteerd en slaat dit item over (geen stomp).
 */
async function applyOne(item: BackfillPlanItem): Promise<'written' | 'skipped-race'> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ field_type: string; gs1_field: string | null }>>(Prisma.sql`
      SELECT field_type, gs1_field FROM reference_logos WHERE id = ${item.id}::uuid FOR UPDATE
    `);
    const current = rows[0];
    if (
      !current ||
      current.field_type !== item.currentFieldType ||
      (current.gs1_field ?? null) !== item.currentGs1Field
    ) {
      return 'skipped-race';
    }

    await tx.referenceLogo.update({
      where: { id: item.id },
      data: { fieldType: item.targetFieldType as string, gs1Field: item.targetGs1Field },
    });
    return 'written';
  });
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const rows = await loadActiveRows();
  const plan = planBackfill(rows);

  const updates = plan.filter((p) => p.action === 'update');
  const unchanged = plan.filter((p) => p.action === 'skip-unchanged');
  const unresolved = plan.filter((p) => p.action === 'skip-ambiguous-unresolved');
  const ambiguous = ambiguousItems(plan);

  console.log('=== Backfill reference_logos.field_type/gs1_field (Story 12.10) ===');
  console.log(`  Modus                 : ${apply ? 'ECHTE RUN (--apply)' : 'DROGE RUN (schrijft niets)'}`);
  console.log(`  Actieve referenties   : ${rows.length}`);
  console.log(`  Te updaten            : ${updates.length}`);
  console.log(`  Al correct            : ${unchanged.length}`);
  console.log(`  Ambigu (opgelost)     : ${ambiguous.filter((a) => a.resolution.resolution === 'default-overlap-resolved').length}`);
  console.log(`  Ambigu (NIET gezet)   : ${unresolved.length}`);

  if (ambiguous.length > 0) {
    console.log('  --- Ambigu-rapport ---');
    for (const a of ambiguous) {
      console.log(`    ${a.t3777Code} (${a.id}): ${a.resolution.note}`);
    }
  }

  if (!apply) {
    console.log('Droge run — er is niets naar reference_logos geschreven. Plan (top-10 updates):');
    for (const p of updates.slice(0, 10)) {
      console.log(`    ${p.t3777Code} · ${p.currentFieldType} -> ${p.targetFieldType}`);
    }
    return;
  }

  let written = 0;
  let skippedRace = 0;
  for (const item of updates) {
    const outcome = await applyOne(item);
    if (outcome === 'written') written += 1;
    else skippedRace += 1;
  }

  console.log(`Backfill toegepast — ${written} rijen geschreven, ${skippedRace} overgeslagen (concurrent gewijzigd).`);
}

// require.main-guard: importeren van dit bestand (in tests) draait main() NIET.
if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Backfill field_type/gs1_field faalde:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
