import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { Button } from 'react-bootstrap';
import { FaBan, FaComments, FaExclamationTriangle, FaPlay, FaTimes } from 'react-icons/fa';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { Spinner } from '@components/common/Spinner';
import type { User } from '@features/auth';
import type { RoomParticipant, RoomSummary } from '@features/rooms';
import { useTheme } from '@features/theme';
import { formatAudioTime } from '@lib/format';
import { useSocket, type MessageView } from '@lib/socket';
import { uploadChatAudio, uploadChatImage } from '../api/chat-api';
import { useRoomMessages } from '../hooks/useRoomMessages';
import type { ChatMessage } from '../types';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { ChatHeader } from './ChatHeader';
import { EmptyChatState } from './EmptyChatState';
import { ImageGroupBubble, MessageBubble, type CurrentAudioRef } from './MessageBubble';
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

type RenderItem = { kind: 'single'; message: ChatMessage } | { kind: 'image-group'; messages: ChatMessage[] };

function buildRenderItems(messages: ChatMessage[]): RenderItem[] {
  const items: RenderItem[] = [];
  let buffer: ChatMessage[] = [];

  const flushBuffer = () => {
    if (buffer.length === 0) {
      return;
    }
    if (buffer.length === 1) {
      items.push({ kind: 'single', message: buffer[0]! });
    } else {
      items.push({ kind: 'image-group', messages: buffer });
    }
    buffer = [];
  };

  for (const message of messages) {
    const isGroupable = message.type === 'image' && !message.deletedForEveryone && !message.pending && !message.failed;
    const bufferTail = buffer[buffer.length - 1];

    if (isGroupable && (!bufferTail || (bufferTail.sender.id === message.sender.id && isSameDay(new Date(bufferTail.timestamp), new Date(message.timestamp))))) {
      buffer.push(message);
      continue;
    }

    flushBuffer();

    if (isGroupable) {
      buffer.push(message);
    } else {
      items.push({ kind: 'single', message });
    }
  }
  flushBuffer();

  return items;
}

function renderItemFirstMessage(item: RenderItem): ChatMessage {
  return item.kind === 'single' ? item.message : item.messages[0]!;
}

function renderItemAnchorMessage(item: RenderItem): ChatMessage {
  return item.kind === 'single' ? item.message : item.messages[item.messages.length - 1]!;
}

