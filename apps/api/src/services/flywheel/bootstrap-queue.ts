/**
 * Bootstrap-wachtrij: prioritering en beheer (Story 17.2, FR-13, AD-2/AD-13/AD-15).
 *
 * De datamanager ziet de wachtrij op declaratiefrequentie geprioriteerd en kan
 * bijsturen: de volgorde overrulen (`priorityOverride`), klassen uitsluiten
 * (`excluded` → status `uitgesloten`) en klassen toevoegen. Deze service levert:
 *   - de EFFECTIEVE volgorde (override eerst, dan frequentie aflopend, gelijke
 *     frequentie deterministisch op code) — puur getest;
 *   - de mutaties met een audittrail (elke bijsturing gelogd met gebruiker +
 *     tijdstempel, AD-13/NFR-5) via het bestaande flat-audit-patroon
 *     (`threshold_changes`, hetzelfde `ModelActivationLog`-patroon als 15.4);
 *   - de "nieuw geactiveerde klasse"-bepaling (read-side, AC3): een wachtrij-status
 *     `gevuld` mét ≥1 actieve promotie-referentie waarvan de kandidaat-herkomst
 *     `bootstrap` is. Geen aparte notificatie-tabel.
 *
 * BINDENDE AD's:
 *   AD-2   `apps/api` is exclusief eigenaar van `bootstrap_queue`; de web muteert
 *          uitsluitend via het endpoint, ml-service raakt de tabel nooit.
 *   AD-13  elke handmatige bijsturing gelogd + opvraagbaar (audittrail).
 *   AD-15-analogie  deze service muteert alleen wachtrij-rijen (+ enqueue-t
 *          hoogstens een 17.1-run); ze draait nooit zelf bootstrap-/poortlogica.
 *
 * STATUS-EIGENDOM: de run-statussen (`gedraaid`/`gevuld`/`leeg`) zijn van 17.1;
 * deze service zet alleen `wachtend`/`uitgesloten` + de override. `uitgesloten`
 * wint altijd van automatische vulling (16.2-guard); het weer includeren zet de
 * status terug op `wachtend`.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';

const logger = createLogger('flywheel-bootstrap-queue');

/** Wachtrij-statussen (vaste waardenset, spiegelt `bootstrap_queue.status`). */
export type BootstrapQueueStatus =
  | 'wachtend'
  | 'gedraaid'
  | 'gevuld'
  | 'leeg'
  | 'uitgesloten';

/** Prefix van de `threshold_changes.thresholdKey` waaronder wachtrij-mutaties loggen. */
export const BOOTSTRAP_AUDIT_KEY_PREFIX = 'flywheel.bootstrapQueue.';

/** De audit-key waaronder een code z'n wachtrij-mutaties logt (AD-13). */
export function bootstrapAuditKeyForCode(t3777Code: string): string {
  return `${BOOTSTRAP_AUDIT_KEY_PREFIX}${t3777Code}`;
}

/** Eén rij in de wachtrij-view (paneel + endpoint-GET). */
export interface BootstrapQueueItem {
  t3777Code: string;
  status: string;
  declarationFrequency: number;
  priorityOverride: number | null;
  excluded: boolean;
  lastRunAt: string | null;
  createdAt: string;
  /** True als deze klasse "nieuw geactiveerd" is (AC3, read-side bepaald). */
  newlyActivated: boolean;
  /**
   * De promotie-batch (Story 15.3) die de bootstrap-kandidaat van deze klasse
   * promoveerde — het doorklik-doel voor het evidence-contract (AC4). Alleen gezet
   * als `newlyActivated`; de batch-detail-route resolvet op DIT batch-id (UUID),
   * niet op de T3777-code.
   */
  activatedBatchId: string | null;
}

/** De wachtrij-view (endpoint-GET + paneel-payload). */
export interface BootstrapQueueView {
  items: BootstrapQueueItem[];
  /** De codes die als "nieuw geactiveerde klasse" gelden (AC3, doorklik-AC4). */
  newlyActivatedCodes: string[];
}

