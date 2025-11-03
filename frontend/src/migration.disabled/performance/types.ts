// Performance Types
// Story: FE-001.0.1

export interface ChunkAnalysis {
  name: string;
  size: number;
  gzipSize: number;
  parseTime: number;
}

export interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
}

export interface PerformanceComparison {
  timestamp: number;
  baseline: number;
  current: number;
  diff: number;
  percentageChange: number;
  regression: boolean;
}

export interface PerformanceThresholds {
  bundle: {
    total: number;
    perRoute: number;
    chunkSize: number;
  };
  runtime: {
    fcp: number;
    tti: number;
    lcp: number;
    cls: number;
    fid: number;
  };
  memory: {
    heap: number;
    peak: number;
  };
  api: {
    p50: number;
    p95: number;
    p99: number;
  };
}

export interface SessionRecording {
  id: string;
  timestamp: number;
  duration: number;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  events: Array<{
    type: string;
    timestamp: number;
    data: any;
  }>;
  errors: Array<{
    message: string;
    stack?: string;
    timestamp: number;
  }>;
}