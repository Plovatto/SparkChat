import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmojiPickerPanelProps } from './EmojiPickerPanel';

const media = vi.hoisted(() => ({ sheet: false }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@lib/i18n/app-i18n', () => ({ useAppLanguage: () => ({ language: 'en', changeLanguage: () => undefined }), translate: (key: string) => key }));
vi.mock('@hooks/useMediaQuery', () => ({
  useMediaQuery: (query: string) => (query.includes('max-width') ? media.sheet : false),
}));
vi.mock('../utils/load-emoji-picker', () => {
  function FakePanel({ locale, columns, onSelect }: EmojiPickerPanelProps) {
    return (
      <div data-testid="fake-panel" data-locale={locale} data-columns={columns}>
        <button type="button" onClick={() => onSelect('\u{1F600}')}>
          pick
        </button>
      </div>
    );
  }
  const load = () => Promise.resolve({ default: FakePanel });
  return { loadEmojiPickerPanel: load, preloadEmojiPicker: () => undefined };
});

import { EmojiPickerPopover } from '../index';

function setup(open: boolean, anchorRef?: RefObject<HTMLElement | null>) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const ref = anchorRef ?? createRef<HTMLElement>();
  const utils = render(
    <div>
      <button type="button" ref={ref as RefObject<HTMLButtonElement>} data-testid="anchor">
        anchor
      </button>
      <button type="button" data-testid="outside">
        outside
      </button>
      <EmojiPickerPopover open={open} anchorRef={ref} onSelect={onSelect} onClose={onClose} />
    </div>,
  );
  return { ...utils, onSelect, onClose, ref };
}

afterEach(() => {
  media.sheet = false;
});

describe('EmojiPickerPopover', () => {
  it('renders nothing while closed', () => {
    setup(false);
    expect(screen.queryByTestId('emoji-picker')).toBeNull();
  });

  it('opens as a labelled dialog, lazily loads the picker and forwards selections', async () => {
    const { onSelect, onClose } = setup(true);
    const dialog = screen.getByTestId('emoji-picker');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('data-layout')).toBe('popover');
    expect(screen.getByText('emoji.pickerLabel').id).toBe(dialog.getAttribute('aria-labelledby'));

    const panel = await screen.findByTestId('fake-panel');
    expect(panel.getAttribute('data-locale')).toBe('en');
    expect(panel.getAttribute('data-columns')).toBe('8');

    fireEvent.click(screen.getByText('pick'));
    expect(onSelect).toHaveBeenCalledWith('\u{1F600}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape and on outside pointer down, but not inside or on the anchor', async () => {
    const { onClose } = setup(true);
    await screen.findByTestId('fake-panel');

    fireEvent.pointerDown(screen.getByText('pick'));
    fireEvent.pointerDown(screen.getByTestId('anchor'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('becomes a bottom sheet with a drag handle and backdrop on small screens', async () => {
    media.sheet = true;
    const { onClose } = setup(true);
    const dialog = screen.getByTestId('emoji-picker');
    expect(dialog.getAttribute('data-layout')).toBe('sheet');
    expect(dialog.className).toContain('is-sheet');
    expect(screen.getByTestId('emoji-picker-backdrop')).toBeTruthy();
    await screen.findByTestId('fake-panel');

    fireEvent.pointerDown(screen.getByTestId('emoji-picker-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('emoji.close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closes the sheet when the handle is dragged down far enough', async () => {
    media.sheet = true;
    const { onClose } = setup(true);
    await screen.findByTestId('fake-panel');
    const handle = screen.getByTestId('emoji-picker-handle');

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 120 });
    expect(screen.getByTestId('emoji-picker').style.transform).toContain('20px');
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 120 });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle, { pointerId: 2, clientY: 100, button: 0 });
    fireEvent.pointerUp(handle, { pointerId: 2, clientY: 260 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('plays an exit state before unmounting when closed', () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      const ref = createRef<HTMLButtonElement>();
      const { rerender } = render(<EmojiPickerPopover open anchorRef={ref} onSelect={() => undefined} onClose={onClose} />);
      rerender(<EmojiPickerPopover open={false} anchorRef={ref} onSelect={() => undefined} onClose={onClose} />);
      expect(screen.getByTestId('emoji-picker').className).toContain('is-exiting');
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByTestId('emoji-picker')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
