import { format } from 'date-fns';
import { FaCheck, FaExclamationCircle, FaRegClock } from 'react-icons/fa';
import { useTheme, type ResolvedBubbleStyle } from '@features/theme';
import type { MessageStatusInfo } from '@lib/message-status';
import type { ChatMessage } from '../types';

interface MessageMetaProps {
  message: ChatMessage;
  isOwn: boolean;
  bubble: ResolvedBubbleStyle;
  statusInfo: MessageStatusInfo | null;
  onRetry: () => void;
}

export function MessageMeta({ message, isOwn, bubble, statusInfo, onRetry }: MessageMetaProps) {
  const { theme } = useTheme();
  const statusColor = statusInfo?.read ? theme.receiptRead : bubble.mutedTextColor;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', padding: '4px 12px 3px' }}>
      <span style={{ fontSize: '0.7rem', color: bubble.mutedTextColor, fontWeight: 500 }}>{format(new Date(message.timestamp), 'HH:mm')}</span>
      {message.pending ? (
        <FaRegClock size={11} color={bubble.mutedTextColor} />
      ) : message.failed ? (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
          title="Falha ao enviar. Toque para reenviar."
          className="sc-icon-btn"
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
