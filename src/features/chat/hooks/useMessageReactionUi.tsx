import { useCallback, useRef, useState, type ReactNode } from 'react';
import { EmojiPickerPopover } from '@features/emoji';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useMediaQuery } from '@hooks/useMediaQuery';
import type { MessageReaction, RoomParticipant } from '@lib/socket';
import { MessageReactions } from '../components/MessageReactions';
import { ReactionQuickBar } from '../components/ReactionQuickBar';
import { ReactorsSheet } from '../components/ReactorsSheet';
import { findOwnReaction, nextOwnReaction, REACTION_COMPACT_QUERY } from '../utils/reactions';

interface ReactionUiOptions {
  messageId: string;
  reactions: readonly MessageReaction[] | undefined;
  canReact: boolean;
  isOwn: boolean;
  isSelected: boolean;
  currentUserId: string | undefined;
  participants: RoomParticipant[];
  onReact: (messageId: string, emoji: string | null) => void;
  onDismiss: () => void;
}

export interface ReactionUi {
  compact: boolean;
  quickBar: ReactNode;
  chips: ReactNode;
  overlays: ReactNode;
}

export function useMessageReactionUi({
  messageId,
  reactions,
  canReact,
  isOwn,
  isSelected,
  currentUserId,
  participants,
  onReact,
  onDismiss,
}: ReactionUiOptions): ReactionUi {
  const compact = useMediaQuery(REACTION_COMPACT_QUERY);
  const barPresence = usePresence(isSelected && canReact, MOTION_DURATION_MS.fast);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [sheetEmoji, setSheetEmoji] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const ownEmoji = currentUserId ? findOwnReaction(reactions, currentUserId) : null;

  const choose = useCallback(
    (emoji: string) => {
      onReact(messageId, nextOwnReaction(ownEmoji, emoji));
    },
    [onReact, messageId, ownEmoji],
  );

  const chooseFromBar = useCallback(
    (emoji: string) => {
      choose(emoji);
      onDismiss();
    },
    [choose, onDismiss],
  );

  const closePicker = useCallback(() => setIsPickerOpen(false), []);
  const togglePicker = useCallback(() => setIsPickerOpen((open) => !open), []);
  const showReactors = useCallback((emoji: string) => {
    setSheetEmoji(emoji);
    setIsSheetOpen(true);
  }, []);
  const closeSheet = useCallback(() => setIsSheetOpen(false), []);

  const quickBar = barPresence.isPresent ? (
    <ReactionQuickBar
      ref={moreButtonRef}
      isOwn={isOwn}
      ownEmoji={ownEmoji}
      isExiting={barPresence.isExiting}
      compact={compact}
      isPickerOpen={isPickerOpen}
      onReact={chooseFromBar}
      onOpenPicker={togglePicker}
    />
  ) : null;

  const chips = (
    <MessageReactions
      reactions={reactions}
      currentUserId={currentUserId}
      participants={participants}
      isOwn={isOwn}
      compact={compact}
      disabled={!canReact}
      onToggle={choose}
      onShowReactors={showReactors}
    />
  );

  const overlays = (
    <>
      <span data-no-long-press onClick={(event) => event.stopPropagation()} style={{ display: 'contents' }}>
        <EmojiPickerPopover
          open={isPickerOpen}
          anchorRef={moreButtonRef}
          placement={compact ? 'top' : 'bottom'}
          onClose={closePicker}
          onSelect={(emoji) => {
            setIsPickerOpen(false);
            onReact(messageId, emoji === ownEmoji ? null : emoji);
            onDismiss();
          }}
        />
      </span>
      {compact && (
        <ReactorsSheet
          isOpen={isSheetOpen}
          initialEmoji={sheetEmoji}
          reactions={reactions}
          participants={participants}
          currentUserId={currentUserId}
          onRemoveOwn={() => onReact(messageId, null)}
          onClose={closeSheet}
        />
      )}
    </>
  );

  return { compact, quickBar, chips, overlays };
}
