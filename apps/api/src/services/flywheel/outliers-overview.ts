/**
 * Overview-paneel `outliers` (Story 14.3, AC3) — ontsluiting van de wekelijkse
 * outlier-audit-uitkomsten.
 *
 * De datamanager (en straks het 15.2-dashboard) leest hier de OPEN
 * outlier-meldingen + het tijdstempel van de laatste audit-run. Persistent en
 * herstart-bestendig: de bron is uitsluitend de `outlier_findings`-tabel (geen
 * process-/Redis-state), dus een API-herstart verliest niets (NFR-5).
 *
 * Modulariteit (coördinatie-noot epics): dit is één sub-service-aanroep in de
 * `/overview`-route, geen monoliet-handler. Het `outliers`-paneel-contract
 * (sleutels) is stabiel voor Story 15.2, die de findings van een beoordelings-
 * flow (`outliers/:id/decision`) voorziet — die endpoint bouwt 15.2, NIET deze
 * story.
 *
 * Uitsluitend `open` findings in het paneel: beoordeelde meldingen
 * (`behouden`/`gedeactiveerd`) zijn afgehandeld en horen niet in de actieve
 * signaleringslijst. `lastAuditRunAt` is het MEEST recente run-tijdstempel over
 * alle findings (ook beoordeelde) zodat "wanneer draaide de audit voor het
 * laatst" ook klopt als de laatste run geen open treffers opleverde.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';

const logger = createLogger('flywheel-outliers-overview');

/** Eén open outlier-melding in het paneel (met referentie-context voor 15.2). */
export interface OutlierPanelItem {
  id: string;
  referenceLogoId: string;
  t3777Code: string;
  variantLabel: string;
  distance: number;
  percentile: number;
  auditRunAt: string;
  createdAt: string;
}

/** Het `outliers`-paneel: open meldingen + laatste run-tijdstempel. */
export interface OutliersPanel {
  /** Aantal open meldingen. */
  openCount: number;
  /** Open meldingen, meest recent eerst. */
  openFindings: OutlierPanelItem[];
  /** ISO-tijdstempel van de meest recente audit-run, of null als er nog geen was. */
  lastAuditRunAt: string | null;
}

/** Hoeveel open meldingen het paneel maximaal meestuurt (dashboard-vriendelijk). */
const MAX_ITEMS = 100;

/**
 * Bouw het `outliers`-paneel (AC3): open findings + laatste `auditRunAt`.
 * ON-READ, geen job — wordt bij elke `GET /overview` aangeroepen.
 */
export async function getOutliersPanel(): Promise<OutliersPanel> {
  const [openCount, findings, latest] = await Promise.all([
    prisma.outlierFinding.count({ where: { status: 'open' } }),
    prisma.outlierFinding.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: MAX_ITEMS,
      include: {
        referenceLogo: { select: { t3777Code: true, variantLabel: true } },
      },
    }),
    // Meest recente run-tijdstempel over ALLE findings (ook beoordeelde).
    prisma.outlierFinding.findFirst({
      orderBy: { auditRunAt: 'desc' },
      select: { auditRunAt: true },
    }),
  ]);

  const openFindings: OutlierPanelItem[] = findings.map((f) => ({
    id: f.id,
    referenceLogoId: f.referenceLogoId,
    t3777Code: f.referenceLogo.t3777Code,
    variantLabel: f.referenceLogo.variantLabel,
    distance: f.distance,
    percentile: f.percentile,
    auditRunAt: f.auditRunAt.toISOString(),
    createdAt: f.createdAt.toISOString(),
  }));

  logger.info('Outliers-paneel opgevraagd', {
    openCount,
    returned: openFindings.length,
    lastAuditRunAt: latest?.auditRunAt?.toISOString() ?? null,
  });

  return {
    openCount,
    openFindings,
    lastAuditRunAt: latest?.auditRunAt?.toISOString() ?? null,
  };
}
