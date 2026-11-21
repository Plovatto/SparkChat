import { FaCheckCircle, FaReply, FaShare, FaTrash } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { IconPillButton } from '@components/common/IconPillButton';

interface MessageActionsRowProps {
  isOwn: boolean;
  isExiting?: boolean;
  onReply?: () => void;
  onDelete: () => void;
  onForward?: () => void;
  onStartSelection?: (() => void) | undefined;
}

export function MessageActionsRow({ isOwn, isExiting = false, onReply, onDelete, onForward, onStartSelection }: MessageActionsRowProps) {
  const { t } = useTranslation();
  return (
    <div
      className={isExiting ? 'sc-anim-pop-out' : 'sc-anim-pop-in'}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        gap: '8px',
        margin: '8px 0 3px',
        transformOrigin: isOwn ? 'top right' : 'top left',
      }}
    >
      {onReply && (
        <IconPillButton
          onClick={(event) => {
            event.stopPropagation();
            onReply();
          }}
          icon={<FaReply size={11} />}
          tone="accent"
          label={t('chat.message.reply')}
        />
      )}

      {onForward && (
        <IconPillButton
          onClick={(event) => {
            event.stopPropagation();
            onForward();
          }}
          icon={<FaShare size={11} />}
          tone="accent"
          label={t('chat.message.forward')}
        />
      )}

      {onStartSelection && (
        <IconPillButton
          onClick={(event) => {
            event.stopPropagation();
            onStartSelection();
          }}
          icon={<FaCheckCircle size={11} />}
          tone="accent"
          label={t('chat.message.select')}
        />
      )}

      <IconPillButton
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        icon={<FaTrash size={11} />}
        tone="danger"
        label={t('chat.message.delete')}
      />
    </div>
  );
}
