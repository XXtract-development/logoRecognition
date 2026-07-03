/**
 * StatusBadge (DESIGN.md `{components.status-badge}`, UX-DR9) — pill met dot +
 * tekst. Status NOOIT via kleur alleen: de dot is aanvullend, de tekst draagt de
 * betekenis. Amber-tekst gebruikt `warningText` (#92600A) voor contrast.
 */

import React from 'react';
import { badgeStyle, type BadgeTone } from './statusColors';

interface StatusBadgeProps {
  tone: BadgeTone;
  children: React.ReactNode;
  'data-testid'?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ tone, children, ...rest }) => {
  const s = badgeStyle(tone);
  return (
    <span
      data-testid={rest['data-testid']}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 500,
        background: s.background,
        color: s.color,
      }}
    >
      <span
        aria-hidden
        style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }}
      />
      {children}
    </span>
  );
};

export default StatusBadge;
