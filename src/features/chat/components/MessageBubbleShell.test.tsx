import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageBubbleShell } from './MessageBubbleShell';

vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: { shadowMd: 'none', shadowSm: 'none' }, getRoomAppearance: () => null }),
  resolveBubbleStyle: () => ({ background: '#222', textColor: '#fff', accentColor: '#0ff', blur: 0 }),
}));

vi.mock('@lib/format', () => ({
  getDisplayName: (_id: string, nickname: string) => nickname,
}));

function renderShell() {
  const onSelect = vi.fn();
  const onOpenActions = vi.fn();
  const onImageClick = vi.fn();
  const onLinkClick = vi.fn();
  render(
    <MessageBubbleShell
      isOwn={false}
      isGroupChat={false}
      roomId="room-1"
      messageId="m1"
      senderId="ana"
      senderNickname="Ana"
      currentUserId="me"
      onSelect={onSelect}
      onOpenActions={onOpenActions}
      padding="0"
    >
      <p>texto da mensagem</p>
      <img alt="foto" onClick={onImageClick} />
      <a href="https://example.com" onClick={onLinkClick}>
        link
      </a>
    </MessageBubbleShell>,
  );
  return { onSelect, onOpenActions, onImageClick, onLinkClick };
}

function longPress(target: Element) {
  fireEvent.pointerDown(target, { pointerType: 'touch', clientX: 10, clientY: 10 });
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.pointerUp(target);
  fireEvent.click(target);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MessageBubbleShell long press', () => {
  it('opens the actions without toggling them back off on release', () => {
    const { onSelect, onOpenActions } = renderShell();

    longPress(screen.getByText('texto da mensagem'));

    expect(onOpenActions).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not also open an image or follow a link that was long pressed', () => {
    const { onImageClick, onLinkClick, onOpenActions } = renderShell();

    longPress(screen.getByAltText('foto'));
    longPress(screen.getByText('link'));

    expect(onOpenActions).toHaveBeenCalledTimes(2);
    expect(onImageClick).not.toHaveBeenCalled();
    expect(onLinkClick).not.toHaveBeenCalled();
  });

  it('keeps short taps working normally', () => {
    const { onSelect, onImageClick } = renderShell();

    fireEvent.pointerDown(screen.getByAltText('foto'), { pointerType: 'touch' });
    fireEvent.pointerUp(screen.getByAltText('foto'));
    fireEvent.click(screen.getByAltText('foto'));

    expect(onImageClick).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('keeps the native menu for images on touch but blocks it on text', () => {
    renderShell();
    fireEvent.pointerDown(screen.getByAltText('foto'), { pointerType: 'touch' });
    const onImage = fireEvent.contextMenu(screen.getByAltText('foto'));
    fireEvent.pointerDown(screen.getByText('texto da mensagem'), { pointerType: 'touch' });
    const onText = fireEvent.contextMenu(screen.getByText('texto da mensagem'));

    expect(onImage).toBe(true);
    expect(onText).toBe(false);
  });
});
