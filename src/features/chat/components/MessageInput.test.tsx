import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmojiPickerPanelProps } from '@features/emoji/components/EmojiPickerPanel';

const GRIN = '\u{1F600}';
const recorder = vi.hoisted(() => ({ startRecording: vi.fn(() => Promise.resolve(true)) }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@lib/i18n/app-i18n', () => ({ useAppLanguage: () => ({ language: 'pt', changeLanguage: () => undefined }), translate: (key: string) => key }));
vi.mock('@features/theme', () => ({ useTheme: () => ({ theme: new Proxy({}, { get: () => '#123456' }) }) }));
vi.mock('@features/gifs', () => ({
  GifButton: ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) =>
    enabled ? (
      <button type="button" data-testid="gif-button" onClick={onToggle}>
        GIF
      </button>
    ) : null,
  GifPanel: () => <div data-testid="gif-panel" />,
  gifLocaleFor: () => 'br',
  keepGifPanelOpen: (open: boolean, text: string) => open && text.trim().length === 0,
  useGifStatus: () => true,
}));
vi.mock('../hooks/useLinkPreview', () => ({
  useLinkPreview: () => ({ url: null, status: 'idle', preview: null, generate: () => undefined, dismiss: () => undefined, reset: () => undefined }),
}));
vi.mock('../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    recordingTime: 0,
    audioLevels: [],
    startRecording: recorder.startRecording,
    stopRecording: () => Promise.resolve(null),
    cancelRecording: () => undefined,
  }),
}));
vi.mock('@features/emoji/utils/load-emoji-picker', () => {
  function FakePanel({ onSelect }: EmojiPickerPanelProps) {
    return (
      <>
        <input data-testid="fake-search" aria-label="search" />
        <button type="button" data-testid="fake-emoji" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(GRIN)}>
          {GRIN}
        </button>
      </>
    );
  }
  return { loadEmojiPickerPanel: () => Promise.resolve({ default: FakePanel }), preloadEmojiPicker: () => undefined };
});

import { MessageInput } from './MessageInput';

function renderComposer(overrides: Partial<Parameters<typeof MessageInput>[0]> = {}) {
  const onSend = vi.fn();
  const onTyping = vi.fn();
  render(
    <MessageInput
      onSend={onSend}
      onSendAudio={() => undefined}
      onSendGif={() => undefined}
      onTyping={onTyping}
      onRecordingStart={() => undefined}
      onRecordingStop={() => undefined}
      isBlockedBy={false}
      userBlocked={false}
      auth={{ userId: 'user-1', sessionToken: 'token' }}
      {...overrides}
    />,
  );
  return { onSend, onTyping, input: screen.getByTestId<HTMLInputElement>('message-input') };
}

async function flushTimers() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

afterEach(() => {
  recorder.startRecording.mockClear();
});

