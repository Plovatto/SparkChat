import { useState } from 'react';
import { format } from 'date-fns';
import { FaBan, FaCheck, FaImage, FaReply, FaTrash } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import type { RoomParticipant } from '@features/rooms';
import type { MessageView } from '@lib/socket';
import { ImageModal } from './ImageModal';

interface MessageBubbleProps {
  message: MessageView;
  isOwn: boolean;
  isGroupChat: boolean;
  participants: RoomParticipant[];
  currentUserId: string | undefined;
  currentNickname: string;
  isSelected: boolean;
  onSelect: () => void;
  onReply: () => void;
  onDelete: () => void;
}

interface MessageStatusInfo {
  icon: 'single' | 'double';
  color: string;
}

const MAX_PREVIEW_LENGTH = 200;

function processSystemMessage(content: string, currentNickname: string): string {
  if (!currentNickname) {
    return content;
  }
  return content.replace(new RegExp(`\\b${currentNickname}\\b`, 'g'), 'Você');
}

function getDisplayName(senderId: string, nickname: string, currentUserId: string | undefined): string {
  return senderId === currentUserId ? 'Você' : nickname;
}

function getMessageStatus(
  message: MessageView,
  isOwn: boolean,
  isGroupChat: boolean,
  participants: RoomParticipant[],
  currentUserId: string | undefined,
): MessageStatusInfo | null {
  if (!isOwn) {
    return null;
  }

  const { status, readBy, deliveredTo } = message;

  if (isGroupChat && participants.length > 0) {
    const others = participants.filter((participant) => participant.id !== currentUserId);

    if (readBy.length > 0 && others.every((participant) => readBy.includes(participant.id))) {
      return { icon: 'double', color: '#4FC3F7' };
    }
    if (deliveredTo.length > 0 && others.every((participant) => deliveredTo.includes(participant.id))) {
      return { icon: 'double', color: 'white' };
    }
    return { icon: 'single', color: 'white' };
  }

  if (readBy.length > 0 && readBy.some((id) => id !== currentUserId)) {
    return { icon: 'double', color: '#4FC3F7' };
  }
  if (status === 'delivered') {
    return { icon: 'double', color: 'white' };
  }
  return { icon: 'single', color: 'white' };
}

