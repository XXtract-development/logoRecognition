/**
 * Artwork training-data registration (Story 8.6) — shared module.
 *
 * Extracted from api/v1/artwork-pipeline.ts (Story 8-3O) so both the HTTP
 * routes AND the detection-flow worker can register crops through the SAME
 * path without an import cycle and without an internal HTTP self-call:
 *   routes  → registerCropsTx / processAcceptedReviewItems
 *   worker  → registerCropsTx (auto-accepted detections)
 *
 * Behaviour is byte-for-byte the same as the previous in-route definitions
 * (the 28 route tests exercise these via the routes and stay green).
 */

import prisma from '../core/db';
import { logger } from '../core/logger';
import {
  KEURMERK_CATEGORY,
  buildProvenance,
  ProvenanceMethod,
} from './provenance';
import type { Prisma } from '@prisma/client';

/**
 * Minimal transactional-client surface used by the shared registration helper.
 * Typed locally so it works against both the real Prisma client and the test
 * mock (which exposes the same model accessors).
 */
export type TxClient = Prisma.TransactionClient;

/**
 * One crop to register as training data (Story 8.6). Shared by the explicit
 * register endpoint, the accept-driven "doorzet" of review items, and the
 * detection-flow worker (auto-accepted detections).
 */
export interface RegisterableCrop {
  t3777Code: string;
  cropPath: string;
  sourceFile: string;
  bbox: { x: number; y: number; width: number; height: number };
  method: ProvenanceMethod;
  confidence: number;
}

/**
 * Register a batch of crops as training data within an existing transaction
 * (Story 8.6). For each crop:
 *   - find-or-create a LogoImage marked `metadata.artworkSource=true` (the
 *     NOT NULL imageId FK requires an image row; the marker keeps these out of
 *     the Image Library — see images.ts),
 *   - upsert the keurmerk Logo so per-category stats stay linked,
 *   - create a TrainingData record (active=true, holdout=false) with full
 *     provenance built through the shared mapper shape.
 *
 * Returns the created TrainingData ids. Must run inside a transaction so a
 * mid-batch failure never leaves partial records behind.
 */
export async function registerCropsTx(
  tx: TxClient,
  gtin: string,
  crops: RegisterableCrop[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const crop of crops) {
    // storagePath is not unique in the schema → findFirst + create.
    let logoImage = await tx.logoImage.findFirst({
      where: { storagePath: crop.cropPath },
      select: { id: true },
    });
    if (!logoImage) {
      logoImage = await tx.logoImage.create({
        data: {
          filename: crop.sourceFile,
          storagePath: crop.cropPath,
          metadata: { artworkSource: true, gtin },
        },
      });
    }

    await tx.logo.upsert({
      where: { category_value: { category: KEURMERK_CATEGORY, value: crop.t3777Code } },
      update: {},
      create: { category: KEURMERK_CATEGORY, value: crop.t3777Code },
    });

    const td = await tx.trainingData.create({
      data: {
        imageId: logoImage.id,
        label: crop.t3777Code,
        confidence: crop.confidence,
        validated: true,
        holdout: false,
        active: true,
        cropPath: crop.cropPath,
        provenance: buildProvenance({
          sourceFile: crop.sourceFile,
          bbox: crop.bbox,
          method: crop.method,
          confidence: crop.confidence,
        }),
      },
    });

    ids.push(td.id);
  }
  return ids;
}

/**
 * Doorzet (Story 8.6, carried over from 8.5): push 'accepted' ArtworkReviewItems
 * to training-data registration and mark them 'registered'.
 *
 * An item can only be registered when it carries the crop references that
 * provenance requires (cropPath + sourceFile). Items missing those are skipped
 * (never fabricated) and reported back so they remain visible for manual fixing.
 *
 * Returns counts so both the accept action and the catch-up endpoint can report.
 */
export async function processAcceptedReviewItems(
  items: Array<{
    id: string;
    gtin: string;
    t3777Code: string;
    cropPath: string | null;
    sourceFile: string | null;
    bbox: unknown;
    confidence: number | null;
    method: string | null;
  }>
): Promise<{ registered: number; skipped: number; skippedIds: string[] }> {
  let registered = 0;
  let skipped = 0;
  const skippedIds: string[] = [];

  for (const item of items) {
    // Provenance requires a crop + source. Without them we cannot register a
    // truthful record — skip rather than fabricate (the no-fabricate rule).
    if (!item.cropPath || !item.sourceFile) {
      skipped += 1;
      skippedIds.push(item.id);
      logger.warn('Accepted review item lacks crop/source; cannot register', {
        reviewItemId: item.id,
        gtin: item.gtin,
      });
      continue;
    }

    const bbox = (item.bbox && typeof item.bbox === 'object'
      ? (item.bbox as RegisterableCrop['bbox'])
      : { x: 0, y: 0, width: 0, height: 0 });

    // The reviewer made the call → provenance method is 'human'.
    const crop: RegisterableCrop = {
      t3777Code: item.t3777Code,
      cropPath: item.cropPath,
      sourceFile: item.sourceFile,
      bbox,
      method: 'human',
      confidence: item.confidence ?? 0,
    };

    await prisma.$transaction(async (tx) => {
      await registerCropsTx(tx as TxClient, item.gtin, [crop]);
      await tx.artworkReviewItem.update({
        where: { id: item.id },
        data: { status: 'registered' },
      });
    });

    registered += 1;
  }

  return { registered, skipped, skippedIds };
}
