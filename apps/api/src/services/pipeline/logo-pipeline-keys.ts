/**
 * Per-consumer service keys for POST /api/v1/pipeline/logo-scans (Story 1.1, FR-20, AD-3).
 *
 * LOGO_PIPELINE_KEYS = "naam:sleutel,naam2:sleutel2" (split on the FIRST colon, so a key may
 * contain ':'; names and keys are trimmed). Missing/empty variable = no consumers = every
 * request is rejected (fail closed). Never reads the shared API_KEY or PIPELINE_SERVICE_KEY.
 */
import crypto from 'crypto';
import { logger } from '../../core/logger';

export interface LogoPipelineKey { name: string; key: string }

export function parseLogoPipelineKeys(raw: string | undefined): LogoPipelineKey[] {
  if (!raw) return [];
  const out: LogoPipelineKey[] = [];
  const parts = raw.split(',');
  for (const [index, part] of parts.entries()) {
    const i = part.indexOf(':');
    if (i < 0) { logger.warn('LOGO_PIPELINE_KEYS entry ignored (no name:key)', { index }); continue; }
    const name = part.slice(0, i).trim();
    const key = part.slice(i + 1).trim();
    if (name && key) out.push({ name, key });
    else logger.warn('LOGO_PIPELINE_KEYS entry ignored (empty name or key)', { index });
  }
  return out;
}

const digest = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest();

/** Returns the consumer name for an exactly matching key, else null. Constant-time; checks every entry. */
export function resolveLogoPipelineConsumer(provided: string | undefined): string | null {
  // Parsed per request on purpose: cheap, and lets the environment change without a restart.
  const entries = parseLogoPipelineKeys(process.env.LOGO_PIPELINE_KEYS);
  if (!provided || typeof provided !== 'string') return null;
  const p = digest(provided); // equal-length digests: no length leak, no timingSafeEqual throw
  let match: string | null = null;
  for (const e of entries) {
    if (crypto.timingSafeEqual(p, digest(e.key)) && match === null) match = e.name;
  }
  return match;
}
