/**
 * Batch-detail-sub-service (Story 15.3, AC1) — voedt de quarantaine-detailpagina.
 *
 * Levert één gequarantaineerde promotiebatch als master-detail-payload:
 *   - batch: status, faalreden (uit `gateResults.regression.details`), gemeten
 *     delta, meest getroffen klassen, poort-fase-uitkomsten, closedAt.
 *   - kandidaten: status, T3777-code, cropPath, evidence-contract (scores,
 *     methode, bron-GTIN/bestand/bbox, declaratie-uitkomst) + de gedeclareerde
 *     codes, en per kandidaat óf een actieve referentie van dezelfde T3777-code
 *     bestaat (voor de vergelijkingsweergave).
 *
 * ON-READ, geen job, GÉÉN poortlogica (AD-15). De beeld-bytes zelf komen via de
 * bestaande stream-routes (candidates/:id/crop, reference-logos/code/:code/image)
 * — deze service levert alleen de metadata + of er een crop/referentie is.
 *
 * 404 bij een onbekende batch (route → HTTP 404).
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { resolvePromotionThreshold } from './thresholds';
import type { GatePhase } from './types';

const logger = createLogger('flywheel-batch-detail');

/** Fout: de batch bestaat niet (endpoint → 404). */
export class BatchDetailNotFoundError extends Error {
  constructor(public batchId: string) {
    super(`Promotiebatch ${batchId} niet gevonden`);
    this.name = 'BatchDetailNotFoundError';
  }
}

/** Eén poort-fase-uitkomst voor de badge-rij in het bewijspaneel. */
export interface GateOutcomeView {
  phase: GatePhase | 'goldSetCoverage';
  outcome: string;
  /** True = de fase die de batch blokkeerde (amber dot i.p.v. groen). */
  blocked: boolean;
  /** Menselijke labeltekst (NL) voor de badge. */
  label: string;
}

/** De batch-kop van de detailpagina. */
export interface BatchDetailHead {
  batchId: string;
  status: string;
  createdAt: string;
  closedAt: string | null;
  candidateCount: number;
  /** Faalreden als tekst (altijd gevuld). */
  failReason: string;
  /** Gemeten precisie-delta in procentpunten (negatief = daling), of null. */
  deltaPp: number | null;
  /** Meest getroffen klassen (subtekst). */
  mostAffectedClasses: string[];
  /** Poort-fase-uitkomsten voor de badge-rij. */
  gateOutcomes: GateOutcomeView[];
}

/** Eén kandidaat-referentie in de master-lijst + het bewijspaneel. */
export interface BatchCandidateView {
  id: string;
  t3777Code: string;
  status: string;
  origin: string;
  /** True als er een crop-beeld te streamen is (candidates/:id/crop). */
  hasCrop: boolean;
  /** True als er een actieve referentie van dezelfde T3777-code bestaat. */
  hasReference: boolean;
  /** Match-confidence uit de evidence-scores, of null. */
  confidence: number | null;
  /** Detectiemethode (embedding/template/…), of null. */
  method: string | null;
  /** Bron-GTIN uit het evidence-contract. */
  sourceGtin: string | null;
  /** Bronbestand (pack) uit het evidence-contract. */
  sourceFile: string | null;
  /** Bbox uit het evidence-contract. */
  bbox: { x: number; y: number; width: number; height: number } | null;
  /** Declaratie-uitkomst (confirmed/…), of null. */
  declarationOutcome: string | null;
  /** Gedeclareerde T3777-codes van de GTIN (voor het declaratieblok). */
  declaredCodes: string[];
  /** Informatieleverancier (GLN), of null. */
  gln: string | null;
}

/** De volledige batch-detail-payload. */
export interface BatchDetail {
  batch: BatchDetailHead;
  candidates: BatchCandidateView[];
  /** De promotiedrempel per methode, voor het scoreblok. */
  promotionThresholds: Record<string, number>;
}

interface RegressionDetails {
  decision?: string;
  reason?: string;
  delta?: number | null;
  mode?: string;
  mostAffectedClasses?: string[];
  threshold?: number;
  error?: string;
}

/** Menselijke faalreden-tekst uit de regressie-details (glossary 1-op-1). */
function formatFailReason(details: RegressionDetails | null): string {
  if (!details) return 'Kwaliteitspoort: batch in quarantaine';
  if (details.reason === 'systeem-fout') {
    return 'Kwaliteitspoort: systeemfout tijdens de regressietest';
  }
  if (details.mode === 'pp' && typeof details.delta === 'number') {
    return `Gold-set-regressietest: precisiedaling −${details.delta.toFixed(1)} pt`;
  }
  if (details.mode === 'sample' && typeof details.delta === 'number') {
    return `Gold-set-regressietest: ${details.delta} netto verslechterde samples`;
  }
  return 'Gold-set-regressietest: precisiedaling boven tolerantie';
}

/** NL-label per poort-fase voor de badge-rij. */
const PHASE_LABELS: Record<string, string> = {
  threshold: 'promotiedrempel',
  cap: 'per-klasse cap',
  dedup: 'dedup (perceptual-hash + embedding)',
  outlier: 'outlier-audit',
  regression: 'gold-set-regressietest',
};

/**
 * Zet de `gateResults`-map om in een badge-rij: elke afgeronde fase krijgt een
 * uitkomst; de blokkerende fase (regressie met beslissing `quarantine`, of een
 * fase met outcome `error`) is `blocked` (amber), de rest gepasseerd (groen).
 */