// ============================================================================
// PURE effectieve-volgorde-berekening (AC2 — los getest)
// ============================================================================

/** Minimale rij-vorm voor de sortering (pure functie, geen DB). */
export interface SortableQueueRow {
  t3777Code: string;
  declarationFrequency: number;
  priorityOverride: number | null;
}

/**
 * PURE sortering: de effectieve wachtrij-volgorde (AC2).
 *
 * Volgorde-regels (in deze prioriteit):
 *   1. Rijen mét een `priorityOverride` staan vóór rijen zonder — en onderling
 *      op override AFLOPEND (hogere override = eerder).
 *   2. Daarna op declaratiefrequentie AFLOPEND (meest-gedeclareerd eerst).
 *   3. Gelijke frequentie → deterministisch alfabetisch op code (stabiel voor
 *      tests + UI; geen niet-deterministische DB-volgorde).
 *
 * Muteert de invoer niet (werkt op een kopie).
 */
export function effectiveQueueOrder<T extends SortableQueueRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aHas = a.priorityOverride !== null && a.priorityOverride !== undefined;
    const bHas = b.priorityOverride !== null && b.priorityOverride !== undefined;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas && a.priorityOverride !== b.priorityOverride) {
      return (b.priorityOverride as number) - (a.priorityOverride as number);
    }
    if (a.declarationFrequency !== b.declarationFrequency) {
      return b.declarationFrequency - a.declarationFrequency;
    }
    return a.t3777Code.localeCompare(b.t3777Code);
  });
}

// ============================================================================
// "Nieuw geactiveerde klasse"-bepaling (AC3 — read-side)
// ============================================================================

/**
 * Bepaal welke wachtrij-codes "nieuw geactiveerd" zijn (AC3, read-side, GEEN
 * notificatie-tabel): een code met wachtrij-status `gevuld` ÉN ≥1 actieve
 * `ReferenceLogo` met `source='flywheel-promotion'` waarvan de onderliggende
 * kandidaat-herkomst `bootstrap` is. Zo verschijnt uitsluitend een klasse die
 * daadwerkelijk via de bootstrap-lus (17.1) door de poort gepromoveerd werd —
 * niet een klasse die langs een ander pad referenties kreeg.
 *
 * Retourneert een map code→promotie-batch-id: het batch-id (UUID) van de
 * promotie-batch die de kandidaat promoveerde, zodat het paneel voor de doorklik
 * (AC4) de batch-detail-route (`/flywheel/batches/:id`) op het JUISTE id kan
 * aanroepen — die route resolvet op batch-UUID, nooit op de T3777-code. Bij
 * meerdere gepromoveerde bootstrap-kandidaten voor één code wint de nieuwste batch.
 *
 * `filledCodes` = de codes met wachtrij-status `gevuld` (voorgefilterd door de
 * caller); we bevestigen per code de actieve bootstrap-promotie via één
 * gegroepeerde query over de gepromoveerde kandidaten.
 */
export async function determineNewlyActivatedCodes(
  filledCodes: string[]
): Promise<Map<string, string | null>> {
  if (filledCodes.length === 0) return new Map();

  // Kandidaten met herkomst `bootstrap` die naar een ACTIEVE, via-promotie
  // referentie van een `gevuld`-klasse verwijzen. `referenceLogoId` is gezet zodra
  // een kandidaat gepromoveerd is (13.2/AD-3); de referentie moet actief zijn en
  // `source='flywheel-promotion'` dragen (AC3-contract). `promotionBatchId` is het
  // doorklik-doel (AC4). Nieuwste eerst zodat de eerste rij per code de meest
  // recente promotie-batch is.
  const rows = await prisma.referenceCandidate.findMany({
    where: {
      origin: 'bootstrap',
      t3777Code: { in: filledCodes },
      referenceLogo: {
        active: true,
        source: 'flywheel-promotion',
      },
    },
    select: { t3777Code: true, promotionBatchId: true },
    orderBy: { createdAt: 'desc' },
  });

  const byCode = new Map<string, string | null>();
  for (const r of rows) {
    if (!byCode.has(r.t3777Code)) byCode.set(r.t3777Code, r.promotionBatchId ?? null);
  }
  return byCode;
}

