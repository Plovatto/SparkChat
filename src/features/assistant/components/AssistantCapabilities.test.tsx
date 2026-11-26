import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantCapabilities } from './AssistantCapabilities';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => (key.endsWith('.title') ? `${key} 🎨` : key) }),
}));

describe('AssistantCapabilities', () => {
  it('renders one tile per capability', () => {
    render(<AssistantCapabilities onSendPrompt={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(9);
  });

  it('keeps the emoji glued to the last word of the title', () => {
    render(<AssistantCapabilities onSendPrompt={vi.fn()} />);
    expect(document.querySelector('.sc-assistant-cap-title')?.textContent?.endsWith(' 🎨')).toBe(true);
  });

  it('wraps only the last word and emoji in a nowrap span', () => {
    render(<AssistantCapabilities onSendPrompt={vi.fn()} />);
    const glued = document.querySelector('.sc-assistant-cap-title .sc-assistant-cap-nowrap');
    expect(glued?.textContent?.endsWith(' 🎨')).toBe(true);
    expect(glued?.textContent?.includes(' ')).toBe(false);
  });

  it('sends the example of the tapped tile', () => {
    const onSendPrompt = vi.fn();
    render(<AssistantCapabilities onSendPrompt={onSendPrompt} />);
    fireEvent.click(screen.getByRole('button', { name: /capabilities\.themes\.title/ }));
    expect(onSendPrompt).toHaveBeenCalledWith('chat.assistant.capabilities.themes.example');
  });

  it('opens the attachment picker for the photo theme tile', () => {
    const onSendPrompt = vi.fn();
    const onPickPhoto = vi.fn();
    render(<AssistantCapabilities onSendPrompt={onSendPrompt} onPickPhoto={onPickPhoto} />);
    fireEvent.click(screen.getByRole('button', { name: /capabilities\.photoTheme\.title/ }));
    expect(onPickPhoto).toHaveBeenCalledTimes(1);
    expect(onSendPrompt).not.toHaveBeenCalled();
  });
});
