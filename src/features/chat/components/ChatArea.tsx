import { useEffect, useRef } from 'react';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import type { User } from '@features/auth';
import { DEFAULT_ROOM_THEME } from '@features/rooms/constants/default-theme';
import type { RoomSummary } from '@features/rooms';
import { useSocket, type MessageView } from '@lib/socket';
import { useRoomMessages } from '../hooks/useRoomMessages';
import { ChatHeader } from './ChatHeader';
import { EmptyChatState } from './EmptyChatState';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';

interface ChatAreaProps {
  room: RoomSummary | null;
  user: User;
}

const theme = DEFAULT_ROOM_THEME;

function formatDateSeparator(timestamp: string): string {
  const date = new Date(timestamp);
  if (isToday(date)) {
    return 'Hoje';
  }
  if (isYesterday(date)) {
    return 'Ontem';
  }
  return format(date, 'dd/MM/yyyy');
}

function shouldShowDateSeparator(current: MessageView, previous: MessageView | undefined): boolean {
  if (!previous) {
    return true;
  }
  return !isSameDay(new Date(current.timestamp), new Date(previous.timestamp));
}

export function ChatArea({ room, user }: ChatAreaProps) {
  const { socket } = useSocket();
  const { messages } = useRoomMessages(room?.id ?? null, user.id);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!room) {
    return <EmptyChatState />;
  }

  const handleSend = (content: string) => {
    socket?.emit('message:send', { roomId: room.id, content });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.background }}>
      <ChatHeader room={room} currentUserId={user.id} />

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          background: theme.background,
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '300px',
              color: theme.textSecondary,
              fontSize: '1.1rem',
              fontWeight: 500,
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '2.5rem', opacity: 0.5 }}>💬</div>
            <div>Nenhuma mensagem ainda</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>Comece a conversa enviando uma mensagem!</div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={message.id}>
              {shouldShowDateSeparator(message, messages[index - 1]) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0', justifyContent: 'center' }}>
                  <div style={{ flex: 1, height: '1px', background: theme.textSecondary, opacity: 0.3 }} />
                  <span
                    style={{
                      fontSize: '0.85rem',
                      color: theme.textSecondary,
                      opacity: 0.7,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      padding: '0 10px',
                    }}
                  >
                    {formatDateSeparator(message.timestamp)}
                  </span>
                  <div style={{ flex: 1, height: '1px', background: theme.textSecondary, opacity: 0.3 }} />
                </div>
              )}
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: message.sender.id === user.id ? 'flex-end' : 'flex-start',
                }}
              >
                <MessageBubble
                  message={message}
                  isOwn={message.sender.id === user.id}
                  isGroupChat={room.type === 'group'}
                  participants={room.participants}
                  currentUserId={user.id}
                  currentNickname={user.nickname}
                />
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <MessageInput onSend={handleSend} />
    </div>
  );
}
