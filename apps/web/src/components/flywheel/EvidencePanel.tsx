/**
 * EvidencePanel (Story 15.3, taak 3.3, DESIGN.md `{components.evidence-panel}`).
 *
 * Het bewijspaneel (detail-kolom) van de quarantaine-afhandeling. Toont voor de
 * geselecteerde kandidaat, conform mock-quarantaine.html:
 *   - vergelijkingsweergave: crop naast de actieve referentie van dezelfde
 *     T3777-code (twee even grote beeldvakken, kader, caption);
 *   - scoreblok: match-confidence vs. promotiedrempel (+ methode);
 *   - declaratieblok: GTIN, GLN, gedeclareerde codes met de gematchte gemarkeerd;
 *   - poort-uitkomsten als badge-rij (groen gehaald, amber de blokkerende check);
 *   - acties Afkeuren/Vrijgeven + compacte sneltoetsen-legenda (footer).
 *
 * Kleursemantiek (UX-DR5): nergens rood op deze pagina; afkeur-knop is neutraal.
 * Beeld-bytes komen via de stream-routes (fetchCandidateCropBlob /
 * fetchReferenceCodeImageBlob) — geen MinIO-logica in de web-app.
 */

import React from 'react';
import { Button } from 'antd';
import { FLYWHEEL_COLORS as C } from './statusColors';
import { StatusBadge } from './StatusBadge';
import { MaterialSymbol } from './MaterialSymbol';
import { candidateStatusView, REVIEW_STATE_LABEL } from './candidateStatus';
import {
  fetchCandidateCropBlob,
  fetchReferenceCodeImageBlob,
  type BatchCandidateView,
} from '@/services/flywheelService';

interface EvidencePanelProps {
  candidate: BatchCandidateView;
  index: number;
  total: number;
  promotionThresholds: Record<string, number>;
  gateOutcomes: Array<{ phase: string; outcome: string; blocked: boolean; label: string }>;
  onReject: () => void;
  onRelease: () => void;
  busy: boolean;
}

function fmt(v: number | null): string {
  return v === null ? '—' : v.toFixed(2).replace('.', ',');
}

const imgBoxStyle: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  overflow: 'hidden',
  background: C.background,
};

const imgAreaStyle: React.CSSProperties = {
  height: 220,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  color: C.foregroundMuted,
  background: C.backgroundMuted,
};

const descBlockStyle: React.CSSProperties = {
  border: `1px solid ${C.borderSoft}`,
  borderRadius: 12,
  overflow: 'hidden',
};

const descHeaderStyle: React.CSSProperties = {
  background: C.backgroundMuted,
  padding: '8px 14px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: C.foregroundMuted,
  borderBottom: `1px solid ${C.borderSoft}`,
};

const kvStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 14px',
  borderBottom: `1px solid ${C.borderSoft}`,
  fontSize: 13,
};

