import { createContext, useContext } from 'react';
import type { RoomSummary } from '@lib/socket';

export const ActiveRoomContext = createContext<RoomSummary | null>(null);

export function useActiveRoom(): RoomSummary | null {
  return useContext(ActiveRoomContext);
}
