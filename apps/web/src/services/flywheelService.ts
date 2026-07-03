/**
 * Flywheel Service (Story 15.1 + 15.2) — leest het vliegwiel-overzicht en voert
 * de dashboard-mutaties uit (batch-rollback, outlier-beslissing).
 *
 * Alle vliegwiel-verkeer gaat uitsluitend via `/api/v1/flywheel/*` (AD-10); de
 * SPA praat nooit rechtstreeks met ml-service of de database. De types zijn
 * defensief (velden optioneel / panelen mogelijk `{ error }`) zodat een falend
 * paneel of een uitgebreidere backend-response de pagina niet breekt.
 */

import apiClient from '@/services/apiClient';

/** Sectie-lokale foutmarkering voor een paneel dat niet geladen kon worden. */
export interface PanelError {
  error: string;
}

/** True als een panel-waarde een sectie-lokale fout is. */
export function isPanelError(v: unknown): v is PanelError {
  return typeof v === 'object' && v !== null && 'error' in (v as object);
}

// ── Paneel-types (spiegelen de API-sub-services) ────────────────────────────

export interface PrecisionTrendPoint {
  batchId: string;
  at: string;
  precision: number | null;
  status: string;
  regression: boolean;
  caption: string | null;
}
export interface PrecisionTrendPanel {
  points: PrecisionTrendPoint[];
  latestPrecision: number | null;
  latestDeltaPp: number | null;
  tolerancePp: number;
}

export interface QuarantineRow {
  batchId: string;
  createdAt: string;
  candidateCount: number;
  failReason: string;
  mostAffectedClasses: string[];
  status: string;
  gateResults: unknown;
}
export interface QuarantinePanel {
  rows: QuarantineRow[];
  count: number;
}

export interface KpiPanel {
  goldSetPrecision: number | null;
  newReferences: {
    count: number;
    classCount: number;
    windowDays: number;
    passedBatches: number;
  };
  quarantine: { count: number; oldestAt: string | null; oldestAgeHours: number | null };
  classesAtCap: { count: number; cap: number };
}

export interface ClassAtCap {
  t3777Code: string;
  activeCount: number;
  cap: number;
  rejectedNominations: number;
}
export interface ClassCapsPanel {
  cap: number;
  classes: ClassAtCap[];
}

export interface HistoryRow {
  batchId: string;
  createdAt: string;
  closedAt: string | null;
  status: string;
  precision: number | null;
  rolledBack: boolean;
  rollback: { by: string; reason: string; at: string } | null;
}
export interface HistoryPanel {
  rows: HistoryRow[];
  count: number;
}

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
export interface OutliersPanel {
  openCount: number;
  openFindings: OutlierPanelItem[];
  lastAuditRunAt: string | null;
}

export interface GoldSetComposition {
  size: number;
  labelDistribution: { echt: number; vals: number; other: number; echtRatio: number };
  classCount: number;
  topClasses: Array<{ t3777Code: string; count: number; share: number }>;
  bottomClasses: Array<{ t3777Code: string; count: number; share: number }>;
  skewSignals: Array<{ type: string; klasse?: string; waarde: number; drempel: number }>;
  thresholds: { classShareMax: number; echtMin: number; echtMax: number };
}

export interface EmptyPanel {
  available: false;
  sourceEpic: string;
  items: never[];
}

export interface PauseState {
  paused: boolean;
  reason: string | null;
  since: string | null;
  by: string | null;
}

/** De volledige `/flywheel/overview`-response (Story 15.2). Panelen kunnen `{ error }` zijn. */
export interface FlywheelOverview {
  generatedAt: string;
  nominationEnabled: boolean;
  missedNominations: Record<string, number> | PanelError;
  missedNominationsTotal: number;
  lastSuccessfulPromotionRun: string | null | PanelError;
  paused: boolean;
  pause: PauseState | PanelError;
  goldSetComposition: GoldSetComposition | PanelError;
  outliers: OutliersPanel | PanelError;
  quarantineCount: number | PanelError;
  precisionTrend: PrecisionTrendPanel | PanelError;
  quarantine: QuarantinePanel | PanelError;
  kpi: KpiPanel | PanelError;
  classCaps: ClassCapsPanel | PanelError;
  history: HistoryPanel | PanelError;
  bootstrapQueue: EmptyPanel;
  mismatchTrends: EmptyPanel;
  glnCoverage: EmptyPanel;
}

/**
 * Haal het vliegwiel-overzicht op. Faalt de call, dan propageert de fout naar de
 * TanStack Query-consumer (die toont de sectie-lokale foutkaart / lege staat).
 */
export async function fetchFlywheelOverview(): Promise<FlywheelOverview> {
  const res = await apiClient.get<FlywheelOverview>('/flywheel/overview');
  return res.data;
}

/**
 * Draai een gepasseerde batch terug (Story 13.6-endpoint). Verplicht redenveld —
 * de server valideert het ook (UX-DR11); een lege reden wordt hier al geweigerd.
 */
export async function rollbackBatch(
  batchId: string,
  reason: string
): Promise<{ batchId: string; status: string; deactivatedReferences: number }> {
  const res = await apiClient.post(`/flywheel/batches/${batchId}/rollback`, { reason });
  return res.data;
}

/** Beoordeel een open outlier-melding (Story 15.2-endpoint): behouden of deactiveren. */
export async function decideOutlier(
  findingId: string,
  decision: 'behouden' | 'deactiveren'
): Promise<{ findingId: string; status: string; deactivated: boolean }> {
  const res = await apiClient.post(`/flywheel/outliers/${findingId}/decision`, { decision });
  return res.data;
}
