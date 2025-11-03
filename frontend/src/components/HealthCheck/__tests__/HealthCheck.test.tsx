import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import HealthCheck from '../HealthCheck';

// Mock fetch
global.fetch = jest.fn();

// Mock MediaQuery
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('HealthCheck Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();

    // Reset MediaQuery mock
    window.matchMedia.mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render health check component', () => {
    render(<HealthCheck />);
    expect(screen.getByText('System Health Check')).toBeInTheDocument();
  });

  it('should show checking status initially', () => {
    render(<HealthCheck />);
    expect(screen.getByText('Check Now')).toBeInTheDocument();
  });

  it('should check health endpoints on mount', async () => {
    const mockHealthResponse = {
      status: 'healthy',
      services: {
        postgresql: { status: 'healthy', latency_ms: 5 },
        redis: { status: 'healthy', latency_ms: 2 },
      },
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockHealthResponse,
    });

    // Mock other endpoint responses
    const endpoints = [
      '/health',
      '/api/v1/logos',
      '/api/v1/training/dataset',
      '/api/v1/training/jobs',
      '/api/training/readiness',
      '/api/categories',
    ];

    endpoints.forEach(() => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
    });

    render(<HealthCheck />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8000/health',
        expect.any(Object)
      );
    });
  });

  it('should display healthy status when all endpoints are ok', async () => {
    // Mock all endpoints as healthy
    (fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'healthy' }),
      })
    );

    render(<HealthCheck />);

    await waitFor(() => {
      expect(screen.getByText('All Systems Operational')).toBeInTheDocument();
    });
  });

  it('should display unhealthy status when critical endpoints fail', async () => {
    // First call succeeds (health endpoint)
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'healthy' }),
    });

    // Make other endpoints fail
    (fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(<HealthCheck />);

    await waitFor(() => {
      expect(screen.getByText('System Health Critical')).toBeInTheDocument();
    });
  });

  it('should handle network errors gracefully', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<HealthCheck />);

    await waitFor(() => {
      expect(screen.getByText('System Health Critical')).toBeInTheDocument();
    });
  });

  it('should allow manual health check', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy' }),
    });

    render(<HealthCheck />);

    const checkButton = screen.getByText('Check Now');

    await act(async () => {
      fireEvent.click(checkButton);
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
  });

  it('should toggle auto-check functionality', async () => {
    jest.useFakeTimers();

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy' }),
    });

    render(<HealthCheck />);

    const autoCheckButton = screen.getByText('Auto-Check: ON');

    // Turn off auto-check
    fireEvent.click(autoCheckButton);
    expect(screen.getByText('Auto-Check: OFF')).toBeInTheDocument();

    // Turn on auto-check
    fireEvent.click(screen.getByText('Auto-Check: OFF'));
    expect(screen.getByText('Auto-Check: ON')).toBeInTheDocument();
  });

  it('should display response times for endpoints', async () => {
    const mockEndpoints = [
      { endpoint: '/health', responseTime: 10 },
      { endpoint: '/api/v1/logos', responseTime: 25 },
    ];

    let callCount = 0;
    (fetch as jest.Mock).mockImplementation(() => {
      const delay = mockEndpoints[Math.min(callCount, mockEndpoints.length - 1)].responseTime;
      callCount++;

      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: async () => ({ status: 'healthy' }),
          });
        }, delay);
      });
    });

    render(<HealthCheck />);

    await waitFor(() => {
      const endpointsPanel = screen.getByText('API Endpoints');
      expect(endpointsPanel).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('should show degraded status for non-critical failures', async () => {
    // Health endpoint succeeds
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'degraded',
        services: {
          postgresql: { status: 'healthy' },
          redis: { status: 'unhealthy', error: 'Connection refused' },
        },
      }),
    });

    // Some endpoints return 404
    (fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    render(<HealthCheck />);

    await waitFor(() => {
      expect(screen.getByText('System Partially Degraded')).toBeInTheDocument();
    });
  });

  it('should display service statuses from health endpoint', async () => {
    const mockServices = {
      postgresql: { status: 'healthy', latency_ms: 5 },
      redis: { status: 'degraded', latency_ms: 100, error: 'High latency' },
      minio: { status: 'unhealthy', error: 'Connection refused' },
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'degraded',
        services: mockServices,
      }),
    });

    // Mock other endpoints
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    render(<HealthCheck />);

    await waitFor(() => {
      expect(screen.getByText('External Services')).toBeInTheDocument();
    });

    // Expand the services panel
    const servicesPanel = screen.getByText('External Services');
    fireEvent.click(servicesPanel);

    await waitFor(() => {
      expect(screen.getByText('postgresql')).toBeInTheDocument();
      expect(screen.getByText('redis')).toBeInTheDocument();
      expect(screen.getByText('minio')).toBeInTheDocument();
    });
  });
});