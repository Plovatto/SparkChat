import { FaReply, FaShare, FaTrash } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { IconPillButton } from '@components/common/IconPillButton';

interface MessageActionsRowProps {
  isOwn: boolean;
  isExiting?: boolean;
  onReply: () => void;
  onDelete: () => void;
  onForward: () => void;
}

export function MessageActionsRow({ isOwn, isExiting = false, onReply, onDelete, onForward }: MessageActionsRowProps) {
  const { t } = useTranslation();
  return (
    <div
      className={isExiting ? 'sc-anim-pop-out' : 'sc-anim-pop-in'}
      style={{ display: 'flex', gap: '8px', margin: '8px 0 3px', transformOrigin: isOwn ? 'top right' : 'top left' }}
    >
      <IconPillButton
        onClick={(event) => {
          event.stopPropagation();
          onReply();
        }}
        icon={<FaReply size={11} />}
        tone="accent"
        label={t('chat.message.reply')}
      />

      <IconPillButton
        onClick={(event) => {
          event.stopPropagation();
          onForward();
        }}
        icon={<FaShare size={11} />}
        tone="accent"
        label={t('chat.message.forward')}
      />

      {isOwn && (
        <IconPillButton
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          icon={<FaTrash size={11} />}
          tone="danger"
          label={t('chat.message.delete')}
        />
      )}
    </div>
  );
}
