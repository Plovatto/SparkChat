import { useCallback, useEffect, useMemo, useState } from 'react';

export interface MessageSelectionState {
  selectionIds: ReadonlySet<string> | null;
  selectedIds: string[];
  isSelecting: boolean;
  startSelection: (ids: string[]) => void;
  toggleSelection: (ids: string[]) => void;
  clearSelection: () => void;
}

interface MessageSelectionOptions {
  presentIds: readonly string[];
  resetKey: string | null;
  escapeEnabled: boolean;
}

export function useMessageSelection({ presentIds, resetKey, escapeEnabled }: MessageSelectionOptions): MessageSelectionState {
  const [selectionIds, setSelectionIds] = useState<ReadonlySet<string> | null>(null);
  const isSelecting = selectionIds !== null;

  useEffect(() => {
    setSelectionIds(null);
  }, [resetKey]);

  useEffect(() => {
    if (!isSelecting || !escapeEnabled) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectionIds(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSelecting, escapeEnabled]);

  const selectedIds = useMemo(
    () => (selectionIds ? presentIds.filter((id) => selectionIds.has(id)) : []),
    [selectionIds, presentIds],
  );

  const startSelection = useCallback((ids: string[]) => {
    setSelectionIds(new Set(ids));
  }, []);

  const toggleSelection = useCallback((ids: string[]) => {
    setSelectionIds((current) => {
      if (!current) {
        return current;
      }
      const next = new Set(current);
      const isChecked = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (isChecked) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectionIds(null), []);

  return { selectionIds, selectedIds, isSelecting, startSelection, toggleSelection, clearSelection };
}
