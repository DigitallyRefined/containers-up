import { useState } from 'react';

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
  const fullKey = `${key}-${keySuffix}`;
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(fullKey);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
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
  };

  const removeValue = (itemToRemove: string) => {
    const currentValues = JSON.parse(window.localStorage.getItem(fullKey) || '[]') as T[];
    const newValue = currentValues.filter((value) => value !== itemToRemove);
    window.localStorage.setItem(fullKey, JSON.stringify(newValue));
  };

  return [storedValue, setValue, removeValue] as const;
}
