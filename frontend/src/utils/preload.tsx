import React, { lazy, ComponentType, LazyExoticComponent } from 'react';
import { ChunkLoader } from './chunkLoader';

interface PreloadableComponent<T = {}> extends LazyExoticComponent<ComponentType<T>> {
  preload: () => Promise<void>;
  prefetch: () => void;
  _chunkName: string;
}

interface PreloadOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  onError?: (error: Error) => void;
}

export function preloadComponent<T = {}>(
  importFn: () => Promise<{ default: ComponentType<T> }>,
  chunkName: string,
  options: PreloadOptions = {}
): PreloadableComponent<T> {
  let component: ComponentType<T> | null = null;
  let error: Error | null = null;
  let promise: Promise<{ default: ComponentType<T> }> | null = null;

  // Create the loader function with retry logic
  const loadComponent = () => {
    if (component) {
      return Promise.resolve({ default: component });
    }

    if (error) {
      return Promise.reject(error);
    }

    if (!promise) {
      promise = ChunkLoader.loadChunk(chunkName, importFn, options)
        .then((module) => {
          component = module.default;
          error = null;
          return module;
        })
        .catch((err) => {
          error = err;
          promise = null;
          throw err;
        });
    }

    return promise;
  };

  // Create the lazy component
  const LazyComponent = lazy(loadComponent) as PreloadableComponent<T>;

  // Add preload method for imperative loading
  LazyComponent.preload = async () => {
    try {
      await loadComponent();
    } catch (err) {
      console.error(`Failed to preload component ${chunkName}:`, err);
      throw err;
    }
  };

  // Add prefetch method for low-priority loading
  LazyComponent.prefetch = () => {
    ChunkLoader.preloadChunk(chunkName, importFn);
  };

  // Store chunk name for debugging
  LazyComponent._chunkName = chunkName;

  return LazyComponent;
}

// Utility to preload multiple components
export async function preloadComponents(
  components: PreloadableComponent<any>[]
): Promise<void> {
  try {
    await Promise.all(components.map(comp => comp.preload()));
  } catch (error) {
    console.error('Failed to preload components:', error);
  }
}

// Utility to prefetch components based on route
export function prefetchRouteComponents(routeName: string): void {
  ChunkLoader.prefetchRoute(routeName);
}

// Hook to preload on hover
export function usePreloadOnHover<T = {}>(
  component: PreloadableComponent<T>
): {
  onMouseEnter: () => void;
  onFocus: () => void;
} {
  const handleInteraction = React.useCallback(() => {
    component.prefetch();
  }, [component]);

  return {
    onMouseEnter: handleInteraction,
    onFocus: handleInteraction,
  };
}

// Hook to preload on visibility
export function usePreloadOnVisible<T = {}>(
  component: PreloadableComponent<T>,
  threshold = 0.1
): React.RefObject<HTMLElement> {
  const ref = React.useRef<HTMLElement>(null);
  const [hasPreloaded, setHasPreloaded] = React.useState(false);

  React.useEffect(() => {
    if (hasPreloaded || !ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasPreloaded) {
            component.prefetch();
            setHasPreloaded(true);
            observer.disconnect();
          }
        });
      },
      { threshold }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [component, threshold, hasPreloaded]);

  return ref;
}

// Priority-based preloading queue
class PreloadQueue {
  private queue: Array<{ component: PreloadableComponent<any>; priority: number }> = [];
  private isProcessing = false;

  add(component: PreloadableComponent<any>, priority = 0): void {
    this.queue.push({ component, priority });
    this.queue.sort((a, b) => b.priority - a.priority);
    this.process();
  }

  private async process(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        try {
          await item.component.preload();
        } catch (error) {
          console.error(`Failed to preload component:`, error);
        }
      }

      // Small delay between preloads to avoid blocking
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
  }

  clear(): void {
    this.queue = [];
  }
}

export const preloadQueue = new PreloadQueue();

// Resource hints component
export const ResourceHints: React.FC = () => {
  React.useEffect(() => {
    // Add DNS prefetch for CDN
    const cdnDomains = [
      'cdn.jsdelivr.net',
      'unpkg.com',
      'cdnjs.cloudflare.com',
    ];

    cdnDomains.forEach(domain => {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = `//${domain}`;
      document.head.appendChild(link);
    });

    // Add preconnect for API
    const apiDomain = process.env.REACT_APP_API_URL || window.location.origin;
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = apiDomain;
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);

    return () => {
      // Cleanup if needed
    };
  }, []);

  return null;
};

// Route preloader based on user patterns
export class RoutePreloader {
  private static routeHistory: string[] = [];
  private static readonly MAX_HISTORY = 10;

  static recordRoute(route: string): void {
    this.routeHistory.push(route);
    if (this.routeHistory.length > this.MAX_HISTORY) {
      this.routeHistory.shift();
    }
    this.predictNextRoute(route);
  }

  private static predictNextRoute(currentRoute: string): void {
    // Simple prediction based on common patterns
    const predictions: Record<string, string[]> = {
      '/': ['/dashboard', '/detection'],
      '/dashboard': ['/detection', '/analytics'],
      '/detection': ['/history', '/dashboard'],
      '/history': ['/analytics', '/detection'],
      '/settings': ['/dashboard'],
      '/analytics': ['/dashboard', '/history'],
    };

    const likelyRoutes = predictions[currentRoute] || [];
    likelyRoutes.forEach(route => {
      // Prefetch likely next routes with low priority
      setTimeout(() => {
        prefetchRouteComponents(route);
      }, 2000);
    });
  }

  static getRouteHistory(): string[] {
    return [...this.routeHistory];
  }
}