describe('MessageInput composer', () => {
  it('puts the smiley at the left and the GIF badge and paperclip inside the pill, with the mic outside', () => {
    renderComposer();
    const pill = screen.getByTestId('message-input').parentElement as HTMLElement;
    expect(pill.className).toContain('sc-composer-pill');
    const order = Array.from(pill.querySelectorAll('[data-testid]')).map((element) => element.getAttribute('data-testid'));
    expect(order).toEqual(['emoji-button', 'message-input', 'gif-button', 'attach-button']);
    const mic = screen.getByTestId('record-button');
    expect(pill.contains(mic)).toBe(false);
    expect(mic.className).toContain('sc-icon-btn--gradient');
    expect(screen.queryByTestId('send-button')).toBeNull();
  });

  it('inserts the picked emoji at the caret and keeps the input focused', async () => {
    const { input, onTyping } = renderComposer();
    fireEvent.change(input, { target: { value: 'oi tudo' } });
    input.focus();
    input.setSelectionRange(2, 2);

    fireEvent.click(screen.getByTestId('emoji-button'));
    expect(screen.getByTestId('emoji-button').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(await screen.findByTestId('fake-emoji'));
    await flushTimers();

    expect(input.value).toBe(`oi${GRIN} tudo`);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2 + GRIN.length);
    expect(input.selectionEnd).toBe(2 + GRIN.length);
    expect(onTyping).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('fake-emoji'));
    await flushTimers();
    expect(input.value).toBe(`oi${GRIN}${GRIN} tudo`);
    expect(screen.getByTestId('emoji-picker')).toBeTruthy();
  });

  it('replaces selected text with the emoji and sends it', async () => {
    const { input, onSend } = renderComposer();
    fireEvent.change(input, { target: { value: 'hello world' } });
    input.setSelectionRange(6, 11);
    fireEvent.click(screen.getByTestId('emoji-button'));
    fireEvent.click(await screen.findByTestId('fake-emoji'));
    await flushTimers();
    expect(input.value).toBe(`hello ${GRIN}`);

    expect(screen.queryByTestId('record-button')).toBeNull();
    expect(screen.queryByTestId('gif-button')).toBeNull();
    fireEvent.click(screen.getByTestId('send-button'));
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ text: `hello ${GRIN}`, imageFiles: [], documentFiles: [] }));
    expect(input.value).toBe('');
  });

  it('does not insert past the character limit', async () => {
    const { input } = renderComposer({ maxLength: 5 });
    fireEvent.change(input, { target: { value: 'abcd' } });
    fireEvent.click(screen.getByTestId('emoji-button'));
    fireEvent.click(await screen.findByTestId('fake-emoji'));
    await flushTimers();
    expect(input.value).toBe('abcd');
  });

  it('closes the picker with Escape and when the GIF panel opens', async () => {
    renderComposer();
    fireEvent.click(screen.getByTestId('emoji-button'));
    await screen.findByTestId('fake-emoji');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByTestId('emoji-button').getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(screen.getByTestId('emoji-button'));
    expect(screen.getByTestId('emoji-button').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByTestId('gif-button'));
    expect(screen.getByTestId('emoji-button').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('gif-panel')).toBeTruthy();
  });

  it('disables the emoji button when the conversation is blocked', () => {
    renderComposer({ isBlockedBy: true });
    expect(screen.getByTestId<HTMLButtonElement>('emoji-button').disabled).toBe(true);
    expect(screen.getByTestId<HTMLButtonElement>('attach-button').disabled).toBe(true);
  });

  it('keeps typing in the picker search when an emoji is picked from there', async () => {
    const { input } = renderComposer();
    fireEvent.change(input, { target: { value: 'oi' } });
    fireEvent.click(screen.getByTestId('emoji-button'));
    const search = await screen.findByTestId('fake-search');
    search.focus();
    fireEvent.click(screen.getByTestId('fake-emoji'));
    await flushTimers();
    expect(input.value).toBe(`oi${GRIN}`);
    expect(document.activeElement).toBe(search);
  });

  it('does not overwrite an active IME composition', async () => {
    const { input } = renderComposer();
    fireEvent.change(input, { target: { value: 'ni' } });
    fireEvent.compositionStart(input);
    fireEvent.click(screen.getByTestId('emoji-button'));
    fireEvent.click(await screen.findByTestId('fake-emoji'));
    await flushTimers();
    expect(input.value).toBe('ni');
    fireEvent.compositionEnd(input);
    fireEvent.click(screen.getByTestId('fake-emoji'));
    await flushTimers();
    expect(input.value).toBe(`ni${GRIN}`);
  });

  it('signals when the emoji would go past the limit', async () => {
    const { input } = renderComposer({ maxLength: 5 });
    fireEvent.change(input, { target: { value: 'abcd' } });
    fireEvent.click(screen.getByTestId('emoji-button'));
    fireEvent.click(await screen.findByTestId('fake-emoji'));
    await flushTimers();
    const pill = input.parentElement as HTMLElement;
    expect(pill.getAttribute('data-shake')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('chat.input.tooLong');
    fireEvent.animationEnd(pill);
    act(() => {
      pill.dispatchEvent(new Event('webkitAnimationEnd', { bubbles: true }));
    });
    expect(pill.getAttribute('data-shake')).toBeNull();
  });

  it('lets Escape close the mention list without closing the picker', async () => {
    const { input } = renderComposer({ mentionCandidates: [{ id: 'u2', nickname: 'ana' }] });
    fireEvent.click(screen.getByTestId('emoji-button'));
    await screen.findByTestId('fake-emoji');
    fireEvent.change(input, { target: { value: '@a', selectionStart: 2 } });
    expect(screen.getByRole('option')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.getByTestId('emoji-button').getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByTestId('emoji-button').getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the picker open when sending and anchors it to the whole composer row', async () => {
    const { input, onSend } = renderComposer();
    fireEvent.click(screen.getByTestId('emoji-button'));
    fireEvent.click(await screen.findByTestId('fake-emoji'));
    await flushTimers();
    fireEvent.pointerDown(screen.getByTestId('send-button'));
    fireEvent.click(screen.getByTestId('send-button'));
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ text: GRIN }));
    expect(input.value).toBe('');
    expect(screen.getByTestId('emoji-button').getAttribute('aria-expanded')).toBe('true');
  });

  it('describes the field with the blocked text when blocked', () => {
    renderComposer({ userBlocked: true });
    expect(screen.getByTestId('message-input').getAttribute('aria-label')).toBe('chat.input.placeholderYouBlocked');
  });
});
