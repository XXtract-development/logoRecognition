import { useCallback, useEffect, useRef } from 'react';

interface UseAutosaveOptions {
  enabled: boolean;
  intervalMs?: number;
  debounceMs?: number;
  saveDraft: () => Promise<void>;
}

interface AutosaveControls {
  markDirty: () => void;
  flush: () => Promise<void>;
}

export const useAutosave = ({
  enabled,
  intervalMs = 60_000,
  debounceMs = 500,
  saveDraft,
}: UseAutosaveOptions): AutosaveControls => {
  const dirtyRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);

  const runAutosave = useCallback(async () => {
    if (inflightRef.current) {
      await inflightRef.current;
    }

    if (!dirtyRef.current) {
      return;
    }

    dirtyRef.current = false;
    inflightRef.current = saveDraft().catch((error) => {
      dirtyRef.current = true;
      throw error;
    }).finally(() => {
      inflightRef.current = null;
    });

    await inflightRef.current;
  }, [saveDraft]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (!enabled) {
      return;
    }
    debounceRef.current = setTimeout(() => {
      void runAutosave();
    }, debounceMs);
  }, [debounceMs, enabled, runAutosave]);

  useEffect(() => {
    if (!enabled) {
      return () => undefined;
    }

    intervalRef.current = setInterval(() => {
      void runAutosave();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [enabled, intervalMs, runAutosave]);

  const flush = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await runAutosave();
  }, [runAutosave]);

  return { markDirty, flush };
};

