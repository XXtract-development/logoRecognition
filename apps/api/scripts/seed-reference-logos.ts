/**
 * Reference library seed (Epic 7, Story 7.3).
 *
 * Idempotent, soft-failing seed for the top-20 keurmerk classes (descending
 * pilot volume). It reads official PNG artwork from `apps/api/seeds/reference-logos/`
 * and reuses the same storage + database path as the upload API:
 *   reference-logos/{t3777Code}/{variantLabel}.png   (MinIO, TRAINING bucket)
 *
 * The artwork files must be supplied by a human/agent (source attribution is
 * mandatory per record). Any missing PNG is reported and skipped — the script
 * never hard-fails on a missing file, so a partial library is allowed.
 *
 * Expected layout (one PNG per class, variant label = "default"):
 *   apps/api/seeds/reference-logos/<T3777_CODE>.png
 *
 * Usage:
 *   npx tsx scripts/seed-reference-logos.ts
 *
 * NOTE: This mutates data via Prisma + MinIO only — it never runs migrations.
 */

import fs from 'fs';
import path from 'path';
import prisma from '../src/core/db';
import { uploadReferenceLogo } from '../src/services/storage';

// Top-20 codes from the logo_detection pilot (descending volume).
const TOP_20_CODES = [
  'RECYCLABLE_GENERAL_CLAIM',
  'GREEN_DOT',
  'EUROPEAN_V_LABEL_VEGETARIAN',
  'FOREST_STEWARDSHIP_COUNCIL_MIX',
  'EUROPEAN_V_LABEL_VEGAN',
  'RAINFOREST_ALLIANCE',
  'EUROPEAN_VEGETARIAN_UNION',
  'AISE',
  'BEWUSTE_KEUZE',
  'GHS07',
  'GHS02',
  'BLUE_ANGEL',
  'EU_ORGANIC_FARMING',
  'FREE_FROM_GLUTEN',
  'RETURNABLE_PET_BOTTLE_NL',
  'GHS05',
  'TNO_APPROVED',
  'MADE_OF_PLASTIC_BEVERAGE_CUPS',
  'BETER_LEVEN_1_STER',
  'DZG_GLUTEN_FREE',
] as const;

const VARIANT_LABEL = 'default';
const SEED_DIR = path.join(__dirname, '..', 'seeds', 'reference-logos');

async function main(): Promise<void> {
  const missing: string[] = [];
  let created = 0;
  let skipped = 0;

  for (const code of TOP_20_CODES) {
    const pngPath = path.join(SEED_DIR, `${code}.png`);
    if (!fs.existsSync(pngPath)) {
      missing.push(code);
      continue;
    }

    // Idempotent: skip if this exact code/variant already exists.
    const existing = await prisma.referenceLogo.findUnique({
      where: { t3777Code_variantLabel: { t3777Code: code, variantLabel: VARIANT_LABEL } },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const buffer = fs.readFileSync(pngPath);
    const storagePath = `reference-logos/${code}/${VARIANT_LABEL}.png`;

    await uploadReferenceLogo(buffer, storagePath, 'image/png');

    const logo = await prisma.logo.upsert({
      where: { category_value: { category: 'keurmerk', value: code } },
      update: {},
      create: { category: 'keurmerk', value: code },
    });

    await prisma.referenceLogo.create({
      data: {
        t3777Code: code,
        variantLabel: VARIANT_LABEL,
        source: `seed:apps/api/seeds/reference-logos/${code}.png`,
        storagePath,
        active: true,
        logoId: logo?.id ?? null,
      },
    });
    created += 1;
  }

  // eslint-disable-next-line no-console
  console.log(
    `Reference library seed complete: ${created} created, ${skipped} already present.`
  );
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `⚠️  Missing PNG artwork for ${missing.length} class(es) (soft-skipped). ` +
        `Supply them under ${SEED_DIR}/<CODE>.png and re-run:\n  - ${missing.join('\n  - ')}`
    );
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Reference library seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
