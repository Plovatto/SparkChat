import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FaBan, FaCheck, FaCopy, FaCrown, FaImage, FaSignOutAlt, FaUserMinus, FaUsers } from 'react-icons/fa';
import { Modal } from '@components/common/Modal';
import { AVATARS } from '@features/auth/constants/avatars';
import { CHAT_BACKGROUNDS, useTheme } from '@features/theme';
import type { RoomParticipant, RoomSummary } from '@features/rooms';
import { downloadFromUrl } from '@lib/download-file';
import { useSocket, type MessageView } from '@lib/socket';
import { isAssistantRoom } from '../utils/assistant';
import { AppearanceEditor } from './AppearanceEditor';
import { GalleryMediaTile } from './GalleryMediaTile';
import { ImageModal } from './ImageModal';
import { PdfPreviewModal } from './PdfPreviewModal';
import { VideoPreviewModal } from './VideoPreviewModal';

interface RoomInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomSummary;
  currentUserId: string | undefined;
  messages: MessageView[];
  messagesLoaded: boolean;
  onLeftGroup: () => void;
}

function getOtherParticipant(room: RoomSummary, userId: string | undefined): RoomParticipant | undefined {
  return room.participants.find((participant) => participant.id !== userId);
}

function getDisplayName(participantId: string, nickname: string, currentUserId: string | undefined): string {
  return participantId === currentUserId ? 'Você' : nickname;
}

function getLastSeen(participant: RoomParticipant): string {
  if (participant.status === 'online') {
    return 'Online';
  }

  if (participant.lastSeen) {
    try {
      return `Visto ${formatDistanceToNow(new Date(participant.lastSeen), { addSuffix: true, locale: ptBR })}`;
    } catch {
      return 'Offline';
    }
  }

  return 'Offline';
}

interface ActionIconButtonProps {
  onClick: () => void;
  title: string;
  color: string;
  background: string;
  border: string;
  children: ReactNode;
}

function ActionIconButton({ onClick, title, color, background, border, children }: ActionIconButtonProps) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        borderRadius: '9px',
        border: `1.5px solid ${border}`,
        background,
        color,
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'transform 0.15s ease, filter 0.15s ease',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = 'translateY(-1px)';
        event.currentTarget.style.filter = 'brightness(1.12)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = 'translateY(0)';
        event.currentTarget.style.filter = 'brightness(1)';
      }}
    >
      {children}
    </button>
  );
}

function useMediaGalleryColumns(): number {
  const [columns, setColumns] = useState(() => (typeof window === 'undefined' || window.innerWidth < 900 ? 3 : 4));

  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px)');
    const update = () => setColumns(query.matches ? 4 : 3);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return columns;
}

