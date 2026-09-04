import { useCallback, useEffect, useState } from 'react';

function readStoredIds(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
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

export function usePersistedIdSet(storageKey: string): PersistedIdSetControls {
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setIds(readStoredIds(storageKey));
  }, [storageKey]);

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

        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        return next;
      });
    },
    [storageKey],
  );

  return { ids, toggle };
}
