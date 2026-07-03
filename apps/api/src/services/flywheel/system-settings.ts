/**
 * Generieke key/value-toegang tot de `system_settings`-tabel (Story 13.6, AD-11).
 *
 * De ENIGE bron van waarheid voor persistente vliegwiel-besturing: de pauze-stand
 * (`pause.ts`), de baseline-invalidatie-marker (`baseline.ts`) en de K=2-
 * quarantaine-teller. Bewust minimaal — geen typering per key op DB-niveau; de
 * vorm van elke `value` is een applicatie-contract in de betreffende service.
 *
 * De bron is de database, nooit process- of env-state (AD-11): een herstart heft
 * niets op. Een korte in-process read-cache versnelt de hot path (`isPaused()` op
 * elke nominatie) en wordt bij elke schrijf via deze module geïnvalideerd.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';

const logger = createLogger('flywheel-system-settings');

/** Bekende system_settings-sleutels (Story 13.6). */
export const SETTING_KEYS = {
  PAUSED: 'flywheel.paused',
  BASELINE_STALE: 'flywheel.baselineStale',
  AUTO_PAUSE_STREAK: 'flywheel.autoPauseStreak',
} as const;

/** Time-to-live van de in-process read-cache (ms). Kort — pauze moet snel landen. */
const CACHE_TTL_MS = parseInt(process.env.FLYWHEEL_SETTINGS_CACHE_TTL_MS || '2000', 10);

interface CacheEntry {
  value: unknown;
  at: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Lees de `value` van een setting-key (of `null` als de key niet bestaat).
 * Gebruikt een korte read-cache; `{ fresh: true }` omzeilt de cache voor een
 * gegarandeerd verse lezing (bv. direct na een schrijf in een andere transactie).
 */
export async function getSetting<T = unknown>(
  key: string,
  opts: { fresh?: boolean } = {}
): Promise<T | null> {
  if (!opts.fresh) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.value as T | null;
    }
  }

  try {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    const value = (row?.value ?? null) as T | null;
    cache.set(key, { value, at: Date.now() });
    return value;
  } catch (err) {
    logger.error('Kon system_settings-key niet lezen', {
      key,
      error: err instanceof Error ? err.message : 'unknown',
    });
    // Fail-safe teruggeven: een leesfout mag geen valse pauze/staleness forceren.
    return null;
  }
}

/**
 * Schrijf de `value` van een setting-key (upsert) met de muterende gebruiker
 * (AD-13-herleidbaarheid). Invalideert de cache-entry zodat de eerstvolgende
 * lezing de verse waarde ziet.
 */
export async function setSetting(
  key: string,
  value: unknown,
  updatedBy?: string | null
): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: value as object, updatedBy: updatedBy ?? null },
    update: { value: value as object, updatedBy: updatedBy ?? null },
  });
  cache.set(key, { value, at: Date.now() });
}

/** Wis de in-process read-cache (testhulp + expliciete invalidatie). */
export function clearSettingsCache(): void {
  cache.clear();
}
