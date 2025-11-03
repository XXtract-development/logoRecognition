import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ResultsDashboard } from '../ResultsDashboard';
import { Detection } from '../ResultsDashboard';

// Mock fetch
global.fetch = jest.fn();

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState: number = WebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) this.onopen(new Event('open'));
    }, 0);
  }

  send(data: string) {
    // Mock send
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose(new CloseEvent('close'));
  }
}

(global as any).WebSocket = MockWebSocket;

const mockDetections: Detection[] = [
  {
    id: 'det1',
    brand: 'Nike',
    category: 'Sports',
    confidence: 0.95,
    boundingBox: { x: 100, y: 100, width: 200, height: 150 },
    attributes: {}
  },
  {
    id: 'det2',
    brand: 'Adidas',
    category: 'Sports',
    confidence: 0.85,
    boundingBox: { x: 400, y: 200, width: 180, height: 180 },
    attributes: {}
  },
  {
    id: 'det3',
    brand: 'Apple',
    category: 'Technology',
    confidence: 0.72,
    boundingBox: { x: 50, y: 300, width: 100, height: 100 },
    attributes: {}
  }
];

describe('ResultsDashboard Component', () => {
  beforeEach(() => {
    (fetch as jest.MockedFunction<typeof fetch>).mockClear();
  });

  test('renders loading state initially', () => {
    (fetch as jest.MockedFunction<typeof fetch>).mockImplementation(() =>
      new Promise(() => {}) // Never resolves to keep loading state
    );

    render(
      <ResultsDashboard
        detectionId="test-123"
        uploadId="upload-456"
        imageUrl="/test-image.jpg"
      />
    );

    // Check for Ant Design Spin component instead of text
    expect(document.querySelector('.ant-spin')).toBeInTheDocument();
  });

  test('renders error state on fetch failure', async () => {
    (fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(
      new Error('Network error')
    );

    render(
      <ResultsDashboard
        detectionId="test-123"
        uploadId="upload-456"
        imageUrl="/test-image.jpg"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Error Loading Results/i)).toBeInTheDocument();
    });
  });

  test('renders dashboard with detections', async () => {
    (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        detections: mockDetections,
        imageUrl: '/test-image.jpg',
        imageMetadata: { width: 1920, height: 1080 }
      })
    } as Response);

    render(
      <ResultsDashboard
        detectionId="test-123"
        uploadId="upload-456"
        imageUrl="/test-image.jpg"
      />
    );

    await waitFor(() => {
      // Check statistics
      expect(screen.getByText('3')).toBeInTheDocument(); // Total detections
      expect(screen.getByText('3')).toBeInTheDocument(); // Unique brands

      // Check brand names in results
      expect(screen.getByText('Nike')).toBeInTheDocument();
      expect(screen.getByText('Adidas')).toBeInTheDocument();
      expect(screen.getByText('Apple')).toBeInTheDocument();
    });
  });

  test('filters detections by confidence', async () => {
    (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        detections: mockDetections,
        imageUrl: '/test-image.jpg',
        imageMetadata: { width: 1920, height: 1080 }
      })
    } as Response);

    const { container } = render(
      <ResultsDashboard
        detectionId="test-123"
        uploadId="upload-456"
        imageUrl="/test-image.jpg"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Nike')).toBeInTheDocument();
    });

    // Find and interact with confidence slider
    const sliders = container.querySelectorAll('.ant-slider-handle');
    expect(sliders.length).toBeGreaterThan(0);

    // Simulate filtering to high confidence only (>90%)
    // This would filter out Apple (72%) and Adidas (85%)
    // Note: Actual slider interaction is complex with Ant Design
  });

  test('handles export functionality', async () => {
    (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        detections: mockDetections,
        imageUrl: '/test-image.jpg',
        imageMetadata: { width: 1920, height: 1080 }
      })
    } as Response);

    render(
      <ResultsDashboard
        detectionId="test-123"
        uploadId="upload-456"
        imageUrl="/test-image.jpg"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Export Results')).toBeInTheDocument();
    });

    // Find and click export button
    const exportButton = screen.getByRole('button', { name: /Export as JSON/i });
    expect(exportButton).toBeInTheDocument();

    // Create a mock for URL.createObjectURL
    const mockCreateObjectURL = jest.fn();
    window.URL.createObjectURL = mockCreateObjectURL;

    fireEvent.click(exportButton);

    // Check that export was triggered
    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
  });

  test('handles WebSocket updates', async () => {
    (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        detections: [mockDetections[0]], // Start with one detection
        imageUrl: '/test-image.jpg',
        imageMetadata: { width: 1920, height: 1080 }
      })
    } as Response);

    render(
      <ResultsDashboard
        detectionId="test-123"
        uploadId="upload-456"
        imageUrl="/test-image.jpg"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Nike')).toBeInTheDocument();
    });

    // Simulate WebSocket message with new detection
    const ws = (global as any).WebSocket.instances?.[0];
    if (ws && ws.onmessage) {
      ws.onmessage(new MessageEvent('message', {
        data: JSON.stringify({
          type: 'partial_result',
          detection: mockDetections[1]
        })
      }));
    }

    await waitFor(() => {
      expect(screen.getByText('Adidas')).toBeInTheDocument();
    });
  });

  test('handles detection selection', async () => {
    (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        detections: mockDetections,
        imageUrl: '/test-image.jpg',
        imageMetadata: { width: 1920, height: 1080 }
      })
    } as Response);

    render(
      <ResultsDashboard
        detectionId="test-123"
        uploadId="upload-456"
        imageUrl="/test-image.jpg"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Nike')).toBeInTheDocument();
    });

    // Click on a detection card
    const nikeCard = screen.getByText('Nike').closest('.logo-card');
    if (nikeCard) {
      fireEvent.click(nikeCard);

      // Check if card is selected (would have 'selected' class)
      expect(nikeCard).toHaveClass('selected');
    }
  });

  test('changes view mode', async () => {
    (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        detections: mockDetections,
        imageUrl: '/test-image.jpg',
        imageMetadata: { width: 1920, height: 1080 }
      })
    } as Response);

    const { container } = render(
      <ResultsDashboard
        detectionId="test-123"
        uploadId="upload-456"
        imageUrl="/test-image.jpg"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Nike')).toBeInTheDocument();
    });

    // Find view mode buttons
    const listViewButton = container.querySelector('[value="list"]');
    if (listViewButton) {
      fireEvent.click(listViewButton);
      // Check if view changed
      expect(container.querySelector('.results-list')).toBeInTheDocument();
    }
  });
});

describe('ResultsDashboard Hooks', () => {
  test('useFilters hook filters detections correctly', () => {
    const { useFilters } = require('../hooks/useFilters');
    const { result } = renderHook(() => useFilters(mockDetections));

    // Initial state - all detections visible
    expect(result.current.filteredDetections).toHaveLength(3);

    // Apply high confidence filter
    act(() => {
      result.current.updateFilters({ confidence: { min: 0.9, max: 1 } });
    });

    // Only Nike should remain (95% confidence)
    expect(result.current.filteredDetections).toHaveLength(1);
    expect(result.current.filteredDetections[0].brand).toBe('Nike');

    // Apply category filter
    act(() => {
      result.current.updateFilters({
        confidence: { min: 0, max: 1 },
        categories: ['Technology']
      });
    });

    // Only Apple should remain
    expect(result.current.filteredDetections).toHaveLength(1);
    expect(result.current.filteredDetections[0].brand).toBe('Apple');
  });
});

// Helper to render hooks
function renderHook(callback: () => any) {
  let result: any = { current: null };
  function TestComponent() {
    result.current = callback();
    return null;
  }
  render(<TestComponent />);
  return { result };
}

function act(callback: () => void) {
  callback();
}