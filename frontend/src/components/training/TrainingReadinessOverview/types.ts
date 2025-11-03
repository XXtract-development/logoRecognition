// Type definitions for Training Readiness Overview components

export interface CategoryValueReadiness {
  id: string;
  category: {
    code: string;
    label: string;
  };
  value: {
    code: string;
    label: string;
  };
  currentCount: number;
  minimumRequired: number;
  readinessPercentage: number;
  annotationsNeeded: number;
  status: 'ready' | 'almost_ready' | 'needs_work';
  lastUpdated: Date;
  augmentedSamples: number;
  naturalSamples: number;
}

export interface ReadinessFilters {
  status: 'all' | 'ready' | 'almost_ready' | 'needs_work';
  category: string | null;
  searchTerm: string;
}

export interface ReadinessOverviewState {
  items: CategoryValueReadiness[];
  isLoading: boolean;
  filters: ReadinessFilters;
  sortBy: 'category' | 'value' | 'readiness' | 'needed' | 'updated';
  sortDirection: 'asc' | 'desc';
  error: string | null;
}

export interface TrainingReadinessOverviewProps {
  onTrainSelected?: (items: CategoryValueReadiness[]) => void;
  onExportCSV?: () => void;
  minimumSamples?: number;
}

export interface ReadinessTableColumn {
  key: keyof CategoryValueReadiness | 'actions';
  title: string;
  dataIndex?: string[];
  sortable?: boolean;
  width?: string | number;
  render?: (value: any, record: CategoryValueReadiness) => React.ReactNode;
}

export interface ReadinessAPIResponse {
  data: CategoryValueReadiness[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WebSocketMessage {
  type: 'update' | 'delete' | 'add';
  payload: CategoryValueReadiness | { id: string };
}