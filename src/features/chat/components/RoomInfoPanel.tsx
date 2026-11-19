import { useId, useState, type ReactNode } from 'react';
import { FaBan, FaCheck, FaCopy, FaCrown, FaLink, FaSignOutAlt, FaUserMinus, FaUsers } from 'react-icons/fa';
import { MdTranslate } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { Modal } from '@components/common/Modal';
import { Switch } from '@components/common/Switch';
import { AVATARS } from '@features/auth/constants/avatars';
import { getOtherParticipant } from '@features/rooms';
import { useTheme } from '@features/theme';
import { useClipboardCopy } from '@hooks/useClipboardCopy';
import { downloadMessageMedia } from '@lib/e2ee';
import { formatTimeAgo, getDisplayName } from '@lib/format';
import { translate } from '@lib/i18n/app-i18n';
import { useSocket, type MessageView, type RoomParticipant, type RoomSummary } from '@lib/socket';
import { isAssistantRoom } from '../utils/assistant';
import { AppearanceEditor } from './AppearanceEditor';
import { GroupInviteSection } from './GroupInviteSection';
import { GroupNameEditor } from './GroupNameEditor';
import { ImageModal } from './ImageModal';
import { MediaGallery } from './MediaGallery';
import { PdfPreviewModal } from './PdfPreviewModal';
import { VideoPreviewModal } from './VideoPreviewModal';
import { WallpaperPicker } from './WallpaperPicker';

interface RoomInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomSummary;
  currentUserId: string | undefined;
  messages: MessageView[];
  messagesLoaded: boolean;
  onLeftGroup: () => void;
  autoTranslate?: RoomAutoTranslateProps;
}

interface RoomAutoTranslateProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

const COPY_KEY_NICKNAME = 'nickname';

function getLastSeen(participant: RoomParticipant): string {
  if (participant.status === 'online') {
    return translate('presence.online');
  }

  if (participant.lastSeen) {
    try {
      return translate('roomInfo.seen', { time: formatTimeAgo(participant.lastSeen) });
    } catch {
      return translate('presence.offline');
    }
  }

  return translate('presence.offline');
}

interface ActionIconButtonProps {
  onClick: () => void;
  title: string;
  tone: 'accent' | 'danger';
  children: ReactNode;
}

function ActionIconButton({ onClick, title, tone, children }: ActionIconButtonProps) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={title}
      className={`sc-icon-btn ${tone === 'danger' ? 'sc-icon-btn--outline-danger' : 'sc-icon-btn--outline-accent'}`}
      style={{ width: '32px', height: '32px' }}
    >
      {children}
    </button>
  );
}

function RoomAutoTranslateCard({ enabled, onChange }: RoomAutoTranslateProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const labelId = useId();
  const captionId = useId();

  return (
    <div className="sc-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderRadius: '10px', padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MdTranslate size={18} color={enabled ? theme.accentText : theme.textMuted} aria-hidden="true" />
          <span id={labelId} style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '0.95rem' }}>
            {t('chat.translation.autoRoomTitle')}
          </span>
        </div>
        <Switch checked={enabled} onChange={() => onChange(!enabled)} aria-labelledby={labelId} aria-describedby={captionId} />
      </div>
      <small id={captionId} style={{ color: theme.textSecondary }}>
        {t('chat.translation.autoRoomCaption')}
      </small>
    </div>
  );
}

function SectionDivider() {
  const { theme } = useTheme();

  return <div style={{ height: '1px', background: theme.borderSubtle, margin: '4px 0' }} />;
}

