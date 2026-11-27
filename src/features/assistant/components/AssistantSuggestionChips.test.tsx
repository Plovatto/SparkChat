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

  it('shows a forward arrow on overflow and pages the row', () => {
    render(<AssistantSuggestionChips visible onPick={vi.fn()} />);
    const row = screen.getByRole('group');
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 900 });
    const calls: ScrollToOptions[] = [];
    row.scrollBy = ((options: ScrollToOptions) => {
      calls.push(options);
    }) as typeof row.scrollBy;

    fireEvent.scroll(row);
    expect(screen.queryByRole('button', { name: 'chat.assistant.chips.scrollBack' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'chat.assistant.chips.scrollForward' }));

    expect(calls).toEqual([{ left: 240, behavior: 'smooth' }]);
  });

  it('renders nothing when not visible', () => {
    const { container } = render(<AssistantSuggestionChips visible={false} onPick={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
