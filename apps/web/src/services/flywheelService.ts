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

/** Pauze-/stilstandstatus (Story 15.4) — voedt amber pauzebanner en rode stilstand-banner. */
export type StandstillMode = 'running' | 'manual' | 'auto';
export interface StandstillPanel {
  mode: StandstillMode;
  paused: boolean;
  reason: string | null;
  since: string | null;
  by: string | null;
  batchIds: string[];
  k: number | null;
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
  standstill: StandstillPanel | PanelError;
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
 * Lichte teller voor de app-brede navigatie-badge (Story 15.1). Losgekoppeld van
 * `fetchFlywheelOverview`: de badge mount op elke pagina via AppLayout, dus hij
 * mag niet de volle 12-panel-aggregatie (Story 15.2) op elke navigatie afvuren.
 */
export async function fetchQuarantineCount(): Promise<number> {
  const res = await apiClient.get<{ quarantineCount: number }>('/flywheel/quarantine-count');
  return typeof res.data?.quarantineCount === 'number' ? res.data.quarantineCount : 0;
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

// ── Batch-detail (Story 15.3) ───────────────────────────────────────────────

/** Eén poort-fase-uitkomst in het bewijspaneel. */
export interface GateOutcomeView {
  phase: string;
  outcome: string;
  blocked: boolean;
  label: string;
}

/** De batch-kop van de detailpagina. */
export interface BatchDetailHead {
  batchId: string;
  status: string;
  createdAt: string;
  closedAt: string | null;
  candidateCount: number;
  failReason: string;
  deltaPp: number | null;
  mostAffectedClasses: string[];
  gateOutcomes: GateOutcomeView[];
}

/** Eén kandidaat in de master-lijst + bewijspaneel. */
export interface BatchCandidateView {
  id: string;
  t3777Code: string;
  status: string;
  origin: string;
  hasCrop: boolean;
  hasReference: boolean;
  confidence: number | null;
  method: string | null;
  sourceGtin: string | null;
  sourceFile: string | null;
  bbox: { x: number; y: number; width: number; height: number } | null;
  declarationOutcome: string | null;
  declaredCodes: string[];
  gln: string | null;
}

/** De volledige batch-detail-payload. */
export interface BatchDetail {
  batch: BatchDetailHead;
  candidates: BatchCandidateView[];
  promotionThresholds: Record<string, number>;
}

/** De kandidaat-beslissingen (spiegelt de API-enum). */
export type CandidateDecisionKind = 'afkeuren' | 'vrijgeven' | 'undo';

export interface CandidateDecisionResult {
  candidateId: string;
  status: string;
  decision: CandidateDecisionKind;
}

export interface BatchCloseResult {
  batchId: string;
  closedAt: string;
  rejected: number;
  released: number;
}

/** Haal de batch-detail-payload op (Story 15.3-endpoint). */
export async function fetchBatchDetail(batchId: string): Promise<BatchDetail> {
  const res = await apiClient.get<BatchDetail>(`/flywheel/batches/${batchId}`);
  return res.data;
}

/**
 * Beslis per kandidaat (Story 15.3-endpoint): afkeuren/vrijgeven/undo. Gooit door
 * bij een fout (409 op een batch in verwerking of een verloren race) zodat de
 * caller de faalpad-toast toont en de kandidaat op `te beoordelen` houdt.
 */
export async function decideCandidate(
  candidateId: string,
  decision: CandidateDecisionKind
): Promise<CandidateDecisionResult> {
  const res = await apiClient.post<CandidateDecisionResult>(
    `/flywheel/candidates/${candidateId}/decision`,
    { decision }
  );
  return res.data;
}

/** Sluit een gequarantaineerde batch af (Story 15.3-endpoint). */
export async function closeBatch(batchId: string): Promise<BatchCloseResult> {
  const res = await apiClient.post<BatchCloseResult>(`/flywheel/batches/${batchId}/close`, {});
  return res.data;
}

/**
 * Haal het crop-beeld van een kandidaat als geauthenticeerde blob-URL (cookie-
 * auth + juiste baseURL, patroon `fetchReviewItemCropBlob`). De caller doet
 * `URL.revokeObjectURL` bij opruimen. `null` als er geen crop is.
 */
export async function fetchCandidateCropBlob(candidateId: string): Promise<string | null> {
  try {
    const res = await apiClient.get(`/flywheel/candidates/${candidateId}/crop`, {
      responseType: 'blob',
    });
    return URL.createObjectURL(res.data as Blob);
  } catch {
    return null;
  }
}

/**
 * Haal het actieve-referentiebeeld van een T3777-code als blob-URL (patroon van
 * de reviewstation-referentiebeeld-route). `null` als er geen actieve referentie is.
 */
export async function fetchReferenceCodeImageBlob(code: string): Promise<string | null> {
  try {
    const res = await apiClient.get(`/reference-logos/code/${encodeURIComponent(code)}/image`, {
      responseType: 'blob',
    });
    return URL.createObjectURL(res.data as Blob);
  } catch {
    return null;
  }
}

// ── Drempelbeheer (Story 15.4) ──────────────────────────────────────────────

/** Bekende detectiemethoden waarvoor een promotiedrempel geldt (FR-5). */
export type ThresholdMethod = 'template' | 'embedding' | 'classifier';
export type ThresholdSource = 'override' | 'env' | 'default';

/** Eén per-methode-drempel in het drempelbeheer. */
export interface MethodThresholdView {
  method: ThresholdMethod;
  value: number;
  envValue: number;
  source: ThresholdSource;
  min: number;
  max: number;
  step: number;
}

/** Eén rij in de drempel-wijzigingshistorie. */
export interface ThresholdHistoryRow {
  id: string;
  thresholdKey: string;
  method: ThresholdMethod | null;
  oldValue: string;
  newValue: string;
  reason: string | null;
  userId: string;
  changedAt: string;
}

/** De volledige drempelbeheer-view (per-methode-drempels + historie). */
export interface ThresholdsView {
  methods: MethodThresholdView[];
  history: ThresholdHistoryRow[];
}

/** Haal de drempelbeheer-view op (Story 15.4-endpoint). */
export async function fetchThresholds(): Promise<ThresholdsView> {
  const res = await apiClient.get<ThresholdsView>('/flywheel/thresholds');
  return res.data;
}

export interface ChangeThresholdResult {
  method: ThresholdMethod;
  oldValue: number;
  newValue: number;
  reason: string;
  changedAt: string;
}

/**
 * Wijzig de effectieve promotiedrempel voor één methode (Story 15.4-endpoint).
 * Reden verplicht — de server valideert het ook (400 zonder). Gooit door bij een
 * fout zodat de modal de foutmelding toont.
 */
export async function changeThreshold(
  method: ThresholdMethod,
  newValue: number,
  reason: string
): Promise<ChangeThresholdResult> {
  const res = await apiClient.put<ChangeThresholdResult>('/flywheel/thresholds', {
    method,
    newValue,
    reason,
  });
  return res.data;
}

// ── Pauzebediening (Story 15.4) ─────────────────────────────────────────────

export interface PauseControlResult {
  paused: boolean;
  reason: string | null;
  since: string | null;
  by: string | null;
  /** Bij hervatten: aantal openstaande quarantaines als waarschuwing (FR-19). */
  openQuarantines: number | null;
}

/** Pauzeer het vliegwiel (Story 15.4-endpoint). */
export async function pauseFlywheel(reason?: string): Promise<PauseControlResult> {
  const res = await apiClient.post<PauseControlResult>('/flywheel/pause', {
    action: 'pause',
    reason,
  });
  return res.data;
}

/** Hervat het vliegwiel (Story 15.4-endpoint) — blokkeert niet op quarantaines. */
export async function resumeFlywheel(): Promise<PauseControlResult> {
  const res = await apiClient.post<PauseControlResult>('/flywheel/pause', {
    action: 'resume',
  });
  return res.data;
}
