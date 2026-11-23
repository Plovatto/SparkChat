import { useCallback, useState, useSyncExternalStore } from 'react';
import { FaExclamationTriangle } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { Modal } from '@components/common/Modal';
import { getOtherParticipant } from '@features/rooms';
import { useTheme } from '@features/theme';
import {
  acceptContactKeyChange,
  getContactTrust,
  getCurrentIdentity,
  isRotationBlockedBy,
  subscribeContactTrust,
  subscribeRotationBlocks,
} from '@lib/e2ee';
import type { RoomSummary } from '@lib/socket';
import { useContactTrust } from '../hooks/useContactTrust';
import { isAssistantRoom } from '../utils/assistant';
import { SafetyNumberDialog } from './lazy-panels';

interface ContactKeyBannerProps {
  room: RoomSummary;
  currentUserId: string | undefined;
}

function subscribeKeyChanges(onChange: () => void): () => void {
  const stopTrust = subscribeContactTrust(onChange);
  const stopBlocks = subscribeRotationBlocks(onChange);
  return () => {
    stopTrust();
    stopBlocks();
  };
}

export function ContactKeyBanner({ room, currentUserId }: ContactKeyBannerProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [blockingDismissed, setBlockingDismissed] = useState(false);
  const isPrivate = room.type === 'private' && !isAssistantRoom(room);
  const isGroup = room.type === 'group';
  const findChangedMember = useCallback(() => {
    if (!isGroup) {
      return null;
    }
    const changed = room.participants.filter(
      (participant) => participant.id !== currentUserId && getContactTrust(participant.id)?.status === 'changed',
    );
    return (changed.find((participant) => isRotationBlockedBy(room.id, participant.id)) ?? changed[0])?.id ?? null;
  }, [isGroup, room.id, room.participants, currentUserId]);
  const changedMemberId = useSyncExternalStore(subscribeKeyChanges, findChangedMember, () => null);
  const isBlockingRotation = useSyncExternalStore(
    subscribeKeyChanges,
    () => (changedMemberId ? isRotationBlockedBy(room.id, changedMemberId) : false),
    () => false,
  );
  const other = isPrivate
    ? getOtherParticipant(room, currentUserId)
    : room.participants.find((participant) => participant.id === changedMemberId);
  const trust = useContactTrust(other?.id);

  if (!other || !trust || (trust.status === 'invalid' && !trust.pin)) {
    return null;
  }

  const changed = trust.status === 'changed' || trust.status === 'invalid';
  if (isGroup && !changed) {
    return null;
  }
  const wasVerified = Boolean(trust.pin?.verified);
  const accept = () => {
    const identity = getCurrentIdentity();
    if (identity) {
      void acceptContactKeyChange({ userId: identity.userId, publicKey: identity.publicKey }, other.id);
    }
  };

  if (changed) {
    const invalid = trust.status === 'invalid';
    return (
      <>
        <div
          role="alert"
          className="sc-anim-rise-in"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px 12px',
            padding: '8px 12px',
            background: theme.dangerSoft,
            color: theme.dangerText,
            borderBottom: `1px solid ${theme.danger}`,
            fontSize: '0.85rem',
          }}
        >
          <FaExclamationTriangle aria-hidden="true" />
          <span style={{ flex: '1 1 220px' }}>
            {invalid
              ? t('chat.keyTrust.invalidWarning', { name: other.nickname })
              : t(wasVerified ? 'chat.keyTrust.changedVerifiedWarning' : 'chat.keyTrust.changedWarning', { name: other.nickname })}
            {!invalid && isGroup && isBlockingRotation && <> {t('chat.keyTrust.rotationBlocked', { name: other.nickname })}</>}
          </span>
          {!invalid && (
            <button type="button" onClick={() => setDialogOpen(true)} style={{ padding: '4px 10px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
              {t('chat.keyTrust.openDialog')}
            </button>
          )}
          {!invalid && !wasVerified && (
            <button type="button" onClick={accept} style={{ padding: '4px 10px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
              {t('chat.keyTrust.acceptChange')}
            </button>
          )}
          {!invalid && wasVerified && (
            <button type="button" onClick={() => setBlockingDismissed(false)} style={{ padding: '4px 10px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
              {t('chat.keyTrust.reviewChange')}
            </button>
          )}
        </div>
        {!invalid && (
          <SafetyNumberDialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} contactId={other.id} contactName={other.nickname} trust={trust} />
        )}
        {!invalid && wasVerified && (
          <Modal isOpen={!blockingDismissed} onClose={() => setBlockingDismissed(true)} title={t('chat.keyTrust.blockingTitle')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', color: theme.textPrimary }}>
              <p style={{ margin: 0 }}>{t('chat.keyTrust.blockingBody', { name: other.nickname })}</p>
              <button
                type="button"
                onClick={accept}
                style={{ padding: '10px 14px', borderRadius: '8px', border: `1px solid ${theme.danger}`, background: theme.dangerSoft, color: theme.dangerText, fontWeight: 600, cursor: 'pointer' }}
              >
                {t('chat.keyTrust.acceptChangeVerified')}
              </button>
              <button
                type="button"
                onClick={() => setBlockingDismissed(true)}
                style={{ padding: '10px 14px', borderRadius: '8px', border: `1px solid ${theme.border}`, background: theme.surfaceSunken, color: theme.textPrimary, fontWeight: 600, cursor: 'pointer' }}
              >
                {t('chat.keyTrust.keepBlocked')}
              </button>
            </div>
          </Modal>
        )}
      </>
    );
  }

  return null;
}
