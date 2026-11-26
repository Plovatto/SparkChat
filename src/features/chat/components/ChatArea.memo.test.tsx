import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@features/auth';
import type { RoomSummary } from '@lib/socket';
import type { ChatMessage } from '../types';

const bubbleRenders = vi.hoisted(() => ({ count: 0 }));
const stable = vi.hoisted(() => ({ messages: [] as unknown[], sendMessage: () => undefined, noop: () => undefined }));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'pt' } }),
}));

vi.mock('./MessageBubble', async () => {
  const react = await import('react');
  return {
    MessageBubble: react.memo(function MessageBubbleProbe() {
      bubbleRenders.count += 1;
      return null;
    }),
  };
});

vi.mock('../hooks/useRoomMessages', () => ({
  useRoomMessages: () => ({
    messages: stable.messages,
    isLoaded: true,
    hasMoreOlder: false,
    isLoadingOlder: false,
    typingUserIds: [],
    recordingUserIds: [],
    sendMessage: stable.sendMessage,
    retryMessage: stable.noop,
    loadOlderMessages: () => undefined,
    hideMessages: () => undefined,
    hideFailure: null,
    dismissHideFailure: () => undefined,
    reactToMessage: stable.noop,
    reactionFailure: null,
  }),
}));

vi.mock('@features/theme', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const theme = new Proxy({}, { get: () => '#808080' });
  const value = { theme, getRoomWallpaper: () => null, getRoomAppearance: () => ({ overlayOpacity: 0 }) };
  return { ...actual, useTheme: () => value };
});

vi.mock('@features/calls', () => ({ CallStatusBar: () => null }));
vi.mock('./ChatHeader', () => ({ ChatHeader: () => null }));
vi.mock('./ContactKeyBanner', () => ({ ContactKeyBanner: () => null }));
vi.mock('./MessageInput', () => ({ MessageInput: () => null }));

vi.mock('@lib/socket', () => ({ useSocket: () => ({ socket: null }) }));

const { ChatArea } = await import('./ChatArea');

const user = { id: 'u1', nickname: 'Ana', avatar: 'a', sessionToken: 't' } as unknown as User;
const room = { id: 'r1', name: 'SparkAI', participants: [], isGroup: false, isAssistant: true } as unknown as RoomSummary;

function message(id: string): ChatMessage {
  return {
    id,
    roomId: 'r1',
    content: `m ${id}`,
    type: 'text',
    timestamp: '2026-01-01T10:00:00.000Z',
    sender: { id: 'u2', nickname: 'SparkAI', avatar: 'b' },
  } as unknown as ChatMessage;
}

describe('ChatArea message list', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
    bubbleRenders.count = 0;
    stable.messages = [message('m1'), message('m2')];
  });

  it('does not re-render existing bubbles when ChatArea re-renders', () => {
    const onBack = vi.fn();
    const { rerender } = render(<ChatArea room={room} rooms={[room]} user={user} onBack={onBack} />);
    expect(bubbleRenders.count).toBeGreaterThan(0);
    const afterFirstRender = bubbleRenders.count;

    rerender(<ChatArea room={room} rooms={[room]} user={{ ...user }} onBack={onBack} />);
    rerender(<ChatArea room={room} rooms={[room]} user={{ ...user }} onBack={onBack} />);

    expect(bubbleRenders.count).toBe(afterFirstRender);
  });
});
