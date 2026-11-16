import { useCallback, useEffect, useState } from 'react';

function readStoredIds(storageKey: string, legacyKey?: string): Set<string> {
  try {
    let raw = localStorage.getItem(storageKey);
    if (!raw && legacyKey) {
      raw = localStorage.getItem(legacyKey);
      if (raw) {
        localStorage.setItem(storageKey, raw);
        localStorage.removeItem(legacyKey);
      }
    }
    if (!raw) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export interface PersistedIdSetControls {
  ids: Set<string>;
  toggle: (ids: string[]) => void;
}

export function usePersistedIdSet(storageKey: string, legacyKey?: string): PersistedIdSetControls {
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setIds(readStoredIds(storageKey, legacyKey));
  }, [storageKey, legacyKey]);

  const toggle = useCallback(
    (targetIds: string[]) => {
      setIds((previous) => {
        const allPresent = targetIds.every((id) => previous.has(id));
        const next = new Set(previous);

        for (const id of targetIds) {
          if (allPresent) {
            next.delete(id);
          } else {
            next.add(id);
          }
        }

        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        } catch {
          return next;
        }
        return next;
      });
    },
    [storageKey],
  );

  return { ids, toggle };
}
