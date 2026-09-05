import { useState, type CSSProperties, type ReactNode } from 'react';
import type { EntrancePhase } from '@features/motion';
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
  entrancePhase?: EntrancePhase;
  entranceIndex?: number;
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
  entrancePhase = 'none',
  entranceIndex = 0,
}: MessageBubbleShellProps) {
  const { theme, getRoomAppearance } = useTheme();
  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);
  const [entrance] = useState(entrancePhase);
  const [staggerIndex] = useState(entranceIndex);

  return (
    <div
      data-message-bubble
      data-message-root={messageId}
      data-own={isOwn}
      data-live={entrance === 'live'}
      className={`${entrance === 'none' ? '' : 'sc-anim-bubble-in sc-stagger '}chat-bubble-wrap${extraClassName}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      style={
        {
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          alignItems: isOwn ? 'flex-end' : 'flex-start',
          alignSelf: isOwn ? 'flex-end' : 'flex-start',
          marginBottom: '2px',
          '--sc-stagger-index': staggerIndex,
          '--sc-stagger-step': '38ms',
        } as CSSProperties
      }
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
