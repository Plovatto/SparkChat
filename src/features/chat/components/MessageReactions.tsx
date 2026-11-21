import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { MOTION_DURATION_MS, usePrefersReducedMotion } from '@features/motion';
import type { MessageReaction, RoomParticipant } from '@lib/socket';
import { useLongPress } from '../hooks/useLongPress';
import { reactorName, summarizeReactions, type ReactionSummary } from '../utils/reactions';

interface MessageReactionsProps {
  reactions: readonly MessageReaction[] | undefined;
  currentUserId: string | undefined;
  participants: RoomParticipant[];
  isOwn: boolean;
  compact: boolean;
  showCount?: boolean;
  background?: string;
  disabled?: boolean;
  onToggle: (emoji: string) => void;
  onShowReactors: (emoji: string) => void;
}

interface DisplayedChip {
  summary: ReactionSummary;
  phase: 'static' | 'enter' | 'exit';
}

function useChipPresence(summaries: ReactionSummary[]): DisplayedChip[] {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [displayed, setDisplayed] = useState<DisplayedChip[]>(() => summaries.map((summary) => ({ summary, phase: 'static' })));
  const timeoutsRef = useRef(new Map<string, number>());

  useEffect(() => {
    const incoming = new Map(summaries.map((summary) => [summary.emoji, summary]));
    setDisplayed((previous) => {
      const previousEmojis = new Set(previous.map((chip) => chip.summary.emoji));
      const kept = previous.map((chip): DisplayedChip => {
        const next = incoming.get(chip.summary.emoji);
        if (next) {
          return { summary: next, phase: chip.phase === 'exit' ? 'enter' : chip.phase };
        }
        return chip.phase === 'exit' ? chip : { summary: chip.summary, phase: 'exit' };
      });
      const added = summaries.filter((summary) => !previousEmojis.has(summary.emoji)).map((summary): DisplayedChip => ({ summary, phase: 'enter' }));
      return [...kept, ...added];
    });
  }, [summaries]);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    for (const chip of displayed) {
      const emoji = chip.summary.emoji;
      if (chip.phase !== 'exit') {
        const pending = timeouts.get(emoji);
        if (pending !== undefined) {
          window.clearTimeout(pending);
          timeouts.delete(emoji);
        }
        continue;
      }
      if (timeouts.has(emoji)) {
        continue;
      }
      timeouts.set(
        emoji,
        window.setTimeout(() => {
          timeouts.delete(emoji);
          setDisplayed((previous) => previous.filter((entry) => !(entry.summary.emoji === emoji && entry.phase === 'exit')));
        }, prefersReducedMotion ? 0 : MOTION_DURATION_MS.normal),
      );
    }
  }, [displayed, prefersReducedMotion]);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      for (const timeout of timeouts.values()) {
        window.clearTimeout(timeout);
      }
      timeouts.clear();
    };
  }, []);

  return displayed;
}

interface ReactionChipProps {
  chip: DisplayedChip;
  names: string;
  compact: boolean;
  showCount: boolean;
  disabled: boolean;
  onToggle: (emoji: string) => void;
  onShowReactors: (emoji: string) => void;
}

function ReactionChip({ chip, names, compact, showCount, disabled, onToggle, onShowReactors }: ReactionChipProps) {
  const { t } = useTranslation();
  const { summary, phase } = chip;
  const mountedCountRef = useRef(summary.count);
  const countClass = summary.count !== mountedCountRef.current ? 'sc-reaction-chip__count sc-reaction-chip__count--tick' : 'sc-reaction-chip__count';
  const longPress = useLongPress({ onLongPress: () => onShowReactors(summary.emoji), enabled: compact && phase !== 'exit' });
  const title = t('chat.reactions.chipTitle', { count: summary.count, names, emoji: summary.emoji });
  const phaseClass = phase === 'enter' ? ' sc-reaction-chip--in' : phase === 'exit' ? ' sc-reaction-chip--out' : '';

  return (
    <li
      className={`sc-reaction-chip${phaseClass}`}
      data-own={summary.includesOwn}
      data-compact={compact}
      data-count={showCount}
      aria-hidden={phase === 'exit' ? true : undefined}
      onContextMenu={compact ? (event) => event.preventDefault() : undefined}
    >
      <button
        type="button"
        className="sc-reaction-chip__toggle"
        aria-pressed={summary.includesOwn}
        aria-label={t('chat.reactions.chipLabel', { count: summary.count, names, emoji: summary.emoji })}
        title={compact ? undefined : title}
        disabled={disabled || phase === 'exit'}
        {...longPress.handlers}
        onClick={(event) => {
          event.stopPropagation();
          if (longPress.consumeLongPress()) {
            return;
          }
          onToggle(summary.emoji);
        }}
      >
        <span className="sc-reaction-chip__emoji" aria-hidden="true">
          {summary.emoji}
        </span>
        {showCount && !compact && (
          <span key={summary.count} className={countClass} aria-hidden="true">
            {summary.count}
          </span>
        )}
      </button>
      {showCount && compact && (
        <button
          type="button"
          className="sc-reaction-chip__count-button"
          aria-label={t('chat.reactions.showReactors', { emoji: summary.emoji })}
          disabled={phase === 'exit'}
          onClick={(event) => {
            event.stopPropagation();
            onShowReactors(summary.emoji);
          }}
        >
          <span key={summary.count} className={countClass}>
            {summary.count}
          </span>
        </button>
      )}
    </li>
  );
}

export const MessageReactions = memo(function MessageReactions({
  reactions,
  currentUserId,
  participants,
  isOwn,
  compact,
  showCount = true,
  background,
  disabled = false,
  onToggle,
  onShowReactors,
}: MessageReactionsProps) {
  const { t } = useTranslation();
  const [summaries, setSummaries] = useState(() => summarizeReactions(reactions, currentUserId));
  const signatureRef = useRef('');

  useEffect(() => {
    const next = summarizeReactions(reactions, currentUserId);
    const signature = next.map((summary) => `${summary.emoji}:${summary.userIds.join(',')}`).join('|');
    if (signature !== signatureRef.current) {
      signatureRef.current = signature;
      setSummaries(next);
    }
  }, [reactions, currentUserId]);

  const chips = useChipPresence(summaries);
  if (chips.length === 0) {
    return null;
  }

  return (
    <ul
      className="sc-reactions"
      data-own={isOwn}
      style={background ? ({ '--sc-reaction-bg': background } as CSSProperties) : undefined}
      aria-label={t('chat.reactions.listLabel')}
      data-no-long-press
      onClick={(event) => event.stopPropagation()}
    >
      {chips.map((chip) => (
        <ReactionChip
          key={chip.summary.emoji}
          chip={chip}
          names={chip.summary.userIds.map((userId) => reactorName(userId, participants, currentUserId)).join(', ')}
          compact={compact}
          showCount={showCount}
          disabled={disabled}
          onToggle={onToggle}
          onShowReactors={onShowReactors}
        />
      ))}
    </ul>
  );
});
