/**
 * Story 15.4 — StandstillBanner (amber pauzebanner + rode stilstand-banner).
 *
 * Dekt (AC 3/5, UX-DR5/DR6/DR9):
 *  - handmatige pauze → AMBER banner (role="alert") met wie/wanneer;
 *  - automatische stilstand → RODE banner (role="alert") met aanleiding + links
 *    naar de betrokken batches;
 *  - geen banner bij een draaiend vliegwiel;
 *  - de amber-variant toont GEEN rode banner en omgekeerd (kleursemantiek).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
      let s = opts?.defaultValue ?? _k;
      if (opts) for (const [k, v] of Object.entries(opts)) if (k !== 'defaultValue') s = s.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
      return s;
    },
    i18n: { language: 'nl', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={to} {...rest}>{children}</a>
  ),
}));

import { StandstillBanner } from './StandstillBanner';

const RUNNING = { mode: 'running' as const, paused: false, reason: null, since: null, by: null, batchIds: [], k: null };
const MANUAL = { mode: 'manual' as const, paused: true, reason: 'handmatig', since: '2026-07-03T09:14:00Z', by: 'sanne', batchIds: [], k: null };
const AUTO = { mode: 'auto' as const, paused: true, reason: 'auto', since: '2026-07-03T02:00:00Z', by: 'system', batchIds: ['batch-a', 'batch-b'], k: 2 };

describe('StandstillBanner — amber pauzebanner (AC 3)', () => {
  it('toont de amber pauzebanner met role=alert en wie/wanneer bij handmatige pauze', () => {
    render(<StandstillBanner standstill={MANUAL} variant="manual" />);
    const banner = screen.getByTestId('pause-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveTextContent('Vliegwiel gepauzeerd door sanne');
  });

  it('rendert geen amber banner bij een draaiend vliegwiel', () => {
    render(<StandstillBanner standstill={RUNNING} variant="manual" />);
    expect(screen.queryByTestId('pause-banner')).not.toBeInTheDocument();
  });

  it('rendert geen amber banner bij een automatische stilstand (dat is de rode variant)', () => {
    render(<StandstillBanner standstill={AUTO} variant="manual" />);
    expect(screen.queryByTestId('pause-banner')).not.toBeInTheDocument();
  });
});

describe('StandstillBanner — rode stilstand-banner (AC 5)', () => {
  it('toont de rode banner met role=alert, aanleiding en batch-links bij automatische stilstand', () => {
    render(<StandstillBanner standstill={AUTO} variant="auto" />);
    const banner = screen.getByTestId('standstill-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveTextContent('Automatische stilstand');
    // Links naar beide betrokken batches.
    expect(screen.getByTestId('standstill-batch-link-batch-a')).toHaveAttribute('href', '/flywheel/batches/batch-a');
    expect(screen.getByTestId('standstill-batch-link-batch-b')).toHaveAttribute('href', '/flywheel/batches/batch-b');
  });

  it('rendert geen rode banner bij een handmatige pauze (kleursemantiek UX-DR5)', () => {
    render(<StandstillBanner standstill={MANUAL} variant="auto" />);
    expect(screen.queryByTestId('standstill-banner')).not.toBeInTheDocument();
  });

  it('rendert geen rode banner bij een draaiend vliegwiel', () => {
    render(<StandstillBanner standstill={RUNNING} variant="auto" />);
    expect(screen.queryByTestId('standstill-banner')).not.toBeInTheDocument();
  });
});
