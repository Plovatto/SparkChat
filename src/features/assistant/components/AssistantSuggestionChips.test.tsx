import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ASSISTANT_CHIP_IDS } from '../assistant-chips';
import { AssistantSuggestionChips } from './AssistantSuggestionChips';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('AssistantSuggestionChips', () => {
  it('renders every chip and reports the id with its prompt', () => {
    const onPick = vi.fn();
    render(<AssistantSuggestionChips visible onPick={onPick} />);

    expect(screen.getAllByRole('button')).toHaveLength(ASSISTANT_CHIP_IDS.length);
    fireEvent.click(screen.getByRole('button', { name: 'chat.assistant.chips.remindMe' }));

    expect(onPick).toHaveBeenCalledWith('remindMe', 'chat.assistant.prompts.remindMe');
  });

  it('renders nothing when not visible', () => {
    const { container } = render(<AssistantSuggestionChips visible={false} onPick={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
