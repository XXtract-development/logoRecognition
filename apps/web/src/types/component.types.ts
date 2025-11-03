/**
 * Component Types
 * Type definitions for React components
 */

import { ReactNode } from 'react';
import { RecognitionResult, LogoDetection, BoundingBox } from './logo.types';

export interface BaseComponentProps {
  className?: string;
  children?: ReactNode;
  testId?: string;
}

export interface ImageUploaderProps extends BaseComponentProps {
  onUpload: (files: File[]) => Promise<void>;
  maxFiles?: number;
  maxSize?: number;
  accept?: string[];
  multiple?: boolean;
  disabled?: boolean;
}

export interface ResultsDisplayProps extends BaseComponentProps {
  results: RecognitionResult[];
  loading?: boolean;
  error?: Error | null;
  onResultSelect?: (result: RecognitionResult) => void;
  selectedId?: string;
}

export interface BoundingBoxCanvasProps extends BaseComponentProps {
  imageUrl: string;
  detections: LogoDetection[];
  selectedDetection?: string;
  onDetectionClick?: (detection: LogoDetection) => void;
  interactive?: boolean;
  zoom?: number;
  pan?: { x: number; y: number };
}

export interface ExportDialogProps {
  visible: boolean;
  results: RecognitionResult[];
  onClose: () => void;
  onExport: (format: 'json' | 'csv' | 'pdf') => Promise<void>;
}

export interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: 'light' | 'dark' | 'system';
}

export interface LanguageSelectorProps extends BaseComponentProps {
  value: string;
  onChange: (language: string) => void;
  languages: LanguageOption[];
}

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export interface AccessibilityProviderProps {
  children: ReactNode;
  announcePageChanges?: boolean;
  skipLinksEnabled?: boolean;
}

export interface ConfidenceMeterProps extends BaseComponentProps {
  confidence: number;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  animated?: boolean;
}

export interface LoadingSpinnerProps extends BaseComponentProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export interface VirtualListProps<T> extends BaseComponentProps {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  loading?: boolean;
  onLoadMore?: () => void;
}

export interface FilterPanelProps extends BaseComponentProps {
  onFilterChange: (filters: Record<string, unknown>) => void;
  filters: Record<string, unknown>;
  onReset: () => void;
}