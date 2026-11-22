import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageReaction, RoomParticipant } from '@lib/socket';
import { MessageReactions } from './MessageReactions';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key) }),
}));

const participants = [
  { id: 'me', nickname: 'Eu' },
  { id: 'ana', nickname: 'Ana' },
  { id: 'bia', nickname: 'Bia' },
] as RoomParticipant[];

function reactions(entries: [string, string][]): MessageReaction[] {
  return entries.map(([userId, emoji], index) => ({ userId, emoji, updatedAt: `2026-11-20T10:00:0${index}.000Z` }));
}

type ChipsProps = Parameters<typeof MessageReactions>[0];

function chipsElement(props: Partial<ChipsProps>, handlers: { onToggle: () => void; onShowReactors: () => void }) {
  return (
    <MessageReactions
      reactions={reactions([
        ['ana', '❤️'],
        ['me', '❤️'],
        ['bia', '😂'],
      ])}
      currentUserId="me"
      participants={participants}
      isOwn={false}
      compact={false}
      {...handlers}
      {...props}
    />
  );
}

function renderChips(props: Partial<ChipsProps> = {}) {
  const handlers = { onToggle: vi.fn(), onShowReactors: vi.fn() };
  const view = render(chipsElement(props, handlers));
  return { ...view, ...handlers, rerenderWith: (next: Partial<ChipsProps>) => view.rerender(chipsElement({ ...props, ...next }, handlers)) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MessageReactions', () => {
  it('groups reactions by emoji with counts, highlights the own one and names who reacted', () => {
    const { container } = renderChips();
    const chips = container.querySelectorAll('.sc-reaction-chip');

    expect(chips).toHaveLength(2);
    expect(chips[0]?.textContent).toBe('❤️2');
    expect(chips[0]?.getAttribute('data-own')).toBe('true');
    expect(chips[1]?.textContent).toBe('😂1');
    expect(chips[1]?.getAttribute('data-own')).toBe('false');
    expect(chips[0]?.querySelector('button')?.getAttribute('title')).toContain('"names":"Ana, ');
    expect(chips[0]?.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(chips[0]?.className).not.toContain('sc-reaction-chip--in');
  });

  it('toggles the reaction when a chip is clicked without selecting the bubble', () => {
    const parentClick = vi.fn();
    const onToggle = vi.fn();
    render(
      <div onClick={parentClick}>
        <MessageReactions
          reactions={reactions([['ana', '😂']])}
          currentUserId="me"
          participants={participants}
          isOwn
          compact={false}
          onToggle={onToggle}
          onShowReactors={vi.fn()}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(onToggle).toHaveBeenCalledWith('😂');
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('pops new chips in, ticks counts and lets removed chips fade out before leaving', () => {
    const { container, rerenderWith } = renderChips();

    rerenderWith({
      reactions: reactions([
        ['ana', '❤️'],
        ['me', '❤️'],
        ['bia', '❤️'],
        ['me', '🙏'],
      ]),
    });
    const chips = () => [...container.querySelectorAll('.sc-reaction-chip')];
    expect(chips().map((chip) => chip.className)).toEqual([
      'sc-reaction-chip',
      'sc-reaction-chip sc-reaction-chip--out',
      'sc-reaction-chip sc-reaction-chip--in',
    ]);
    expect(chips()[0]?.querySelector('.sc-reaction-chip__count--tick')?.textContent).toBe('3');

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(chips().map((chip) => chip.textContent)).toEqual(['❤️3', '🙏1']);
  });

  it('renders nothing without reactions', () => {
    const { container } = renderChips({ reactions: [] });
    expect(container.querySelector('.sc-reactions')).toBeNull();
  });

  it('on phones, the count opens who reacted and a long press does too instead of toggling', () => {
    const { container, onToggle, onShowReactors } = renderChips({ compact: true });
    const firstChip = container.querySelector('.sc-reaction-chip');
    const [toggle, count] = [...(firstChip?.querySelectorAll('button') ?? [])];
    if (!toggle || !count) {
      throw new Error('chip buttons missing');
    }

    expect(toggle.getAttribute('title')).toBeNull();
    fireEvent.click(count);
    expect(onShowReactors).toHaveBeenCalledWith('❤️');

    fireEvent.pointerDown(toggle, { pointerType: 'touch', clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.pointerUp(toggle);
    fireEvent.click(toggle);
    expect(onShowReactors).toHaveBeenCalledTimes(2);
    expect(onToggle).not.toHaveBeenCalled();

    fireEvent.pointerDown(toggle, { pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerUp(toggle);
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith('❤️');
  });
  it('bursts only when the current user adds a reaction, never for existing or others reactions', () => {
    const { container, rerenderWith } = renderChips({ reactions: reactions([['ana', '😂']]) });
    expect(container.querySelector('.sc-reaction-burst')).toBeNull();

    rerenderWith({ reactions: reactions([['ana', '😂'], ['bia', '😂']]) });
    expect(container.querySelector('.sc-reaction-burst')).toBeNull();

    rerenderWith({ reactions: reactions([['ana', '😂'], ['bia', '😂'], ['me', '😂']]) });
    expect(container.querySelectorAll('.sc-reaction-burst')).toHaveLength(1);
    expect(container.querySelector('.sc-reaction-chip__emoji--burst')).not.toBeNull();

    rerenderWith({ reactions: reactions([['ana', '😂'], ['bia', '😂'], ['me', '😂'], ['me', '🔥']]) });
    expect(container.querySelectorAll('.sc-reaction-burst')).toHaveLength(2);
  });
});
