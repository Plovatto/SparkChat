import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerHelpOpener } from '../help-targets';
import { AssistantHelpCard } from './AssistantHelpCard';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

let unregister: (() => void) | undefined;

afterEach(() => {
  unregister?.();
  unregister = undefined;
});

describe('AssistantHelpCard', () => {
  it('opens the appearance target when Open is pressed', () => {
    const opener = vi.fn();
    unregister = registerHelpOpener('appearance', opener);
    render(<AssistantHelpCard target="appearance" />);
    fireEvent.click(screen.getByRole('button', { name: 'chat.assistant.help.open' }));
    expect(opener).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for a target without an opener', () => {
    const { container } = render(<AssistantHelpCard target="none" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the button once an opener registers', () => {
    render(<AssistantHelpCard target="profile" />);
    expect(screen.queryByRole('button')).toBeNull();
    act(() => {
      unregister = registerHelpOpener('profile', vi.fn());
    });
    expect(screen.getByRole('button')).toBeTruthy();
  });
});
