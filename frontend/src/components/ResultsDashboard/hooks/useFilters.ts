import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Detection } from '../ResultsDashboard';

export interface Filters {
  confidence: { min: number; max: number };
  categories: string[];
  size?: { min: number; max: number };
  regions?: Array<{ x: number; y: number; width: number; height: number }>;
}

export const useFilters = (detections: Detection[], debounceDelay: number = 150) => {
  const [filters, setFilters] = useState<Filters>({
    confidence: { min: 0, max: 1 },
    categories: [],
    size: undefined,
    regions: undefined
  });

  const [debouncedFilters, setDebouncedFilters] = useState<Filters>(filters);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce filter updates
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedFilters(filters);
    }, debounceDelay);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [filters, debounceDelay]);

  const filteredDetections = useMemo(() => {
    return detections.filter((detection) => {
      // Confidence filter
      if (
        detection.confidence < debouncedFilters.confidence.min ||
        detection.confidence > debouncedFilters.confidence.max
      ) {
        return false;
      }

      // Category filter
      if (debouncedFilters.categories.length > 0) {
        if (!detection.category || !debouncedFilters.categories.includes(detection.category)) {
          return false;
        }
      }

      // Size filter (if implemented)
      if (debouncedFilters.size) {
        const area = detection.boundingBox.width * detection.boundingBox.height;
        if (area < debouncedFilters.size.min || area > debouncedFilters.size.max) {
          return false;
        }
      }

      // Region filter (if implemented)
      if (debouncedFilters.regions && debouncedFilters.regions.length > 0) {
        const inRegion = debouncedFilters.regions.some((region) => {
          const boxCenterX = detection.boundingBox.x + detection.boundingBox.width / 2;
          const boxCenterY = detection.boundingBox.y + detection.boundingBox.height / 2;

          return (
            boxCenterX >= region.x &&
            boxCenterX <= region.x + region.width &&
            boxCenterY >= region.y &&
            boxCenterY <= region.y + region.height
          );
        });

        if (!inRegion) {
          return false;
        }
      }

      return true;
    });
  }, [detections, debouncedFilters]);

  const updateFilters = useCallback((updates: Partial<Filters>) => {
    setFilters((prev) => ({
      ...prev,
      ...updates
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      confidence: { min: 0, max: 1 },
      categories: [],
      size: undefined,
      regions: undefined
    });
  }, []);

  const applyPreset = useCallback((preset: 'highConfidence' | 'mediumConfidence' | 'all') => {
    switch (preset) {
      case 'highConfidence':
        setFilters((prev) => ({
          ...prev,
          confidence: { min: 0.9, max: 1 }
        }));
        break;
      case 'mediumConfidence':
        setFilters((prev) => ({
          ...prev,
          confidence: { min: 0.7, max: 0.9 }
        }));
        break;
      case 'all':
      default:
        resetFilters();
        break;
    }
  }, [resetFilters]);

  return {
    filters,
    filteredDetections,
    updateFilters,
    resetFilters,
    applyPreset
  };
};