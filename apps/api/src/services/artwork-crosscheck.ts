/**
 * T3777 crosscheck (Story 8.5) — extracted to a service (Story 8-3O).
 *
 * `crosscheckDetections(gtin, detections, declared)` is the byte-for-byte
 * behaviour of the previous POST /artwork/:gtin/crosscheck route body:
 *   - declared[] empty            → every detection → reviewItems (safety rule:
 *                                    no independent confirmation, no auto-accept)
 *   - detection ∈ declared
 *       confidence ≥ method-thr.   → autoAccepted
 *       confidence < method-thr.   → reviewItems ("confidence onder drempel")
 *   - detected, not declared       → reviewItems ("gevonden maar niet verwacht")
 *   - declared, not detected       → reviewItems ("verwacht maar niet gevonden")
 * Review items are persisted (createMany, skipDuplicates:false) exactly as the
 * route did. The route is now a thin wrapper; the detection worker calls this
 * directly (no internal HTTP).
 *
 * IDEMPOTENCY LIVES IN THE WORKER, NOT HERE (O2-fix): this service always
 * inserts, preserving byte-gelijk behaviour. The worker pre-filters duplicate
 * detections before calling crosscheck (see services/pipeline/detection-flow.ts
 * → dedupDetections).
 */

import prisma from '../core/db';

// Crosscheck confidence thresholds per detection method.
// Detections without a method fall under STRICTEST (classifier).
const CROSSCHECK_THRESHOLD_TEMPLATE = parseFloat(
  process.env.CROSSCHECK_THRESHOLD_TEMPLATE || '0.85'
);
const CROSSCHECK_THRESHOLD_EMBEDDING = parseFloat(
  process.env.CROSSCHECK_THRESHOLD_EMBEDDING || '0.80'
);
const CROSSCHECK_THRESHOLD_CLASSIFIER = parseFloat(
  process.env.CROSSCHECK_THRESHOLD_CLASSIFIER || '0.90'
);

// Review-queue floor (interim noise filter, pending Story 12.3 embedding
// fine-tuning). A detection whose confidence sits below this floor is still
// persisted for auditability/later harvesting, but lands in status
// 'dismissed_low_conf' so it never reaches the human review queue (which lists
// status='open'). The spike (12.2 AC2) measured genuine marks at cosine
// 0.62–0.78; everything below 0.50 is overwhelmingly noise. Items without a
// confidence (declared-but-not-found placeholders) are never dismissed — that
// is a distinct review signal. Set 0 to disable. (status column is VARCHAR(20).)
const REVIEW_MIN_CONFIDENCE = parseFloat(
  process.env.REVIEW_MIN_CONFIDENCE || '0.50'
);

/** Status assigned to a sub-floor review item so it is kept but hidden. */
export const LOW_CONF_DISMISS_STATUS = 'dismissed_low_conf';

export function getThresholdForMethod(method?: string): number {
  switch (method) {
    case 'template':
      return CROSSCHECK_THRESHOLD_TEMPLATE;
    case 'embedding':
      return CROSSCHECK_THRESHOLD_EMBEDDING;
    case 'classifier':
      return CROSSCHECK_THRESHOLD_CLASSIFIER;
    default:
      // No method provided → apply strictest threshold
      return CROSSCHECK_THRESHOLD_CLASSIFIER;
  }
}

export interface CrosscheckDetection {
  t3777Code: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  method?: string;
  cropPath?: string;
  sourceFile?: string;
}

export interface CrosscheckReviewItem {
  t3777Code: string;
  reason: string;
  confidence?: number;
  bbox?: CrosscheckDetection['bbox'];
  method?: string;
  cropPath?: string;
  sourceFile?: string;
}

export interface CrosscheckResult {
  autoAccepted: CrosscheckDetection[];
  reviewItems: CrosscheckReviewItem[];
}

/**
 * Compare detected keurmerken against the GS1 T3777 declaration and persist the
 * resulting review items. Returns the auto-accepted detections and the review
 * items (route shape: arrays, not counts).
 */
export async function crosscheckDetections(
  gtin: string,
  detections: CrosscheckDetection[],
  declared: string[]
): Promise<CrosscheckResult> {
  const autoAccepted: CrosscheckDetection[] = [];
  const reviewItems: CrosscheckReviewItem[] = [];

  const declaredSet = new Set(declared);

  // Process each detection
  for (const detection of detections) {
    const threshold = getThresholdForMethod(detection.method);

    if (declaredSet.size === 0) {
      // Safety rule: no declaration = no auto-accept
      reviewItems.push({
        t3777Code: detection.t3777Code,
        reason: 'Geen T3777-declaratie beschikbaar — verwacht handmatige review',
        confidence: detection.confidence,
        bbox: detection.bbox,
        method: detection.method,
        cropPath: detection.cropPath,
        sourceFile: detection.sourceFile,
      });
      continue;
    }

    if (declaredSet.has(detection.t3777Code)) {
      if (detection.confidence >= threshold) {
        autoAccepted.push(detection);
      } else {
        reviewItems.push({
          t3777Code: detection.t3777Code,
          reason: `Confidence onder drempel (${detection.confidence.toFixed(2)} < ${threshold.toFixed(2)})`,
          confidence: detection.confidence,
          bbox: detection.bbox,
          method: detection.method,
          cropPath: detection.cropPath,
          sourceFile: detection.sourceFile,
        });
      }
    } else {
      // Detected but not declared
      reviewItems.push({
        t3777Code: detection.t3777Code,
        reason: `Gevonden maar niet verwacht (niet gedeclareerd in T3777 voor GTIN ${gtin})`,
        confidence: detection.confidence,
        bbox: detection.bbox,
        method: detection.method,
        cropPath: detection.cropPath,
        sourceFile: detection.sourceFile,
      });
    }
  }

  // Check for "declared but not found"
  const detectedCodes = new Set(detections.map((d) => d.t3777Code));
  for (const code of declared) {
    if (!detectedCodes.has(code)) {
      reviewItems.push({
        t3777Code: code,
        reason: `Verwacht maar niet gevonden op het artwork (gedeclareerd in T3777 voor GTIN ${gtin})`,
      });
    }
  }

  // Persist review items to ArtworkReviewItem table
  if (reviewItems.length > 0) {
    await prisma.artworkReviewItem.createMany({
      data: reviewItems.map((item) => ({
        gtin,
        t3777Code: item.t3777Code,
        bbox: item.bbox ?? {},
        confidence: item.confidence,
        method: item.method,
        reason: item.reason,
        cropPath: item.cropPath,
        sourceFile: item.sourceFile,
        // Sub-floor detections are persisted but hidden from the queue. Items
        // without a confidence (placeholders) always stay 'open'.
        status:
          typeof item.confidence === 'number' &&
          REVIEW_MIN_CONFIDENCE > 0 &&
          item.confidence < REVIEW_MIN_CONFIDENCE
            ? LOW_CONF_DISMISS_STATUS
            : 'open',
      })),
      skipDuplicates: false,
    });
  }

  return { autoAccepted, reviewItems };
}