const ImageBox: React.FC<{
  url: string | null;
  loading: boolean;
  fallbackIcon: string;
  fallbackText: string;
  captionLeft: string;
  captionRight: string;
  alt: string;
}> = ({ url, loading, fallbackIcon, fallbackText, captionLeft, captionRight, alt }) => (
  <div style={imgBoxStyle}>
    <div style={imgAreaStyle}>
      {url ? (
        <img src={url} alt={alt} style={{ maxHeight: 220, maxWidth: '100%', objectFit: 'contain' }} />
      ) : (
        <>
          <MaterialSymbol name={loading ? 'hourglass_empty' : fallbackIcon} size={40} style={{ opacity: 0.5 }} />
          <span style={{ fontSize: 12 }}>{loading ? 'laden…' : fallbackText}</span>
        </>
      )}
    </div>
    <div
      style={{
        padding: '8px 12px',
        borderTop: `1px solid ${C.borderSoft}`,
        fontSize: 12,
        color: C.foregroundMuted,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <span>{captionLeft}</span>
      <b style={{ color: C.foreground }}>{captionRight}</b>
    </div>
  </div>
);

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  candidate,
  index,
  total,
  promotionThresholds,
  gateOutcomes,
  onReject,
  onRelease,
  busy,
}) => {
  const [cropUrl, setCropUrl] = React.useState<string | null>(null);
  const [refUrl, setRefUrl] = React.useState<string | null>(null);
  const [loadingImages, setLoadingImages] = React.useState(false);

  // Beeld-bytes lazy per kandidaat laden; oude object-URLs opruimen (memory).
  React.useEffect(() => {
    let active = true;
    let localCrop: string | null = null;
    let localRef: string | null = null;
    setCropUrl(null);
    setRefUrl(null);
    setLoadingImages(true);
    (async () => {
      const [crop, ref] = await Promise.all([
        candidate.hasCrop ? fetchCandidateCropBlob(candidate.id) : Promise.resolve(null),
        candidate.hasReference ? fetchReferenceCodeImageBlob(candidate.t3777Code) : Promise.resolve(null),
      ]);
      localCrop = crop;
      localRef = ref;
      if (active) {
        setCropUrl(crop);
        setRefUrl(ref);
        setLoadingImages(false);
      }
    })();
    return () => {
      active = false;
      if (localCrop) URL.revokeObjectURL(localCrop);
      if (localRef) URL.revokeObjectURL(localRef);
    };
  }, [candidate.id, candidate.hasCrop, candidate.hasReference, candidate.t3777Code]);

  const view = candidateStatusView(candidate.status);
  const threshold =
    candidate.method && typeof promotionThresholds[candidate.method] === 'number'
      ? promotionThresholds[candidate.method]
      : null;
  const thresholdMet = candidate.confidence !== null && threshold !== null && candidate.confidence >= threshold;

  return (
    <div data-testid="evidence-panel">
      {/* Kopregel */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: C.foregroundHeading }}>
          Bewijs — kandidaat {index + 1} van {total}{' '}
          <span style={{ fontSize: 12, color: C.foregroundMuted, fontWeight: 400 }}>· {candidate.t3777Code}</span>
        </span>
        <StatusBadge tone={view.tone} data-testid="evidence-status-badge">
          {REVIEW_STATE_LABEL[view.state]}
        </StatusBadge>
      </div>

      <div style={{ padding: 20 }}>
        {/* Vergelijkingsweergave */}
        <div
          data-testid="evidence-compare"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}
        >
          <ImageBox
            url={cropUrl}
            loading={loadingImages && candidate.hasCrop}
            fallbackIcon="crop"
            fallbackText="geen crop beschikbaar"
            captionLeft="Kandidaat-crop"
            captionRight={
              candidate.bbox
                ? `bbox ${candidate.bbox.width}×${candidate.bbox.height} px`
                : candidate.sourceFile ?? '—'
            }
            alt={`Crop van kandidaat ${candidate.t3777Code}`}
          />
          <ImageBox
            url={refUrl}
            loading={loadingImages && candidate.hasReference}
            fallbackIcon="verified"
            fallbackText="nog geen actieve referentie"
            captionLeft={`Referentie ${candidate.t3777Code}`}
            captionRight={candidate.hasReference ? 'actief' : 'geen'}
            alt={`Actieve referentie ${candidate.t3777Code}`}
          />
        </div>

        {/* Scores + declaratie */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={descBlockStyle} data-testid="evidence-scores">
            <div style={descHeaderStyle}>Scores</div>
            <div style={kvStyle}>
              <span style={{ color: C.foregroundMuted, fontSize: 12 }}>
                Match-confidence{candidate.method ? ` (${candidate.method})` : ''}
              </span>
              <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(candidate.confidence)}
              </span>
            </div>
            <div style={{ ...kvStyle, borderBottom: 'none' }}>
              <span style={{ color: C.foregroundMuted, fontSize: 12 }}>Promotiedrempel</span>
              <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {threshold === null ? '—' : fmt(threshold)}
                {threshold !== null ? (thresholdMet ? ' · gehaald' : ' · niet gehaald') : ''}
              </span>
            </div>
          </div>
          <div style={descBlockStyle} data-testid="evidence-declaration">
            <div style={descHeaderStyle}>Declaratie (dubbele bevestiging)</div>
            <div style={kvStyle}>
              <span style={{ color: C.foregroundMuted, fontSize: 12 }}>GTIN</span>
              <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {candidate.sourceGtin ?? '—'}
              </span>
            </div>
            <div style={kvStyle}>
              <span style={{ color: C.foregroundMuted, fontSize: 12 }}>Informatieleverancier (GLN)</span>
              <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{candidate.gln ?? '—'}</span>
            </div>
            <div style={{ ...kvStyle, borderBottom: 'none' }}>
              <span style={{ color: C.foregroundMuted, fontSize: 12 }}>Gedeclareerde codes</span>
              <span style={{ fontWeight: 500, textAlign: 'right' }}>
                {candidate.declaredCodes.length === 0
                  ? candidate.declarationOutcome === 'confirmed'
                    ? `${candidate.t3777Code} ✓`
                    : '—'
                  : candidate.declaredCodes.map((code) => (
                      <span key={code} style={{ marginLeft: 6 }}>
                        {code === candidate.t3777Code ? <b>{code} ✓</b> : code}
                      </span>
                    ))}
              </span>
            </div>
          </div>
        </div>

        {/* Poort-uitkomsten */}
        <div style={{ ...descBlockStyle, marginBottom: 20 }} data-testid="evidence-gates">
          <div style={descHeaderStyle}>Kwaliteitspoort — uitkomsten voor deze promotiebatch</div>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {gateOutcomes.length === 0 ? (
                <span style={{ fontSize: 12, color: C.foregroundMuted }}>Geen poort-uitkomsten beschikbaar.</span>
              ) : (
                gateOutcomes.map((g) => (
                  <StatusBadge key={g.phase} tone={g.blocked ? 'warn' : 'ok'} data-testid={`gate-${g.phase}`}>
                    {g.label} — {g.blocked ? 'geblokkeerd' : 'gepasseerd'}
                  </StatusBadge>
                ))
              )}
            </div>
            <div style={{ fontSize: 12, color: C.foregroundMuted }}>
              Bij vrijgave vormt deze kandidaat een nieuwe promotiebatch die opnieuw door de kwaliteitspoort gaat —
              vrijgave omzeilt de poort niet.
            </div>
          </div>
        </div>

        {/* Acties + sneltoetsen-legenda */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderTop: `1px solid ${C.borderSoft}`,
            paddingTop: 16,
            flexWrap: 'wrap',
          }}
        >
          <Button data-testid="evidence-reject" onClick={onReject} disabled={busy} icon={<MaterialSymbol name="block" size={16} />}>
            Afkeuren (wordt hard-negative)
          </Button>
          <Button
            type="primary"
            data-testid="evidence-release"
            onClick={onRelease}
            disabled={busy}
            icon={<MaterialSymbol name="task_alt" size={16} />}
          >
            Vrijgeven
          </Button>
          <div
            aria-label="Sneltoetsen"
            style={{ marginLeft: 'auto', fontSize: 11, color: C.foregroundMuted, display: 'flex', gap: 10, flexWrap: 'wrap' }}
          >
            <span><Kbd>A</Kbd> vrijgeven</span>
            <span><Kbd>R</Kbd> afkeuren</span>
            <span><Kbd>U</Kbd> ongedaan</span>
            <span><Kbd>←</Kbd><Kbd>→</Kbd> kandidaat</span>
            <span><Kbd>Esc</Kbd> sluiten</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '1px 6px',
      border: `1px solid ${C.border}`,
      borderRadius: 5,
      background: C.backgroundMuted,
      fontSize: 10,
      fontWeight: 600,
      color: C.foregroundMuted,
      marginRight: 2,
    }}
  >
    {children}
  </span>
);

export default EvidencePanel;
