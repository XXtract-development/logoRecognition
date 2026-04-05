import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock dashboardService before importing the component
vi.mock('@/services/dashboardService', () => ({
  fetchDashboardStats: vi.fn(),
  addDemoData: vi.fn(),
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import DashboardPage from './DashboardPage';
import { fetchDashboardStats, addDemoData } from '@/services/dashboardService';

const mockStats = {
  stats: {
    totalRecognitions: 150,
    successRate: 92.5,
    averageTime: 1.3,
    todayCount: 12,
  },
  recentActivity: [
    {
      key: '1',
      image: 'test.png',
      logos: 3,
      confidence: 0.95,
      time: '2s',
      timestamp: '2026-04-04T10:00:00Z',
    },
  ],
  timestamp: '2026-04-04T10:00:00Z',
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchDashboardStats).mockResolvedValue(mockStats);
    vi.mocked(addDemoData).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows loading spinner initially then renders stats', async () => {
    // Make fetchDashboardStats resolve after a tick
    vi.mocked(fetchDashboardStats).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockStats), 10))
    );

    render(<DashboardPage />);

    // Should show loading state
    expect(screen.getByText('Loading statistics...')).toBeInTheDocument();

    // Wait for stats to load
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // Stats should be displayed
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('renders dashboard title and stat cards after loading', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // Verify stat labels are present
    expect(screen.getByText('Total Recognitions')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('Avg. Processing Time')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('displays error alert when fetch fails', async () => {
    vi.mocked(fetchDashboardStats).mockRejectedValueOnce(new Error('Server down'));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Error loading statistics')).toBeInTheDocument();
    });

    expect(screen.getByText('Server down')).toBeInTheDocument();
  });

  it('refresh button triggers reload', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // fetchDashboardStats called once on mount
    expect(fetchDashboardStats).toHaveBeenCalledTimes(1);

    const refreshBtn = screen.getByText('Refresh');
    await user.click(refreshBtn);

    await waitFor(() => {
      expect(fetchDashboardStats).toHaveBeenCalledTimes(2);
    });
  });

  it('renders recent activity table with data', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });

    // Table should contain the mock activity data
    expect(screen.getByText('test.png')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('shows no activity message when recentActivity is empty', async () => {
    vi.mocked(fetchDashboardStats).mockResolvedValueOnce({
      ...mockStats,
      recentActivity: [],
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText('No recent activity. Start recognizing logos to see stats here.')
      ).toBeInTheDocument();
    });
  });
});
