import { useEffect, useState } from 'react';
import { useSocket, type MessageView } from '@lib/socket';

export interface RoomMessagesState {
  messages: MessageView[];
  isLoaded: boolean;
  typingUserIds: string[];
}

export function useRoomMessages(roomId: string | null, currentUserId: string | undefined): RoomMessagesState {
  const { socket } = useSocket();
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  useEffect(() => {
    setMessages([]);
    setIsLoaded(false);
    setTypingUserIds([]);
  }, [roomId]);

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }

    socket.emit('messages:get', { roomId });
    socket.emit('message:mark-read', { roomId });

    const handleMessagesList = (payload: { roomId: string; messages: MessageView[] }) => {
      if (payload.roomId !== roomId) {
        return;
      }
      setMessages(payload.messages);
      setIsLoaded(true);
    };

    const handleMessageNew = (message: MessageView) => {
      if (message.roomId !== roomId) {
        return;
      }
      setMessages((previous) => [...previous, message]);
    };

    const handleReadReceipt = ({ roomId: receiptRoomId, userId }: { roomId: string; userId: string }) => {
      if (receiptRoomId !== roomId) {
        return;
      }
      setMessages((previous) =>
        previous.map((message) =>
          message.sender.id === currentUserId && !message.readBy.includes(userId)
            ? { ...message, readBy: [...message.readBy, userId], status: 'read' }
            : message,
        ),
      );
    };

    const handleTypingUpdate = ({ roomId: typingRoomId, users }: { roomId: string; users: string[] }) => {
      if (typingRoomId !== roomId) {
        return;
      }
      setTypingUserIds(users.filter((userId) => userId !== currentUserId));
    };

    const handleMessageDeleted = ({ messageId, roomId: deletedRoomId }: { messageId: string; roomId: string }) => {
      if (deletedRoomId !== roomId) {
        return;
      }
      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId ? { ...message, deletedForEveryone: true, content: '' } : message,
        ),
      );
    };

    socket.on('messages:list', handleMessagesList);
    socket.on('message:new', handleMessageNew);
    socket.on('message:read-receipt', handleReadReceipt);
    socket.on('typing:update', handleTypingUpdate);
    socket.on('message:deleted', handleMessageDeleted);

    return () => {
      socket.off('messages:list', handleMessagesList);
      socket.off('message:new', handleMessageNew);
      socket.off('message:read-receipt', handleReadReceipt);
      socket.off('typing:update', handleTypingUpdate);
      socket.off('message:deleted', handleMessageDeleted);
    };
  }, [socket, roomId, currentUserId]);

  return { messages, isLoaded, typingUserIds };
}
