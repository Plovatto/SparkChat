import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, useRef, useState, type RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmojiPickerPanelProps } from './EmojiPickerPanel';

const media = vi.hoisted(() => ({ sheet: false, coarse: false }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@lib/i18n/app-i18n', () => ({ useAppLanguage: () => ({ language: 'en', changeLanguage: () => undefined }), translate: (key: string) => key }));
vi.mock('@hooks/useMediaQuery', () => ({
  useMediaQuery: (query: string) => (query.includes('max-width') ? media.sheet : query.includes('coarse') ? media.coarse : false),
}));
vi.mock('../utils/load-emoji-picker', () => {
  function FakePanel({ locale, columns, autoFocusSearch, onSelect, onClose }: EmojiPickerPanelProps) {
    return (
      <div data-testid="fake-panel" data-locale={locale} data-columns={columns} data-autofocus={String(autoFocusSearch)}>
        <input data-testid="fake-search" aria-label="search" />
        <button type="button" onClick={() => onSelect('\u{1F600}')}>
          pick
        </button>
        <button type="button" onClick={onClose}>
          close
        </button>
        <div data-testid="fake-scroll" />
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

function rect(top: number, bottom: number, left = 10, right = 300): DOMRect {
  return { top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) };
}

function Toggleable({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div>
      <input data-testid="composer" />
      <div ref={ref}>
        <button type="button" data-testid="toggle" onClick={() => setOpen((value) => !value)}>
          toggle
        </button>
      </div>
      <EmojiPickerPopover open={open} anchorRef={ref} onSelect={onSelect} onClose={() => setOpen(false)} />
    </div>
  );
}

afterEach(() => {
  media.sheet = false;
  media.coarse = false;
  vi.restoreAllMocks();
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

    fireEvent.click(screen.getByText('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
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

  it('leaves Escape to whoever handled it first and does not stop it from bubbling', async () => {
    const { onClose } = setup(true);
    await screen.findByTestId('fake-panel');
    const bubbled = vi.fn();
    window.addEventListener('keydown', bubbled);
    try {
      const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      handled.preventDefault();
      document.body.dispatchEvent(handled);
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(bubbled).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener('keydown', bubbled);
    }
  });

  it('closes when an app modal opens', async () => {
    const { onClose } = setup(true);
    await screen.findByTestId('fake-panel');
    const modal = document.createElement('div');
    modal.className = 'sc-modal-panel';
    document.body.appendChild(modal);
    try {
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    } finally {
      modal.remove();
    }
  });

  it('focuses the search on desktop and on touch only when opened from the keyboard', async () => {
    setup(true);
    expect((await screen.findByTestId('fake-panel')).getAttribute('data-autofocus')).toBe('true');
  });

  it('does not focus the search when opened by touch', async () => {
    media.coarse = true;
    fireEvent.pointerDown(document.body);
    setup(true);
    expect((await screen.findByTestId('fake-panel')).getAttribute('data-autofocus')).toBe('false');
  });

  it('focuses the search on touch devices when opened from the keyboard', async () => {
    media.coarse = true;
    fireEvent.keyDown(document.body, { key: 'Enter' });
    setup(true);
    expect((await screen.findByTestId('fake-panel')).getAttribute('data-autofocus')).toBe('true');
  });

  it('returns focus to where it was when closing from inside the picker', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Toggleable onSelect={() => undefined} />);
      screen.getByTestId('composer').focus();
      fireEvent.click(screen.getByTestId('toggle'));
      await act(async () => {
        await Promise.resolve();
      });
      const search = await screen.findByTestId('fake-search');
      search.focus();
      expect(document.activeElement).toBe(search);
      fireEvent.keyDown(search, { key: 'Escape' });
      expect(document.activeElement).toBe(screen.getByTestId('composer'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores scroll events from inside the picker and only re-measures for outside scrolls', async () => {
    const { ref } = setup(true);
    await screen.findByTestId('fake-panel');
    const measure = vi.spyOn(ref.current as HTMLElement, 'getBoundingClientRect');
    const flushFrame = () =>
      act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      });

    fireEvent.scroll(screen.getByTestId('fake-scroll'));
    await flushFrame();
    expect(measure).not.toHaveBeenCalled();

    fireEvent.scroll(document);
    fireEvent.scroll(document);
    await flushFrame();
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it('docks the phone sheet right above a composer at the bottom, keeping it visible', async () => {
    media.sheet = true;
    const ref = createRef<HTMLElement>();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-testid') === 'anchor' ? rect(window.innerHeight - 58, window.innerHeight - 10) : rect(0, 0, 0, 0);
    });
    setup(true, ref);
    await screen.findByTestId('fake-panel');
    const frame = screen.getByTestId('emoji-picker-frame');
    expect(frame.style.bottom).toBe('68px');
    const dialog = screen.getByTestId('emoji-picker');
    expect(dialog.getAttribute('data-layout')).toBe('sheet');
    expect(dialog.getAttribute('data-docked')).toBe('anchor');
    expect(frame.contains(screen.getByTestId('emoji-picker-backdrop'))).toBe(true);
  });

  it('closes the sheet from the backdrop, the close button or a long drag', async () => {
    media.sheet = true;
    const { onClose } = setup(true);
    await screen.findByTestId('fake-panel');

    fireEvent.pointerDown(screen.getByTestId('emoji-picker-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('close'));
    expect(onClose).toHaveBeenCalledTimes(2);

    const handle = screen.getByTestId('emoji-picker-handle');
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 120 });
    expect(screen.getByTestId('emoji-picker').style.transform).toContain('20px');
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 120 });
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.pointerDown(handle, { pointerId: 2, clientY: 100, button: 0 });
    fireEvent.pointerUp(handle, { pointerId: 2, clientY: 260 });
    expect(onClose).toHaveBeenCalledTimes(3);
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
