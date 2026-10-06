import { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import { mlClient } from '../services/ml-client';
import { fetchLegacyImage, LegacyImageError, MAX_LEGACY_IMAGE_BYTES } from '../services/legacy-image-fetch';
import prisma from '../core/db';
import { isGhsCode, normalizeReferenceCode } from '../services/field-type-mapping';
import canonicalReferenceMapping from '../services/reference-code-mapping.json';

const MAX_CONCURRENT_DETECTIONS = 2;
export const MAX_NORMALIZED_BYTES = 20 * 1024 * 1024;
export const MAX_DECODED_PIXELS = 80_000_000;

type ReferencePair = { t3777Code: string; fieldType: string };
export const GHS_REFERENCE_PAIRS: ReferencePair[] = canonicalReferenceMapping.categories.GHSSymbolDescriptionCode.codes
  .filter(code => isGhsCode(code) && code === normalizeReferenceCode(code) && !/^GHS\d+$/.test(code))
  .map(t3777Code => ({ t3777Code, fieldType: 'GHSSymbolDescriptionCode' }));
type ArtworkResult = Awaited<ReturnType<typeof mlClient.classifyArtwork>>['results'][number];
const SCORE_KINDS: Record<string, string> = {
  embedding: 'embedding-cosine-similarity', classifier: 'classifier-softmax',
  'nutriscore-head': 'nutriscore-color-geometry-score', 'nutriscore-a2': 'classifier-softmax',
  'ghs-specialist': 'uncalibrated-classifier-score', 'ghs-reference': 'template-similarity-not-probability',
  'ghs-glyph': 'uncalibrated-classifier-score', 'ghs-template': 'template-similarity-not-probability',
};

export function validBox(box: unknown, width: number, height: number): box is { x: number; y: number; width: number; height: number } {
  if (!box || typeof box !== 'object') return false;
  const b = box as { x: number; y: number; width: number; height: number };
  return [b.x, b.y, b.width, b.height].every(Number.isSafeInteger) &&
    b.x >= 0 && b.y >= 0 && b.width > 0 && b.height > 0 &&
    b.x + b.width <= width && b.y + b.height <= height;
}
export const boxKey = (box: { x: number; y: number; width: number; height: number }) =>
  `${box.x},${box.y},${box.width},${box.height}`;

export function assertCompleteClassification(results: ArtworkResult[], crops: { x: number; y: number; width: number; height: number }[], width: number, height: number) {
  if (!Array.isArray(results) || results.length !== crops.length) throw new Error('Classification response is incomplete');
  const remaining = new Set(crops.map(boxKey));
  if (remaining.size !== crops.length) throw new Error('Duplicate localization regions');
  for (const result of results) {
    if (!validBox(result.bbox, width, height) || !remaining.delete(boxKey(result.bbox)) ||
      !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1 ||
      !Object.prototype.hasOwnProperty.call(SCORE_KINDS, result.method) || typeof result.t3777_code !== 'string' || !result.t3777_code.trim()) {
      throw new Error('Classification evidence is malformed');
    }
  }
  if (remaining.size) throw new Error('Classification response is incomplete');
}

export function toLegacyArtworkResults(results: ArtworkResult[], width: number, height: number,
  references: ReadonlyArray<ReferencePair>, requestedBoxes: ReadonlyArray<{ x: number; y: number; width: number; height: number }>) {
  const pairs = new Map<string, Set<string>>();
  // Specialist classes have their own trained assets and are not embedding-library rows.
  for (const ref of [...references.filter(ref => !isGhsCode(ref.t3777Code)), ...GHS_REFERENCE_PAIRS]) {
    const code = normalizeReferenceCode(ref.t3777Code);
    if (!pairs.has(code)) pairs.set(code, new Set());
    pairs.get(code)!.add(ref.fieldType);
  }
  const boxes = new Set(requestedBoxes.map(boxKey));
  const positive = new Map<string, Record<string, unknown>>();
  const review = new Map<string, Record<string, unknown>>();
  for (const result of results) {
    const code = normalizeReferenceCode(result.t3777_code || '');
    const categories = pairs.get(code);
    if (!categories || categories.size !== 1 || code === 'NO_PICTOGRAM' || /^GHS\d+$/.test(code) ||
      !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1 ||
      !validBox(result.bbox, width, height) || !boxes.has(boxKey(result.bbox))) continue;
    const category = [...categories][0];
    const ghs = category === 'GHSSymbolDescriptionCode';
    const scoreKind = SCORE_KINDS[result.method];
    if (!scoreKind && !ghs) continue;
    // Deployment preserves the existing GHS review policy even if an upstream field is omitted.
    const requiresReview = ghs || result.requires_review === true || result.uncertain === true || result.confidence < 0.99;
    const entry = {
      logo_code: code, label: code, confidence: result.confidence,
      bbox: [result.bbox.x / width, result.bbox.y / height,
        (result.bbox.x + result.bbox.width) / width, (result.bbox.y + result.bbox.height) / height],
      method: result.method, confidence_kind: scoreKind || 'uncalibrated-ghs-score',
      evidence: result.evidence, reference_version: result.reference_version, requires_review: requiresReview,
      uncertain: result.uncertain === true || result.confidence < 0.99,
    };
    const target = requiresReview ? review : positive;
    const previous = target.get(code);
    if (!previous || Number(previous.confidence) < result.confidence) target.set(code, entry);
  }
  return { detections: [...positive.values()], review_proposals: [...review.values()] };
}

export async function legacyDetectRoutes(app: FastifyInstance) {
  let inFlight = 0;
  app.post<{ Body: { image_url: string; product_id: string } }>('/detect', {
    bodyLimit: 16 * 1024,
    onRequest: async (req, reply) => {
      const expected = process.env.LEGACY_DETECTION_API_KEY;
      if (!expected) return reply.code(503).send({ detail: 'Detection integration is not configured' });
      const supplied = req.headers['x-api-key'];
      if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
        return reply.code(401).send({ detail: supplied ? 'Invalid API key' : 'Missing X-API-Key header' });
      }
    },
    schema: { body: { type: 'object', required: ['image_url', 'product_id'],
      properties: { image_url: { type: 'string', maxLength: 4096 }, product_id: { type: 'string', maxLength: 1024 } } } },
  }, async (req, reply) => {
    if (inFlight >= MAX_CONCURRENT_DETECTIONS) {
      return reply.code(503).header('Retry-After', '1').send({ detail: 'Detection capacity is busy' });
    }
    inFlight += 1;
    const start = Date.now();
    const deadline = start + 165000;
    const remaining = () => {
      const ms = deadline - Date.now();
      if (ms <= 0) throw new Error('Recognition deadline exceeded');
      return ms;
    };
    try {
      const source = await fetchLegacyImage(req.body.image_url);
      if (source.length > MAX_LEGACY_IMAGE_BYTES) throw new LegacyImageError('Image exceeds size limit');
      let normalized;
      try {
        normalized = await sharp(source, { limitInputPixels: MAX_DECODED_PIXELS, animated: false })
          .rotate().png().toBuffer({ resolveWithObject: true });
      } catch { throw new LegacyImageError('Invalid or oversized image'); }
      if (normalized.data.length > MAX_NORMALIZED_BYTES) throw new LegacyImageError('Normalized image exceeds size limit');
      const catalogBudget = Math.min(5000, remaining());
      const references = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(catalogBudget)}, true)`;
        return tx.referenceLogo.findMany({ where: { active: true }, select: { t3777Code: true, fieldType: true } });
      }, { maxWait: Math.min(1000, catalogBudget), timeout: catalogBudget });
      if (!references.length) return reply.code(503).send({ detail: 'Active recognition catalog is empty' });
      const recognitionReferences = [...references, ...GHS_REFERENCE_PAIRS];
      // Both ML and coordinates use exactly this normalized orientation/dimensions.
      const image_b64 = normalized.data.toString('base64');
      const localizeBudget = remaining();
      const localized = await mlClient.localizeArtwork({
        proposal_strategy: 'visual', strict_runtime: true, remaining_budget_ms: localizeBudget, image_b64, codes: [...new Set(recognitionReferences.map(ref => normalizeReferenceCode(ref.t3777Code)))],
      }, { timeoutMs: localizeBudget });
      if (localized.truncated !== false || !Array.isArray(localized.detections)) {
        throw new Error('Localization did not complete');
      }
      const crops = localized.detections.map(d => d.bbox)
        .filter(box => validBox(box, normalized.info.width, normalized.info.height));
      if (crops.length !== localized.detections.length) throw new Error('Localization returned invalid regions');
      if (crops.length > 64) throw new Error('Localization exceeded classification capacity');
      if (new Set(crops.map(boxKey)).size !== crops.length) throw new Error('Duplicate localization regions');
      // No crops means no call: classifyArtwork's empty-crops fallback classifies the whole image.
      const classifyBudget = remaining();
      const classified = crops.length ? await mlClient.classifyArtwork({
        strict_runtime: true, remaining_budget_ms: classifyBudget, image_b64, crops, confidence_threshold: 0.99, persist_crops: false,
      }, { timeoutMs: classifyBudget }) : { results: [] };
      assertCompleteClassification(classified.results, crops, normalized.info.width, normalized.info.height);
      const result = toLegacyArtworkResults(classified.results, normalized.info.width, normalized.info.height, references, crops);
      return {
        product_id: req.body.product_id,
        processing_time_ms: Date.now() - start,
        ...result,
        review_proposals: result.review_proposals.map(proposal => ({ ...proposal, product_id: req.body.product_id })),
      };
    } catch (error) {
      if (error instanceof LegacyImageError) return reply.code(400).send({ detail: error.message });
      req.log.error({ requestId: req.id }, 'Legacy recognition service unavailable');
      return reply.code(502).send({ detail: 'Recognition service unavailable' });
    } finally {
      inFlight -= 1;
    }
  });
}
