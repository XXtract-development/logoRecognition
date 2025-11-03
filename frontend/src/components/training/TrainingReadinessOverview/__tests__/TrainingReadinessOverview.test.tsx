import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import TrainingReadinessOverview from '../TrainingReadinessOverview';
import { CategoryValueReadiness } from '../types';
import * as api from '../api';

// Mock the API module
jest.mock('../api');
jest.mock('../apiUtils');

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

const mockData: CategoryValueReadiness[] = [
  {
    id: '1',
    category: { code: 'brand', label: 'Brand' },
    value: { code: 'nike', label: 'Nike' },
    currentCount: 10,
    minimumRequired: 10,
    readinessPercentage: 100,
    annotationsNeeded: 0,
    status: 'ready',
    lastUpdated: new Date('2024-01-01'),
    augmentedSamples: 500,
    naturalSamples: 10,
  },
  {
    id: '2',
    category: { code: 'brand', label: 'Brand' },
    value: { code: 'adidas', label: 'Adidas' },
    currentCount: 8,
    minimumRequired: 10,
    readinessPercentage: 80,
    annotationsNeeded: 2,
    status: 'almost_ready',
    lastUpdated: new Date('2024-01-02'),
    augmentedSamples: 400,
    naturalSamples: 8,
  },
  {
    id: '3',
    category: { code: 'recycling', label: 'Recycling' },
    value: { code: 'pet', label: 'PET' },
    currentCount: 3,
    minimumRequired: 10,
    readinessPercentage: 30,
    annotationsNeeded: 7,
    status: 'needs_work',
    lastUpdated: new Date('2024-01-03'),
    augmentedSamples: 150,
    naturalSamples: 3,
  },
];

