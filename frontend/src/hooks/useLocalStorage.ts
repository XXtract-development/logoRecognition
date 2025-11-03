import { useState, useEffect, useCallback } from 'react';

type SetValue<T> = (value: T | ((prevValue: T) => T)) => void;

interface UseLocalStorageOptions {
  fallbackToMemory?: boolean;
  onError?: (error: Error) => void;
}

/**
 * Custom hook for localStorage with error handling and fallback
 * @param key - The localStorage key
 * @param initialValue - Initial value if key doesn't exist
 * @param options - Configuration options
 * @returns [value, setValue, error]
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: UseLocalStorageOptions = {}
): [T, SetValue<T>, Error | null] {
  const { fallbackToMemory = true, onError } = options;

  // In-memory fallback for when localStorage is unavailable
  const [memoryStorage, setMemoryStorage] = useState<T>(initialValue);
  const [error, setError] = useState<Error | null>(null);
  const [isLocalStorageAvailable, setIsLocalStorageAvailable] = useState(true);

  // Check if localStorage is available
  const checkLocalStorageAvailability = useCallback(() => {
    try {
      const testKey = '__localStorage_test__';
      window.localStorage.setItem(testKey, 'test');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Get value from localStorage or fallback
  const getStoredValue = useCallback((): T => {
    if (!isLocalStorageAvailable) {
      return memoryStorage;
    }

    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        return JSON.parse(item);
      }
      return initialValue;
    } catch (err) {
      const error = err as Error;
      setError(error);
      onError?.(error);

      if (fallbackToMemory) {
        setIsLocalStorageAvailable(false);
        return memoryStorage;
      }

      return initialValue;
    }
  }, [key, initialValue, memoryStorage, isLocalStorageAvailable, fallbackToMemory, onError]);

  // State to hold the value
  const [storedValue, setStoredValue] = useState<T>(getStoredValue);

  // Listen for storage events (changes from other tabs)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try {
          setStoredValue(JSON.parse(e.newValue));
          setError(null);
        } catch (err) {
          setError(err as Error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  // Check localStorage availability on mount
  useEffect(() => {
    const available = checkLocalStorageAvailability();
    setIsLocalStorageAvailable(available);
    if (!available) {
      setError(new Error('localStorage is not available'));
    }
  }, [checkLocalStorageAvailability]);

  // Set value function
  const setValue: SetValue<T> = useCallback(
    (value) => {
      try {
        // Allow value to be a function
        const valueToStore = value instanceof Function ? value(storedValue) : value;

        // Update state
        setStoredValue(valueToStore);
        setError(null);

        // Try to save to localStorage
        if (isLocalStorageAvailable) {
          try {
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
          } catch (err) {
            const error = err as Error;
            setError(error);
            onError?.(error);

            if (fallbackToMemory) {
              setIsLocalStorageAvailable(false);
              setMemoryStorage(valueToStore);
            }
          }
        } else if (fallbackToMemory) {
          // Use in-memory fallback
          setMemoryStorage(valueToStore);
        }
      } catch (err) {
        const error = err as Error;
        setError(error);
        onError?.(error);
      }
    },
    [key, storedValue, isLocalStorageAvailable, fallbackToMemory, onError]
  );

  return [storedValue, setValue, error];
}

// Hook for menu collapsed state with specific error handling
export function useMenuCollapsedState(
  isMobile: boolean,
  defaultValue = false
): [boolean, (value: boolean) => void, Error | null] {
  const [collapsed, setCollapsed, error] = useLocalStorage(
    'menuCollapsed',
    defaultValue,
    {
      fallbackToMemory: true,
      onError: (error) => {
        console.warn('Menu state storage failed, using in-memory storage:', error);
      },
    }
  );

  // Don't use localStorage for mobile
  const effectiveCollapsed = isMobile ? false : collapsed;

  const setEffectiveCollapsed = useCallback(
    (value: boolean) => {
      if (!isMobile) {
        setCollapsed(value);
      }
    },
    [isMobile, setCollapsed]
  );

  return [effectiveCollapsed, setEffectiveCollapsed, error];
}