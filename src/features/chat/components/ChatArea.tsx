import { useEffect, useRef, useState } from 'react';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { Button } from 'react-bootstrap';
import { FaPlay } from 'react-icons/fa';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { Spinner } from '@components/common/Spinner';
import type { User } from '@features/auth';
import type { RoomParticipant, RoomSummary } from '@features/rooms';
import { useTheme } from '@features/theme';
import { formatAudioTime } from '@lib/format';
import { useSocket, type MessageView } from '@lib/socket';
import { uploadChatAudio, uploadChatImage } from '../api/chat-api';
import { useRoomMessages } from '../hooks/useRoomMessages';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { ChatHeader } from './ChatHeader';
import { EmptyChatState } from './EmptyChatState';
import { MessageBubble, type CurrentAudioRef } from './MessageBubble';
import { MessageListSkeleton } from './MessageListSkeleton';
import {
  MessageInput,
  type AudioSendPayload,
  type MessageInputHandle,
  type MessageInputSubmitPayload,
} from './MessageInput';
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

function getRecordingText(recordingUserIds: string[], participants: RoomParticipant[]): string | null {
  if (recordingUserIds.length === 0) {
    return null;
  }

  if (recordingUserIds.length === 1) {
    const nickname = participants.find((participant) => participant.id === recordingUserIds[0])?.nickname ?? 'Usuário';
    return `${nickname} está gravando áudio...`;
  }

  return `${recordingUserIds.length} pessoas estão gravando áudio...`;
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
  const { theme, getRoomWallpaper } = useTheme();
  const { socket } = useSocket();
  const { messages, isLoaded: areMessagesLoaded, typingUserIds, recordingUserIds, sendMessage, retryMessage } =
    useRoomMessages(room?.id ?? null, { id: user.id ?? '', nickname: user.nickname, avatar: user.avatar });
  const { notifyTyping, notifyStoppedTyping } = useTypingIndicator(room?.id ?? null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<MessageInputHandle>(null);
  const currentAudioRef = useRef<CurrentAudioRef | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [messageIdPendingDelete, setMessageIdPendingDelete] = useState<string | null>(null);
  const [repliedMessage, setRepliedMessage] = useState<MessageView | null>(null);
  const [uploadingMediaType, setUploadingMediaType] = useState<'image' | 'audio' | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setIsInfoOpen(false);
    setSelectedMessageId(null);
    setRepliedMessage(null);
  }, [room?.id]);

  useEffect(() => {
    const handleClickOutside = () => setSelectedMessageId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  if (!room) {
    return <EmptyChatState />;
  }

  const sendImageMessage = async (file: File, replyTo: MessageView | null) => {
    setUploadingMediaType('image');
    try {
      const content = await uploadChatImage(file);
      sendMessage({ content, type: 'image', replyTo });
    } catch (error) {
      console.error(error);
      window.alert('Não foi possível enviar a imagem. Tente novamente.');
    } finally {
      setUploadingMediaType(null);
    }
  };

  const handleSendAudio = async ({ blob, mimeType, duration }: AudioSendPayload) => {
    setUploadingMediaType('audio');
    try {
      const content = await uploadChatAudio(blob, mimeType);
      sendMessage({ content, type: 'audio', duration, replyTo: repliedMessage });
      setRepliedMessage(null);
    } catch (error) {
      console.error(error);
      window.alert('Não foi possível enviar o áudio. Tente novamente.');
    } finally {
      setUploadingMediaType(null);
    }
  };

  const handleRecordingStart = () => {
    socket?.emit('recording:start', { roomId: room.id });
  };

  const handleRecordingStop = () => {
    socket?.emit('recording:stop', { roomId: room.id });
  };

  const handleAudioPlayed = (messageId: string) => {
    socket?.emit('audio:played', { messageId });
  };

  const handleSend = ({ text, imageFile }: MessageInputSubmitPayload) => {
    const trimmed = text.trim();

    if (trimmed) {
      sendMessage({ content: trimmed, type: 'text', replyTo: repliedMessage });
    }

    if (imageFile) {
      void sendImageMessage(imageFile, trimmed ? null : repliedMessage);
    }

    setRepliedMessage(null);
    notifyStoppedTyping();
  };

  const handleReply = (message: MessageView) => {
    setRepliedMessage(message);
    setSelectedMessageId(message.id);
    setTimeout(() => messageInputRef.current?.focus(), 100);
  };

  const handleLeftGroup = () => {
    setIsInfoOpen(false);
    onBack();
  };

  const wallpaper = getRoomWallpaper(room.id);
  const messagesBackground = wallpaper?.background
    ? wallpaper.isImage
      ? `${wallpaper.background} center/cover fixed`
      : wallpaper.background
    : theme.background;

  const confirmDeleteMessage = () => {
    if (messageIdPendingDelete) {
      socket?.emit('message:delete', { messageId: messageIdPendingDelete });
    }
    setSelectedMessageId(null);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.background }}>
      <ChatHeader room={room} currentUserId={user.id} onBack={onBack} onOpenInfo={() => setIsInfoOpen(true)} />
      <RoomInfoPanel
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
        room={room}
        currentUserId={user.id}
        messages={messages}
        onLeftGroup={handleLeftGroup}
      />

      <div
        data-chat-messages
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          background: messagesBackground,
          position: 'relative',
        }}
      >
        {wallpaper?.isImage && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.32)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}
        <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {!areMessagesLoaded ? (
          <MessageListSkeleton />
        ) : messages.length === 0 ? (
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
                  currentAudioRef={currentAudioRef}
                  onSelect={() => setSelectedMessageId(message.id)}
                  onReply={() => handleReply(message)}
                  onDelete={() => setMessageIdPendingDelete(message.id)}
                  onAudioPlayed={handleAudioPlayed}
                  onRetry={() => message.clientTempId && retryMessage(message.clientTempId)}
                />
              </div>
            </div>
          ))
        )}

        {(() => {
          const recordingText = getRecordingText(recordingUserIds, room.participants);
          if (!recordingText) {
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
                background: 'rgba(255, 107, 107, 0.1)',
                borderRadius: '15px',
                maxWidth: '300px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid rgba(255, 107, 107, 0.2)',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '100%',
                  background: '#ff6b6b',
                  animation: 'blink 1s infinite',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '0.85rem', color: '#ff6b6b', fontStyle: 'italic', fontWeight: 500 }}>
                {recordingText}
              </span>
            </div>
          );
        })()}

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

        {uploadingMediaType && (
          <div
            className="animate__animated animate__fadeInUp animate__faster"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 15px',
              background: theme.surface,
              borderRadius: '15px',
              maxWidth: '220px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <Spinner size={16} />
            <span style={{ fontSize: '0.85rem', color: theme.textSecondary, fontStyle: 'italic' }}>
              {uploadingMediaType === 'image' ? 'Enviando imagem...' : 'Enviando áudio...'}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
        </div>
      </div>

      {room.userBlocked && (
        <div
          style={{
            background: '#fff3e0',
            color: '#e65100',
            padding: '12px 18px',
            borderTop: '2px solid #ff9800',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.9rem',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>🚫</span>
          <strong>Você bloqueou este usuário</strong>
        </div>
      )}

      {room.isBlockedBy && (
        <div
          style={{
            background: '#ffebee',
            color: '#c62828',
            padding: '12px 18px',
            borderTop: '2px solid #d32f2f',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.9rem',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>⛔</span>
          <strong>Você foi bloqueado por este usuário</strong>
        </div>
      )}

      {repliedMessage && (
        <div
          style={{
            background: theme.surfaceLight,
            padding: '12px 18px',
            borderLeft: `4px solid ${theme.primary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: `1px solid ${theme.border}`,
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: theme.textSecondary, marginBottom: '4px' }}>
              Respondendo {repliedMessage.sender.id === user.id ? 'a você mesmo' : `a ${repliedMessage.sender.nickname}`}
            </div>
            <div
              style={{
                fontSize: '0.9rem',
                color: theme.text,
                maxWidth: '300px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                overflow: 'hidden',
              }}
            >
              {repliedMessage.type === 'image' ? (
                <img
                  src={repliedMessage.content}
                  alt="thumb"
                  style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                />
              ) : repliedMessage.type === 'audio' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <FaPlay size={12} />
                  <span>Áudio {formatAudioTime(repliedMessage.duration ?? 0)}</span>
                </div>
              ) : (
                <span style={{ display: 'inline-block', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {repliedMessage.content}
                </span>
              )}
            </div>
          </div>
          <Button variant="link" onClick={() => setRepliedMessage(null)} style={{ color: theme.textSecondary, padding: '4px 8px', minWidth: 'auto' }}>
            ✕
          </Button>
        </div>
      )}

      <MessageInput
        ref={messageInputRef}
        onSend={handleSend}
        onSendAudio={(payload) => void handleSendAudio(payload)}
        onTyping={notifyTyping}
        onRecordingStart={handleRecordingStart}
        onRecordingStop={handleRecordingStop}
        isBlockedBy={room.isBlockedBy}
        userBlocked={room.userBlocked}
      />

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
