import { useState } from 'react';
import { FaExclamationTriangle, FaShieldAlt } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { Modal } from '@components/common/Modal';
import { getOtherParticipant } from '@features/rooms';
import { useTheme } from '@features/theme';
import { acceptContactKeyChange, getCurrentIdentity } from '@lib/e2ee';
import type { RoomSummary } from '@lib/socket';
import { useContactTrust } from '../hooks/useContactTrust';
import { isAssistantRoom } from '../utils/assistant';
import { SafetyNumberDialog } from './SafetyNumberDialog';

interface ContactKeyBannerProps {
  room: RoomSummary;
  currentUserId: string | undefined;
}

const STATUS_LABEL_KEYS = {
  verified: 'chat.keyTrust.statusVerified',
  unverified: 'chat.keyTrust.statusUnverified',
  unverifiable: 'chat.keyTrust.statusUnverifiable',
} as const;

export function ContactKeyBanner({ room, currentUserId }: ContactKeyBannerProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [blockingDismissed, setBlockingDismissed] = useState(false);
  const isPrivate = room.type === 'private' && !isAssistantRoom(room);
  const other = isPrivate ? getOtherParticipant(room, currentUserId) : undefined;
  const trust = useContactTrust(other?.id);

  if (!other || !trust || (trust.status === 'invalid' && !trust.pin)) {
    return null;
  }

  const changed = trust.status === 'changed' || trust.status === 'invalid';
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

  const status = trust.status as keyof typeof STATUS_LABEL_KEYS;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 12px',
          fontSize: '0.75rem',
          color: status === 'verified' ? theme.accentText : theme.textSecondary,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <FaShieldAlt aria-hidden="true" />
        <span>{t(STATUS_LABEL_KEYS[status])}</span>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: theme.accentText, cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}
        >
          {t('chat.keyTrust.openDialog')}
        </button>
      </div>
      <SafetyNumberDialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} contactId={other.id} contactName={other.nickname} trust={trust} />
    </>
  );
}
