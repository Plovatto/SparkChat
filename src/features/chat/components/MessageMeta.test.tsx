import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedBubbleStyle } from '@features/theme';
import type { MessageStatusInfo } from '@lib/message-status';
import type { ChatMessage } from '../types';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: () => '#123456' }) }),
}));

const { MessageMeta } = await import('./MessageMeta');

const message = { id: 'm1', timestamp: '2026-11-22T10:00:00.000Z' } as ChatMessage;
const bubble = { mutedTextColor: '#999999', textColor: '#ffffff' } as ResolvedBubbleStyle;

function meta(statusInfo: MessageStatusInfo | null) {
  return <MessageMeta message={message} isOwn bubble={bubble} statusInfo={statusInfo} onRetry={() => undefined} />;
}

const ticks = (container: HTMLElement) => container.querySelector('.sc-meta__ticks');

describe('MessageMeta ticks', () => {
  it('does not animate ticks that were already there when the message mounted', () => {
    const { container } = render(meta({ icon: 'double', read: true }));
    expect(ticks(container)?.getAttribute('data-animate')).toBeNull();
  });

  it('plays the delivered and read moments as the receipt advances', () => {
    const { container, rerender } = render(meta({ icon: 'single', read: false }));
    expect(ticks(container)?.getAttribute('data-animate')).toBeNull();

    rerender(meta({ icon: 'double', read: false }));
    expect(ticks(container)?.getAttribute('data-animate')).toBe('double');
    expect(ticks(container)?.querySelectorAll('svg')).toHaveLength(2);

    rerender(meta({ icon: 'double', read: true }));
    expect(ticks(container)?.getAttribute('data-animate')).toBe('read');
  });
});
