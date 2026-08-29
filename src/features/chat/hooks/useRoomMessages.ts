import { useEffect, useState } from 'react';
import { useSocket, type MessageView } from '@lib/socket';

export interface RoomMessagesState {
  messages: MessageView[];
  isLoaded: boolean;
}

export function useRoomMessages(roomId: string | null, currentUserId: string | undefined): RoomMessagesState {
  const { socket } = useSocket();
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setMessages([]);
    setIsLoaded(false);
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

    socket.on('messages:list', handleMessagesList);
    socket.on('message:new', handleMessageNew);
    socket.on('message:read-receipt', handleReadReceipt);

    return () => {
      socket.off('messages:list', handleMessagesList);
      socket.off('message:new', handleMessageNew);
      socket.off('message:read-receipt', handleReadReceipt);
    };
  }, [socket, roomId, currentUserId]);

  return { messages, isLoaded };
}
