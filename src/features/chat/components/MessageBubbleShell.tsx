import { useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import type { EntrancePhase } from '@features/motion';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import { getDisplayName } from '@lib/format';
import { useLongPress } from '../hooks/useLongPress';

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
  onOpenActions: () => void;
  allowCustomContextMenu?: boolean;
  padding: string;
  extraClassName?: string;
  afterBubble?: ReactNode;
  beforeBubble?: ReactNode;
  onLongPress?: () => void;
  children: ReactNode;
  minWidth?: string;
  cornerRadius?: number;
  entrancePhase?: EntrancePhase;
  entranceIndex?: number;
  containerRef?: Ref<HTMLDivElement>;
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
  onOpenActions,
  allowCustomContextMenu = true,
  padding,
  extraClassName = '',
  afterBubble,
  beforeBubble,
  onLongPress,
  children,
  minWidth = '80px',
  cornerRadius = 16,
  entrancePhase = 'none',
  entranceIndex = 0,
  containerRef,
}: MessageBubbleShellProps) {
  const { theme, getRoomAppearance } = useTheme();
  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);
  const [entrance] = useState(entrancePhase);
  const [staggerIndex] = useState(entranceIndex);
  const lastPointerTypeRef = useRef<string | null>(null);
  const longPress = useLongPress({ onLongPress: onLongPress ?? onOpenActions, enabled: allowCustomContextMenu });

  return (
    <div
      ref={containerRef}
      data-message-bubble
      data-message-root={messageId}
      data-own={isOwn}
      data-live={entrance === 'live'}
      className={`${entrance === 'none' ? '' : 'sc-anim-bubble-in sc-stagger '}chat-bubble-wrap${extraClassName}`}
      onClick={(event) => {
        event.stopPropagation();
        if (longPress.consumeLongPress()) {
          return;
        }
        onSelect();
      }}
      onPointerDown={(event) => {
        lastPointerTypeRef.current = event.pointerType;
        if (!(event.target as HTMLElement).closest('[data-no-long-press]')) {
          longPress.handlers.onPointerDown(event);
        }
      }}
      onPointerMove={longPress.handlers.onPointerMove}
      onPointerUp={longPress.handlers.onPointerUp}
      onPointerCancel={longPress.handlers.onPointerCancel}
      onPointerLeave={longPress.handlers.onPointerLeave}
      onContextMenu={(event) => {
        if (!allowCustomContextMenu || (event.target as HTMLElement).closest('a, video')) {
          return;
        }
        if (lastPointerTypeRef.current === 'touch') {
          event.preventDefault();
          return;
        }
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onOpenActions();
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
      {beforeBubble}
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
