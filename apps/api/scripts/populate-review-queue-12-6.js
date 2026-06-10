/**
 * Story 12.6 — populate the artwork review queue with top-N candidate crops so
 * the PO can label them in the (now mobile-friendly) ArtworkReviewPage.
 *
 * Reads the assembler's prioritised candidates (top-25/code) + their crop PNGs,
 * uploads each crop to the TRAINING bucket, and inserts an `ArtworkReviewItem`
 * (status 'open'). Idempotent: clears its own previous '12.6' items first.
 *
 * Input layout (docker cp'd to /tmp/rq126):
 *   /tmp/rq126/candidates.json   (array of {candidate_id, crop, predicted_code, confidence, sourceFile, bbox})
 *   /tmp/rq126/crops/{crop}.png
 *
 * Usage (in API container):  node /app/populate-review-queue-12-6.js /tmp/rq126
 */
const fs = require('fs');
const path = require('path');

const MARKER = '12.6 acceptatie-kandidaat (assembler)';

async function main() {
  const root = process.argv[2] || '/tmp/rq126';
  const { uploadReferenceLogo } = require('/app/dist/services/storage.js');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const candidates = JSON.parse(fs.readFileSync(path.join(root, 'candidates.json'), 'utf8'));

  // Idempotency: remove our own previous open 12.6 items (never the crosscheck ones).
  const cleared = await prisma.artworkReviewItem.deleteMany({
    where: { status: 'open', reason: MARKER },
  });

  let ok = 0;
  let fail = 0;
  for (const c of candidates) {
    try {
      const gtin = String(c.sourceFile || '').split('/')[1] || 'unknown';
      const cropKey = `artwork-crops/${gtin}/12_6_${c.candidate_id}.png`;
      const buf = fs.readFileSync(path.join(root, 'crops', c.crop));
      await uploadReferenceLogo(buf, cropKey, 'image/png');
      await prisma.artworkReviewItem.create({
        data: {
          gtin,
          t3777Code: c.predicted_code,
          cropPath: cropKey,
          bbox: c.bbox || {},
          confidence: typeof c.confidence === 'number' ? c.confidence : null,
          method: 'embedding',
          reason: MARKER,
          sourceFile: c.sourceFile || null,
          status: 'open',
        },
      });
      ok += 1;
    } catch (e) {
      fail += 1;
      if (fail <= 5) console.error('fail', c.candidate_id, String(e).slice(0, 120));
    }
  }

  const open = await prisma.artworkReviewItem.count({ where: { status: 'open' } });
  console.log(JSON.stringify({ cleared: cleared.count, inserted: ok, failed: fail, total_open_now: open }));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
