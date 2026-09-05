import type { ReactNode } from 'react';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import { getDisplayName } from '@lib/format';

interface MessageBubbleShellProps {
  isOwn: boolean;
  isGroupChat: boolean;
  roomId: string;
  messageId: string;
  senderId: string;
  senderNickname: string;
  currentUserId: string | undefined;
  isSelected?: boolean;
  onSelect: () => void;
  padding: string;
  extraClassName?: string;
  afterBubble?: ReactNode;
  children: ReactNode;
  minWidth?: string;
  cornerRadius?: number;
}

export function MessageBubbleShell({
  isOwn,
  isGroupChat,
  roomId,
  messageId,
  senderId,
  senderNickname,
  currentUserId,
  isSelected = false,
  onSelect,
  padding,
  extraClassName = '',
  afterBubble,
  children,
  minWidth = '80px',
  cornerRadius = 16,
}: MessageBubbleShellProps) {
  const { theme, getRoomAppearance } = useTheme();
  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);

  return (
    <div
      data-message-bubble
      data-message-root={messageId}
      className={`animate__animated animate__fadeInUp animate__faster chat-bubble-wrap${extraClassName}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignItems: isOwn ? 'flex-end' : 'flex-start',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: '2px',
      }}
    >
      <div
        data-message-id={messageId}
        data-selected={isSelected}
        className="sc-bubble"
        style={{
          background: bubbleStyle.background,
          color: bubbleStyle.textColor,
          borderRadius: isOwn
            ? `${cornerRadius}px ${cornerRadius}px 4px ${cornerRadius}px`
            : `${cornerRadius}px ${cornerRadius}px ${cornerRadius}px 4px`,
          boxShadow: isOwn ? theme.shadowMd : theme.shadowSm,
          backdropFilter: bubbleStyle.blur > 0 ? `blur(${bubbleStyle.blur}px)` : undefined,
          WebkitBackdropFilter: bubbleStyle.blur > 0 ? `blur(${bubbleStyle.blur}px)` : undefined,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          padding,
          minWidth,
          maxWidth: '100%',
          cursor: 'pointer',
        }}
      >
        {!isOwn && isGroupChat && (
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: bubbleStyle.accentColor, padding: '4px 12px 0' }}>
            {getDisplayName(senderId, senderNickname, currentUserId)}
          </div>
        )}
        {children}
      </div>
      {afterBubble}
    </div>
  );
}
