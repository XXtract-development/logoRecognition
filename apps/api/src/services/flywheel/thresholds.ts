/**
 * Drempelbeheer (Story 15.4, FR-5, AD-13) — de effectieve promotiedrempel per
 * methode + de wijzig-flow met verplichte reden en audittrail.
 *
 * ÉÉN RESOLUTIEFUNCTIE (`resolvePromotionThreshold`) is de gedeelde bron voor de
 * effectieve waarde: `system_settings-override ?? env ?? default 0,90`. De
 * poort-/nominatielogica (13.2/13.4) leest via déze functie, zodat een
 * UI-wijziging zonder deploy effect heeft en er geen tweede leespad ontstaat dat
 * de override negeert.
 *
 * `threshold_changes` is UITSLUITEND de audittrail (AD-13): de actuele waarde
 * leeft in de override (`system_settings`) resp. env — nooit in de audit-tabel.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import {
  PROMOTION_METHODS,
  PROMOTION_THRESHOLD_DEFAULT,
  normalizeMethod,
  getPromotionThresholdForMethod,
  type NominationMethod,
} from './config';
import { getSetting, invalidateSetting } from './system-settings';

const logger = createLogger('flywheel-thresholds');

/** Prefix van de override-key in `system_settings` (per methode één key). */
const OVERRIDE_KEY_PREFIX = 'flywheel.promotionThreshold.';

/** Toegestane per-methode-drempelvenster (AC/taak 2.4): stap 0,01, 0,50–0,99. */
export const THRESHOLD_MIN = 0.5;
export const THRESHOLD_MAX = 0.99;
export const THRESHOLD_STEP = 0.01;

/** De `thresholdKey` waaronder een methode in `threshold_changes` gelogd wordt. */
export function thresholdKeyForMethod(method: NominationMethod): string {
  return `${OVERRIDE_KEY_PREFIX}${method}`;
}

/** Vorm van de override-waarde in `system_settings` (een enkel getal in JSON). */
interface OverrideValue {
  value: number;
}

/**
 * Lees de system_settings-override voor één methode (of `null` als er geen
 * override is / de opgeslagen waarde ongeldig is → val terug op env/default).
 */
async function getOverride(method: NominationMethod): Promise<number | null> {
  const raw = await getSetting<OverrideValue>(thresholdKeyForMethod(method));
  const v = raw?.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * DE gedeelde resolver (AD-13, taak 2.3): de effectieve promotiedrempel voor een
 * methode = `system_settings-override ?? env ?? default 0,90`. Detecties zonder
 * methode vallen (via `normalizeMethod`) onder de strengste (classifier). Deze
 * functie is het ENIGE effectieve-waarde-leespad; poort en nominatie roepen hem
 * aan i.p.v. rechtstreeks de env te lezen.
 */
export async function resolvePromotionThreshold(method?: string | null): Promise<number> {
  const normalized = normalizeMethod(method);
  const override = await getOverride(normalized);
  if (override !== null) {
    return override;
  }
  // Geen override → env ?? default (de synchrone basiswaarde).
  return getPromotionThresholdForMethod(normalized);
}

/** Effectieve drempels voor álle methoden ineens (batch-detail-scoreblok e.d.). */
export async function resolvePromotionThresholds(
  methods: readonly string[] = PROMOTION_METHODS
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const m of methods) {
    out[m] = await resolvePromotionThreshold(m);
  }
  return out;
}

// ============================================
// GET-view: per-methode-drempels + historie
// ============================================

/** Bron van de effectieve waarde per methode (voor de UI-toelichting). */
export type ThresholdSource = 'override' | 'env' | 'default';

export interface MethodThresholdView {
  method: NominationMethod;
  /** Effectieve drempel (override ?? env ?? default). */
  value: number;
  /** De env/default-basiswaarde (de "vorige waarde" zolang geen override staat). */
  envValue: number;
  /** Bron van de effectieve waarde. */
  source: ThresholdSource;
  min: number;
  max: number;
  step: number;
}

export interface ThresholdHistoryRow {
  id: string;
  thresholdKey: string;
  method: NominationMethod | null;
  oldValue: string;
  newValue: string;
  reason: string | null;
  userId: string;
  changedAt: string;
}

export interface ThresholdsView {
  methods: MethodThresholdView[];
  history: ThresholdHistoryRow[];
}

/** Zet een `thresholdKey` terug naar de methode, of `null` (bv. de pauze-key). */
function methodFromKey(key: string): NominationMethod | null {
  if (!key.startsWith(OVERRIDE_KEY_PREFIX)) return null;
  const suffix = key.slice(OVERRIDE_KEY_PREFIX.length);
  return (PROMOTION_METHODS as readonly string[]).includes(suffix)
    ? (suffix as NominationMethod)
    : null;
}

/**
 * Bouw de drempel-view: per methode de effectieve waarde + env-basis + bron, plus
 * de wijzigingshistorie (nieuwste boven) uit `threshold_changes`. De historie
 * filtert op de drempel-keys (de pauze-overgangen leven óók in `threshold_changes`
 * maar horen niet in het drempeloverzicht).
 */
