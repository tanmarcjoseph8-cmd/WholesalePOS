import { useEffect, useState } from "react";

/** Delays database search work while preserving immediate controlled-input feedback. */
export function useDebouncedValue<T>(value: T, delayMs = 180) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [delayMs, value]);
  return debounced;
}
