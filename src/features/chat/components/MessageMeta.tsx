import { useRef, type ReactNode } from 'react';
import { FaCheck, FaExclamationCircle, FaRegClock } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useTheme, type ResolvedBubbleStyle } from '@features/theme';
import { formatTime } from '@lib/format';
import type { MessageStatusInfo } from '@lib/message-status';
import type { ChatMessage } from '../types';

export type MessageMetaPlacement = 'row' | 'inline' | 'overlay';

interface MessageMetaProps {
  message: ChatMessage;
  isOwn: boolean;
  bubble: ResolvedBubbleStyle;
  statusInfo: MessageStatusInfo | null;
  onRetry: () => void;
  leading?: ReactNode;
  placement?: MessageMetaPlacement;
}

const OVERLAY_TEXT = '#ffffff';
const OVERLAY_READ = '#9fd0ff';

export function MessageMetaSpacer({ isOwn }: { isOwn: boolean }) {
  return <span className="sc-meta-spacer" data-own={isOwn} aria-hidden="true" />;
}

export function MessageMeta({ message, isOwn, bubble, statusInfo, onRetry, leading, placement = 'row' }: MessageMetaProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isOverlay = placement === 'overlay';
  const mutedColor = isOverlay ? OVERLAY_TEXT : bubble.mutedTextColor;
  const statusColor = statusInfo?.read ? (isOverlay ? OVERLAY_READ : theme.receiptRead) : mutedColor;
  const tickState = statusInfo ? (statusInfo.read ? 'read' : statusInfo.icon) : 'none';
  const mountedTickStateRef = useRef(tickState);
  const tickAnimation = tickState !== mountedTickStateRef.current ? tickState : undefined;

  const status = message.pending ? (
    <FaRegClock size={10} color={mutedColor} className="sc-anim-pulse-soft" />
  ) : message.failed ? (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onRetry();
      }}
      title={t('chat.message.retry')}
      className="sc-icon-btn sc-anim-badge-pop"
      style={{ width: '18px', height: '18px', background: 'transparent', color: isOwn ? bubble.textColor : theme.dangerText }}
    >
      <FaExclamationCircle size={11} />
    </button>
  ) : (
    statusInfo && (
      <span key={tickState} className="sc-meta__ticks" data-animate={tickAnimation}>
        <FaCheck size={10} color={statusColor} />
        {statusInfo.icon === 'double' && <FaCheck size={10} color={statusColor} style={{ marginLeft: '-5px' }} />}
      </span>
    )
  );

  return (
    <div className={`sc-meta sc-meta--${placement}`}>
      {leading && placement === 'row' && <div className="sc-meta__leading">{leading}</div>}
      <span className="sc-meta__time" style={{ color: mutedColor }}>
        {formatTime(message.timestamp)}
      </span>
      {status}
    </div>
  );
}