function buildGateOutcomes(gateResults: unknown): GateOutcomeView[] {
  const gr = (gateResults as Record<string, { outcome?: string; details?: RegressionDetails }> | null) ?? {};
  const order: GatePhase[] = ['threshold', 'cap', 'dedup', 'outlier', 'regression'];
  const outcomes: GateOutcomeView[] = [];
  for (const phase of order) {
    const rec = gr[phase];
    if (!rec) continue;
    const outcome = rec.outcome ?? 'not-run';
    // Blokkerend: regressie die tot quarantaine leidde, of een harde fout.
    const blocked =
      outcome === 'error' ||
      (phase === 'regression' && rec.details?.decision === 'quarantine');
    outcomes.push({
      phase,
      outcome,
      blocked,
      label: PHASE_LABELS[phase] ?? phase,
    });
  }
  return outcomes;
}

/**
 * Haal de batch-detail-payload op (AC1). Gooit `BatchDetailNotFoundError` bij een
 * onbekende id (endpoint → 404). Draait GÉÉN poortlogica.
 */
export async function getBatchDetail(batchId: string): Promise<BatchDetail> {
  const batch = await prisma.promotionBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      closedAt: true,
      gateResults: true,
    },
  });
  if (!batch) {
    throw new BatchDetailNotFoundError(batchId);
  }

  const candidateRows = await prisma.referenceCandidate.findMany({
    where: { promotionBatchId: batchId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      t3777Code: true,
      status: true,
      origin: true,
      cropPath: true,
      evidence: true,
    },
  });

  // Welke T3777-codes in deze batch hebben een actieve referentie? Eén query.
  const distinctCodes = Array.from(new Set(candidateRows.map((c) => c.t3777Code)));
  const codesWithReference = new Set<string>();
  if (distinctCodes.length > 0) {
    const refs = await prisma.referenceLogo.findMany({
      where: { t3777Code: { in: distinctCodes }, active: true },
      select: { t3777Code: true },
      distinct: ['t3777Code'],
    });
    for (const r of refs) codesWithReference.add(r.t3777Code);
  }

  const gate = (batch.gateResults as { regression?: { details?: RegressionDetails } } | null) ?? null;
  const details = gate?.regression?.details ?? null;

  const candidates: BatchCandidateView[] = candidateRows.map((c) => {
    const evidence = (c.evidence as Record<string, unknown>) ?? {};
    const scores = (evidence.scores as Record<string, unknown> | undefined) ?? {};
    const confidence = typeof scores.confidence === 'number' ? (scores.confidence as number) : null;
    const method = typeof evidence.method === 'string' ? (evidence.method as string) : null;
    const sourceGtin = typeof evidence.sourceGtin === 'string' ? (evidence.sourceGtin as string) : null;
    const sourceFile = typeof evidence.sourceFile === 'string' ? (evidence.sourceFile as string) : null;
    const bbox =
      evidence.bbox && typeof evidence.bbox === 'object'
        ? (evidence.bbox as { x: number; y: number; width: number; height: number })
        : null;
    const declarationOutcome =
      typeof evidence.declarationOutcome === 'string' ? (evidence.declarationOutcome as string) : null;
    const declaredCodes = Array.isArray(evidence.declaredCodes)
      ? (evidence.declaredCodes as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const gln = typeof evidence.gln === 'string' ? (evidence.gln as string) : null;

    return {
      id: c.id,
      t3777Code: c.t3777Code,
      status: c.status,
      origin: c.origin,
      hasCrop: !!c.cropPath,
      hasReference: codesWithReference.has(c.t3777Code),
      confidence,
      method,
      sourceGtin,
      sourceFile,
      bbox,
      declarationOutcome,
      declaredCodes,
      gln,
    };
  });

  const head: BatchDetailHead = {
    batchId: batch.id,
    status: batch.status,
    createdAt: batch.createdAt.toISOString(),
    closedAt: batch.closedAt ? batch.closedAt.toISOString() : null,
    candidateCount: candidateRows.length,
    failReason: formatFailReason(details),
    deltaPp: typeof details?.delta === 'number' ? details.delta : null,
    mostAffectedClasses: Array.isArray(details?.mostAffectedClasses)
      ? details!.mostAffectedClasses!.slice(0, 5)
      : [],
    gateOutcomes: buildGateOutcomes(batch.gateResults),
  };

  logger.info('Batch-detail opgevraagd', {
    batchId,
    status: batch.status,
    candidates: candidateRows.length,
  });

  return {
    batch: head,
    candidates,
    promotionThresholds: await getPromotionThresholds(candidates),
  };
}

/**
 * De effectieve promotiedrempel per methode die in deze batch voorkomt (voor het
 * scoreblok: "match-confidence vs. promotiedrempel"). Leest via de gedeelde
 * resolver (override ?? env ?? default), zodat een UI-drempelwijziging (15.4)
 * ook hier zichtbaar is.
 */
async function getPromotionThresholds(
  candidates: BatchCandidateView[]
): Promise<Record<string, number>> {
  const methods = Array.from(
    new Set(candidates.map((c) => c.method).filter((m): m is string => !!m))
  );
  const out: Record<string, number> = {};
  for (const m of methods) {
    out[m] = await resolvePromotionThreshold(m);
  }
  return out;
}
