/**
 * POST /api/v1/pipeline/logo-scans — request a scan (202 + scanId), Story 1.2.
 * GET  /api/v1/pipeline/logo-scans/:scanId — status (pending|running|done|failed) and result.
 * Both need a service key (Story 1.1). Logs only the consumer name, never a key value (NFR-4).
 */
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import sharp from 'sharp';
import { resolveLogoPipelineConsumer } from '../../services/pipeline/logo-pipeline-keys';
import {
  LOGO_SCAN_MAX_IMAGE_BYTES, LOGO_SCAN_MAX_PIXELS, LOGO_SCAN_RETRY_AFTER_S, LogoScanBusyError, getLogoScan, submitLogoScan,
} from '../../services/pipeline/logo-scan-flow';
import { logger } from '../../core/logger';

const LOG_MODULE = 'logo-scans';
const FIELDS = ['productId', 'pipelineId', 'gpcCategoryCode'] as const;
const MAX_FIELD_LENGTH = 256;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

function fail(request: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) {
  return reply.status(status).send({ error: { code, message, requestId: request.id || 'unknown' } });
}

function authenticate(request: FastifyRequest, reply: FastifyReply): string | null {
  const header = request.headers['x-api-key'];
  const consumer = resolveLogoPipelineConsumer(typeof header === 'string' ? header : undefined);
  if (!consumer) {
    logger.warn('logo-scans request rejected', { module: LOG_MODULE, requestId: request.id });
    fail(request, reply, 401, 'UNAUTHORIZED', 'Missing or invalid service key');
    return null;
  }
  return consumer;
}

export async function logoScanRoutes(app: FastifyInstance) {
  // Per-route cap against key guessing (global limiter is 100/min); only active when @fastify/rate-limit is registered.
  app.post('/pipeline/logo-scans', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const consumer = authenticate(request, reply);
    if (!consumer) return reply;
    logger.info('logo-scans request authenticated', { module: LOG_MODULE, consumer, requestId: request.id });

    if (typeof request.isMultipart !== 'function' || !request.isMultipart()) {
      return fail(request, reply, 400, 'INVALID_IMAGE', 'Send multipart/form-data with one png or jpeg file in field "file"');
    }
    let image: Buffer | undefined;
    let files = 0;
    let tooLong: string | undefined;
    const fields: Partial<Record<(typeof FIELDS)[number], string>> = {};
    try {
      for await (const part of request.parts({ limits: { fileSize: LOGO_SCAN_MAX_IMAGE_BYTES } })) {
        if (part.type === 'file') {
          files += 1;
          const buf = await part.toBuffer(); // throws FST_REQ_FILE_TOO_LARGE above the limit
          if (files === 1) image = buf;
        } else if ((FIELDS as readonly string[]).includes(part.fieldname) && typeof part.value === 'string') {
          const value = part.value.trim();
          if (value.length > MAX_FIELD_LENGTH) tooLong = part.fieldname; // keep draining the stream, answer afterwards
          if (value) fields[part.fieldname as (typeof FIELDS)[number]] = value;
        }
      }
    } catch (err) {
      if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        return fail(request, reply, 413, 'IMAGE_TOO_LARGE', `Image exceeds ${LOGO_SCAN_MAX_IMAGE_BYTES} bytes`);
      }
      return fail(request, reply, 400, 'INVALID_REQUEST', 'Malformed multipart request');
    }
    if (tooLong) return fail(request, reply, 400, 'INVALID_REQUEST', `Field ${tooLong} is too long`);
    if (files !== 1 || !image || !image.length) return fail(request, reply, 400, 'INVALID_IMAGE', 'Exactly one image file is required');

    // Magic bytes decide, not the mimetype the caller claims.
    if (!image.subarray(0, PNG.length).equals(PNG) && !image.subarray(0, JPEG.length).equals(JPEG)) {
      return fail(request, reply, 400, 'INVALID_IMAGE', 'Only png and jpeg images are accepted');
    }
    try {
      const { width = 0, height = 0 } = await sharp(image).metadata();
      if (!width || !height || width * height > LOGO_SCAN_MAX_PIXELS) throw new Error('size');
      // Decode for real so a valid header on a corrupt body is a 400 now, not a failed scan later.
      await sharp(image, { limitInputPixels: LOGO_SCAN_MAX_PIXELS }).resize(1, 1).raw().toBuffer();
    } catch {
      return fail(request, reply, 400, 'INVALID_IMAGE', 'Image cannot be read or has too many pixels');
    }

    try {
      const { scanId } = await submitLogoScan({ image, consumer, ...fields });
      return reply.status(202).send({ scanId });
    } catch (err) {
      if (!(err instanceof LogoScanBusyError)) throw err;
      return fail(request, reply.header('Retry-After', String(LOGO_SCAN_RETRY_AFTER_S)), 503, 'BUSY', 'Scan service is busy, retry later');
    }
  });

  app.get<{ Params: { scanId: string } }>('/pipeline/logo-scans/:scanId', async (request, reply) => {
    const consumer = authenticate(request, reply);
    if (!consumer) return reply;
    const state = UUID.test(request.params.scanId) ? await getLogoScan(request.params.scanId) : null;
    // A key only reads its own scans; another consumer's scan looks unknown.
    if (!state || state.consumer !== consumer) return fail(request, reply, 404, 'NOT_FOUND', 'Unknown scanId');
    const { scanId, status, reason, logoResults, processingTimeMs } = state;
    return { scanId, status, reason, logoResults, processingTimeMs };
  });
}
