/**
 * Feature Flags Configuration
 * Sprint 2: Progressive rollout and A/B testing
 */

export interface FeatureFlag {
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage?: number;
  environments: ('development' | 'staging' | 'production')[];
  dependencies?: string[];
}

export const FEATURE_FLAGS: Record<string, FeatureFlag> = {
  // Sprint 2 Features
  SMART_DETECTION: {
    name: 'Smart Click Detection',
    description: 'AI-powered logo detection from click coordinates',
    enabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'],
  },

  BATCH_UPLOAD: {
    name: 'Batch Upload',
    description: 'Upload multiple files simultaneously',
    enabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'],
  },

  DATA_AUGMENTATION: {
    name: 'Data Augmentation',
    description: 'Automatic generation of training variants',
    enabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging'],
  },

  CANVAS_ANNOTATION: {
    name: 'Canvas Annotation',
    description: 'Interactive canvas for logo annotation',
    enabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'],
  },

  // Sprint 3 Features (disabled)
  ADVANCED_CANVAS: {
    name: 'Advanced Canvas Features',
    description: 'Smooth zoom, multi-select, keyboard shortcuts',
    enabled: false,
    rolloutPercentage: 0,
    environments: ['development'],
    dependencies: ['CANVAS_ANNOTATION'],
  },

  MOBILE_SUPPORT: {
    name: 'Mobile Support',
    description: 'Touch gestures and mobile-optimized UI',
    enabled: false,
    rolloutPercentage: 0,
    environments: ['development'],
  },

  VIRUS_SCANNING: {
    name: 'Virus Scanning',
    description: 'Automatic virus scanning for uploaded files',
    enabled: false,
    rolloutPercentage: 0,
    environments: ['development'],
  },

  // Algorithm selection
  USE_SAM_MODEL: {
    name: 'Use SAM Model',
    description: 'Use Facebook Segment Anything Model for detection',
    enabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'],
  },

  USE_OPENCV: {
    name: 'Use OpenCV Fallback',
    description: 'Fallback to OpenCV for edge detection',
    enabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'],
  },

  // Performance features
  PROGRESSIVE_LOADING: {
    name: 'Progressive Image Loading',
    description: 'Load images progressively for better performance',
    enabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'],
  },

  CACHE_DETECTIONS: {
    name: 'Cache Detection Results',
    description: 'Cache ML detection results for repeated images',
    enabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'],
  },
};

class FeatureFlagService {
  private flags: Record<string, FeatureFlag> = FEATURE_FLAGS;
  private environment: string;

  constructor() {
    this.environment = process.env.REACT_APP_ENV || 'development';
  }

  isEnabled(flagKey: string): boolean {
    const flag = this.flags[flagKey];

    if (!flag) {
      console.warn(`Feature flag ${flagKey} not found`);
      return false;
    }

    // Check if enabled for current environment
    if (!flag.environments.includes(this.environment as any)) {
      return false;
    }

    // Check dependencies
    if (flag.dependencies) {
      for (const dep of flag.dependencies) {
        if (!this.isEnabled(dep)) {
          return false;
        }
      }
    }

    // Check rollout percentage (simple implementation)
    if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
      // Use a stable hash based on user ID or session
      const userId = localStorage.getItem('userId') || 'anonymous';
      const hash = this.hashCode(userId + flagKey);
      const percentage = Math.abs(hash % 100);
      return percentage < flag.rolloutPercentage;
    }

    return flag.enabled;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  getAllFlags(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const key in this.flags) {
      result[key] = this.isEnabled(key);
    }
    return result;
  }

  // For testing and development
  override(flagKey: string, enabled: boolean): void {
    if (this.flags[flagKey]) {
      this.flags[flagKey].enabled = enabled;
    }
  }

  reset(): void {
    this.flags = { ...FEATURE_FLAGS };
  }
}

// Singleton instance
const featureFlags = new FeatureFlagService();

// React hook for feature flags
export function useFeatureFlag(flagKey: string): boolean {
  return featureFlags.isEnabled(flagKey);
}

export default featureFlags;