/**
 * CandidateList (Story 15.3, taak 3.2/7) — de master-kolom van de batch-detail.
 *
 * Verticale, ±320px vaste lijst (mock-quarantaine.html): per kandidaat een
 * miniatuur, T3777-code + GTIN/score-subregel en een statusbadge (amber `te
 * beoordelen`, groen `vrijgegeven`, neutraal grijs `afgekeurd` — géén rood,
 * UX-DR5). Beoordeelde kandidaten blijven zichtbaar met hun badge.
 *
 * Toegankelijkheid (UX-DR9, taak 7.1): `role="listbox"` met `role="option"`-items;
 * de geselecteerde kandidaat krijgt `aria-selected` en wordt in beeld gescrold
 * (`scrollIntoView`); zichtbare teal focus-ring op elk item. Pijltjestoetsen
 * worden op paginaniveau afgehandeld (useCandidateKeyboard); klik selecteert hier.
 */

import React from 'react';
import { FLYWHEEL_COLORS as C } from './statusColors';
import { StatusBadge } from './StatusBadge';
import { MaterialSymbol } from './MaterialSymbol';
import { candidateStatusView, REVIEW_STATE_LABEL } from './candidateStatus';
import type { BatchCandidateView } from '@/services/flywheelService';

interface CandidateListProps {
  candidates: BatchCandidateView[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function fmtScore(v: number | null): string {
  return v === null ? '—' : v.toFixed(2).replace('.', ',');
}

export const CandidateList: React.FC<CandidateListProps> = ({
  candidates,
  selectedIndex,
  onSelect,
}) => {
  const itemRefs = React.useRef<Array<HTMLDivElement | null>>([]);

  // Scroll de geselecteerde kandidaat in beeld (UX-DR9). scrollIntoView bestaat
  // niet in jsdom (test-omgeving) — daarom defensief aangeroepen.
  React.useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <div role="listbox" aria-label="Kandidatenlijst" data-testid="candidate-list">
      {candidates.map((c, i) => {
        const view = candidateStatusView(c.status);
        const selected = i === selectedIndex;
        return (
          <div
            key={c.id}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            role="option"
            aria-selected={selected}
            tabIndex={0}
            data-testid={`candidate-item-${i}`}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(i);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderBottom: `1px solid ${C.borderSoft}`,
              cursor: 'pointer',
              background: selected ? C.primaryLight : 'transparent',
              boxShadow: selected ? `inset 3px 0 0 ${C.primary}` : 'none',
              outlineOffset: -2,
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = `2px solid ${C.secondary}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = 'none';
            }}
          >
            <div
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.backgroundMuted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: C.foregroundMuted,
                flexShrink: 0,
              }}
            >
              <MaterialSymbol name="image" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: C.foreground,
                }}
              >
                {c.t3777Code}
              </div>
              <div style={{ fontSize: 11, color: C.foregroundMuted }}>
                {c.sourceGtin ? `GTIN ${c.sourceGtin} · ` : ''}
                score {fmtScore(c.confidence)}
                {c.origin === 'kruischeck' ? ' · kruischeck' : ''}
              </div>
            </div>
            <StatusBadge tone={view.tone} data-testid={`candidate-badge-${i}`}>
              {REVIEW_STATE_LABEL[view.state]}
            </StatusBadge>
          </div>
        );
      })}
    </div>
  );
};

export default CandidateList;
