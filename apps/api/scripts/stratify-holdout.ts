/**
 * Stratified holdout selection (Epic 7, Story 7.1).
 *
 * One-off, idempotent script that marks a stratified sample of existing
 * validated training data as holdout — a fixed, protected evaluation set.
 *
 * Per keurmerk-class (`label`) it marks `HOLDOUT_PERCENTAGE` (default 15%) of
 * the validated records as holdout. It only runs when NO holdout records exist
 * yet, so re-running is a no-op and never disturbs an established holdout set.
 *
 * Usage:
 *   HOLDOUT_PERCENTAGE=15 npx tsx scripts/stratify-holdout.ts
 *
 * NOTE: This mutates data via Prisma only — it never runs migrations.
 */

import prisma from '../src/core/db';

const HOLDOUT_PERCENTAGE = parseInt(process.env.HOLDOUT_PERCENTAGE || '15', 10);

async function main(): Promise<void> {
  const existingHoldout = await prisma.trainingData.count({ where: { holdout: true } });
  if (existingHoldout > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `Holdout set already exists (${existingHoldout} records). Skipping stratification (idempotent).`
    );
    return;
  }

  // Group validated records per label.
  const validated = await prisma.trainingData.findMany({
    where: { validated: true },
    select: { id: true, label: true },
    orderBy: { createdAt: 'asc' },
  });

  if (validated.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No validated training data found. Nothing to stratify.');
    return;
  }

  const byLabel = new Map<string, string[]>();
  for (const record of validated) {
    const ids = byLabel.get(record.label) ?? [];
    ids.push(record.id);
    byLabel.set(record.label, ids);
  }

  // A class must keep enough training samples to remain learnable: below this
  // size we take NO holdout records (the class joins the holdout set once it
  // has grown). This prevents a 1-sample class from losing its only example.
  const MIN_CLASS_SIZE_FOR_HOLDOUT = parseInt(process.env.MIN_CLASS_SIZE_FOR_HOLDOUT || '4', 10);

  const holdoutIds: string[] = [];
  for (const [label, ids] of byLabel) {
    if (ids.length < MIN_CLASS_SIZE_FOR_HOLDOUT) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${label}: 0/${ids.length} marked as holdout (class below minimum size ${MIN_CLASS_SIZE_FOR_HOLDOUT}; all samples kept for training)`
      );
      continue;
    }
    // At least one per (sufficiently large) class, but never so many that the
    // class loses its training majority.
    const take = Math.min(
      Math.max(1, Math.round((ids.length * HOLDOUT_PERCENTAGE) / 100)),
      ids.length - 1
    );
    holdoutIds.push(...ids.slice(0, take));
    // eslint-disable-next-line no-console
    console.log(`  ${label}: ${take}/${ids.length} marked as holdout`);
  }

  await prisma.trainingData.updateMany({
    where: { id: { in: holdoutIds } },
    data: { holdout: true },
  });

  // eslint-disable-next-line no-console
  console.log(
    `Stratified holdout selection complete: ${holdoutIds.length} records across ${byLabel.size} classes (${HOLDOUT_PERCENTAGE}%).`
  );
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Stratification failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