function SectionTitle({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  return (
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
      {children}
    </div>
  );
}

export function RoomInfoPanel({ isOpen, onClose, room, currentUserId, messages, messagesLoaded, onLeftGroup, autoTranslate }: RoomInfoPanelProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { socket } = useSocket();
  const clipboard = useClipboardCopy();
  const [selectedMedia, setSelectedMedia] = useState<MessageView | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ roomId: string; participant: RoomParticipant } | null>(null);
  const removalTarget =
    pendingRemoval && pendingRemoval.roomId === room.id && room.participants.some((participant) => participant.id === pendingRemoval.participant.id)
      ? pendingRemoval
      : null;
  if (pendingRemoval && !removalTarget) {
    setPendingRemoval(null);
  }

  const otherUser = room.type === 'private' ? getOtherParticipant(room, currentUserId) : undefined;
  const avatar = otherUser ? AVATARS[otherUser.avatar] : undefined;
  const isCurrentUserAdmin = room.participants.some((participant) => participant.id === currentUserId && participant.isAdmin);
  const isSelectedMediaVideo = selectedMedia?.type === 'file' && Boolean(selectedMedia.fileMeta?.mimeType.startsWith('video/'));
  const isSelectedMediaPdf = selectedMedia?.type === 'file' && selectedMedia.fileMeta?.mimeType === 'application/pdf';

  const handleSelectMedia = (message: MessageView) => {
    if (message.type === 'file' && !message.fileMeta?.mimeType.startsWith('video/') && message.fileMeta?.mimeType !== 'application/pdf') {
      void downloadMessageMedia({
        content: message.content,
        roomId: room.id,
        messageId: message.id,
        fileMeta: message.fileMeta,
        fileName: message.fileMeta?.name ?? t('chat.message.defaultFileName'),
        messageType: message.type,
      });
      return;
    }
    setSelectedMedia(message);
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

  const confirmRemoveMember = () => {
    if (removalTarget) {
      socket?.emit('group:remove-member', { roomId: removalTarget.roomId, userId: removalTarget.participant.id });
    }
  };

  const avatarHaloStyle = {
    borderRadius: '50%',
    background: theme.accentSoft,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 15px',
    boxShadow: theme.shadowAccent,
    position: 'relative' as const,
    border: `3px solid ${theme.accent}`,
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={removalTarget ? () => setPendingRemoval(null) : onClose} title={room.type === 'group' ? (room.name ?? t('common.group')) : otherUser?.nickname}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {room.type === 'private' && otherUser && (
            <>
              <div style={{ textAlign: 'center', paddingBottom: '15px', borderBottom: `1px solid ${theme.border}` }}>
                <div style={{ ...avatarHaloStyle, width: '100px', height: '100px' }}>
                  {avatar && <avatar.icon size={50} color={theme.accentText} />}
                  {otherUser.status === 'online' && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: '5px',
                        right: '5px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: theme.online,
                        border: `4px solid ${theme.surfaceElevated}`,
                        boxShadow: theme.shadowSm,
                      }}
                    />
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', margin: '0 0 15px 0' }}>
                  <h3 style={{ margin: 0, lineHeight: 1, fontSize: '1.6rem', fontWeight: 700, color: theme.textPrimary }}>{otherUser.nickname}</h3>
                  <button
                    onClick={() => clipboard.copy(otherUser.nickname, COPY_KEY_NICKNAME)}
                    title={t('roomInfo.copyUsername')}
                    className="sc-icon-btn sc-icon-btn--soft"
                    style={{ width: '26px', height: '26px', borderRadius: '6px', alignSelf: 'center', position: 'relative', top: '2px' }}
                  >
                    {clipboard.isCopied(COPY_KEY_NICKNAME) ? <FaCheck size={13} className="sc-anim-badge-pop" /> : <FaCopy size={13} />}
                  </button>
                </div>
              </div>

              <div className="sc-card" style={{ padding: '15px' }}>
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
                  {t('roomInfo.status')}
                </div>
                <div
                  style={{
                    fontSize: '1rem',
                    color: otherUser.status === 'online' ? theme.successText : theme.textPrimary,
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

              {autoTranslate && <RoomAutoTranslateCard enabled={autoTranslate.enabled} onChange={autoTranslate.onChange} />}

              <WallpaperPicker roomId={room.id} />

              <SectionDivider />

              <AppearanceEditor roomId={room.id} />

              {!isAssistantRoom(room) && (
                <div style={{ display: 'flex', gap: '10px', paddingTop: '20px', borderTop: `1px solid ${theme.border}` }}>
                  {room.userBlocked ? (
                    <button onClick={handleUnblock} className="sc-btn sc-btn--warning" style={{ flex: 1, padding: '10px', fontSize: '0.9rem', borderRadius: '8px' }}>
                      <FaBan size={16} />
                      {t('roomInfo.unblock')}
                    </button>
                  ) : (
                    <button onClick={handleBlock} className="sc-btn sc-btn--danger" style={{ flex: 1, padding: '10px', fontSize: '0.9rem', borderRadius: '8px' }}>
                      <FaBan size={16} />
                      {t('roomInfo.block')}
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {room.type === 'group' && (
            <>
              <div style={{ textAlign: 'center', paddingBottom: '15px', borderBottom: `1px solid ${theme.border}` }}>
                <div style={{ ...avatarHaloStyle, width: '90px', height: '90px' }}>
                  <FaUsers size={45} color={theme.accentText} />
                </div>

                <GroupNameEditor room={room} currentUserId={currentUserId} />

                <div style={{ fontSize: '0.9rem', color: theme.textSecondary, fontWeight: 500 }}>
                  {t('roomInfo.members', { count: room.participants.length })}
                </div>
              </div>

              <div className="sc-card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: theme.accentSoft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <FaCrown size={18} color={theme.accentText} />
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
                    {t('roomInfo.createdBy')}
                  </div>
                  <div
                    style={{
                      fontSize: '1rem',
                      color: theme.textPrimary,
                      fontWeight: 600,
                      marginTop: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {room.creatorId === currentUserId ? t('common.you') : (room.createdBy ?? t('common.unknown'))}
                  </div>
                </div>
              </div>

              <GroupInviteSection
                room={room}
                title={
                  <SectionTitle>
                    <FaLink /> {t('roomInfo.inviteLink')}
                  </SectionTitle>
                }
              />

              <div>
                <SectionTitle>
                  <FaUsers /> {t('roomInfo.membersTitle', { count: room.participants.length })}
                </SectionTitle>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '320px', overflowY: 'auto', paddingRight: '6px' }}>
                  {room.participants.map((participant) => {
                    const participantAvatar = AVATARS[participant.avatar];
                    const canManage = isCurrentUserAdmin && participant.id !== currentUserId;

                    return (
                      <div
                        key={participant.id}
                        className="sc-card sc-card--hover"
                        style={{
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          transition: 'border-color var(--sc-dur-fast) var(--sc-ease-standard), box-shadow var(--sc-dur-normal) var(--sc-ease-standard)',
                        }}
                      >
                        <div
                          style={{
                            position: 'relative',
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            background: theme.accentSoft,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {participantAvatar && <participantAvatar.icon size={20} color={theme.accentText} />}
                          {participant.status === 'online' && (
                            <span
                              style={{
                                position: 'absolute',
                                bottom: '-1px',
                                right: '-1px',
                                width: '11px',
                                height: '11px',
                                borderRadius: '50%',
                                background: theme.online,
                                border: `2px solid ${theme.surfaceSunken}`,
                              }}
                            />
                          )}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {getDisplayName(participant.id, participant.nickname, currentUserId)}
                            </span>
                            {participant.isAdmin && <FaCrown size={12} color={theme.warning} title={t('roomInfo.admin')} style={{ flexShrink: 0 }} />}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: participant.status === 'online' ? theme.successText : theme.textSecondary, marginTop: '2px' }}>
                            {getLastSeen(participant)}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          <ActionIconButton onClick={() => clipboard.copy(participant.nickname, participant.id)} title={t('roomInfo.copyUsername')} tone="accent">
                            {clipboard.isCopied(participant.id) ? <FaCheck size={13} className="sc-anim-badge-pop" /> : <FaCopy size={13} />}
                          </ActionIconButton>

                          {canManage && !participant.isAdmin && (
                            <ActionIconButton onClick={() => handlePromoteAdmin(participant.id)} title={t('roomInfo.promote')} tone="accent">
                              <FaCrown size={13} />
                            </ActionIconButton>
                          )}

                          {canManage && (
                            <ActionIconButton onClick={() => setPendingRemoval({ roomId: room.id, participant })} title={t('roomInfo.remove')} tone="danger">
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

              {autoTranslate && <RoomAutoTranslateCard enabled={autoTranslate.enabled} onChange={autoTranslate.onChange} />}

              <WallpaperPicker roomId={room.id} />

              <SectionDivider />

              <AppearanceEditor roomId={room.id} />

              <div
                style={{
                  padding: '15px',
                  background: theme.warningSoft,
                  borderRadius: '12px',
                  border: `1px solid ${theme.warning}`,
                  marginTop: '15px',
                }}
              >
                <button onClick={handleLeaveGroup} className="sc-btn sc-btn--warning sc-btn--lift" style={{ width: '100%', padding: '12px 15px', borderRadius: '8px' }}>
                  <FaSignOutAlt size={16} />
                  {t('roomInfo.leave')}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        isOpen={removalTarget !== null}
        title={t('roomInfo.removeTitle')}
        message={t('roomInfo.removeConfirm', { name: removalTarget?.participant.nickname ?? '' })}
        confirmLabel={t('roomInfo.remove')}
        onConfirm={confirmRemoveMember}
        onCancel={() => setPendingRemoval(null)}
      />
      <ImageModal
        isOpen={selectedMedia?.type === 'image'}
        images={selectedMedia?.type === 'image' ? [selectedMedia.content] : []}
        roomId={room.id}
        messageIds={selectedMedia?.type === 'image' ? [selectedMedia.id] : []}
        fileMetas={selectedMedia?.type === 'image' ? [selectedMedia.fileMeta] : []}
        onClose={() => setSelectedMedia(null)}
      />
      <VideoPreviewModal
        isOpen={isSelectedMediaVideo}
        onClose={() => setSelectedMedia(null)}
        url={isSelectedMediaVideo ? (selectedMedia?.content ?? '') : ''}
        fileName={selectedMedia?.fileMeta?.name ?? t('chat.message.defaultVideoName')}
        roomId={room.id}
        messageId={selectedMedia?.id}
        fileMeta={selectedMedia?.fileMeta}
      />
      <PdfPreviewModal
        isOpen={isSelectedMediaPdf}
        onClose={() => setSelectedMedia(null)}
        url={isSelectedMediaPdf ? (selectedMedia?.content ?? '') : ''}
        fileName={selectedMedia?.fileMeta?.name ?? t('chat.message.defaultPdfName')}
      />
    </>
  );
}