// ============================================================================
// GET-view (endpoint + paneel)
// ============================================================================

/**
 * Bouw de wachtrij-view: alle rijen in effectieve volgorde + de "nieuw
 * geactiveerde klasse"-markering per rij (AC2/AC3). Read-only.
 */
export async function getBootstrapQueue(): Promise<BootstrapQueueView> {
  const rows = await prisma.bootstrapQueue.findMany({
    select: {
      t3777Code: true,
      status: true,
      declarationFrequency: true,
      priorityOverride: true,
      excluded: true,
      lastRunAt: true,
      createdAt: true,
    },
  });

  const filledCodes = rows.filter((r) => r.status === 'gevuld').map((r) => r.t3777Code);
  const newlyActivated = await determineNewlyActivatedCodes(filledCodes);

  const ordered = effectiveQueueOrder(rows);
  const items: BootstrapQueueItem[] = ordered.map((r) => ({
    t3777Code: r.t3777Code,
    status: r.status,
    declarationFrequency: r.declarationFrequency,
    priorityOverride: r.priorityOverride,
    excluded: r.excluded,
    lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    newlyActivated: newlyActivated.has(r.t3777Code),
    activatedBatchId: newlyActivated.get(r.t3777Code) ?? null,
  }));

  return {
    items,
    newlyActivatedCodes: items.filter((i) => i.newlyActivated).map((i) => i.t3777Code),
  };
}

// ============================================================================
// Mutaties (met audittrail, AD-13)
// ============================================================================

/** Foutklasse: onbekende wachtrij-code bij een mutatie op een bestaande rij. */
export class BootstrapQueueCodeNotFoundError extends Error {
  constructor(public readonly t3777Code: string) {
    super(`Bootstrap-wachtrij-code niet gevonden: ${t3777Code}.`);
    this.name = 'BootstrapQueueCodeNotFoundError';
  }
}

/** Foutklasse: ongeldige toevoeging (lege code). */
export class BootstrapQueueInvalidCodeError extends Error {
  constructor() {
    super('Een geldige T3777-code is verplicht.');
    this.name = 'BootstrapQueueInvalidCodeError';
  }
}

/**
 * Log één wachtrij-mutatie in de flat-audittrail (`threshold_changes`, AD-13).
 * `action` beschrijft de mutatie; `oldValue`/`newValue` leggen de wijziging vast.
 * De log-rij en de wachtrij-mutatie worden door de caller in één transactie
 * geschreven zodat er geen half-geschreven audittrail ontstaat.
 */
async function auditMutation(
  tx: {
    thresholdChange: {
      create: (args: {
        data: {
          thresholdKey: string;
          oldValue: string;
          newValue: string;
          reason: string | null;
          userId: string;
        };
      }) => Promise<unknown>;
    };
  },
  t3777Code: string,
  action: string,
  oldValue: string,
  newValue: string,
  by: string
): Promise<void> {
  await tx.thresholdChange.create({
    data: {
      thresholdKey: bootstrapAuditKeyForCode(t3777Code),
      oldValue,
      newValue,
      reason: action,
      userId: by,
    },
  });
}

/**
 * Zet of wis de prioriteits-override van een klasse (AC2). `null` wist de override
 * (terug naar frequentie-volgorde). Gelogd met gebruiker + tijdstempel.
 */