function renderItemKey(item: RenderItem): string {
  return item.kind === 'single' ? item.message.id : `group-${item.messages[0]!.id}`;
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

  const captureScrollAnchor = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      prependAnchorRef.current = { scrollHeight: container.scrollHeight, scrollTop: container.scrollTop };
    }
  }, []);

  const {
    messages,
    isLoaded: areMessagesLoaded,
    hasMoreOlder,
    isLoadingOlder,
    typingUserIds,
    recordingUserIds,
    sendMessage,
    retryMessage,
    loadOlderMessages,
  } = useRoomMessages(
    room?.id ?? null,
    { id: user.id ?? '', nickname: user.nickname, avatar: user.avatar },
    captureScrollAnchor,
  );
  const { notifyTyping, notifyStoppedTyping } = useTypingIndicator(room?.id ?? null);
  const renderItems = useMemo(() => buildRenderItems(messages), [messages]);
  const lastMessageIdRef = useRef<string | null>(null);
  const isReadyForLoadMoreRef = useRef(false);
  const hasUserScrolledRef = useRef(false);
  const messageInputRef = useRef<MessageInputHandle>(null);
  const currentAudioRef = useRef<CurrentAudioRef | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [messageIdPendingDelete, setMessageIdPendingDelete] = useState<string | null>(null);
  const [repliedMessage, setRepliedMessage] = useState<MessageView | null>(null);
  const [uploadingMediaType, setUploadingMediaType] = useState<'image' | 'audio' | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const lastId = lastMessage?.id ?? null;
    if (lastId === lastMessageIdRef.current) {
      return;
    }
    const isInitialPopulation = lastMessageIdRef.current === null;
    lastMessageIdRef.current = lastId;

    const container = scrollContainerRef.current;
    if (!lastId || !container) {
      return;
    }

    if (isInitialPopulation) {
      scrollToBottom();
      isReadyForLoadMoreRef.current = false;
      let secondFrame = 0;
      const firstFrame = requestAnimationFrame(() => {
        scrollToBottom();
        secondFrame = requestAnimationFrame(() => {
          scrollToBottom();
          isReadyForLoadMoreRef.current = true;
        });
      });
      const timeout = window.setTimeout(() => {
        scrollToBottom();
        isReadyForLoadMoreRef.current = true;
      }, 250);
      return () => {
        cancelAnimationFrame(firstFrame);
        cancelAnimationFrame(secondFrame);
        window.clearTimeout(timeout);
      };
    }

    scrollToBottom('smooth');
  }, [messages, scrollToBottom]);

  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    const container = scrollContainerRef.current;
    if (!anchor || !container) {
      return;
    }
    prependAnchorRef.current = null;

    const applyAnchorCorrection = () => {
      container.scrollTop = anchor.scrollTop + (container.scrollHeight - anchor.scrollHeight);
    };
    applyAnchorCorrection();

    const observer = new ResizeObserver(applyAnchorCorrection);
    if (contentWrapperRef.current) {
      observer.observe(contentWrapperRef.current);
    }
    const settleTimeout = window.setTimeout(() => observer.disconnect(), 800);

    return () => {
      observer.disconnect();
      window.clearTimeout(settleTimeout);
    };
  }, [messages]);

  useEffect(() => {
    isReadyForLoadMoreRef.current = false;
    hasUserScrolledRef.current = false;
    lastMessageIdRef.current = null;
    prependAnchorRef.current = null;
    scrollToBottom();
  }, [room?.id, scrollToBottom]);

  const markUserScrolled = () => {
    hasUserScrolledRef.current = true;
  };

  const handleMessagesScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || !hasUserScrolledRef.current || !isReadyForLoadMoreRef.current || !hasMoreOlder || isLoadingOlder) {
      return;
    }
    if (container.scrollTop < 150) {
      loadOlderMessages();
    }
  };

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

  const sendImageMessages = async (files: File[], replyTo: MessageView | null) => {
    setUploadingMediaType('image');
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        if (!file) {
          continue;
        }
        const content = await uploadChatImage(file);
        sendMessage({ content, type: 'image', replyTo: index === 0 ? replyTo : null });
      }
    } catch (error) {
      console.error(error);
      window.alert('Não foi possível enviar uma das imagens. Tente novamente.');
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

  const handleSend = ({ text, imageFiles }: MessageInputSubmitPayload) => {
    const trimmed = text.trim();

    if (trimmed) {
      sendMessage({ content: trimmed, type: 'text', replyTo: repliedMessage });
    }

    if (imageFiles.length > 0) {
      void sendImageMessages(imageFiles, trimmed ? null : repliedMessage);
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
        messagesLoaded={areMessagesLoaded}
        onLeftGroup={handleLeftGroup}
      />

      <div
        ref={scrollContainerRef}
        onScroll={handleMessagesScroll}
        onWheel={markUserScrolled}
        onTouchMove={markUserScrolled}
        data-chat-messages
        className="chat-messages-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
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
        <div ref={contentWrapperRef} style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
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
            <FaComments size={40} style={{ opacity: 0.5 }} />
            <div>Nenhuma mensagem ainda</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>Comece a conversa enviando uma mensagem!</div>
          </div>
        ) : (
          <>
            {isLoadingOlder && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 2px' }}>
                <Spinner size={20} />
              </div>
            )}
            {renderItems.map((item, index) => {
            const firstMessage = renderItemFirstMessage(item);
            const anchorMessage = renderItemAnchorMessage(item);
            const previousItem = renderItems[index - 1];
            const isOwn = anchorMessage.sender.id === user.id;

            return (
              <div key={renderItemKey(item)}>
                {shouldShowDateSeparator(firstMessage, previousItem ? renderItemAnchorMessage(previousItem) : undefined) && (
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
                      {formatDateSeparator(firstMessage.timestamp)}
                    </span>
                    <div style={{ flex: 1, height: '1px', background: theme.textSecondary, opacity: 0.3 }} />
                  </div>
                )}
                <div style={{ width: '100%', display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                  {item.kind === 'single' ? (
                    <MessageBubble
                      message={item.message}
                      isOwn={isOwn}
                      isGroupChat={room.type === 'group'}
                      participants={room.participants}
                      currentUserId={user.id}
                      currentNickname={user.nickname}
                      isSelected={selectedMessageId === item.message.id}
                      currentAudioRef={currentAudioRef}
                      onSelect={() => setSelectedMessageId(item.message.id)}
                      onReply={() => handleReply(item.message)}
                      onDelete={() => setMessageIdPendingDelete(item.message.id)}
                      onAudioPlayed={handleAudioPlayed}
                      onRetry={() => item.message.clientTempId && retryMessage(item.message.clientTempId)}
                    />
                  ) : (
                    <ImageGroupBubble
                      images={item.messages}
                      isOwn={isOwn}
                      isGroupChat={room.type === 'group'}
                      participants={room.participants}
                      currentUserId={user.id}
                      isSelected={selectedMessageId === anchorMessage.id}
                      onSelect={() => setSelectedMessageId(anchorMessage.id)}
                      onReply={() => handleReply(anchorMessage)}
                      onDelete={() => setMessageIdPendingDelete(anchorMessage.id)}
                      onRetry={() => anchorMessage.clientTempId && retryMessage(anchorMessage.clientTempId)}
                    />
                  )}
                </div>
              </div>
            );
            })}
          </>
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
          <FaBan size={16} />
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
          <FaExclamationTriangle size={16} />
          <strong>Você foi bloqueado por este usuário</strong>
        </div>
      )}

      {repliedMessage && (
        <div
          className="chat-preview-bar"
          style={{
            background: theme.surfaceLight,
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
          <Button
            variant="link"
            onClick={() => setRepliedMessage(null)}
            style={{ color: theme.textSecondary, padding: '4px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center' }}
          >
            <FaTimes size={14} />
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
