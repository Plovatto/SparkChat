import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LuBan, LuChevronRight, LuCopy, LuCheck, LuImage, LuLink, LuLogOut, LuPhone, LuSearch, LuVideo } from 'react-icons/lu';
import { MdTranslate } from 'react-icons/md';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { SideDrawer } from '@components/common/SideDrawer';
import { Switch } from '@components/common/Switch';
import { blocksNewCall, useOptionalCall } from '@features/calls';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { GroupPhotoEditor } from '@features/profile-photos/components/GroupPhotoEditor';
import { ProfilePhotoViewer } from '@features/profile-photos/components/ProfilePhotoViewer';
import { getOtherParticipant, getRoomDisplayName } from '@features/rooms';
import { useClipboardCopy } from '@hooks/useClipboardCopy';
import { attestGroupAction, downloadMessageMedia } from '@lib/e2ee';
import { formatTimeAgo } from '@lib/format';
import { translate } from '@lib/i18n/app-i18n';
import { useSocket, type MessageView, type RoomParticipant, type RoomSummary } from '@lib/socket';
import { isAssistantRoom } from '../utils/assistant';
import { getGalleryMedia } from '../utils/gallery-media';
import { jumpToMessage } from '../utils/jump-to-message';
import { useConsumeViewRequest } from '../hooks/useConsumeViewRequest';
import { ChatAppearanceActions, ChatAppearanceView } from './ChatAppearanceView';
import { ContactSecurityLink } from './ContactSecurityLink';
import { GroupInviteSection } from './GroupInviteSection';
import { GroupNameEditor } from './GroupNameEditor';
import { MediaViewer, PdfPreviewModal } from './lazy-panels';
import { useMediaViewer } from './media-viewer/media-viewer-context';
import { toMediaViewerItems } from './media-viewer/media-viewer-items';
import { InfoMediaGrid } from './room-info/InfoMediaGrid';
import { InfoMessageSearch } from './room-info/InfoMessageSearch';
import { MemberRow } from './room-info/MemberRow';
import '../styles/room-info-drawer.css';

interface RoomInfoPanelProps {
  isOpen: boolean;
  inline?: boolean;
  onClose: () => void;
  room: RoomSummary;
  currentUserId: string | undefined;
  messages: MessageView[];
  messagesLoaded: boolean;
  onLeftGroup: () => void;
  autoTranslate?: RoomAutoTranslateProps;
  requestedView?: { view: InfoView; nonce: number } | undefined;
}

interface RoomAutoTranslateProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

type InfoView = 'main' | 'invite' | 'search' | 'media' | 'appearance';

const COPY_KEY_NICKNAME = 'nickname';
const MEDIA_PREVIEW_COUNT = 9;
const HERO_AVATAR_SIZE = 92;

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

function RoomAutoTranslateCard({ enabled, onChange }: RoomAutoTranslateProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const captionId = useId();

  return (
    <div className="sc-info-toggle">
      <MdTranslate size={18} className="sc-info-toggle__icon" data-on={enabled} aria-hidden="true" />
      <div className="sc-info-toggle__body">
        <span id={labelId} className="sc-info-toggle__label">
          {t('chat.translation.autoRoomTitle')}
        </span>
        <small id={captionId} className="sc-info-toggle__caption">
          {t('chat.translation.autoRoomCaption')}
        </small>
      </div>
      <Switch checked={enabled} onChange={() => onChange(!enabled)} aria-labelledby={labelId} aria-describedby={captionId} />
    </div>
  );
}

interface QuickActionProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  index: number;
  disabled?: boolean;
}

function QuickAction({ icon, label, onClick, index, disabled = false }: QuickActionProps) {
  return (
    <button type="button" className="sc-info-action" onClick={onClick} disabled={disabled} style={{ '--sc-info-i': index } as CSSProperties}>
      <span className="sc-info-action__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sc-info-action__label">{label}</span>
    </button>
  );
}

interface FooterRowProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'danger';
  withChevron?: boolean;
}

function FooterRow({ icon, label, onClick, tone, withChevron = false }: FooterRowProps) {
  return (
    <button type="button" className="sc-info-footer-row" data-tone={tone} onClick={onClick}>
      <span className="sc-info-footer-row__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sc-info-footer-row__label">{label}</span>
      {withChevron && <LuChevronRight size={18} className="sc-info-footer-row__chevron" aria-hidden="true" />}
    </button>
  );
}

