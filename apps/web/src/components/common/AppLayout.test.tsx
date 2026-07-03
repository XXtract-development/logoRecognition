/**
 * Story 15.1 — AppLayout: Vliegwiel-nav-item + quarantaine-badge.
 *
 * Dekt: nav-item "Vliegwiel" aanwezig naast Review; badge toont de count uit de
 * gemockte overview-hook; klik navigeert naar /flywheel; badge verschijnt niet
 * bij count 0 (en is amber, nooit fout-rood).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: '/' }),
  Outlet: () => <div data-testid="outlet" />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
    i18n: { language: 'nl', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: () => ({ isDarkMode: false, toggleTheme: vi.fn() }),
}));

vi.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ isApiHealthy: true, isWebSocketHealthy: true }),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: null, loading: false }),
}));

vi.mock('@/services/apiClient', () => ({
  default: { post: vi.fn() },
}));

const mockUseQuarantineBadgeCount = vi.fn();
vi.mock('@/components/flywheel/useFlywheelOverview', () => ({
  useQuarantineBadgeCount: () => mockUseQuarantineBadgeCount(),
  FLYWHEEL_OVERVIEW_QUERY_KEY: ['flywheel-overview'],
  FLYWHEEL_QUARANTINE_COUNT_QUERY_KEY: ['flywheel-quarantine-count'],
}));

import { AppLayout } from './AppLayout';

describe('AppLayout — Vliegwiel-nav (Story 15.1)', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    mockUseQuarantineBadgeCount.mockReset();
  });

  it('toont het nav-item "Vliegwiel" naast Review', () => {
    mockUseQuarantineBadgeCount.mockReturnValue({ data: 0 });
    render(<AppLayout />);
    expect(screen.getByTestId('nav-flywheel')).toBeInTheDocument();
    expect(screen.getByText('Vliegwiel')).toBeInTheDocument();
    // Review-anker bestaat ook (positie ernaast).
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('toont de quarantaine-badge met de count uit de badge-hook', () => {
    mockUseQuarantineBadgeCount.mockReturnValue({ data: 2 });
    render(<AppLayout />);
    const badge = screen.getByTestId('flywheel-quarantine-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('2');
  });

  it('toont GEEN badge als er geen openstaande quarantainebatches zijn', () => {
    mockUseQuarantineBadgeCount.mockReturnValue({ data: 0 });
    render(<AppLayout />);
    expect(screen.queryByTestId('flywheel-quarantine-badge')).not.toBeInTheDocument();
  });

  it('valt terug op 0 als de badge-hook nog geen data heeft', () => {
    mockUseQuarantineBadgeCount.mockReturnValue({ data: undefined });
    render(<AppLayout />);
    expect(screen.getByTestId('nav-flywheel')).toBeInTheDocument();
    expect(screen.queryByTestId('flywheel-quarantine-badge')).not.toBeInTheDocument();
  });

  it('navigeert naar /flywheel bij klik op het nav-item', async () => {
    const user = userEvent.setup();
    mockUseQuarantineBadgeCount.mockReturnValue({ data: 1 });
    render(<AppLayout />);
    await user.click(screen.getByText('Vliegwiel'));
    expect(navigateMock).toHaveBeenCalledWith('/flywheel');
  });
});
