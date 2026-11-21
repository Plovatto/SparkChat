import { useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import type { EntrancePhase } from '@features/motion';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import { getDisplayName } from '@lib/format';
import { useLongPress } from '../hooks/useLongPress';
import { senderNameColor } from '../utils/sender-color';
import '../styles/chat-bubbles.css';

export type BubbleVariant = 'bubble' | 'media' | 'media-caption';

export interface BubbleRunPosition {
  isFirstInRun: boolean;
  isLastInRun: boolean;
}

interface MessageBubbleShellProps {
  isOwn: boolean;
  isGroupChat: boolean;
  roomId: string;
  messageId: string;
  senderId: string;
  senderNickname: string;
  senderAvatar?: number;
  currentUserId: string | undefined;
  isSelected?: boolean;
  onSelect: () => void;
  onOpenActions: () => void;
  allowCustomContextMenu?: boolean;
  padding: string;
  variant?: BubbleVariant;
  run?: BubbleRunPosition;
  extraClassName?: string;
  afterBubble?: ReactNode;
  reactions?: ReactNode;
  onLongPress?: () => void;
  children: ReactNode;
  minWidth?: string;
  cornerRadius?: number;
  entrancePhase?: EntrancePhase;
  entranceIndex?: number;
  containerRef?: Ref<HTMLDivElement>;
}

const SINGLE_RUN: BubbleRunPosition = { isFirstInRun: true, isLastInRun: true };
const TAIL_RADIUS = 4;

function bubbleCorners(radius: number, isOwn: boolean, isFirstInRun: boolean): string {
  const joined = isFirstInRun ? radius : TAIL_RADIUS;
  return isOwn
    ? `${radius}px ${joined}px ${TAIL_RADIUS}px ${radius}px`
    : `${joined}px ${radius}px ${radius}px ${TAIL_RADIUS}px`;
}

const GROUP_AVATAR_SIZE = 30;

export function MessageBubbleShell({
  isOwn,
  isGroupChat,
  roomId,
  messageId,
  senderId,
  senderNickname,
  senderAvatar,
  currentUserId,
  isSelected = false,
  onSelect,
  onOpenActions,
  allowCustomContextMenu = true,
  padding,
  variant = 'bubble',
  run = SINGLE_RUN,
  extraClassName = '',
  afterBubble,
  reactions,
  onLongPress,
  children,
  minWidth = '80px',
  cornerRadius = 12,
  entrancePhase = 'none',
  entranceIndex = 0,
  containerRef,
}: MessageBubbleShellProps) {
  const { theme, getRoomAppearance } = useTheme();
  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);
  const [entrance] = useState(entrancePhase);
  const [staggerIndex] = useState(entranceIndex);
  const lastPointerTypeRef = useRef<string | null>(null);
  const showGroupChrome = isGroupChat && !isOwn;
  const showSenderName = showGroupChrome && run.isFirstInRun;
  const showAvatar = showGroupChrome && run.isLastInRun;
  const isBareMedia = variant === 'media';
  const longPress = useLongPress({
    onLongPress: () => {
      window.getSelection()?.removeAllRanges();
      navigator.vibrate?.(12);
      (onLongPress ?? onOpenActions)();
    },
    enabled: allowCustomContextMenu,
  });

  return (
    <div
      ref={containerRef}
      data-message-bubble
      data-message-root={messageId}
      data-own={isOwn}
      data-live={entrance === 'live'}
      data-variant={variant}
      className={`${entrance === 'none' ? '' : 'sc-anim-bubble-in sc-stagger '}chat-bubble-wrap${extraClassName}`}
      onClickCapture={(event) => {
        if (longPress.consumeLongPress()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onClick={(event) => {
        if (isSelected) {
          event.stopPropagation();
          onSelect();
        }
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
          if (!(event.target as HTMLElement).closest('img')) {
            event.preventDefault();
          }
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
          alignItems: 'flex-end',
          gap: '8px',
          alignSelf: isOwn ? 'flex-end' : 'flex-start',
          minWidth: 0,
          '--sc-stagger-index': staggerIndex,
          '--sc-stagger-step': '38ms',
        } as CSSProperties
      }
    >
      {showGroupChrome && (
        <div className="sc-bubble-avatar-slot" aria-hidden={!showAvatar}>
          {showAvatar && (
            <Avatar userId={senderId} avatarIndex={senderAvatar} size={GROUP_AVATAR_SIZE} iconSize={15} tone="soft" className="sc-anim-pop-in" />
          )}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          alignItems: isOwn ? 'flex-end' : 'flex-start',
          minWidth: 0,
          maxWidth: '100%',
        }}
      >
        {showSenderName && (
          <div className="sc-bubble-sender" style={{ color: senderNameColor(senderId, theme.kind) }}>
            {getDisplayName(senderId, senderNickname, currentUserId)}
          </div>
        )}
        <div
          data-message-id={messageId}
          data-selected={isSelected}
          data-variant={variant}
          className={`sc-bubble${isBareMedia ? ' sc-bubble--media' : variant === 'media-caption' ? ' sc-bubble--media-caption' : ''}`}
          style={{
            background: isBareMedia ? 'transparent' : bubbleStyle.background,
            color: bubbleStyle.textColor,
            borderRadius: isBareMedia ? `${cornerRadius}px` : bubbleCorners(cornerRadius, isOwn, run.isFirstInRun),
            boxShadow: isSelected ? `0 0 0 1.5px ${theme.messageSelectedRing}, ${isBareMedia ? 'none' : theme.shadowSm}`.replace(', none', '') : isBareMedia ? 'none' : theme.shadowSm,
            backdropFilter: !isBareMedia && bubbleStyle.blur > 0 ? `blur(${bubbleStyle.blur}px)` : undefined,
            WebkitBackdropFilter: !isBareMedia && bubbleStyle.blur > 0 ? `blur(${bubbleStyle.blur}px)` : undefined,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding,
            minWidth,
            maxWidth: '100%',
            overflow: variant === 'bubble' ? undefined : 'hidden',
            position: 'relative',
            cursor: 'pointer',
          }}
        >
          {children}
        </div>
        {reactions}
        {afterBubble}
      </div>
    </div>
  );
}
