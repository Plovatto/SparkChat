import { FaCheck, FaCheckCircle, FaCopy, FaReply, FaShare, FaTrash } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { IconPillButton } from '@components/common/IconPillButton';
import { useClipboardCopy } from '@hooks/useClipboardCopy';

interface MessageActionsRowProps {
  isOwn: boolean;
  isExiting?: boolean;
  onReply?: () => void;
  onDelete: () => void;
  onForward?: () => void;
  onStartSelection?: (() => void) | undefined;
  copyText?: string | null;
}

export function MessageActionsRow({ isOwn, isExiting = false, onReply, onDelete, onForward, onStartSelection, copyText }: MessageActionsRowProps) {
  const { t } = useTranslation();
  const clipboard = useClipboardCopy();
  const copied = clipboard.isCopied();
  return (
    <div
      className={isExiting ? 'sc-anim-pop-out' : 'sc-anim-pop-in'}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        gap: '8px',
        margin: '8px 0 3px',
        width: 'max-content',
        maxWidth: 'calc(100vw - 32px)',
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

      {copyText && (
        <IconPillButton
          onClick={(event) => {
            event.stopPropagation();
            clipboard.copy(copyText);
          }}
          icon={copied ? <FaCheck size={11} /> : <FaCopy size={11} />}
          tone={copied ? 'success' : 'accent'}
          label={copied ? t('chat.message.copied') : t('chat.message.copy')}
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
