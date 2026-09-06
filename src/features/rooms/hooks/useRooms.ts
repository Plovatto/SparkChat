import { useEffect, useRef, useState } from 'react';
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

function patchParticipant(
  rooms: RoomSummary[],
  userId: string,
  patch: (participant: RoomParticipant) => RoomParticipant,
): RoomSummary[] {
  let changed = false;
  const next = rooms.map((room) => {
    if (!room.participants.some((participant) => participant.id === userId)) {
      return room;
    }
    changed = true;
    return {
      ...room,
      participants: room.participants.map((participant) => (participant.id === userId ? patch(participant) : participant)),
    };
  });
  return changed ? next : rooms;
}

function patchRoom(rooms: RoomSummary[], roomId: string, patch: (room: RoomSummary) => RoomSummary): RoomSummary[] {
  const index = rooms.findIndex((room) => room.id === roomId);
  if (index === -1) {
    return rooms;
  }
  const current = rooms[index];
  if (!current) {
    return rooms;
  }
  const next = [...rooms];
  next[index] = patch(current);
  return next;
}

export function useRooms(selectedRoomId: string | null, currentUserId: string | undefined): RoomsState {
  const { socket } = useSocket();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<Record<string, string[]>>({});
  const [recordingUserIds, setRecordingUserIds] = useState<Record<string, string[]>>({});
  const selectedRoomIdRef = useRef(selectedRoomId);
  selectedRoomIdRef.current = selectedRoomId;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  useEffect(() => {
    if (!socket) {
      return;
    }

    const upsertRoom = (room: RoomSummary) => {
      setRooms((previous) => {
        const exists = previous.some((existing) => existing.id === room.id);
        return exists ? previous.map((existing) => (existing.id === room.id ? room : existing)) : [room, ...previous];
      });
    };

    const handleRoomsList = ({ rooms: list }: { rooms: RoomSummary[] }) => {
      setRooms(list);
      setIsLoaded(true);
    };
    const handleRoomUpserted = ({ room }: { room: RoomSummary }) => upsertRoom(room);

    const handleUserOnline = ({ userId }: { userId: string }) => {
      setRooms((previous) => patchParticipant(previous, userId, (participant) => ({ ...participant, status: 'online' })));
    };

    const handleUserOffline = ({ userId, user }: { userId: string; user: { id: string; status: SocketUserStatus; lastSeen: string } }) => {
      setRooms((previous) =>
        patchParticipant(previous, userId, (participant) => ({ ...participant, status: user.status, lastSeen: user.lastSeen })),
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
      setRooms((previous) => patchParticipant(previous, userId, (participant) => ({ ...participant, nickname, avatar, statusText })));
    };

    const handleMessageNew = (message: MessageView) => {
      setRooms((previous) =>
        patchRoom(previous, message.roomId, (room) => {
          const currentUserId = currentUserIdRef.current;
          const isCurrentRoom = room.id === selectedRoomIdRef.current;
          const isMentioned = currentUserId !== undefined && message.mentionedUserIds.includes(currentUserId);
          return {
            ...room,
            lastMessage: message,
            unreadCount: isCurrentRoom ? 0 : room.unreadCount + 1,
            mentionCount: isCurrentRoom ? 0 : room.mentionCount + (isMentioned ? 1 : 0),
          };
        }),
      );
    };

    const handleMarkReadDone = ({
      roomId,
      unreadCount,
      mentionCount,
    }: {
      roomId: string;
      unreadCount: number;
      mentionCount: number;
    }) => {
      setRooms((previous) => patchRoom(previous, roomId, (room) => ({ ...room, unreadCount, mentionCount })));
    };

    const handleTypingUpdate = ({ roomId, users }: { roomId: string; users: string[] }) => {
      setTypingUserIds((previous) => ({ ...previous, [roomId]: users.filter((userId) => userId !== currentUserIdRef.current) }));
    };

    const handleRecordingUpdate = ({ roomId, users }: { roomId: string; users: string[] }) => {
      setRecordingUserIds((previous) => ({ ...previous, [roomId]: users.filter((userId) => userId !== currentUserIdRef.current) }));
    };

    const handleReadReceipt = ({ roomId: receiptRoomId, userId: readerId }: { roomId: string; userId: string }) => {
      setRooms((previous) =>
        patchRoom(previous, receiptRoomId, (room) => {
          const message = room.lastMessage;
          if (!message || message.sender.id !== currentUserIdRef.current || message.readBy.includes(readerId)) {
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
        previous.some((room) => room.lastMessage?.id === message.id)
          ? previous.map((room) => (room.lastMessage?.id === message.id ? { ...room, lastMessage: message } : room))
          : previous,
      );
    };

    const handleMessageDeleted = ({ messageId, roomId }: { messageId: string; roomId: string }) => {
      setRooms((previous) =>
        patchRoom(previous, roomId, (room) =>
          room.lastMessage?.id === messageId
            ? { ...room, lastMessage: { ...room.lastMessage, deletedForEveryone: true, content: '' } }
            : room,
        ),
      );
    };

    const handleRoomRemoved = ({ roomId }: { roomId: string }) => {
      setRooms((previous) => (previous.some((room) => room.id === roomId) ? previous.filter((room) => room.id !== roomId) : previous));
    };

    const handleParticipantsUpdated = ({ roomId, participants }: { roomId: string; participants: RoomParticipant[] }) => {
      setRooms((previous) => patchRoom(previous, roomId, (room) => ({ ...room, participants })));
    };

    const handleBlockStatusChanged = ({ roomId, blockedBy }: BlockStatusPayload) => {
      setRooms((previous) =>
        patchRoom(previous, roomId, (room) => {
          const currentUserId = currentUserIdRef.current;
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
    socket.on('room:deleted', handleRoomRemoved);
    socket.on('group:left', handleRoomRemoved);
    socket.on('group:user-joined', handleParticipantsUpdated);
    socket.on('group:user-left', handleParticipantsUpdated);
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
      socket.off('room:deleted', handleRoomRemoved);
      socket.off('group:left', handleRoomRemoved);
      socket.off('group:user-joined', handleParticipantsUpdated);
      socket.off('group:user-left', handleParticipantsUpdated);
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
  }, [socket]);

  return { rooms, isLoaded, typingUserIds, recordingUserIds };
}
