import { useCallback, useEffect, useState } from 'react';
import { useSocket, type RoomSummary } from '@lib/socket';

export interface RoomsState {
  rooms: RoomSummary[];
  isLoaded: boolean;
}

export function useRooms(): RoomsState {
  const { socket } = useSocket();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const upsertRoom = useCallback((room: RoomSummary) => {
    setRooms((previous) => {
      const exists = previous.some((existing) => existing.id === room.id);
      return exists ? previous.map((existing) => (existing.id === room.id ? room : existing)) : [room, ...previous];
    });
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const requestRooms = () => socket.emit('rooms:get');
    const handleRoomsList = ({ rooms: list }: { rooms: RoomSummary[] }) => {
      setRooms(list);
      setIsLoaded(true);
    };
    const handleRoomUpserted = ({ room }: { room: RoomSummary }) => upsertRoom(room);

    socket.on('user:registered', requestRooms);
    socket.on('rooms:list', handleRoomsList);
    socket.on('room:created', handleRoomUpserted);
    socket.on('room:joined', handleRoomUpserted);
    socket.on('room:new', handleRoomUpserted);

    return () => {
      socket.off('user:registered', requestRooms);
      socket.off('rooms:list', handleRoomsList);
      socket.off('room:created', handleRoomUpserted);
      socket.off('room:joined', handleRoomUpserted);
      socket.off('room:new', handleRoomUpserted);
    };
  }, [socket, upsertRoom]);

  return { rooms, isLoaded };
}
