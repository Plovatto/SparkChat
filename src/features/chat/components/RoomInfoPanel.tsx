import { useEffect, useState, type CSSProperties } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FaBan, FaCheck, FaCopy, FaCrown, FaImage, FaSignOutAlt, FaUserSlash, FaUsers } from 'react-icons/fa';
import { Modal } from '@components/common/Modal';
import { AVATARS } from '@features/auth/constants/avatars';
import { CHAT_BACKGROUNDS, useTheme } from '@features/theme';
import type { ThemePalette } from '@features/theme';
import type { RoomParticipant, RoomSummary } from '@features/rooms';
import { useSocket, type MessageView } from '@lib/socket';
import { AppearanceEditor } from './AppearanceEditor';
import { ImageModal } from './ImageModal';

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

function MediaThumbnail({ src, theme }: { src: string; theme: ThemePalette }) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <>
      {!isLoaded && (
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
      )}
      <img
        src={src}
        alt="Mídia"
        onLoad={() => setIsLoaded(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          opacity: isLoaded ? 1 : 0,
          transition: 'opacity 0.25s ease',
        }}
      />
    </>
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
  onSelectImage,
}: {
  messages: MessageView[];
  messagesLoaded: boolean;
  onSelectImage: (src: string) => void;
}) {
  const { theme } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const columns = useMediaGalleryColumns();

  const mediaMessages = messages.filter((message) => message.type === 'image' && !message.deletedForEveryone);

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
            onClick={() => onSelectImage(message.content)}
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
            <MediaThumbnail src={message.content} theme={theme} />
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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const otherUser = room.type === 'private' ? getOtherParticipant(room, currentUserId) : undefined;
  const avatar = otherUser ? AVATARS[otherUser.avatar] : undefined;
  const isCurrentUserAdmin = room.participants.some((participant) => participant.id === currentUserId && participant.isAdmin);

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

              <h3 style={{ margin: '0 0 15px 0', fontSize: '1.6rem', fontWeight: 700, color: theme.text }}>{otherUser.nickname}</h3>

              <div
                onClick={() => copyCode(otherUser.nickname)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  background: `${theme.primary}20`,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: theme.primary,
                  border: `2px solid ${theme.primary}`,
                  minHeight: '44px',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = `${theme.primary}30`;
                  event.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = `${theme.primary}20`;
                  event.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {codeCopied ? <FaCheck style={{ fontSize: '1.3rem' }} /> : <FaCopy style={{ fontSize: '1.3rem' }} />}
                <span style={{ letterSpacing: '2px' }}>{otherUser.nickname}</span>
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
                {otherUser.status === 'online' && (
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4caf50' }} />
                )}
                {getLastSeen(otherUser)}
              </div>
            </div>

            <MediaGallery messages={messages} messagesLoaded={messagesLoaded} onSelectImage={setSelectedImage} />

            <WallpaperPicker roomId={room.id} />

            <AppearanceEditor roomId={room.id} />

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
                {room.participants.length} membros
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
              <div style={{ color: theme.primary }}>
                <FaCrown size={18} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: theme.textSecondary,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Criado por
                </div>
                <div style={{ fontSize: '1rem', color: theme.text, fontWeight: 600, marginTop: '3px' }}>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
                {room.participants.map((participant) => (
                  <div
                    key={participant.id}
                    style={{
                      padding: '12px',
                      background: theme.background,
                      borderRadius: '10px',
                      border: `1px solid ${theme.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: theme.text, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getDisplayName(participant.id, participant.nickname, currentUserId)}
                        {participant.status === 'online' && (
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4caf50' }} />
                        )}
                        {participant.isAdmin && <FaCrown size={12} color={theme.primary} title="Administrador" />}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: theme.textSecondary }}>{getLastSeen(participant)}</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isCurrentUserAdmin && participant.id !== currentUserId && (
                        <>
                          {!participant.isAdmin && (
                            <button
                              onClick={() => handlePromoteAdmin(participant.id)}
                              title="Promover a administrador"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                border: `1.5px solid ${theme.primary}`,
                                background: `${theme.primary}15`,
                                color: theme.primary,
                                cursor: 'pointer',
                              }}
                            >
                              <FaCrown size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveMember(participant.id)}
                            title="Remover do grupo"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              border: '1.5px solid #f44336',
                              background: 'rgba(244, 67, 54, 0.1)',
                              color: '#f44336',
                              cursor: 'pointer',
                            }}
                          >
                            <FaUserSlash size={14} />
                          </button>
                        </>
                      )}

                      <div
                        onClick={() => copyCode(participant.nickname, participant.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          background: `${theme.primary}15`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          fontFamily: 'monospace',
                          color: theme.primary,
                          border: `1.5px solid ${theme.primary}`,
                          fontWeight: 700,
                          minHeight: '36px',
                        }}
                      >
                        {copiedParticipantId === participant.id ? (
                          <>
                            <FaCheck size={14} />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <FaCopy size={14} />
                            <span style={{ letterSpacing: '1px' }}>{participant.nickname}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <MediaGallery messages={messages} messagesLoaded={messagesLoaded} onSelectImage={setSelectedImage} />

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
    <ImageModal isOpen={selectedImage !== null} images={selectedImage ? [selectedImage] : []} onClose={() => setSelectedImage(null)} />
    </>
  );
}
