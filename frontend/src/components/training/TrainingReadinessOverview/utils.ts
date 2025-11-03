import { CategoryValueReadiness, ReadinessFilters } from './types';

/**
 * Calculate the readiness percentage based on current count vs minimum required
 */
export function calculateReadinessPercentage(
  currentCount: number,
  minimumRequired: number
): number {
  if (minimumRequired === 0) return 100;
  const percentage = (currentCount / minimumRequired) * 100;
  return Math.min(100, Math.round(percentage));
}

/**
 * Calculate how many more annotations are needed
 */
export function calculateAnnotationsNeeded(
  currentCount: number,
  minimumRequired: number
): number {
  return Math.max(0, minimumRequired - currentCount);
}

/**
 * Determine the readiness status based on percentage
 */
export function determineReadinessStatus(
  percentage: number
): 'ready' | 'almost_ready' | 'needs_work' {
  if (percentage >= 100) return 'ready';
  if (percentage >= 80) return 'almost_ready';
  return 'needs_work';
}

/**
 * Sort readiness items based on field and direction
 */
export function sortReadinessItems(
  items: CategoryValueReadiness[],
  sortBy: 'category' | 'value' | 'readiness' | 'needed' | 'updated',
  direction: 'asc' | 'desc'
): CategoryValueReadiness[] {
  const sorted = [...items].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'category':
        comparison = a.category.label.localeCompare(b.category.label);
        break;
      case 'value':
        comparison = a.value.label.localeCompare(b.value.label);
        break;
      case 'readiness':
        comparison = a.readinessPercentage - b.readinessPercentage;
        break;
      case 'needed':
        comparison = a.annotationsNeeded - b.annotationsNeeded;
        break;
      case 'updated':
        comparison = new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime();
        break;
    }

    return direction === 'asc' ? comparison : -comparison;
  });

  return sorted;
}

/**
 * Filter readiness items based on filters
 */
export function filterReadinessItems(
  items: CategoryValueReadiness[],
  filters: ReadinessFilters
): CategoryValueReadiness[] {
  let filtered = [...items];

  // Filter by status
  if (filters.status !== 'all') {
    filtered = filtered.filter(item => item.status === filters.status);
  }

  // Filter by category
  if (filters.category) {
    filtered = filtered.filter(item => item.category.code === filters.category);
  }

  // Filter by search term
  if (filters.searchTerm) {
    const searchLower = filters.searchTerm.toLowerCase();
    filtered = filtered.filter(
      item =>
        item.category.label.toLowerCase().includes(searchLower) ||
        item.value.label.toLowerCase().includes(searchLower) ||
        item.category.code.toLowerCase().includes(searchLower) ||
        item.value.code.toLowerCase().includes(searchLower)
    );
  }

  return filtered;
}

/**
 * Export readiness data to CSV format
 */
export function exportToCSV(items: CategoryValueReadiness[]): string {
  const headers = [
    'Category',
    'Value',
    'Current Count',
    'Required',
    'Readiness %',
    'Status',
    'Natural Samples',
    'Augmented Samples',
    'Last Updated',
  ];

  const rows = items.map(item => [
    item.category.label,
    item.value.label,
    item.currentCount.toString(),
    item.minimumRequired.toString(),
    `${item.readinessPercentage}%`,
    item.status,
    item.naturalSamples.toString(),
    item.augmentedSamples.toString(),
    new Date(item.lastUpdated).toLocaleString(),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Format readiness item for display
 */
export function formatReadinessForDisplay(item: CategoryValueReadiness) {
  return {
    displayPercentage: `${item.readinessPercentage}%`,
    displayCount: `${item.currentCount}/${item.minimumRequired}`,
    displayNeeded:
      item.annotationsNeeded > 0
        ? `${item.annotationsNeeded} more needed`
        : 'Ready',
  };
}

/**
 * Download CSV file
 */
export function downloadCSV(content: string, filename: string = 'training-readiness.csv') {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Check if any items are ready for training
 */
export function hasReadyItems(items: CategoryValueReadiness[]): boolean {
  return items.some(item => item.status === 'ready');
}

/**
 * Get only ready items
 */
export function getReadyItems(items: CategoryValueReadiness[]): CategoryValueReadiness[] {
  return items.filter(item => item.status === 'ready');
}

/**
 * Calculate overall readiness statistics
 */
export function calculateReadinessStats(items: CategoryValueReadiness[]) {
  const total = items.length;
  const ready = items.filter(item => item.status === 'ready').length;
  const almostReady = items.filter(item => item.status === 'almost_ready').length;
  const needsWork = items.filter(item => item.status === 'needs_work').length;

  const avgReadiness =
    total > 0
      ? Math.round(
          items.reduce((sum, item) => sum + item.readinessPercentage, 0) / total
        )
      : 0;

  return {
    total,
    ready,
    almostReady,
    needsWork,
    avgReadiness,
    readyPercentage: total > 0 ? Math.round((ready / total) * 100) : 0,
  };
}