export function MessageBubble({
  message,
  isOwn,
  isGroupChat,
  participants,
  currentUserId,
  currentNickname,
  isSelected,
  onSelect,
  onReply,
  onDelete,
}: MessageBubbleProps) {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  if (message.deletedForEveryone) {
    return (
      <div
        className="animate__animated animate__fadeInUp animate__faster"
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-end',
          maxWidth: '60%',
          alignSelf: isOwn ? 'flex-end' : 'flex-start',
          marginBottom: '7px',
        }}
      >
        <div
          style={{
            margin: '7px 0',
            background: theme.background,
            color: theme.text,
            borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            padding: '12px 16px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
            fontStyle: 'italic',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <FaBan size={14} />
          <p style={{ margin: 0 }}>Mensagem deletada</p>
        </div>
      </div>
    );
  }

  if (message.type === 'system') {
    return (
      <div
        className="animate__animated animate__fadeIn"
        style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '15px 0' }}
      >
        <div
          style={{
            background: theme.primary,
            color: theme.headerTextColor,
            borderRadius: '12px',
            padding: '8px 16px',
            fontSize: '0.85rem',
            textAlign: 'center',
            maxWidth: '80%',
            fontStyle: 'italic',
            fontWeight: 500,
          }}
        >
          <p style={{ margin: 0, lineHeight: 1.4 }}>{processSystemMessage(message.content, currentNickname)}</p>
          <span style={{ fontSize: '0.7rem', opacity: 0.7, display: 'block', marginTop: '4px' }}>
            {format(new Date(message.timestamp), 'HH:mm')}
          </span>
        </div>
      </div>
    );
  }

  const statusInfo = getMessageStatus(message, isOwn, isGroupChat, participants, currentUserId);
  const isImageMessage = message.type === 'image';
  const showExpand = !isImageMessage && message.content.length > MAX_PREVIEW_LENGTH;
  const displayContent = showExpand && !isExpanded ? `${message.content.substring(0, MAX_PREVIEW_LENGTH)}...` : message.content;

  return (
    <div
      className="animate__animated animate__fadeInUp animate__faster"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        alignItems: isOwn ? 'flex-end' : 'flex-start',
        maxWidth: '60%',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: '7px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexDirection: isOwn ? 'row-reverse' : 'row' }}>
        <div
          style={{
            background: isOwn ? theme.messageOwn : theme.messageOther,
            color: isOwn ? theme.messageOwnText : theme.messageOtherText,
            borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            padding: isImageMessage ? '12px 16px 10px 16px' : '0 16px 10px 16px',
            boxShadow: isOwn ? '0 2px 10px rgba(0, 0, 0, 0.2)' : '0 2px 8px rgba(0, 0, 0, 0.08)',
            wordBreak: 'break-word',
          }}
        >
          {!isOwn && isGroupChat && (
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: theme.primary, margin: '12px 0 4px 3px' }}>
              {getDisplayName(message.sender.id, message.sender.nickname, currentUserId)}
            </div>
          )}

          {message.replyTo && (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                borderLeft: `3px solid ${isOwn ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}`,
                padding: '8px 40px 12px 12px',
                marginBottom: '8px',
                borderRadius: '4px',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ fontWeight: 600, opacity: 0.8 }}>
                {getDisplayName(message.replyTo.sender.id, message.replyTo.sender.nickname, currentUserId)}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  opacity: 0.7,
                }}
              >
                {message.replyTo.type === 'image' ? (
                  <>
                    <FaImage size={12} style={{ flexShrink: 0 }} />
                    <span>Imagem</span>
                  </>
                ) : (
                  message.replyTo.content
                )}
              </div>
            </div>
          )}

          <div style={{ margin: '10px 6px 6px 6px' }}>
            {isImageMessage ? (
              <img
                src={message.content}
                alt="Imagem enviada"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsImageModalOpen(true);
                }}
                style={{
                  maxWidth: '100%',
                  maxHeight: '400px',
                  borderRadius: '12px',
                  display: 'block',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.95rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    fontWeight: 500,
                    wordBreak: 'break-word',
                  }}
                >
                  {displayContent}
                </p>
                {showExpand && (
                  <button
                    onClick={() => setIsExpanded((previous) => !previous)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: theme.primary,
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      padding: '4px 0',
                      alignSelf: 'flex-start',
                      borderBottom: `2px solid ${theme.primary}`,
                    }}
                  >
                    {isExpanded ? '↑ Ver menos' : '↓ Ver mais'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', width: '100%' }}>
            <span
              style={{
                fontSize: '0.7rem',
                opacity: 0.6,
                color: isOwn ? theme.messageOwnText : theme.messageOtherText,
                fontWeight: 500,
              }}
            >
              {format(new Date(message.timestamp), 'HH:mm')}
            </span>
            {statusInfo && (
              <div style={{ display: 'flex', alignItems: 'center', opacity: isOwn ? 0.9 : 0.7, marginLeft: '6px' }}>
                {statusInfo.icon === 'double' ? (
                  <>
                    <FaCheck size={11} color={statusInfo.color} style={{ marginLeft: '-6px' }} />
                    <FaCheck size={11} color={statusInfo.color} style={{ marginLeft: '-6px' }} />
                  </>
                ) : (
                  <FaCheck size={11} color={statusInfo.color} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isSelected && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            right: isOwn ? 'auto' : '-55px',
            left: isOwn ? '-100px' : 'auto',
            display: 'flex',
            gap: '8px',
            zIndex: 1000,
          }}
        >
          <button
            onClick={(event) => {
              event.stopPropagation();
              onReply();
            }}
            title="Responder"
            style={{
              background: theme.primary,
              opacity: 0.6,
              border: 'none',
              color: 'white',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '0.9rem',
              padding: 0,
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = theme.secondary;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = theme.primary;
            }}
          >
            <FaReply size={14} />
          </button>

          {isOwn && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              title="Deletar para todos"
              style={{
                background: '#ef5350',
                opacity: 0.6,
                border: 'none',
                color: 'white',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '0.9rem',
                padding: 0,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = '#d32f2f';
                event.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = '#ef5350';
                event.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <FaTrash size={14} />
            </button>
          )}
        </div>
      )}

      {isImageMessage && (
        <ImageModal isOpen={isImageModalOpen} imageSrc={message.content} onClose={() => setIsImageModalOpen(false)} />
      )}
    </div>
  );
}
