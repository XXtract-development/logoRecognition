import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchDashboardStats, addDemoData, createStatsPoller } from './dashboardService';

// Mock the constants module
vi.mock('@/constants', () => ({
  APP_CONFIG: {
    apiBaseUrl: 'http://localhost:8000',
  },
}));

describe('dashboardService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchDashboardStats', () => {
    it('returns stats on successful response', async () => {
      const mockResponse = {
        stats: { totalRecognitions: 100, successRate: 95, averageTime: 1.2, todayCount: 10 },
        recentActivity: [],
        timestamp: '2026-04-04T00:00:00Z',
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await fetchDashboardStats();
      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/stats'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(fetchDashboardStats()).rejects.toThrow('API returned status 500');
    });

    it('throws on timeout', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });

      await expect(fetchDashboardStats(1)).rejects.toThrow();
    });
  });

  describe('addDemoData', () => {
    it('calls POST to demo endpoint', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
      } as Response);

      await addDemoData();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/stats/demo'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws on failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 403,
      } as Response);

      await expect(addDemoData()).rejects.toThrow('API returned status 403');
    });
  });

  describe('createStatsPoller', () => {
    it('calls onUpdate on successful poll', async () => {
      const mockStats = {
        stats: { totalRecognitions: 50, successRate: 90, averageTime: 0.8, todayCount: 5 },
        recentActivity: [],
        timestamp: '2026-04-04T00:00:00Z',
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStats),
      } as Response);

      const onUpdate = vi.fn();
      const onError = vi.fn();
      const poller = createStatsPoller(onUpdate, onError, 60000);

      await poller.fetchNow();
      expect(onUpdate).toHaveBeenCalledWith(mockStats);
      expect(onError).not.toHaveBeenCalled();

      poller.stop();
    });

    it('calls onError on failed poll', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const onUpdate = vi.fn();
      const onError = vi.fn();
      const poller = createStatsPoller(onUpdate, onError, 60000);

      await poller.fetchNow();
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onUpdate).not.toHaveBeenCalled();

      poller.stop();
    });
  });
});