export async function setPriorityOverride(
  t3777Code: string,
  priorityOverride: number | null,
  by: string
): Promise<BootstrapQueueItem> {
  const existing = await prisma.bootstrapQueue.findUnique({ where: { t3777Code } });
  if (!existing) throw new BootstrapQueueCodeNotFoundError(t3777Code);

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.bootstrapQueue.update({
      where: { t3777Code },
      data: { priorityOverride },
    });
    await auditMutation(
      tx,
      t3777Code,
      priorityOverride === null ? 'override-gewist' : 'override-gezet',
      existing.priorityOverride === null ? '(geen)' : String(existing.priorityOverride),
      priorityOverride === null ? '(geen)' : String(priorityOverride),
      by
    );
    return updated;
  });

  logger.info('Bootstrap-wachtrij override gemuteerd', {
    t3777Code,
    priorityOverride,
    by,
  });
  return toItem(row);
}

/**
 * Sluit een klasse uit of includeer hem weer (AC2). Uitsluiten zet `excluded=true`
 * + status `uitgesloten` (17.1 verwerkt hem nooit; de 16.2-aggregatie zet hem nooit
 * terug op `wachtend`). Includeren zet `excluded=false` + status terug op `wachtend`
 * (opneembaar). Gelogd.
 */
export async function setExcluded(
  t3777Code: string,
  excluded: boolean,
  by: string
): Promise<BootstrapQueueItem> {
  const existing = await prisma.bootstrapQueue.findUnique({ where: { t3777Code } });
  if (!existing) throw new BootstrapQueueCodeNotFoundError(t3777Code);

  const newStatus: BootstrapQueueStatus = excluded ? 'uitgesloten' : 'wachtend';

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.bootstrapQueue.update({
      where: { t3777Code },
      data: { excluded, status: newStatus },
    });
    await auditMutation(
      tx,
      t3777Code,
      excluded ? 'uitgesloten' : 'weer-ingesloten',
      `excluded=${existing.excluded}, status=${existing.status}`,
      `excluded=${excluded}, status=${newStatus}`,
      by
    );
    return updated;
  });

  logger.info('Bootstrap-wachtrij uitsluiting gemuteerd', { t3777Code, excluded, by });
  return toItem(row);
}

/**
 * Voeg een klasse handmatig toe aan de wachtrij (AC2). Idempotent: bestaat de code
 * al, dan wordt hij niet overschreven (bestaande status/override/excluded blijven).
 * Een nieuwe rij krijgt status `wachtend` + de meegegeven/afgeleide frequentie.
 * Gelogd.
 */
export async function addClass(
  t3777Code: string,
  declarationFrequency: number,
  by: string
): Promise<BootstrapQueueItem> {
  const code = t3777Code?.trim();
  if (!code) throw new BootstrapQueueInvalidCodeError();

  const existing = await prisma.bootstrapQueue.findUnique({ where: { t3777Code: code } });
  if (existing) {
    // Idempotent: geen overschrijving — een handmatige toevoeging van een bestaande
    // code is een no-op op de rij zelf (status/override/excluded blijven staan).
    logger.info('Bootstrap-wachtrij: klasse bestond al — geen wijziging', { t3777Code: code });
    return toItem(existing);
  }

  const freq = Number.isFinite(declarationFrequency) && declarationFrequency >= 0
    ? Math.floor(declarationFrequency)
    : 0;

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.bootstrapQueue.create({
      data: { t3777Code: code, declarationFrequency: freq, status: 'wachtend' },
    });
    await auditMutation(tx, code, 'klasse-toegevoegd', '(niet in wachtrij)', `frequentie=${freq}`, by);
    return created;
  });

  logger.info('Bootstrap-wachtrij: klasse toegevoegd', { t3777Code: code, freq, by });
  return toItem(row);
}

/** Vertaal een DB-rij naar een view-item (zonder de per-rij newlyActivated-vlag). */
function toItem(row: {
  t3777Code: string;
  status: string;
  declarationFrequency: number;
  priorityOverride: number | null;
  excluded: boolean;
  lastRunAt: Date | null;
  createdAt: Date;
}): BootstrapQueueItem {
  return {
    t3777Code: row.t3777Code,
    status: row.status,
    declarationFrequency: row.declarationFrequency,
    priorityOverride: row.priorityOverride,
    excluded: row.excluded,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    newlyActivated: false,
    activatedBatchId: null,
  };
}