function MediaGallery({
  messages,
  messagesLoaded,
  onSelectMedia,
}: {
  messages: MessageView[];
  messagesLoaded: boolean;
  onSelectMedia: (message: MessageView) => void;
}) {
  const { theme } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const columns = useMediaGalleryColumns();

  const mediaMessages = messages.filter(
    (message) => (message.type === 'image' || message.type === 'file') && !message.deletedForEveryone,
  );

  if (!messagesLoaded) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '10px', padding: '3px' }}>
        {Array.from({ length: columns }).map((_, index) => (
          <div key={index} style={{ position: 'relative', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden' }}>
            <div
              className="shimmer-bg"
              style={
                {
                  position: 'absolute',
                  inset: 0,
                  '--shimmer-a': theme.surfaceLight,
                } as CSSProperties
              }
            />
          </div>
        ))}
      </div>
    );
  }

  if (mediaMessages.length === 0) {
    return (
      <div
        style={{
          padding: '20px',
          textAlign: 'center',
          color: theme.textSecondary,
          background: theme.background,
          borderRadius: '10px',
          border: `1px dashed ${theme.border}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <FaImage size={30} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: '0.9rem' }}>Nenhuma mídia compartilhada</div>
      </div>
    );
  }

  const visibleMessages = showAll ? mediaMessages : mediaMessages.slice(0, columns);

  return (
    <div>
      <div
        style={{
          fontSize: '0.85rem',
          color: theme.textSecondary,
          marginBottom: '12px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <FaImage /> Mídias ({mediaMessages.length})
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: '10px',
          padding: '3px',
          maxHeight: showAll ? '300px' : 'none',
          overflowY: showAll ? 'auto' : 'visible',
          overflowX: 'hidden',
        }}
      >
        {visibleMessages.map((message) => (
          <div
            key={message.id}
            onClick={() => onSelectMedia(message)}
            style={{
              aspectRatio: '1',
              borderRadius: '10px',
              overflow: 'hidden',
              cursor: 'pointer',
              border: `2px solid ${theme.border}`,
              transition: 'all 0.3s',
              position: 'relative',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.borderColor = theme.primary;
              event.currentTarget.style.transform = 'scale(1.05)';
              event.currentTarget.style.boxShadow = `0 6px 16px ${theme.primary}40`;
              event.currentTarget.style.zIndex = '10';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.borderColor = theme.border;
              event.currentTarget.style.transform = 'scale(1)';
              event.currentTarget.style.boxShadow = 'none';
              event.currentTarget.style.zIndex = '1';
            }}
          >
            <GalleryMediaTile message={message} theme={theme} />
          </div>
        ))}
      </div>
      {mediaMessages.length > columns && (
        <button
          onClick={() => setShowAll((previous) => !previous)}
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '12px',
            background: `${theme.primary}18`,
            border: 'none',
            color: theme.primary,
            borderRadius: '10px',
            padding: '9px 16px',
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 700,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = `${theme.primary}28`;
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = `${theme.primary}18`;
          }}
        >
          {showAll ? 'Ver menos' : `Ver todas (${mediaMessages.length})`}
        </button>
      )}
    </div>
  );
}

function WallpaperPicker({ roomId }: { roomId: string }) {
  const { theme, getRoomWallpaper, setRoomWallpaper } = useTheme();
  const currentId = getRoomWallpaper(roomId)?.id ?? 'default';

  return (
    <div>
      <div
        style={{
          fontSize: '0.85rem',
          color: theme.textSecondary,
          marginBottom: '12px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <FaImage /> Papel de Parede
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
          maxHeight: '250px',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '3px',
        }}
      >
        {CHAT_BACKGROUNDS.map((background) => {
          const isSelected = currentId === background.id;
          return (
            <div
              key={background.id}
              onClick={() => setRoomWallpaper(roomId, background.id)}
              title={background.name}
              style={{
                height: '80px',
                borderRadius: '10px',
                background: background.isImage
                  ? `${background.background} center/cover no-repeat`
                  : (background.background ?? theme.background),
                cursor: 'pointer',
                border: isSelected ? '3px solid #667eea' : `2px solid ${theme.border}`,
                boxShadow: isSelected ? '0 0 0 2px #667eea40' : 'none',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'scale(1.05)';
                if (!isSelected) {
                  event.currentTarget.style.borderColor = theme.primary;
                }
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'scale(1)';
                if (!isSelected) {
                  event.currentTarget.style.borderColor = theme.border;
                }
              }}
            >
              <div
                style={{
                  width: '100%',
                  padding: '5px',
                  background: 'rgba(0,0,0,0.5)',
                  color: 'white',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              >
                {background.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RoomInfoPanel({ isOpen, onClose, room, currentUserId, messages, messagesLoaded, onLeftGroup }: RoomInfoPanelProps) {
  const { theme } = useTheme();
  const { socket } = useSocket();
  const [codeCopied, setCodeCopied] = useState(false);
  const [copiedParticipantId, setCopiedParticipantId] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MessageView | null>(null);

  const otherUser = room.type === 'private' ? getOtherParticipant(room, currentUserId) : undefined;
  const avatar = otherUser ? AVATARS[otherUser.avatar] : undefined;
  const isCurrentUserAdmin = room.participants.some((participant) => participant.id === currentUserId && participant.isAdmin);
  const isSelectedMediaVideo = selectedMedia?.type === 'file' && Boolean(selectedMedia.fileMeta?.mimeType.startsWith('video/'));
  const isSelectedMediaPdf = selectedMedia?.type === 'file' && selectedMedia.fileMeta?.mimeType === 'application/pdf';

  const handleSelectMedia = (message: MessageView) => {
    if (message.type === 'file' && !message.fileMeta?.mimeType.startsWith('video/') && message.fileMeta?.mimeType !== 'application/pdf') {
      void downloadFromUrl(message.content, message.fileMeta?.name ?? 'arquivo');
      return;
    }
    setSelectedMedia(message);
  };

  const copyCode = (code: string, participantId?: string) => {
    if (!navigator.clipboard) {
      return;
    }

    navigator.clipboard
      .writeText(code)
      .then(() => {
        if (participantId) {
          setCopiedParticipantId(participantId);
          setTimeout(() => setCopiedParticipantId(null), 2000);
        } else {
          setCodeCopied(true);
          setTimeout(() => setCodeCopied(false), 2000);
        }
      })
      .catch(() => undefined);
  };

  const handleBlock = () => {
    if (otherUser) {
      socket?.emit('user:block', { roomId: room.id, blockedUserId: otherUser.id });
      onClose();
    }
  };

  const handleUnblock = () => {
    if (otherUser) {
      socket?.emit('user:unblock', { roomId: room.id, blockedUserId: otherUser.id });
      onClose();
    }
  };

  const handleLeaveGroup = () => {
    socket?.emit('group:leave', { roomId: room.id });
    onLeftGroup();
  };

  const handlePromoteAdmin = (userId: string) => {
    socket?.emit('group:promote-admin', { roomId: room.id, userId });
  };

  const handleRemoveMember = (userId: string) => {
    socket?.emit('group:remove-member', { roomId: room.id, userId });
  };

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title={room.type === 'group' ? room.name : otherUser?.nickname} theme={theme}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {room.type === 'private' && otherUser && (
          <>
            <div style={{ textAlign: 'center', paddingBottom: '15px', borderBottom: `1px solid ${theme.border}` }}>
              <div
                style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '50%',
                  background: `${theme.primary}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 15px',
                  boxShadow: `0 5px 20px ${theme.primary}20`,
                  position: 'relative',
                  border: `3px solid ${theme.primary}`,
                }}
              >
                {avatar && <avatar.icon size={50} color={theme.primary} />}
                {otherUser.status === 'online' && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '5px',
                      right: '5px',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#4caf50',
                      border: '4px solid white',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }}
                  />
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', margin: '0 0 15px 0' }}>
                <h3 style={{ margin: 0, lineHeight: 1, fontSize: '1.6rem', fontWeight: 700, color: theme.text }}>{otherUser.nickname}</h3>
                <button
                  onClick={() => copyCode(otherUser.nickname)}
                  title="Copiar username"
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '6px',
                    border: 'none',
                    background: `${theme.primary}20`,
                    color: theme.primary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    alignSelf: 'center',
                    position: 'relative',
                    top: '2px',
                    cursor: 'pointer',
                    flexShrink: 0,
                    padding: 0,
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = `${theme.primary}30`;
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = `${theme.primary}20`;
                  }}
                >
                  {codeCopied ? <FaCheck size={13} /> : <FaCopy size={13} />}
                </button>
              </div>
            </div>

            <div style={{ padding: '15px', background: theme.background, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
              <div
                style={{
                  fontSize: '0.85rem',
                  color: theme.textSecondary,
                  marginBottom: '8px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Status
              </div>
              <div
                style={{
                  fontSize: '1rem',
                  color: otherUser.status === 'online' ? '#4caf50' : theme.text,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {getLastSeen(otherUser)}
              </div>
            </div>

            <MediaGallery messages={messages} messagesLoaded={messagesLoaded} onSelectMedia={handleSelectMedia} />

            <WallpaperPicker roomId={room.id} />

            <AppearanceEditor roomId={room.id} />

            {!isAssistantRoom(room) && (
            <div style={{ display: 'flex', gap: '10px', paddingTop: '20px', borderTop: `1px solid ${theme.border}` }}>
              {room.userBlocked ? (
                <button
                  onClick={handleUnblock}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: '#ff9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = '#e68900';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = '#ff9800';
                  }}
                >
                  <FaBan size={16} />
                  Desbloquear Usuário
                </button>
              ) : (
                <button
                  onClick={handleBlock}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: '#ff4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = '#cc0000';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = '#ff4444';
                  }}
                >
                  <FaBan size={16} />
                  Bloquear Usuário
                </button>
              )}
            </div>
            )}
          </>
        )}

        {room.type === 'group' && (
          <>
            <div style={{ textAlign: 'center', paddingBottom: '15px', borderBottom: `1px solid ${theme.border}` }}>
              <div
                style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  background: `${theme.primary}30`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 15px',
                  boxShadow: `0 5px 20px ${theme.primary}33`,
                  border: `3px solid ${theme.primary}`,
                }}
              >
                <FaUsers size={45} color={theme.primary} />
              </div>

              <h3 style={{ margin: '0 0 10px 0', fontSize: '1.6rem', fontWeight: 700, color: theme.text }}>{room.name}</h3>

              <div style={{ fontSize: '0.9rem', color: theme.textSecondary, fontWeight: 500 }}>
                {room.participants.length} {room.participants.length === 1 ? 'membro' : 'membros'}
              </div>
            </div>

            <div
              style={{
                padding: '15px',
                background: theme.background,
                borderRadius: '12px',
                border: `1px solid ${theme.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: `${theme.primary}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FaCrown size={18} color={theme.primary} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: theme.textSecondary,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Criado por
                </div>
                <div
                  style={{
                    fontSize: '1rem',
                    color: theme.text,
                    fontWeight: 600,
                    marginTop: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {room.creatorId === currentUserId ? 'Você' : (room.createdBy ?? 'Desconhecido')}
                </div>
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.85rem',
                  color: theme.textSecondary,
                  marginBottom: '12px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <FaUsers /> Membros ({room.participants.length})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '320px', overflowY: 'auto', paddingRight: '6px' }}>
                {room.participants.map((participant) => {
                  const avatar = AVATARS[participant.avatar];
                  const canManage = isCurrentUserAdmin && participant.id !== currentUserId;

                  return (
                    <div
                      key={participant.id}
                      style={{
                        padding: '10px 12px',
                        background: theme.background,
                        borderRadius: '12px',
                        border: `1px solid ${theme.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.borderColor = theme.primary;
                        event.currentTarget.style.boxShadow = `0 2px 10px ${theme.primary}1A`;
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.borderColor = theme.border;
                        event.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div
                        style={{
                          position: 'relative',
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: `${theme.primary}20`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {avatar && <avatar.icon size={20} color={theme.primary} />}
                        {participant.status === 'online' && (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: '-1px',
                              right: '-1px',
                              width: '11px',
                              height: '11px',
                              borderRadius: '50%',
                              background: '#4caf50',
                              border: `2px solid ${theme.background}`,
                            }}
                          />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: theme.text, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getDisplayName(participant.id, participant.nickname, currentUserId)}
                          </span>
                          {participant.isAdmin && (
                            <FaCrown size={12} color={theme.primary} title="Administrador" style={{ flexShrink: 0 }} />
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: theme.textSecondary, marginTop: '2px' }}>
                          {getLastSeen(participant)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <ActionIconButton
                          onClick={() => copyCode(participant.nickname, participant.id)}
                          title="Copiar username"
                          color={theme.primary}
                          background={`${theme.primary}15`}
                          border={theme.primary}
                        >
                          {copiedParticipantId === participant.id ? <FaCheck size={13} /> : <FaCopy size={13} />}
                        </ActionIconButton>

                        {canManage && !participant.isAdmin && (
                          <ActionIconButton
                            onClick={() => handlePromoteAdmin(participant.id)}
                            title="Promover a administrador"
                            color={theme.primary}
                            background={`${theme.primary}15`}
                            border={theme.primary}
                          >
                            <FaCrown size={13} />
                          </ActionIconButton>
                        )}

                        {canManage && (
                          <ActionIconButton
                            onClick={() => handleRemoveMember(participant.id)}
                            title="Remover do grupo"
                            color="#f44336"
                            background="rgba(244, 67, 54, 0.1)"
                            border="#f44336"
                          >
                            <FaUserMinus size={13} />
                          </ActionIconButton>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <MediaGallery messages={messages} messagesLoaded={messagesLoaded} onSelectMedia={handleSelectMedia} />

            <WallpaperPicker roomId={room.id} />

            <AppearanceEditor roomId={room.id} />

            <div
              style={{
                padding: '15px',
                background: 'rgba(255, 152, 0, 0.1)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 152, 0, 0.3)',
                marginTop: '15px',
              }}
            >
              <button
                onClick={handleLeaveGroup}
                style={{
                  width: '100%',
                  padding: '12px 15px',
                  background: '#ff9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 8px rgba(255, 152, 0, 0.3)',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = '#f57c00';
                  event.currentTarget.style.transform = 'translateY(-2px)';
                  event.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 152, 0, 0.5)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = '#ff9800';
                  event.currentTarget.style.transform = 'translateY(0)';
                  event.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 152, 0, 0.3)';
                }}
              >
                <FaSignOutAlt size={16} />
                Sair do Grupo
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
    <ImageModal
      isOpen={selectedMedia?.type === 'image'}
      images={selectedMedia?.type === 'image' ? [selectedMedia.content] : []}
      onClose={() => setSelectedMedia(null)}
    />
    {selectedMedia && isSelectedMediaVideo && (
      <VideoPreviewModal
        isOpen
        onClose={() => setSelectedMedia(null)}
        url={selectedMedia.content}
        fileName={selectedMedia.fileMeta?.name ?? 'Vídeo.mp4'}
      />
    )}
    {selectedMedia && isSelectedMediaPdf && (
      <PdfPreviewModal
        isOpen
        onClose={() => setSelectedMedia(null)}
        url={selectedMedia.content}
        fileName={selectedMedia.fileMeta?.name ?? 'Documento.pdf'}
      />
    )}
    </>
  );
}
