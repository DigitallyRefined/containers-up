import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useLocalStorage hook for persistent state synced with localStorage.
 * @param key The localStorage key
 * @param initialValue The initial value if nothing is in storage
 */
export function useLocalStorage<T>(
  key: string,
  keySuffix: string,
  initialValue: T = '' as T,
  mode: 'append' | 'replace' = 'replace'
) {
  const fullKey = `${key}:${keySuffix}`;

  const initialValueRef = useRef(initialValue);

  const readValueFromStorage = () => {
    if (typeof window === 'undefined') {
      return initialValueRef.current;
    }
    try {
      const item = window.localStorage.getItem(fullKey);
      return item ? (JSON.parse(item) as T) : initialValueRef.current;
    } catch (error) {
      console.warn(`Error reading localStorage key "${fullKey}":`, error);
      return initialValueRef.current;
    }
  };

  const [storedValue, setStoredValue] = useState<T>(readValueFromStorage);

  // Only re-sync when the storage key changes, not when the function reference changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: readValueFromStorage captures initialValue which changes ref each render
  useEffect(() => {
    setStoredValue(readValueFromStorage());
  }, [fullKey]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(fullKey, JSON.stringify(storedValue));
    }
  }, [storedValue, fullKey]);

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      if (!key || !keySuffix) return;
      if (mode === 'append') {
        setStoredValue((prev) => {
          const prevArr = Array.isArray(prev) ? prev : [];
          const nextArr = typeof value === 'function' ? (value as (val: T) => T)(prev) : value;
          const nextArrCasted = Array.isArray(nextArr) ? nextArr : [];
          // Merge and deduplicate
          const merged = Array.from(new Set([...prevArr, ...nextArrCasted]));
          return merged as unknown as T;
        });
      } else {
        setStoredValue(value);
      }
    },
    [key, keySuffix, mode]
  );

  const removeValue = useCallback((itemToRemove: string) => {
    setStoredValue((prev) => {
      const prevArr = Array.isArray(prev) ? prev : [];
      const nextArr = prevArr.filter((value) => value !== itemToRemove);
      return nextArr as unknown as T;
    });
  }, []);

  return [storedValue, setValue, removeValue] as const;
}
