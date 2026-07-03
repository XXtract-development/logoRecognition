/**
 * Outlier-beoordelingsbeslissing (Story 15.2, AC6, FR-8/AD-5/AD-13).
 *
 * De datamanager beoordeelt een open outlier-melding met Behouden of Deactiveren:
 *   - `behouden`    → `outlier_findings.status='behouden'` + decidedBy/decidedAt.
 *                     De referentie blijft ongewijzigd actief.
 *   - `deactiveren` → `ReferenceLogo.active=false` (SOFT-DELETE, nooit DELETE —
 *                     schema.prisma) + `outlier_findings.status='gedeactiveerd'` +
 *                     decidedBy/decidedAt, plus KRITIEK: de baseline als VEROUDERD
 *                     markeren (AD-5, markBaselineStale). Outlier-deactivatie is
 *                     een mutatie van de actieve referentieset BUITEN batch-
 *                     promotie om; zonder de stale-markering meet de eerstvolgende
 *                     poortrun tegen een valse baseline.
 *
 * GÉÉN poortlogica in dit pad (AD-15): dit muteert status + soft-delete + logt en
 * markeert de baseline. Het draait nooit guardrails of de regressietest.
 *
 * Idempotentie (Testrichtlijnen): een tweede beslissing op een reeds beoordeelde
 * finding wordt geweigerd (409 in het endpoint) — geen dubbele soft-delete/log.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { markBaselineStale } from './baseline';
import { mlClient } from '../ml-client';

const logger = createLogger('flywheel-outlier-decision');

/** De toegestane beoordelingsacties. */
export type OutlierDecision = 'behouden' | 'deactiveren';

/** Fout: de finding bestaat niet (endpoint → 404). */
export class OutlierFindingNotFoundError extends Error {
  constructor(public findingId: string) {
    super(`Outlier-finding ${findingId} niet gevonden`);
    this.name = 'OutlierFindingNotFoundError';
  }
}

/** Fout: de finding is al beoordeeld (endpoint → 409, idempotentie). */
export class OutlierFindingAlreadyDecidedError extends Error {
  constructor(public findingId: string, public status: string) {
    super(`Outlier-finding ${findingId} is al beoordeeld (status ${status})`);
    this.name = 'OutlierFindingAlreadyDecidedError';
  }
}

export interface OutlierDecisionInput {
  findingId: string;
  decision: OutlierDecision;
  /** Wie de beslissing nam (userId), voor decidedBy. */
  by: string;
}

export interface OutlierDecisionResult {
  findingId: string;
  /** Nieuwe finding-status: `behouden` of `gedeactiveerd`. */
  status: 'behouden' | 'gedeactiveerd';
  referenceLogoId: string;
  /** True als de referentie gedeactiveerd is (soft-delete). */
  deactivated: boolean;
}

/**
 * Verwerk een outlier-beslissing (AC6). Gooit `OutlierFindingNotFoundError`
 * (onbekende finding) of `OutlierFindingAlreadyDecidedError` (reeds beoordeeld) —
 * het endpoint vertaalt die naar 404/409.
 *
 * Bij `deactiveren`: de status-mutatie van de finding én de soft-delete van de
 * referentie gebeuren in één transactie (conditioneel op `status='open'`, zodat
 * een gelijktijdige dubbele beslissing netjes verliest). De baseline-invalidatie
 * (AD-5) volgt ná de transactie — best-effort, want een gemiste markering mag de
 * (gecommitte) deactivatie niet terugdraaien, maar hij is verplicht en wordt
 * gelogd.
 */
export async function decideOutlier(
  input: OutlierDecisionInput
): Promise<OutlierDecisionResult> {
  const { findingId, decision, by } = input;

  const finding = await prisma.outlierFinding.findUnique({
    where: { id: findingId },
    select: { id: true, status: true, referenceLogoId: true },
  });
  if (!finding) {
    throw new OutlierFindingNotFoundError(findingId);
  }
  if (finding.status !== 'open') {
    throw new OutlierFindingAlreadyDecidedError(findingId, finding.status);
  }

  const decidedAt = new Date();

  if (decision === 'behouden') {
    // Conditioneel op status='open' (idempotentie tegen dubbele beslissing).
    const updated = await prisma.outlierFinding.updateMany({
      where: { id: findingId, status: 'open' },
      data: { status: 'behouden', decidedBy: by, decidedAt },
    });
    if (updated.count === 0) {
      throw new OutlierFindingAlreadyDecidedError(findingId, 'gewijzigd');
    }
    logger.info('Outlier-melding behouden', { findingId, referenceLogoId: finding.referenceLogoId, by });
    return {
      findingId,
      status: 'behouden',
      referenceLogoId: finding.referenceLogoId,
      deactivated: false,
    };
  }

  // decision === 'deactiveren': soft-delete + finding-status in één transactie.
  const result = await prisma.$transaction(async (tx) => {
    const findingUpdate = await tx.outlierFinding.updateMany({
      where: { id: findingId, status: 'open' },
      data: { status: 'gedeactiveerd', decidedBy: by, decidedAt },
    });
    if (findingUpdate.count === 0) {
      throw new OutlierFindingAlreadyDecidedError(findingId, 'gewijzigd');
    }

    // SOFT-DELETE: active=false (nooit DELETE — herleidbaarheid + matcher-filter).
    const deact = await tx.referenceLogo.updateMany({
      where: { id: finding.referenceLogoId, active: true },
      data: { active: false },
    });
    return { deactivated: deact.count > 0 };
  });

  logger.warn('Outlier-referentie gedeactiveerd (soft-delete)', {
    findingId,
    referenceLogoId: finding.referenceLogoId,
    by,
    deactivated: result.deactivated,
  });

  // KRITIEK (AD-5): de actieve referentieset muteerde buiten batch-promotie om →
  // markeer de baseline als verouderd zodat de eerstvolgende poortrun een verse
  // nulmeting draait. Zonder dit meet de poort tegen een valse baseline.
  await markBaselineStale('outlier-deactivatie', by);

  // ml-cache-verversing zodat de gedeactiveerde referentie direct uit de detectie
  // verdwijnt (best-effort, non-fataal).
  try {
    await mlClient.reloadTemplates();
  } catch (err) {
    logger.warn('Kon ml-templates niet verversen na outlier-deactivatie (non-fataal)', {
      findingId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }

  return {
    findingId,
    status: 'gedeactiveerd',
    referenceLogoId: finding.referenceLogoId,
    deactivated: result.deactivated,
  };
}
