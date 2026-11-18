import type { ReactNode } from 'react';
import { FaCheck, FaExclamationCircle, FaRegClock } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useTheme, type ResolvedBubbleStyle } from '@features/theme';
import { formatTime } from '@lib/format';
import type { MessageStatusInfo } from '@lib/message-status';
import type { ChatMessage } from '../types';

interface MessageMetaProps {
  message: ChatMessage;
  isOwn: boolean;
  bubble: ResolvedBubbleStyle;
  statusInfo: MessageStatusInfo | null;
  onRetry: () => void;
  leading?: ReactNode;
}

export function MessageMeta({ message, isOwn, bubble, statusInfo, onRetry, leading }: MessageMetaProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const statusColor = statusInfo?.read ? theme.receiptRead : bubble.mutedTextColor;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', padding: '4px 12px 3px' }}>
      {leading && <div style={{ flex: '1 1 auto', minWidth: 0 }}>{leading}</div>}
      <span style={{ fontSize: '0.7rem', color: bubble.mutedTextColor, fontWeight: 500 }}>{formatTime(message.timestamp)}</span>
      {message.pending ? (
        <FaRegClock size={11} color={bubble.mutedTextColor} className="sc-anim-pulse-soft" />
      ) : message.failed ? (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
          title={t('chat.message.retry')}
          className="sc-icon-btn sc-anim-badge-pop"
          style={{ width: '20px', height: '20px', background: 'transparent', color: isOwn ? bubble.textColor : theme.dangerText }}
        >
          <FaExclamationCircle size={12} />
        </button>
      ) : (
        statusInfo && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {statusInfo.icon === 'double' ? (
              <>
                <FaCheck size={11} color={statusColor} />
                <FaCheck size={11} color={statusColor} style={{ marginLeft: '-6px' }} />
              </>
            ) : (
              <FaCheck size={11} color={statusColor} />
            )}
          </div>
        )
      )}
    </div>
  );
}
