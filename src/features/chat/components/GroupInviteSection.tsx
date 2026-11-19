import { useState, type ReactNode } from 'react';
import { FaCheck, FaLink, FaRedo } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@components/common/ConfirmDialog';
import { useClipboardCopy } from '@hooks/useClipboardCopy';
import type { RoomSummary } from '@lib/socket';
import { useGroupInviteLink } from '../hooks/useGroupInviteLink';

interface GroupInviteSectionProps {
  room: RoomSummary;
  isOwner: boolean;
  title: ReactNode;
}

type ResetFeedback = 'done' | 'failed' | null;

export function GroupInviteSection({ room, isOwner, title }: GroupInviteSectionProps) {
  const { t } = useTranslation();
  const clipboard = useClipboardCopy();
  const invite = useGroupInviteLink(room);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<ResetFeedback>(null);

  const copyLink = () => {
    if (invite.link) {
      clipboard.copy(invite.link);
    }
  };

  const confirmReset = () => {
    setIsConfirmOpen(false);
    setFeedback(null);
    void invite.reset().then((done) => setFeedback(done ? 'done' : 'failed'));
  };

  return (
    <div>
      {title}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="sc-notice sc-notice--info" style={{ alignItems: 'center' }}>
          <FaLink size={13} style={{ flexShrink: 0, opacity: 0.85 }} />
          <span>{invite.link ? t('roomInfo.inviteHelp') : invite.isCleared ? t('roomInfo.inviteCleared') : t('roomInfo.inviteUnavailable')}</span>
        </div>

        <button
          type="button"
          onClick={copyLink}
          disabled={!invite.link}
          className="sc-btn sc-btn--secondary sc-btn--lift"
          style={{ width: '100%', padding: '10px 15px', borderRadius: '8px' }}
        >
          {clipboard.isCopied() ? <FaCheck size={14} className="sc-anim-badge-pop" /> : <FaLink size={14} />}
          {clipboard.isCopied() ? t('roomInfo.copied') : t('roomInfo.copyInvite')}
        </button>

        {isOwner && (
          <button
            type="button"
            onClick={() => setIsConfirmOpen(true)}
            disabled={invite.isResetting}
            className="sc-btn sc-btn--outline sc-btn--lift"
            style={{ width: '100%', padding: '10px 15px', borderRadius: '8px' }}
          >
            <FaRedo size={13} />
            {t('roomInfo.resetInvite')}
          </button>
        )}

        {feedback && (
          <div role="status" className={`sc-notice ${feedback === 'done' ? 'sc-notice--info' : 'sc-notice--danger'}`}>
            <span>{feedback === 'done' ? t('roomInfo.inviteResetDone') : t('roomInfo.inviteResetFailed')}</span>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={t('roomInfo.resetInviteTitle')}
        message={t('roomInfo.resetInviteConfirm')}
        confirmLabel={t('roomInfo.resetInvite')}
        onConfirm={confirmReset}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}
