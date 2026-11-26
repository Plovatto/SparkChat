import type { RefObject } from 'react';
import type { RoomSummary } from '@lib/socket';
import { isAssistantRoom } from '@features/chat/utils/assistant';
import type { AssistantChipId } from '../assistant-chips';
import { AssistantSuggestionChips } from './AssistantSuggestionChips';

interface AssistantComposerChipsProps {
  room: RoomSummary;
  isSelecting: boolean;
  isComposerEmpty: boolean;
  inputRef: RefObject<{ openAttachmentPicker: () => void } | null>;
  sendText: (text: string) => void;
}

export function AssistantComposerChips({ room, isSelecting, isComposerEmpty, inputRef, sendText }: AssistantComposerChipsProps) {
  if (!isAssistantRoom(room) || isSelecting) {
    return null;
  }

  const handlePick = (id: AssistantChipId, prompt: string) => {
    if (id === 'themeFromPhoto') {
      inputRef.current?.openAttachmentPicker();
      return;
    }
    sendText(prompt);
  };

  return <AssistantSuggestionChips visible={isComposerEmpty} onPick={handlePick} />;
}
