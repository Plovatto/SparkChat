import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket, type SocketErrorPayload } from '@lib/socket';
import { chunkMessageIds } from '../utils/delete-options';

const LEGACY_FALLBACK_WINDOW_MS = 4000;
const LEGACY_DELETE_SPACING_MS = 250;

interface PendingBatch {
  ids: string[];
  sentAt: number;
}

export interface DeleteFailure {
  count: number;
  code: string | null;
}

export interface DeleteForEveryoneState {
  deleteForEveryone: (messageIds: string[]) => void;
  deleteFailure: DeleteFailure | null;
  dismissDeleteFailure: () => void;
}

export function useDeleteForEveryone(roomId: string | null): DeleteForEveryoneState {
  const { socket } = useSocket();
  const [deleteFailure, setDeleteFailure] = useState<DeleteFailure | null>(null);
  const batchesRef = useRef<PendingBatch[]>([]);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setDeleteFailure(null);
  }, [roomId]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const sendOneByOne = (ids: string[]) => {
      ids.forEach((messageId, index) => {
        const timer = setTimeout(() => {
          timersRef.current.delete(timer);
          socket.emit('message:delete', { messageId });
        }, index * LEGACY_DELETE_SPACING_MS);
        timersRef.current.add(timer);
      });
    };

    const handleError = ({ event, code, messageIds }: SocketErrorPayload) => {
      if (event === 'message:delete' && messageIds) {
        batchesRef.current = batchesRef.current
          .map((batch) => ({ ...batch, ids: batch.ids.filter((id) => !messageIds.includes(id)) }))
          .filter((batch) => batch.ids.length > 0);
        setDeleteFailure({ count: messageIds.length, code: code ?? null });
        return;
      }
      if (event || code !== 'validation.invalidPayload') {
        return;
      }
      const now = Date.now();
      const legacy = batchesRef.current.filter((batch) => now - batch.sentAt < LEGACY_FALLBACK_WINDOW_MS);
      if (legacy.length === 0) {
        return;
      }
      batchesRef.current = batchesRef.current.filter((batch) => !legacy.includes(batch));
      sendOneByOne(legacy.flatMap((batch) => batch.ids));
    };

    const handleDeleted = ({ messageId }: { messageId: string }) => {
      if (batchesRef.current.length === 0) {
        return;
      }
      batchesRef.current = batchesRef.current
        .map((batch) => ({ ...batch, ids: batch.ids.filter((id) => id !== messageId) }))
        .filter((batch) => batch.ids.length > 0);
    };

    socket.on('error', handleError);
    socket.on('message:deleted', handleDeleted);
    return () => {
      socket.off('error', handleError);
      socket.off('message:deleted', handleDeleted);
    };
  }, [socket]);

  const deleteForEveryone = useCallback(
    (messageIds: string[]) => {
      if (!socket || messageIds.length === 0) {
        return;
      }
      setDeleteFailure(null);
      const [single] = messageIds;
      if (messageIds.length === 1 && single) {
        socket.emit('message:delete', { messageId: single });
        return;
      }
      for (const ids of chunkMessageIds(messageIds)) {
        batchesRef.current = [...batchesRef.current, { ids, sentAt: Date.now() }];
        socket.emit('message:delete', { messageIds: ids });
      }
    },
    [socket],
  );

  const dismissDeleteFailure = useCallback(() => setDeleteFailure(null), []);

  return { deleteForEveryone, deleteFailure, dismissDeleteFailure };
}
