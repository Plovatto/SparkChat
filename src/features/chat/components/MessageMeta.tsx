import { format } from 'date-fns';
import { FaCheck, FaExclamationCircle, FaRegClock } from 'react-icons/fa';
import type { MessageStatusInfo } from '@lib/message-status';
import type { ChatMessage } from '../types';

interface MessageMetaProps {
  message: ChatMessage;
  isOwn: boolean;
  textColor: string;
  statusInfo: MessageStatusInfo | null;
  onRetry: () => void;
}

export function MessageMeta({ message, isOwn, textColor, statusInfo, onRetry }: MessageMetaProps) {
  const statusColor = statusInfo?.read ? '#4FC3F7' : 'white';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', padding: '4px 12px 3px' }}>
      <span style={{ fontSize: '0.7rem', opacity: 0.6, color: textColor, fontWeight: 500 }}>
        {format(new Date(message.timestamp), 'HH:mm')}
      </span>
      {message.pending ? (
        <FaRegClock size={11} color={textColor} style={{ opacity: 0.8 }} />
      ) : message.failed ? (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
          title="Falha ao enviar. Toque para reenviar."
          style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#ff6b6b' }}
        >
          <FaExclamationCircle size={12} />
        </button>
      ) : (
        statusInfo && (
          <div style={{ display: 'flex', alignItems: 'center', opacity: isOwn ? 0.9 : 0.7 }}>
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
