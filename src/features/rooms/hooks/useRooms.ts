import { useCallback, useEffect, useState } from 'react';
import { useSocket, type MessageView, type RoomSummary } from '@lib/socket';

export interface RoomsState {
  rooms: RoomSummary[];
  isLoaded: boolean;
}

export function useRooms(selectedRoomId: string | null): RoomsState {
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

    const handleUserOnline = ({ userId }: { userId: string }) => {
      setRooms((previous) =>
        previous.map((room) => ({
          ...room,
          participants: room.participants.map((participant) =>
            participant.id === userId ? { ...participant, status: 'online' } : participant,
          ),
        })),
      );
    };

    const handleUserOffline = ({ userId }: { userId: string }) => {
      setRooms((previous) =>
        previous.map((room) => ({
          ...room,
          participants: room.participants.map((participant) =>
            participant.id === userId ? { ...participant, status: 'offline' } : participant,
          ),
        })),
      );
    };

    const handleMessageNew = (message: MessageView) => {
      setRooms((previous) =>
        previous.map((room) => {
          if (room.id !== message.roomId) {
            return room;
          }

          const isCurrentRoom = room.id === selectedRoomId;
          return {
            ...room,
            lastMessage: message,
            unreadCount: isCurrentRoom ? 0 : room.unreadCount + 1,
          };
        }),
      );
    };

    const handleMarkReadDone = ({ roomId, unreadCount }: { roomId: string; unreadCount: number }) => {
      setRooms((previous) => previous.map((room) => (room.id === roomId ? { ...room, unreadCount } : room)));
    };

    const handleRoomDeleted = ({ roomId }: { roomId: string }) => {
      setRooms((previous) => previous.filter((room) => room.id !== roomId));
    };

    socket.on('user:registered', requestRooms);
    socket.on('rooms:list', handleRoomsList);
    socket.on('room:created', handleRoomUpserted);
    socket.on('room:joined', handleRoomUpserted);
    socket.on('room:new', handleRoomUpserted);
    socket.on('room:deleted', handleRoomDeleted);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);
    socket.on('message:new', handleMessageNew);
    socket.on('message:mark-read-done', handleMarkReadDone);

    return () => {
      socket.off('user:registered', requestRooms);
      socket.off('rooms:list', handleRoomsList);
      socket.off('room:created', handleRoomUpserted);
      socket.off('room:joined', handleRoomUpserted);
      socket.off('room:new', handleRoomUpserted);
      socket.off('room:deleted', handleRoomDeleted);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
      socket.off('message:new', handleMessageNew);
      socket.off('message:mark-read-done', handleMarkReadDone);
    };
  }, [socket, upsertRoom, selectedRoomId]);

  return { rooms, isLoaded };
}
