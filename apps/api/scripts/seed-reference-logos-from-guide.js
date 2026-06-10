/**
 * Story 12.1 / Task 2 — Bulk-seed the keurmerk reference library from the GS1
 * Label Guide extraction manifest (Task 1 output).
 *
 * Reuses the 7.3 storage contract (TRAINING bucket, key
 * `reference-logos/{t3777Code}/{variantLabel}.{ext}`) and upserts `reference_logos`
 * rows idempotently per (t3777Code, variantLabel), carrying the GS1 fieldType.
 * Deliberately bypasses the 7.3 HTTP upload route (which enforces a 200px floor
 * that 79% of official logos fall under) — seeds may be < 200px.
 *
 * Runs inside the API container (needs MinIO + Postgres). After import it calls
 * the ML rebuild-reference-embeddings endpoint (Story 12.1 Task 3) + reload-templates
 * so the seeded codes become detectable without an ML restart.
 *
 * Input layout (docker cp'd to /tmp/refseed):
 *   /tmp/refseed/manifest.json   (from extract_gs1_label_guide.py)
 *   /tmp/refseed/{code}/{n}.png
 *
 * Usage (in container):  node /app/seed-reference-logos-from-guide.js /tmp/refseed
 */
const fs = require('fs');
const path = require('path');

// --- pure helpers (unit-testable) ---
function deriveVariantLabel(variant) {
  return variant === 0 ? 'gs1-guide' : `gs1-guide-${variant}`;
}
function buildStoragePath(t3777Code, variantLabel) {
  return `reference-logos/${t3777Code}/${variantLabel}.png`;
}

// GS1-codelijstnaam (fieldType) -> GS1-declaratieveld (gs1Field, voor de crosscheck).
const GS1_FIELD = {
  PackagingMarkedLabelAccreditationCode: 'packagingMarkedLabelAccreditationCode',
  NutritionalScore: 'nutritionalScore', // Nutri-Score A–E live in the NutritionalScore codelist
  DietTypeCode: 'dietTypeCode',
  GHSSymbolDescriptionCode: 'gHSSymbolDescriptionCode',
  EU_consumerUsageLabelCodeList: 'enumerationValue',
};

async function main() {
  const root = process.argv[2] || '/tmp/refseed';
  const { uploadReferenceLogo } = require('/app/dist/services/storage.js');
  const { mlClient } = require('/app/dist/services/ml-client.js');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const entries = manifest.entries || [];

  let ok = 0;
  let fail = 0;
  for (const e of entries) {
    try {
      const variantLabel = deriveVariantLabel(e.variant);
      const storagePath = buildStoragePath(e.code, variantLabel);
      const buf = fs.readFileSync(path.join(root, e.file));
      await uploadReferenceLogo(buf, storagePath, 'image/png');
      // fieldType = GS1-codelijstnaam (1:1 met GS1); gs1Field = GS1-declaratieveld.
      const fieldType = e.fieldType || 'PackagingMarkedLabelAccreditationCode';
      const gs1Field = e.gs1Field || GS1_FIELD[fieldType] || 'packagingMarkedLabelAccreditationCode';
      await prisma.referenceLogo.upsert({
        where: { t3777Code_variantLabel: { t3777Code: e.code, variantLabel } },
        create: {
          t3777Code: e.code,
          variantLabel,
          source: e.source || 'gs1-packaging-label-guide',
          storagePath,
          fieldType,
          gs1Field,
          active: true,
        },
        update: {
          source: e.source || 'gs1-packaging-label-guide',
          storagePath,
          fieldType,
          gs1Field,
          active: true,
        },
      });
      ok++;
    } catch (err) {
      fail++;
      console.error('FAIL', e.code, err.message);
    }
  }

  // Make the seeded codes detectable without an ML restart (Task 3):
  // rebuild embeddings (classify) THEN reload templates (localize).
  let rebuild = null;
  try {
    rebuild = await mlClient.rebuildReferenceEmbeddings();
    await mlClient.reloadTemplates();
  } catch (err) {
    console.error('POST-IMPORT ML refresh failed (run manually):', err.message);
  }

  const codes = [...new Set(entries.map((e) => e.code))];
  console.log(JSON.stringify({ imported: ok, failed: fail, codes: codes.length, rebuild }));
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    console.error('FATAL', e.message);
    process.exit(1);
  });
}

module.exports = { deriveVariantLabel, buildStoragePath };
