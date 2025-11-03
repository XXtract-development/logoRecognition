import {
  calculateReadinessPercentage,
  calculateAnnotationsNeeded,
  determineReadinessStatus,
  sortReadinessItems,
  filterReadinessItems,
  exportToCSV,
  formatReadinessForDisplay,
} from '../utils';
import { CategoryValueReadiness } from '../types';

describe('TrainingReadinessOverview Utils', () => {
  const mockReadinessItem: CategoryValueReadiness = {
    id: '1',
    category: { code: 'brand', label: 'Brand' },
    value: { code: 'nike', label: 'Nike' },
    currentCount: 7,
    minimumRequired: 10,
    readinessPercentage: 70,
    annotationsNeeded: 3,
    status: 'needs_work',
    lastUpdated: new Date('2024-01-01'),
    augmentedSamples: 350,
    naturalSamples: 7,
  };

  describe('calculateReadinessPercentage', () => {
    it('should calculate 0% when no annotations', () => {
      expect(calculateReadinessPercentage(0, 10)).toBe(0);
    });

    it('should calculate 100% when meets minimum', () => {
      expect(calculateReadinessPercentage(10, 10)).toBe(100);
    });

    it('should calculate correct percentage for partial', () => {
      expect(calculateReadinessPercentage(7, 10)).toBe(70);
    });

    it('should cap at 100% when exceeds minimum', () => {
      expect(calculateReadinessPercentage(15, 10)).toBe(100);
    });

    it('should handle zero minimum gracefully', () => {
      expect(calculateReadinessPercentage(5, 0)).toBe(100);
    });
  });

  describe('calculateAnnotationsNeeded', () => {
    it('should return 0 when requirements met', () => {
      expect(calculateAnnotationsNeeded(10, 10)).toBe(0);
    });

    it('should return correct number needed', () => {
      expect(calculateAnnotationsNeeded(7, 10)).toBe(3);
    });

    it('should return 0 when exceeds requirements', () => {
      expect(calculateAnnotationsNeeded(15, 10)).toBe(0);
    });
  });

  describe('determineReadinessStatus', () => {
    it('should return ready when 100%', () => {
      expect(determineReadinessStatus(100)).toBe('ready');
    });

    it('should return almost_ready when 80-99%', () => {
      expect(determineReadinessStatus(80)).toBe('almost_ready');
      expect(determineReadinessStatus(99)).toBe('almost_ready');
    });

    it('should return needs_work when below 80%', () => {
      expect(determineReadinessStatus(79)).toBe('needs_work');
      expect(determineReadinessStatus(0)).toBe('needs_work');
    });
  });

  describe('sortReadinessItems', () => {
    const items: CategoryValueReadiness[] = [
      { ...mockReadinessItem, id: '1', readinessPercentage: 70 },
      { ...mockReadinessItem, id: '2', readinessPercentage: 100 },
      { ...mockReadinessItem, id: '3', readinessPercentage: 85 },
    ];

    it('should sort by readiness ascending', () => {
      const sorted = sortReadinessItems(items, 'readiness', 'asc');
      expect(sorted[0].readinessPercentage).toBe(70);
      expect(sorted[2].readinessPercentage).toBe(100);
    });

    it('should sort by readiness descending', () => {
      const sorted = sortReadinessItems(items, 'readiness', 'desc');
      expect(sorted[0].readinessPercentage).toBe(100);
      expect(sorted[2].readinessPercentage).toBe(70);
    });

    it('should sort by category name', () => {
      const categoryItems = [
        { ...mockReadinessItem, id: '1', category: { code: 'c', label: 'Charlie' } },
        { ...mockReadinessItem, id: '2', category: { code: 'a', label: 'Alpha' } },
        { ...mockReadinessItem, id: '3', category: { code: 'b', label: 'Bravo' } },
      ];
      const sorted = sortReadinessItems(categoryItems, 'category', 'asc');
      expect(sorted[0].category.label).toBe('Alpha');
      expect(sorted[2].category.label).toBe('Charlie');
    });
  });

  describe('filterReadinessItems', () => {
    const items: CategoryValueReadiness[] = [
      { ...mockReadinessItem, id: '1', status: 'ready' },
      { ...mockReadinessItem, id: '2', status: 'almost_ready' },
      { ...mockReadinessItem, id: '3', status: 'needs_work' },
    ];

    it('should return all items when filter is "all"', () => {
      const filtered = filterReadinessItems(items, {
        status: 'all',
        category: null,
        searchTerm: '',
      });
      expect(filtered).toHaveLength(3);
    });

    it('should filter by status', () => {
      const filtered = filterReadinessItems(items, {
        status: 'ready',
        category: null,
        searchTerm: '',
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe('ready');
    });

    it('should filter by category', () => {
      const filtered = filterReadinessItems(items, {
        status: 'all',
        category: 'brand',
        searchTerm: '',
      });
      expect(filtered).toHaveLength(3); // All have 'brand' category
    });

    it('should filter by search term', () => {
      const searchItems = [
        { ...mockReadinessItem, id: '1', value: { code: 'nike', label: 'Nike' } },
        { ...mockReadinessItem, id: '2', value: { code: 'adidas', label: 'Adidas' } },
      ];
      const filtered = filterReadinessItems(searchItems, {
        status: 'all',
        category: null,
        searchTerm: 'nik',
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].value.label).toBe('Nike');
    });
  });

  describe('exportToCSV', () => {
    it('should generate CSV content with headers', () => {
      const items = [mockReadinessItem];
      const csv = exportToCSV(items);

      expect(csv).toContain('Category,Value,Current Count,Required,Readiness %,Status');
      expect(csv).toContain('Brand,Nike,7,10,70%,needs_work');
    });

    it('should handle multiple items', () => {
      const items = [
        mockReadinessItem,
        { ...mockReadinessItem, id: '2', value: { code: 'adidas', label: 'Adidas' } },
      ];
      const csv = exportToCSV(items);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3); // Header + 2 data rows
    });
  });

  describe('formatReadinessForDisplay', () => {
    it('should format item for display with percentage', () => {
      const formatted = formatReadinessForDisplay(mockReadinessItem);

      expect(formatted.displayPercentage).toBe('70%');
      expect(formatted.displayCount).toBe('7/10');
      expect(formatted.displayNeeded).toBe('3 more needed');
    });

    it('should show ready message when complete', () => {
      const readyItem = { ...mockReadinessItem, currentCount: 10, annotationsNeeded: 0 };
      const formatted = formatReadinessForDisplay(readyItem);

      expect(formatted.displayNeeded).toBe('Ready');
    });
  });
});