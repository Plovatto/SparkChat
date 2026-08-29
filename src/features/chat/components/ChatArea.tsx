import { useEffect, useRef, useState } from 'react';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import type { User } from '@features/auth';
import type { RoomParticipant, RoomSummary } from '@features/rooms';
import { useTheme } from '@features/theme';
import { useSocket, type MessageView } from '@lib/socket';
import { useRoomMessages } from '../hooks/useRoomMessages';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { ChatHeader } from './ChatHeader';
import { EmptyChatState } from './EmptyChatState';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { RoomInfoPanel } from './RoomInfoPanel';

interface ChatAreaProps {
  room: RoomSummary | null;
  user: User;
  onBack: () => void;
}

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

function getTypingText(typingUserIds: string[], participants: RoomParticipant[]): string | null {
  if (typingUserIds.length === 0) {
    return null;
  }

  const names = typingUserIds
    .map((userId) => participants.find((participant) => participant.id === userId)?.nickname)
    .filter((nickname): nickname is string => Boolean(nickname));

  if (names.length === 1) {
    return `${names[0]} está digitando...`;
  }
  if (names.length === 2) {
    return `${names[0]} e ${names[1]} estão digitando...`;
  }
  return 'Várias pessoas estão digitando...';
}

export function ChatArea({ room, user, onBack }: ChatAreaProps) {
  const { theme } = useTheme();
  const { socket } = useSocket();
  const { messages, typingUserIds } = useRoomMessages(room?.id ?? null, user.id);
  const { notifyTyping, notifyStoppedTyping } = useTypingIndicator(room?.id ?? null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [messageIdPendingDelete, setMessageIdPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setIsInfoOpen(false);
    setSelectedMessageId(null);
  }, [room?.id]);

  useEffect(() => {
    const handleClickOutside = () => setSelectedMessageId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  if (!room) {
    return <EmptyChatState />;
  }

  const handleSend = (content: string) => {
    socket?.emit('message:send', { roomId: room.id, content });
    notifyStoppedTyping();
  };

  const handleLeftGroup = () => {
    setIsInfoOpen(false);
    onBack();
  };

  const confirmDeleteMessage = () => {
    if (messageIdPendingDelete) {
      socket?.emit('message:delete', { messageId: messageIdPendingDelete });
    }
    setSelectedMessageId(null);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.background }}>
      <ChatHeader room={room} currentUserId={user.id} onBack={onBack} onOpenInfo={() => setIsInfoOpen(true)} />
      <RoomInfoPanel isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} room={room} currentUserId={user.id} onLeftGroup={handleLeftGroup} />

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
                  isSelected={selectedMessageId === message.id}
                  onSelect={() => setSelectedMessageId(message.id)}
                  onDelete={() => setMessageIdPendingDelete(message.id)}
                />
              </div>
            </div>
          ))
        )}

        {(() => {
          const typingText = getTypingText(typingUserIds, room.participants);
          if (!typingText) {
            return null;
          }

          return (
            <div
              className="animate__animated animate__fadeInUp animate__faster"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 15px',
                background: theme.surface,
                borderRadius: '15px',
                maxWidth: '200px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
            >
              <div style={{ display: 'flex', gap: '4px' }}>
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    style={{
                      width: '8px',
                      height: '8px',
                      background: theme.primary,
                      borderRadius: '50%',
                      animation: 'typing 1.4s infinite',
                      animationDelay: `${index * 0.2}s`,
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: '0.85rem', color: theme.textSecondary, fontStyle: 'italic' }}>{typingText}</span>
            </div>
          );
        })()}

        <div ref={messagesEndRef} />
      </div>

      <MessageInput onSend={handleSend} onTyping={notifyTyping} />

      <ConfirmDialog
        isOpen={messageIdPendingDelete !== null}
        title="Deletar mensagem"
        message="Tem certeza que deseja deletar esta mensagem para todos?"
        onConfirm={confirmDeleteMessage}
        onCancel={() => setMessageIdPendingDelete(null)}
        theme={theme}
      />
    </div>
  );
}
