import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ApprovalQueuePage from './ApprovalQueuePage';

// ApprovalQueuePage uses @tanstack/react-query (useQuery). Before the
// QueryClientProvider was added at the App root, mounting this page threw
// "No QueryClient set" — the approval screen (Story 9.5 AC1) was effectively
// unreachable. This test renders it under a provider to prove it now renders.
function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ApprovalQueuePage />
    </QueryClientProvider>
  );
}

describe('ApprovalQueuePage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the empty state when no challengers await approval', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    renderWithClient();

    // The page mounts and resolves (no "No QueryClient set" crash) and shows
    // its root element with no evaluation reports.
    await waitFor(() => {
      expect(screen.getByTestId('approval-queue-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('evaluation-report')).not.toBeInTheDocument();
  });

  it('renders an evaluation report with an activate button per challenger', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'm-1',
            version: 'v2.0.0',
            createdAt: '2026-06-01T10:00:00Z',
            evaluationReport: {
              challenger: { holdoutAccuracy: 0.95 },
              champion: { holdoutAccuracy: 0.91 },
              diff: { accuracy: 0.04 },
              datasetGrowth: 120,
              triggerReasons: ['Datasetgroei'],
            },
          },
        ],
      }),
    } as Response);

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByTestId('evaluation-report')).toBeInTheDocument();
    });
    expect(screen.getByTestId('activate-model-button')).toBeInTheDocument();
  });
});
