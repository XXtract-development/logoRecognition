class PerformanceMonitor {
  private marks: Map<string, number> = new Map();
  private measures: Map<string, number> = new Map();

  mark(name: string): void {
    this.marks.set(name, performance.now());
    if (typeof performance.mark === 'function') {
      try {
        performance.mark(name);
      } catch (e) {
        // Ignore if mark already exists
      }
    }
  }

  measure(name: string, startMark: string, endMark: string): number | null {
    const startTime = this.marks.get(startMark);
    const endTime = this.marks.get(endMark);

    if (startTime === undefined || endTime === undefined) {
      return null;
    }

    const duration = endTime - startTime;
    this.measures.set(name, duration);

    if (typeof performance.measure === 'function') {
      try {
        performance.measure(name, startMark, endMark);
      } catch (e) {
        // Ignore errors
      }
    }

    // Log performance metrics in development
    if (import.meta.env.DEV) {
      console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
    }

    return duration;
  }

  getMeasure(name: string): number | undefined {
    return this.measures.get(name);
  }

  clearMarks(): void {
    this.marks.clear();
    if (typeof performance.clearMarks === 'function') {
      performance.clearMarks();
    }
  }

  clearMeasures(): void {
    this.measures.clear();
    if (typeof performance.clearMeasures === 'function') {
      performance.clearMeasures();
    }
  }

  getMetrics(): { marks: Record<string, number>; measures: Record<string, number> } {
    return {
      marks: Object.fromEntries(this.marks),
      measures: Object.fromEntries(this.measures),
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();
