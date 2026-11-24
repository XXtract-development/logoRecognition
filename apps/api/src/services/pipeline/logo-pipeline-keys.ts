/**
 * Per-consumer service keys for POST /api/v1/pipeline/logo-scans (Story 1.1, FR-20, AD-3).
 *
 * LOGO_PIPELINE_KEYS = "naam:sleutel,naam2:sleutel2" (split on the FIRST colon, so a key may
 * contain ':'; names and keys are trimmed). LOGO_PIPELINE_KEYS_EXTRA (same format) is read as well: lets a
 * consumer be added without rewriting the main list (whose value Coolify does not return).
 * An EXTRA entry whose name or key already exists in the main list is ignored with a warning (names
 * only, never a key). Both variables missing/empty = no consumers = every request is rejected
 * (fail closed). Never reads the shared API_KEY or PIPELINE_SERVICE_KEY.
 */
import crypto from 'crypto';
import { logger } from '../../core/logger';

export interface LogoPipelineKey { name: string; key: string }

export function parseLogoPipelineKeys(raw: string | undefined, label = 'LOGO_PIPELINE_KEYS'): LogoPipelineKey[] {
  if (!raw?.trim()) return [];
  const out: LogoPipelineKey[] = [];
  for (const [index, part] of raw.split(',').entries()) {
    if (!part.trim()) continue; // lege delen (spatie, komma aan het eind) zijn geen fout
    const i = part.indexOf(':');
    if (i < 0) { logger.warn(`${label} entry ignored (no name:key)`, { index }); continue; }
    const name = part.slice(0, i).trim();
    const key = part.slice(i + 1).trim();
    if (name && key) out.push({ name, key });
    else logger.warn(`${label} entry ignored (empty name or key)`, { index });
  }
  return out;
}

// Memo on the raw env values: parsing and its warnings run once per configuration, not per request.
let memo: { main: string | undefined; extra: string | undefined; entries: LogoPipelineKey[] } | null = null;

function consumerEntries(): LogoPipelineKey[] {
  const main = process.env.LOGO_PIPELINE_KEYS;
  const extra = process.env.LOGO_PIPELINE_KEYS_EXTRA;
  if (memo && memo.main === main && memo.extra === extra) return memo.entries;
  const entries = parseLogoPipelineKeys(main);
  const names = new Set(entries.map((e) => e.name));
  const keyOwner = new Map<string, string>(); // first entry wins on a repeated key (warned, names only)
  for (const e of entries) {
    const owner = keyOwner.get(e.key);
    if (owner === undefined) keyOwner.set(e.key, e.name);
    else logger.warn('LOGO_PIPELINE_KEYS duplicate key (first entry wins)', { name: e.name, existing: owner });
  }
  for (const e of parseLogoPipelineKeys(extra, 'LOGO_PIPELINE_KEYS_EXTRA')) {
    // Same EXTRA name twice stays allowed (key rotation); only a clash with the main list is refused.
    if (names.has(e.name)) {
      logger.warn('LOGO_PIPELINE_KEYS_EXTRA entry ignored (name already in LOGO_PIPELINE_KEYS)', { name: e.name });
      continue;
    }
    const owner = keyOwner.get(e.key);
    if (owner !== undefined) {
      logger.warn('LOGO_PIPELINE_KEYS_EXTRA entry ignored (key already in use by another entry)', { name: e.name, existing: owner });
      continue;
    }
    keyOwner.set(e.key, e.name);
    entries.push(e);
  }
  memo = { main, extra, entries };
  return entries;
}

const digest = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest();

/** Returns the consumer name for an exactly matching key, else null. Constant-time; checks every entry. */
export function resolveLogoPipelineConsumer(provided: string | undefined): string | null {
  if (!provided || typeof provided !== 'string') return null;
  const p = digest(provided); // equal-length digests: no length leak, no timingSafeEqual throw
  let match: string | null = null;
  for (const e of consumerEntries()) {
    if (crypto.timingSafeEqual(p, digest(e.key)) && match === null) match = e.name;
  }
  return match;
}
