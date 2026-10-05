import { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import { mlClient, DetectionResponse } from '../services/ml-client';
import { fetchLegacyImage, LegacyImageError, MAX_LEGACY_IMAGE_BYTES } from '../services/legacy-image-fetch';
import mapping from '../services/reference-code-mapping.json';
import prisma from '../core/db';
import { normalizeReferenceCode } from '../services/field-type-mapping';

const specificPairs = Object.entries(mapping.categories).flatMap(([fieldType, group]) =>
  group.codes.map(t3777Code => ({ t3777Code, fieldType })));
const MAX_CONCURRENT_DETECTIONS = 2;
const MAX_NORMALIZED_BYTES = 20 * 1024 * 1024;
const MAX_DECODED_PIXELS = 8_000_000;

export function toLegacyDetections(result: DetectionResponse, width: number, height: number,
  references: ReadonlyArray<{ t3777Code: string; fieldType: string }> = specificPairs) {
  const validPairs = new Set(references.map(ref => `${ref.fieldType}:${normalizeReferenceCode(ref.t3777Code)}`));
  const best = new Map<string, { logo_code: string; label: string; confidence: number; bbox: number[];
    confidence_kind?: string; detector_confidence?: number; model_version?: string; method?: string }>();
  for (const detection of result.detections) {
    if (detection.uncertain === true || detection.requires_review === true ||
      ['unknown', 'logo', ''].includes(String(detection.category || '').toLowerCase())) continue;
    const code = normalizeReferenceCode(detection.value || '');
    // Accept canonical nonempty codes returned by the recognition service; reject negative/placeholder classes.
    if (!code || code === 'NO_PICTOGRAM' || ['NO_MATCH', 'MATCH_ERROR', 'DETECTED_LOGO'].includes(code) ||
      !validPairs.has(`${detection.category}:${code}`) || /^GHS\d+$/.test(code) ||
      !Number.isFinite(detection.confidence) || detection.confidence < 0 || detection.confidence > 1) continue;
    const specialist = detection.category === 'GHSSymbolDescriptionCode' &&
      ['template-similarity-not-probability', 'ghs-glyph-ensemble-similarity', 'ghs_glyph_similarity', 'uncalibrated-classifier-score'].includes(detection.confidence_kind || '');
    const classification = specialist ? detection.confidence : detection.match_confidence;
    // A confident box is not evidence of confident classification.
    if (typeof classification !== 'number' || !Number.isFinite(classification) || classification < 0.99 || classification > 1) continue;
    const box = detection.bbox;
    if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
      box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 ||
      box.x + box.width > width || box.y + box.height > height) continue;
    const old = best.get(code);
    if (old && old.confidence >= classification) continue;
    best.set(code, {
      logo_code: code, label: detection.value, confidence: classification,
      bbox: [box.x / width, box.y / height, (box.x + box.width) / width, (box.y + box.height) / height],
      confidence_kind: specialist ? detection.confidence_kind : 'embedding-cosine-similarity',
      detector_confidence: specialist ? undefined : detection.confidence, model_version: detection.model_version || result.model_version,
      method: detection.method,
    });
  }
  return [...best.values()];
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
    try {
      const source = await fetchLegacyImage(req.body.image_url);
      if (source.length > MAX_LEGACY_IMAGE_BYTES) throw new LegacyImageError('Image exceeds size limit');
      let normalized;
      try {
        normalized = await sharp(source, { limitInputPixels: MAX_DECODED_PIXELS, animated: false })
          .rotate().png().toBuffer({ resolveWithObject: true });
      } catch { throw new LegacyImageError('Invalid or oversized image'); }
      if (normalized.data.length > MAX_NORMALIZED_BYTES) throw new LegacyImageError('Normalized image exceeds size limit');
      const references = await prisma.referenceLogo.findMany({
        where: { active: true }, select: { t3777Code: true, fieldType: true },
      });
      // Both ML and coordinates use exactly this normalized orientation/dimensions.
      const result = await mlClient.detectLogosFromBuffer(normalized.data, { confidenceThreshold: 0.99, returnEmbeddings: true });
      return {
        product_id: req.body.product_id,
        processing_time_ms: Date.now() - start,
        detections: toLegacyDetections(result, normalized.info.width, normalized.info.height, references),
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