export function RoomInfoPanel({ isOpen, inline = false, onClose, room, currentUserId, messages, messagesLoaded, onLeftGroup, autoTranslate, requestedView }: RoomInfoPanelProps) {
  const { t } = useTranslation();
  const { socket } = useSocket();
  const clipboard = useClipboardCopy();
  const [view, setView] = useState<InfoView>('main');
  useConsumeViewRequest(isOpen, requestedView, setView);
  const [selectedMedia, setSelectedMedia] = useState<MessageView | null>(null);
  const [viewerPhoto, setViewerPhoto] = useState<string | null>(null);
  const [isGroupPhotoConfirmOpen, setIsGroupPhotoConfirmOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ roomId: string; participant: RoomParticipant } | null>(null);
  const removalTarget =
    pendingRemoval && pendingRemoval.roomId === room.id && room.participants.some((participant) => participant.id === pendingRemoval.participant.id)
      ? pendingRemoval
      : null;
  if (pendingRemoval && !removalTarget) {
    setPendingRemoval(null);
  }
  if (!isOpen && isLeaveConfirmOpen) {
    setIsLeaveConfirmOpen(false);
  }
  if (!isOpen && viewerPhoto) {
    setViewerPhoto(null);
  }
  if (!isOpen && view !== 'main') {
    setView('main');
  }

  const isGroup = room.type === 'group';
  const isAssistant = isAssistantRoom(room);
  const otherUser = room.type === 'private' ? getOtherParticipant(room, currentUserId) : undefined;
  const call = useOptionalCall();
  const canCall = call !== null && call.canCall(room);
  const callBusy = call !== null && blocksNewCall(call.snapshot.state, room.id);
  const isCurrentUserAdmin = room.participants.some((participant) => participant.id === currentUserId && participant.isAdmin);
  const isSelectedMediaPdf = selectedMedia?.type === 'file' && selectedMedia.fileMeta?.mimeType === 'application/pdf';
  const media = useMemo(() => getGalleryMedia(messages), [messages]);
  const mediaViewer = useMediaViewer();
  const viewerItems = useMemo(() => toMediaViewerItems(messages, room.participants), [messages, room.participants]);
  const [localViewerIndex, setLocalViewerIndex] = useState<number | null>(null);
  const sortedParticipants = useMemo(
    () =>
      [...room.participants].sort((a, b) => {
        const selfDiff = Number(b.id === currentUserId) - Number(a.id === currentUserId);
        if (selfDiff !== 0) {
          return selfDiff;
        }
        const adminDiff = Number(Boolean(b.isAdmin)) - Number(Boolean(a.isAdmin));
        if (adminDiff !== 0) {
          return adminDiff;
        }
        return a.nickname.localeCompare(b.nickname);
      }),
    [room.participants, currentUserId],
  );

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
    if (message.type === 'file' && message.fileMeta?.mimeType === 'application/pdf') {
      setSelectedMedia(message);
      return;
    }
    if (mediaViewer?.open(message.id)) {
      return;
    }
    const viewerIndex = viewerItems.findIndex((item) => item.id === message.id);
    if (viewerIndex >= 0) {
      setLocalViewerIndex(viewerIndex);
    }
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

  const confirmLeaveGroup = () => {
    void attestGroupAction(room.id, 'group.memberLeft').then((attestation) => {
      socket?.emit('group:leave', { roomId: room.id, ...(attestation ? { attestation } : {}) });
    });
    onLeftGroup();
  };

  const handlePromoteAdmin = (userId: string) => {
    void attestGroupAction(room.id, 'group.adminPromoted', userId).then((attestation) => {
      socket?.emit('group:promote-admin', { roomId: room.id, userId, ...(attestation ? { attestation } : {}) });
    });
  };

  const confirmRemoveMember = () => {
    if (removalTarget) {
      const { roomId } = removalTarget;
      const userId = removalTarget.participant.id;
      void attestGroupAction(roomId, 'group.memberRemoved', userId).then((attestation) => {
        socket?.emit('group:remove-member', { roomId, userId, ...(attestation ? { attestation } : {}) });
      });
    }
  };

  const handleSearchSelect = (messageId: string) => {
    onClose();
    window.setTimeout(() => jumpToMessage(messageId), 320);
  };

  const drawerCloseHandler = removalTarget
    ? () => setPendingRemoval(null)
    : isLeaveConfirmOpen
      ? () => setIsLeaveConfirmOpen(false)
      : isGroupPhotoConfirmOpen
        ? () => {}
        : viewerPhoto
          ? () => setViewerPhoto(null)
          : onClose;

  const heroAvatarStyle: CSSProperties = {
    borderRadius: '50%',
    margin: '0 auto',
    position: 'relative',
    boxShadow: '0 0 0 4px color-mix(in srgb, var(--sc-accent) 55%, transparent), 0 14px 34px -10px color-mix(in srgb, var(--sc-accent) 80%, transparent)',
  };

  const creatorLabel = room.creatorId === currentUserId ? t('roomInfo.createdByYou') : t('roomInfo.createdByName', { name: room.createdBy ?? t('common.unknown') });

  const viewTitles: Record<InfoView, string> = {
    main: t('roomInfo.title'),
    invite: t('roomInfo.invite'),
    search: t('roomInfo.search'),
    media: t('roomInfo.media'),
    appearance: t('chat.appearance.title'),
  };

  const footer =
    view === 'main' ? (
      <>
        <FooterRow icon={<LuImage size={19} />} label={t('roomInfo.appearance')} onClick={() => setView('appearance')} withChevron />
        {isGroup && <FooterRow icon={<LuLogOut size={19} />} label={t('roomInfo.leave')} onClick={() => setIsLeaveConfirmOpen(true)} tone="danger" />}
        {!isGroup && otherUser && !isAssistant && (
          <FooterRow
            icon={<LuBan size={19} />}
            label={room.userBlocked ? t('roomInfo.unblock') : t('roomInfo.block')}
            onClick={room.userBlocked ? handleUnblock : handleBlock}
            tone={room.userBlocked ? undefined : 'danger'}
          />
        )}
      </>
    ) : view === 'appearance' ? (
      <ChatAppearanceActions roomId={room.id} />
    ) : undefined;

  const mainView = (
    <>
      <section className="sc-info-hero">
        {isGroup ? (
          <>
            <GroupPhotoEditor
              room={room}
              size={HERO_AVATAR_SIZE}
              iconSize={42}
              avatarStyle={heroAvatarStyle}
              onView={setViewerPhoto}
              onConfirmChange={setIsGroupPhotoConfirmOpen}
            />
            <div className="sc-info-hero__name">
              <GroupNameEditor room={room} currentUserId={currentUserId} />
            </div>
            <p className="sc-info-hero__meta">
              {t('common.group')} · {t('roomInfo.members', { count: room.participants.length })} · {creatorLabel}
            </p>
          </>
        ) : (
          otherUser && (
            <>
              <Avatar
                userId={otherUser.id}
                avatarIndex={otherUser.avatar}
                tone="soft"
                size={HERO_AVATAR_SIZE}
                iconSize={44}
                style={heroAvatarStyle}
                onPhotoClick={setViewerPhoto}
              >
                {otherUser.status === 'online' && <span className="sc-info-hero__online" />}
              </Avatar>
              <h3 className="sc-info-hero__title">{otherUser.nickname}</h3>
              <p className="sc-info-hero__meta" data-online={otherUser.status === 'online'}>
                {getLastSeen(otherUser)}
              </p>
              {!isAssistant && (
                <div className="sc-info-hero__security">
                  <ContactSecurityLink contactId={otherUser.id} contactName={otherUser.nickname} />
                </div>
              )}
            </>
          )
        )}

        <div className="sc-info-actions">
          {isGroup && <QuickAction icon={<LuLink size={19} />} label={t('roomInfo.invite')} onClick={() => setView('invite')} index={0} />}
          {canCall && call && (
            <>
              <QuickAction icon={<LuPhone size={19} />} label={t('chat.header.voiceCall')} onClick={() => call.startCall(room, 'voice')} disabled={callBusy} index={0} />
              <QuickAction icon={<LuVideo size={19} />} label={t('roomInfo.videoCall')} onClick={() => call.startCall(room, 'video')} disabled={callBusy} index={1} />
            </>
          )}
          <QuickAction icon={<LuSearch size={19} />} label={t('roomInfo.search')} onClick={() => setView('search')} index={2} />
          {!isGroup && otherUser && !canCall && (
            <QuickAction
              icon={clipboard.isCopied(COPY_KEY_NICKNAME) ? <LuCheck size={19} className="sc-anim-badge-pop" /> : <LuCopy size={19} />}
              label={clipboard.isCopied(COPY_KEY_NICKNAME) ? t('roomInfo.copied') : t('roomInfo.copyUsername')}
              onClick={() => clipboard.copy(otherUser.nickname, COPY_KEY_NICKNAME)}
              index={3}
            />
          )}
        </div>
      </section>

      <section className="sc-info-section">
        <div className="sc-info-section__head">
          <h4 className="sc-info-section__title">{t('roomInfo.media')}</h4>
          {media.length > 0 && (
            <button type="button" className="sc-info-link" onClick={() => setView('media')}>
              {t('roomInfo.seeAll')}
            </button>
          )}
        </div>
        <InfoMediaGrid media={media} messagesLoaded={messagesLoaded} limit={MEDIA_PREVIEW_COUNT} variant="preview" onSelect={handleSelectMedia} />
      </section>

      {autoTranslate && (
        <section className="sc-info-section">
          <RoomAutoTranslateCard enabled={autoTranslate.enabled} onChange={autoTranslate.onChange} />
        </section>
      )}

      {isGroup && (
        <section className="sc-info-section">
          <div className="sc-info-section__head">
            <h4 className="sc-info-section__title">{t('roomInfo.members', { count: room.participants.length })}</h4>
          </div>
          <div className="sc-info-members">
            {sortedParticipants.map((participant, index) => (
              <MemberRow
                key={participant.id}
                participant={participant}
                currentUserId={currentUserId}
                subtitle={participant.isAdmin ? t('roomInfo.admin') : getLastSeen(participant)}
                canManage={isCurrentUserAdmin && participant.id !== currentUserId}
                isCopied={clipboard.isCopied(participant.id)}
                index={Math.min(index, 12)}
                onCopy={() => clipboard.copy(participant.nickname, participant.id)}
                onPromote={() => handlePromoteAdmin(participant.id)}
                onRemove={() => setPendingRemoval({ roomId: room.id, participant })}
                onViewPhoto={setViewerPhoto}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );

  return (
    <>
      <SideDrawer
        isOpen={isOpen}
        title={viewTitles[view]}
        onClose={drawerCloseHandler}
        onBack={view === 'main' ? undefined : () => setView('main')}
        footer={footer}
        viewKey={view}
        inline={inline}
      >
        {view === 'main' && mainView}
        {view === 'invite' && isGroup && (
          <section className="sc-info-section sc-info-section--flat">
            <GroupInviteSection room={room} title={null} />
          </section>
        )}
        {view === 'search' && (
          <section className="sc-info-section sc-info-section--flat">
            <InfoMessageSearch messages={messages} currentUserId={currentUserId} onSelect={handleSearchSelect} />
          </section>
        )}
        {view === 'appearance' && (
          <section className="sc-info-section sc-info-section--flat sc-info-section--appearance">
            <ChatAppearanceView roomId={room.id} />
          </section>
        )}
        {view === 'media' && (
          <section className="sc-info-section sc-info-section--flat">
            <InfoMediaGrid media={media} messagesLoaded={messagesLoaded} variant="full" onSelect={handleSelectMedia} />
          </section>
        )}
      </SideDrawer>
      <ConfirmDialog
        isOpen={removalTarget !== null}
        title={t('roomInfo.removeTitle')}
        message={t('roomInfo.removeConfirm', { name: removalTarget?.participant.nickname ?? '' })}
        confirmLabel={t('roomInfo.remove')}
        onConfirm={confirmRemoveMember}
        onCancel={() => setPendingRemoval(null)}
      />
      <ConfirmDialog
        isOpen={isLeaveConfirmOpen}
        title={t('roomInfo.leaveTitle')}
        message={t('roomInfo.leaveConfirm', { name: getRoomDisplayName(room, currentUserId) })}
        confirmLabel={t('roomInfo.leaveConfirmAction')}
        onConfirm={confirmLeaveGroup}
        onCancel={() => setIsLeaveConfirmOpen(false)}
      />
      {!mediaViewer && (
        <MediaViewer
          isOpen={localViewerIndex !== null}
          items={viewerItems}
          startIndex={localViewerIndex ?? 0}
          onClose={() => setLocalViewerIndex(null)}
          roomName={isGroup ? room.name : undefined}
          onShowInChat={(messageId) => {
            setLocalViewerIndex(null);
            handleSearchSelect(messageId);
          }}
        />
      )}
      <ProfilePhotoViewer photoUrl={viewerPhoto} onClose={() => setViewerPhoto(null)} />
      <PdfPreviewModal
        isOpen={isSelectedMediaPdf}
        onClose={() => setSelectedMedia(null)}
        url={isSelectedMediaPdf ? (selectedMedia?.content ?? '') : ''}
        fileName={selectedMedia?.fileMeta?.name ?? t('chat.message.defaultPdfName')}
      />
    </>
  );
}
