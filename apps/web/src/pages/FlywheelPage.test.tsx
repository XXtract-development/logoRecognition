/**
 * Story 15.1 — FlywheelPage-casco.
 *
 * Dekt: gescopeerde theming-wrapper aanwezig, lege/ladende/fout-staten (UX-DR8),
 * NL-teksten via i18next-keys, verversknop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// i18next: geef de defaultValue terug (patroon DashboardPage.test).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string; count?: number }) =>
      opts?.defaultValue ?? _key,
    i18n: { language: 'nl', changeLanguage: vi.fn() },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock de overview-hook zodat we de staten sturen.
const mockUseFlywheelOverview = vi.fn();
vi.mock('@/components/flywheel/useFlywheelOverview', () => ({
  useFlywheelOverview: () => mockUseFlywheelOverview(),
  FLYWHEEL_OVERVIEW_QUERY_KEY: ['flywheel-overview'],
}));

import FlywheelPage from './FlywheelPage';

const refetch = vi.fn();

describe('FlywheelPage (Story 15.1)', () => {
  beforeEach(() => {
    refetch.mockReset();
    mockUseFlywheelOverview.mockReset();
  });

  it('rendert de gescopeerde theming-wrapper en de NL-paginatitel', () => {
    mockUseFlywheelOverview.mockReturnValue({
      data: { quarantineCount: 0 },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch,
    });
    render(<FlywheelPage />);
    // Casco-root aanwezig (theming-wrapper omhult deze subtree).
    expect(screen.getByTestId('flywheel-page')).toBeInTheDocument();
    // NL-titel via i18next-key.
    expect(screen.getByText('Vliegwiel')).toBeInTheDocument();
  });

  it('toont de skeleton-ladende staat (geen spinner-op-wit)', () => {
    mockUseFlywheelOverview.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isFetching: true,
      refetch,
    });
    render(<FlywheelPage />);
    expect(screen.getByTestId('flywheel-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('flywheel-empty')).not.toBeInTheDocument();
  });

  it('toont de richtinggevende empty state met glossary-term "promotiebatches"', () => {
    mockUseFlywheelOverview.mockReturnValue({
      data: { quarantineCount: 0 },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch,
    });
    render(<FlywheelPage />);
    expect(screen.getByTestId('flywheel-empty')).toBeInTheDocument();
    expect(
      screen.getByText(/Nog geen promotiebatches/i)
    ).toBeInTheDocument();
  });

  it('toont een sectie-lokale foutkaart met "Opnieuw proberen" bij een fout', () => {
    mockUseFlywheelOverview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    });
    render(<FlywheelPage />);
    expect(screen.getByTestId('flywheel-error')).toBeInTheDocument();
    expect(screen.getByText('Opnieuw proberen')).toBeInTheDocument();
    // Bij fout geen empty-casco.
    expect(screen.queryByTestId('flywheel-empty')).not.toBeInTheDocument();
  });

  it('de verversknop roept refetch aan', async () => {
    const user = userEvent.setup();
    mockUseFlywheelOverview.mockReturnValue({
      data: { quarantineCount: 0 },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch,
    });
    render(<FlywheelPage />);
    await user.click(screen.getByText('Vernieuwen'));
    expect(refetch).toHaveBeenCalled();
  });
});
