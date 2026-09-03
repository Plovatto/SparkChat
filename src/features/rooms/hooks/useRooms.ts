import { useCallback, useEffect, useState } from 'react';
import {
  useSocket,
  type BlockStatusPayload,
  type MessageView,
  type RoomParticipant,
  type RoomSummary,
  type SocketUserStatus,
} from '@lib/socket';

export interface RoomsState {
  rooms: RoomSummary[];
  isLoaded: boolean;
  typingUserIds: Record<string, string[]>;
  recordingUserIds: Record<string, string[]>;
}

export function useRooms(selectedRoomId: string | null, currentUserId: string | undefined): RoomsState {
  const { socket } = useSocket();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<Record<string, string[]>>({});
  const [recordingUserIds, setRecordingUserIds] = useState<Record<string, string[]>>({});

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

    const handleUserOffline = ({ userId, user }: { userId: string; user: { id: string; status: SocketUserStatus; lastSeen: string } }) => {
      setRooms((previous) =>
        previous.map((room) => ({
          ...room,
          participants: room.participants.map((participant) =>
            participant.id === userId ? { ...participant, status: user.status, lastSeen: user.lastSeen } : participant,
          ),
        })),
      );
    };

    const handleProfileUpdated = ({
      userId,
      nickname,
      avatar,
      statusText,
    }: {
      userId: string;
      nickname: string;
      avatar: number;
      statusText: string | null;
    }) => {
      setRooms((previous) =>
        previous.map((room) => ({
          ...room,
          participants: room.participants.map((participant) =>
            participant.id === userId ? { ...participant, nickname, avatar, statusText } : participant,
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

    const handleTypingUpdate = ({ roomId, users }: { roomId: string; users: string[] }) => {
      setTypingUserIds((previous) => ({ ...previous, [roomId]: users.filter((userId) => userId !== currentUserId) }));
    };

    const handleRecordingUpdate = ({ roomId, users }: { roomId: string; users: string[] }) => {
      setRecordingUserIds((previous) => ({ ...previous, [roomId]: users.filter((userId) => userId !== currentUserId) }));
    };

    const handleReadReceipt = ({ roomId: receiptRoomId, userId: readerId }: { roomId: string; userId: string }) => {
      setRooms((previous) =>
        previous.map((room) => {
          const message = room.lastMessage;
          if (room.id !== receiptRoomId || !message || message.sender.id !== currentUserId || message.readBy.includes(readerId)) {
            return room;
          }

          const deliveredTo = message.deliveredTo.includes(readerId) ? message.deliveredTo : [...message.deliveredTo, readerId];
          return {
            ...room,
            lastMessage: { ...message, readBy: [...message.readBy, readerId], deliveredTo, status: 'read' },
          };
        }),
      );
    };

    const handleMessageUpdated = (message: MessageView) => {
      setRooms((previous) =>
        previous.map((room) => (room.lastMessage?.id === message.id ? { ...room, lastMessage: message } : room)),
      );
    };

    const handleMessageDeleted = ({ messageId, roomId }: { messageId: string; roomId: string }) => {
      setRooms((previous) =>
        previous.map((room) =>
          room.id === roomId && room.lastMessage?.id === messageId
            ? { ...room, lastMessage: { ...room.lastMessage, deletedForEveryone: true, content: '' } }
            : room,
        ),
      );
    };

    const handleRoomDeleted = ({ roomId }: { roomId: string }) => {
      setRooms((previous) => previous.filter((room) => room.id !== roomId));
    };

    const handleGroupLeft = ({ roomId }: { roomId: string }) => {
      setRooms((previous) => previous.filter((room) => room.id !== roomId));
    };

    const handleGroupUserLeft = ({ roomId, participants }: { roomId: string; participants: RoomParticipant[] }) => {
      setRooms((previous) => previous.map((room) => (room.id === roomId ? { ...room, participants } : room)));
    };

    const handleGroupUserJoined = ({ roomId, participants }: { roomId: string; participants: RoomParticipant[] }) => {
      setRooms((previous) => previous.map((room) => (room.id === roomId ? { ...room, participants } : room)));
    };

    const handleParticipantsUpdated = ({ roomId, participants }: { roomId: string; participants: RoomParticipant[] }) => {
      setRooms((previous) => previous.map((room) => (room.id === roomId ? { ...room, participants } : room)));
    };

    const handleBlockStatusChanged = ({ roomId, blockedBy }: BlockStatusPayload) => {
      setRooms((previous) =>
        previous.map((room) => {
          if (room.id !== roomId) {
            return room;
          }

          const isBlockedBy = Boolean(currentUserId && blockedBy[currentUserId]);
          const userBlocked = Boolean(currentUserId && Object.values(blockedBy).includes(currentUserId));
          return { ...room, blockedBy, isBlockedBy, userBlocked, isMutuallyBlocked: isBlockedBy && userBlocked };
        }),
      );
    };

    socket.emit('rooms:get');
    socket.on('rooms:list', handleRoomsList);
    socket.on('room:created', handleRoomUpserted);
    socket.on('room:joined', handleRoomUpserted);
    socket.on('room:new', handleRoomUpserted);
    socket.on('room:deleted', handleRoomDeleted);
    socket.on('group:left', handleGroupLeft);
    socket.on('group:user-joined', handleGroupUserJoined);
    socket.on('group:user-left', handleGroupUserLeft);
    socket.on('group:participants-updated', handleParticipantsUpdated);
    socket.on('user:blocked', handleBlockStatusChanged);
    socket.on('user:unblocked', handleBlockStatusChanged);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);
    socket.on('user:profile-updated', handleProfileUpdated);
    socket.on('message:new', handleMessageNew);
    socket.on('message:mark-read-done', handleMarkReadDone);
    socket.on('message:read-receipt', handleReadReceipt);
    socket.on('message:updated', handleMessageUpdated);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('typing:update', handleTypingUpdate);
    socket.on('recording:update', handleRecordingUpdate);

    return () => {
      socket.off('rooms:list', handleRoomsList);
      socket.off('room:created', handleRoomUpserted);
      socket.off('room:joined', handleRoomUpserted);
      socket.off('room:new', handleRoomUpserted);
      socket.off('room:deleted', handleRoomDeleted);
      socket.off('group:left', handleGroupLeft);
      socket.off('group:user-joined', handleGroupUserJoined);
      socket.off('group:user-left', handleGroupUserLeft);
      socket.off('group:participants-updated', handleParticipantsUpdated);
      socket.off('user:blocked', handleBlockStatusChanged);
      socket.off('user:unblocked', handleBlockStatusChanged);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
      socket.off('user:profile-updated', handleProfileUpdated);
      socket.off('message:new', handleMessageNew);
      socket.off('message:mark-read-done', handleMarkReadDone);
      socket.off('message:read-receipt', handleReadReceipt);
      socket.off('message:updated', handleMessageUpdated);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('typing:update', handleTypingUpdate);
      socket.off('recording:update', handleRecordingUpdate);
    };
  }, [socket, upsertRoom, selectedRoomId, currentUserId]);

  return { rooms, isLoaded, typingUserIds, recordingUserIds };
}