export async function getThresholdsView(): Promise<ThresholdsView> {
  const methods: MethodThresholdView[] = [];
  for (const method of PROMOTION_METHODS) {
    const override = await getOverride(method);
    const envValue = getPromotionThresholdForMethod(method);
    const value = override ?? envValue;
    const source: ThresholdSource =
      override !== null ? 'override' : envValue === PROMOTION_THRESHOLD_DEFAULT ? 'default' : 'env';
    methods.push({
      method,
      value,
      envValue,
      source,
      min: THRESHOLD_MIN,
      max: THRESHOLD_MAX,
      step: THRESHOLD_STEP,
    });
  }

  const keys = PROMOTION_METHODS.map((m) => thresholdKeyForMethod(m));
  const rows = await prisma.thresholdChange.findMany({
    where: { thresholdKey: { in: keys } },
    orderBy: { changedAt: 'desc' },
    take: 100,
  });

  const history: ThresholdHistoryRow[] = rows.map((r) => ({
    id: r.id,
    thresholdKey: r.thresholdKey,
    method: methodFromKey(r.thresholdKey),
    oldValue: r.oldValue,
    newValue: r.newValue,
    reason: r.reason,
    userId: r.userId,
    changedAt: r.changedAt.toISOString(),
  }));

  return { methods, history };
}

// ============================================
// PUT: drempel wijzigen (verplichte reden + audittrail)
// ============================================

/** Foutklasse: reden ontbreekt (server-side verplicht, AC 2 / taak 2.2). */
export class ThresholdReasonRequiredError extends Error {
  constructor() {
    super('Een reden is verplicht bij het wijzigen van een drempel.');
    this.name = 'ThresholdReasonRequiredError';
  }
}

/** Foutklasse: onbekende methode. */
export class ThresholdMethodInvalidError extends Error {
  constructor(public readonly method: string) {
    super(`Onbekende drempel-methode: ${method}.`);
    this.name = 'ThresholdMethodInvalidError';
  }
}

/** Foutklasse: waarde buiten het toegestane venster (taak 2.4). */
export class ThresholdOutOfRangeError extends Error {
  constructor(public readonly value: number) {
    super(
      `Drempel ${value} valt buiten het toegestane bereik (${THRESHOLD_MIN}–${THRESHOLD_MAX}, stap ${THRESHOLD_STEP}).`
    );
    this.name = 'ThresholdOutOfRangeError';
  }
}

export interface ChangeThresholdInput {
  method: string;
  newValue: number;
  reason: string;
  by: string;
}

export interface ChangeThresholdResult {
  method: NominationMethod;
  oldValue: number;
  newValue: number;
  reason: string;
  changedAt: string;
}

/** Ligt `value` op een geldige stap binnen [min,max]? (met floating-point-marge). */
function isValidThresholdValue(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (value < THRESHOLD_MIN - 1e-9 || value > THRESHOLD_MAX + 1e-9) return false;
  const steps = value / THRESHOLD_STEP;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

/**
 * Wijzig de effectieve drempel voor één methode (taak 2.2): reden verplicht,
 * bereik-gevalideerd; persisteert de override in `system_settings` én logt
 * atomair een `threshold_changes`-rij met oude+nieuwe waarde, gebruiker en reden.
 * De oude waarde is de HUIDIGE effectieve waarde (override ?? env ?? default), zo
 * blijft de audittrail leesbaar ("van X naar Y").
 */
export async function changeThreshold(
  input: ChangeThresholdInput
): Promise<ChangeThresholdResult> {
  const reason = input.reason?.trim();
  if (!reason) {
    throw new ThresholdReasonRequiredError();
  }
  if (!(PROMOTION_METHODS as readonly string[]).includes(input.method)) {
    throw new ThresholdMethodInvalidError(input.method);
  }
  const method = input.method as NominationMethod;
  if (!isValidThresholdValue(input.newValue)) {
    throw new ThresholdOutOfRangeError(input.newValue);
  }

  const oldValue = await resolvePromotionThreshold(method);
  const key = thresholdKeyForMethod(method);

  // Persisteer de override (bron van de actuele waarde) en log de wijziging.
  // Beide via prisma; de log-rij en de override-upsert in één transactie zodat
  // een half-geschreven audittrail niet kan ontstaan.
  const changedAt = await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key },
      create: { key, value: { value: input.newValue }, updatedBy: input.by },
      update: { value: { value: input.newValue }, updatedBy: input.by },
    });
    const row = await tx.thresholdChange.create({
      data: {
        thresholdKey: key,
        oldValue: String(oldValue),
        newValue: String(input.newValue),
        reason,
        userId: input.by,
      },
    });
    return row.changedAt;
  });

  // De override is BINNEN de transactie geschreven (buiten `setSetting`), dus de
  // in-process read-cache kan een stale waarde bevatten — gericht invalideren
  // zodat de gedeelde resolver de verse override leest.
  invalidateSetting(key);

  logger.info('Promotiedrempel gewijzigd', {
    method,
    oldValue,
    newValue: input.newValue,
    by: input.by,
  });

  return {
    method,
    oldValue,
    newValue: input.newValue,
    reason,
    changedAt: changedAt.toISOString(),
  };
}
