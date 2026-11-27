import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RoomSummary } from '@lib/socket';
import { MessageInput, type MessageInputHandle } from '@features/chat/components/MessageInput';
import { ASSISTANT_NICKNAME } from '@features/chat/utils/assistant';
import { AssistantComposerChips } from './AssistantComposerChips';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@features/gifs', () => ({
  GifButton: () => null,
  GifPanel: () => null,
  gifLocaleFor: () => 'en',
  keepGifPanelOpen: () => false,
  useGifStatus: () => ({ enabled: false }),
}));

vi.mock('@features/emoji', () => ({
  EmojiButton: () => null,
  EmojiPickerPopover: () => null,
  insertAtCaret: (value: string) => value,
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: {}, getRoomAppearance: () => ({}) }),
}));

vi.mock('@lib/i18n/app-i18n', () => ({
  useAppLanguage: () => ({ language: 'en' }),
  currentLanguage: () => 'en',
  translate: (key: string) => key,
}));

vi.mock('@features/chat/hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    isPaused: false,
    recordingTime: 0,
    level: 0,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
  }),
}));

vi.mock('@features/chat/hooks/useLinkPreview', () => ({
  useLinkPreview: () => ({ status: 'idle', preview: null, dismiss: vi.fn() }),
}));

function room(nickname: string): RoomSummary {
  return {
    id: 'r1',
    type: 'private',
    participants: [{ id: 'u2', nickname }],
  } as unknown as RoomSummary;
}

function Harness({ target, sendText }: { target: RoomSummary; sendText: (text: string) => void }) {
  const inputRef = useRef<MessageInputHandle>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  return (
    <>
      <AssistantComposerChips room={target} isSelecting={false} isComposerEmpty={isEmpty} inputRef={inputRef} sendText={sendText} />
      <MessageInput
        ref={inputRef}
        onSend={vi.fn()}
        onSendAudio={vi.fn()}
        onTyping={vi.fn()}
        onRecordingStart={vi.fn()}
        onRecordingStop={vi.fn()}
        isBlockedBy={false}
        userBlocked={false}
        onEmptyChange={setIsEmpty}
        auth={{ userId: 'u1', sessionToken: 't' }}
      />
    </>
  );
}

const CHIPS_GROUP = { name: 'chat.assistant.chips.label' };

describe('AssistantComposerChips with the composer', () => {
  it('shows chips in the SparkAI room while the composer is empty and hides them after typing', async () => {
    render(<Harness target={room(ASSISTANT_NICKNAME)} sendText={vi.fn()} />);
    expect(screen.queryByRole('group', CHIPS_GROUP)).not.toBeNull();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'oi' } });

    await vi.waitFor(() => expect(screen.queryByRole('group', CHIPS_GROUP)).toBeNull());
  });

  it('sends the prompt text when a chip is tapped', () => {
    const sendText = vi.fn();
    render(<Harness target={room(ASSISTANT_NICKNAME)} sendText={sendText} />);

    fireEvent.click(screen.getByRole('button', { name: 'chat.assistant.chips.myNotes' }));

    expect(sendText).toHaveBeenCalledWith('chat.assistant.prompts.myNotes');
  });

  it('prefills the photo caption and opens the picker for the photo theme chip', () => {
    const sendText = vi.fn();
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    render(<Harness target={room(ASSISTANT_NICKNAME)} sendText={sendText} />);

    fireEvent.click(screen.getByRole('button', { name: 'chat.assistant.chips.themeFromPhoto' }));

    expect(clickSpy).toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('chat.assistant.photoCaption');
    clickSpy.mockRestore();
  });

  it('never renders chips in a normal room', () => {
    render(<Harness target={room('amiga')} sendText={vi.fn()} />);
    expect(screen.queryByRole('group', CHIPS_GROUP)).toBeNull();
  });
});