describe('TrainingReadinessOverview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.fetchReadinessData as jest.Mock).mockResolvedValue({
      data: mockData,
      total: 3,
      page: 1,
      pageSize: 20,
    });
    (api.fetchCategories as jest.Mock).mockResolvedValue([
      { code: 'brand', label: 'Brand' },
      { code: 'recycling', label: 'Recycling' },
    ]);
    (api.connectWebSocket as jest.Mock).mockReturnValue({
      close: jest.fn(),
      send: jest.fn(),
    });
  });

  it('should render loading state initially', () => {
    render(<TrainingReadinessOverview />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('should fetch and display readiness data', async () => {
    render(<TrainingReadinessOverview />);

    await waitFor(() => {
      expect(screen.getByText('Nike')).toBeInTheDocument();
      expect(screen.getByText('Adidas')).toBeInTheDocument();
      expect(screen.getByText('PET')).toBeInTheDocument();
    });
  });

  it('should show correct status badges', async () => {
    render(<TrainingReadinessOverview />);

    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(screen.getByText('Almost Ready')).toBeInTheDocument();
      expect(screen.getByText('Needs Work')).toBeInTheDocument();
    });
  });

  it('should display readiness percentages', async () => {
    render(<TrainingReadinessOverview />);

    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.getByText('30%')).toBeInTheDocument();
    });
  });

  it('should display annotation counts', async () => {
    render(<TrainingReadinessOverview />);

    await waitFor(() => {
      expect(screen.getByText('10/10')).toBeInTheDocument();
      expect(screen.getByText('8/10')).toBeInTheDocument();
      expect(screen.getByText('3/10')).toBeInTheDocument();
    });
  });

  it('should display annotations needed', async () => {
    render(<TrainingReadinessOverview />);

    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(screen.getByText('2 more needed')).toBeInTheDocument();
      expect(screen.getByText('7 more needed')).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('should filter by status', async () => {
      render(<TrainingReadinessOverview />);

      await waitFor(() => {
        expect(screen.getByText('Nike')).toBeInTheDocument();
      });

      // Click on 'Ready' filter
      fireEvent.click(screen.getByTestId('filter-ready'));

      await waitFor(() => {
        expect(screen.getByText('Nike')).toBeInTheDocument();
        expect(screen.queryByText('Adidas')).not.toBeInTheDocument();
        expect(screen.queryByText('PET')).not.toBeInTheDocument();
      });
    });

    it('should filter by category', async () => {
      render(<TrainingReadinessOverview />);

      await waitFor(() => {
        expect(screen.getByText('Nike')).toBeInTheDocument();
      });

      // Select 'Brand' category
      fireEvent.change(screen.getByTestId('category-filter'), {
        target: { value: 'brand' },
      });

      await waitFor(() => {
        expect(screen.getByText('Nike')).toBeInTheDocument();
        expect(screen.getByText('Adidas')).toBeInTheDocument();
        expect(screen.queryByText('PET')).not.toBeInTheDocument();
      });
    });

    it('should filter by search term', async () => {
      render(<TrainingReadinessOverview />);

      await waitFor(() => {
        expect(screen.getByText('Nike')).toBeInTheDocument();
      });

      // Type in search box
      fireEvent.change(screen.getByPlaceholderText('Search...'), {
        target: { value: 'nik' },
      });

      await waitFor(() => {
        expect(screen.getByText('Nike')).toBeInTheDocument();
        expect(screen.queryByText('Adidas')).not.toBeInTheDocument();
        expect(screen.queryByText('PET')).not.toBeInTheDocument();
      });
    });
  });

  describe('Sorting', () => {
    it('should sort by readiness percentage', async () => {
      render(<TrainingReadinessOverview />);

      await waitFor(() => {
        expect(screen.getByText('Nike')).toBeInTheDocument();
      });

      // Click on readiness column header
      fireEvent.click(screen.getByText('Readiness'));

      await waitFor(() => {
        const rows = screen.getAllByTestId(/^readiness-row-/);
        expect(rows[0]).toHaveTextContent('30%'); // Lowest first
        expect(rows[2]).toHaveTextContent('100%'); // Highest last
      });
    });

    it('should toggle sort direction', async () => {
      render(<TrainingReadinessOverview />);

      await waitFor(() => {
        expect(screen.getByText('Nike')).toBeInTheDocument();
      });

      // Click twice to reverse sort
      fireEvent.click(screen.getByText('Readiness'));
      fireEvent.click(screen.getByText('Readiness'));

      await waitFor(() => {
        const rows = screen.getAllByTestId(/^readiness-row-/);
        expect(rows[0]).toHaveTextContent('100%'); // Highest first
        expect(rows[2]).toHaveTextContent('30%'); // Lowest last
      });
    });
  });

  describe('Bulk Actions', () => {
    it('should enable Train All Ready button when items are ready', async () => {
      render(<TrainingReadinessOverview />);

      await waitFor(() => {
        const trainButton = screen.getByText('Train All Ready (1)');
        expect(trainButton).toBeEnabled();
      });
    });

    it('should disable Train All Ready button when no items are ready', async () => {
      (api.fetchReadinessData as jest.Mock).mockResolvedValue({
        data: [mockData[2]], // Only needs_work item
        total: 1,
        page: 1,
        pageSize: 20,
      });

      render(<TrainingReadinessOverview />);

      await waitFor(() => {
        const trainButton = screen.getByText('Train All Ready (0)');
        expect(trainButton).toBeDisabled();
      });
    });

    it('should call onTrainSelected when Train All Ready is clicked', async () => {
      const mockOnTrainSelected = jest.fn();
      render(<TrainingReadinessOverview onTrainSelected={mockOnTrainSelected} />);

      await waitFor(() => {
        const trainButton = screen.getByText('Train All Ready (1)');
        fireEvent.click(trainButton);
      });

      expect(mockOnTrainSelected).toHaveBeenCalledWith([mockData[0]]);
    });

    it('should export CSV when Export button is clicked', async () => {
      const mockOnExportCSV = jest.fn();
      render(<TrainingReadinessOverview onExportCSV={mockOnExportCSV} />);

      await waitFor(() => {
        const exportButton = screen.getByText('Export to CSV');
        fireEvent.click(exportButton);
      });

      expect(mockOnExportCSV).toHaveBeenCalled();
    });
  });

  describe('Real-time Updates', () => {
    it('should update item when WebSocket message received', async () => {
      render(<TrainingReadinessOverview />);

      await waitFor(() => {
        expect(screen.getByText('8/10')).toBeInTheDocument(); // Adidas initial
      });

      // Simulate WebSocket update
      act(() => {
        const updatedItem: CategoryValueReadiness = {
          ...mockData[1],
          currentCount: 10,
          readinessPercentage: 100,
          annotationsNeeded: 0,
          status: 'ready',
        };

        // Trigger WebSocket update (implementation will handle this)
        window.dispatchEvent(
          new CustomEvent('websocket-update', {
            detail: { type: 'update', payload: updatedItem },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('10/10')).toBeInTheDocument(); // Adidas updated
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message on API failure', async () => {
      (api.fetchReadinessData as jest.Mock).mockRejectedValue(
        new Error('Failed to fetch data')
      );

      render(<TrainingReadinessOverview />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load readiness data/)).toBeInTheDocument();
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('should retry on error', async () => {
      (api.fetchReadinessData as jest.Mock)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          data: mockData,
          total: 3,
          page: 1,
          pageSize: 20,
        });

      render(<TrainingReadinessOverview />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load readiness data/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(screen.getByText('Nike')).toBeInTheDocument();
      });
    });
  });

  describe('Performance', () => {
    it('should render large datasets efficiently', async () => {
      const largeDataset = Array.from({ length: 500 }, (_, i) => ({
        ...mockData[0],
        id: `item-${i}`,
        value: { code: `value-${i}`, label: `Value ${i}` },
      }));

      (api.fetchReadinessData as jest.Mock).mockResolvedValue({
        data: largeDataset,
        total: 500,
        page: 1,
        pageSize: 500,
      });

      const startTime = performance.now();
      render(<TrainingReadinessOverview />);

      await waitFor(() => {
        expect(screen.getByText('Value 0')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within 2 seconds even with 500 items
      expect(renderTime).toBeLessThan(2000);
    });
  });
});