import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECENT_EMOJIS_STORAGE_KEY } from '../utils/recent-emojis';
import { SKIN_TONE_STORAGE_KEY } from '../utils/skin-tone';

const GRIN = '\u{1F600}';
const HEART = '\u{2764}\u{FE0F}';

const root = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => `translated:${key}` }));
vi.mock('frimousse', () => {
  const Root = ({ children, onEmojiSelect, ...props }: { children: ReactNode; onEmojiSelect: (emoji: { emoji: string; label: string }) => void }) => {
    root.props = { ...props, onEmojiSelect };
    return (
      <div data-testid="frimousse-root">
        {children}
        <button type="button" onClick={() => onEmojiSelect({ emoji: HEART, label: 'red heart' })}>
          list-emoji
        </button>
      </div>
    );
  };
  return {
    EmojiPicker: {
      Root,
      Search: (props: ComponentProps<'input'>) => <input {...props} />,
      Viewport: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Loading: () => null,
      Empty: () => null,
      List: () => null,
      ActiveEmoji: ({ children }: { children: (props: { emoji?: { emoji: string; label: string } }) => ReactNode }) => <>{children({})}</>,
    },
    useEmojiDetails: (emoji: string) => (emoji === GRIN ? { emoji: GRIN, label: 'grinning face' } : undefined),
    defaultEmojiDataResolver: vi.fn(() =>
      Promise.resolve({
      locale: 'pt',
      emojis: [],
      categories: [
        { index: 0, label: 'Sorrisos' },
        { index: 9, label: 'Bandeiras' },
      ],
      skinTones: {},
      }),
    ),
  };
});

import EmojiPickerPanel from './EmojiPickerPanel';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  root.props = null;
});

describe('EmojiPickerPanel', () => {
  it('configures frimousse with self-hosted data, the locale and the column count', () => {
    render(<EmojiPickerPanel locale="pt" columns={7} autoFocusSearch={false} onSelect={() => undefined} onClose={() => undefined} />);
    expect(root.props).toMatchObject({ locale: 'pt', columns: 7, skinTone: 'none', emojibaseUrl: '/emoji-data/17.0.0' });
    const search = screen.getByTestId('emoji-search-input');
    expect(search.getAttribute('placeholder')).toBe('emoji.searchPlaceholder');
    expect(search.getAttribute('aria-label')).toBe('emoji.searchLabel');
  });

  it('translates category names through the app translations', async () => {
    render(<EmojiPickerPanel locale="pt" columns={7} autoFocusSearch={false} onSelect={() => undefined} onClose={() => undefined} />);
    const resolve = root.props?.resolveEmojiData as (locale: string, options: object) => Promise<{ categories: { label: string }[] }>;
    const data = await resolve('pt', {});
    expect(data.categories.map((category) => category.label)).toEqual(['translated:emoji.categories.smileys', 'translated:emoji.categories.flags']);
  });

  it('forwards selections and remembers them as recently used', () => {
    const onSelect = vi.fn();
    render(<EmojiPickerPanel locale="en" columns={8} autoFocusSearch={false} onSelect={onSelect} onClose={() => undefined} />);
    expect(screen.queryAllByTestId('emoji-recent')).toHaveLength(0);

    fireEvent.click(screen.getByText('list-emoji'));
    expect(onSelect).toHaveBeenCalledWith(HEART);
    expect(JSON.parse(window.localStorage.getItem(RECENT_EMOJIS_STORAGE_KEY) ?? '[]')).toEqual([HEART]);
  });

  it('shows recents from storage, limited to one row and hidden while searching', () => {
    const stored = Array.from({ length: 12 }, (_, index) => String.fromCodePoint(0x1f600 + index));
    window.localStorage.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify(stored));
    const onSelect = vi.fn();
    render(<EmojiPickerPanel locale="en" columns={8} autoFocusSearch={false} onSelect={onSelect} onClose={() => undefined} />);

    const recents = screen.getAllByTestId('emoji-recent');
    expect(recents).toHaveLength(8);
    expect(screen.getByText('emoji.recent')).toBeTruthy();

    expect(recents[0]?.getAttribute('aria-label')).toBe('grinning face');
    expect(recents[1]?.getAttribute('aria-label')).toBe(stored[1]);

    fireEvent.click(recents[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(GRIN);

    fireEvent.change(screen.getByTestId('emoji-search-input'), { target: { value: 'cat' } });
    expect(screen.queryAllByTestId('emoji-recent')).toHaveLength(0);
  });

  it('keeps focus where it was when an emoji is pressed', () => {
    window.localStorage.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify([GRIN]));
    render(<EmojiPickerPanel locale="en" columns={8} autoFocusSearch={false} onSelect={() => undefined} onClose={() => undefined} />);
    const pressed = fireEvent.mouseDown(screen.getByTestId('emoji-recent'));
    expect(pressed).toBe(false);
  });

  it('cycles and persists the skin tone', () => {
    render(<EmojiPickerPanel locale="en" columns={8} autoFocusSearch={false} onSelect={() => undefined} onClose={() => undefined} />);
    fireEvent.click(screen.getByTestId('emoji-skin-tone'));
    expect(root.props?.skinTone).toBe('light');
    expect(window.localStorage.getItem(SKIN_TONE_STORAGE_KEY)).toBe('light');
  });

  it('has a visible close button', () => {
    const onClose = vi.fn();
    render(<EmojiPickerPanel locale="en" columns={8} autoFocusSearch onSelect={() => undefined} onClose={onClose} />);
    const close = screen.getByTestId('emoji-picker-close');
    expect(close.getAttribute('aria-label')).toBe('emoji.close');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByTestId('emoji-search-input'));
  });
});
