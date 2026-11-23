import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTranslation: () => ({ t: (key: string, options?: { time?: string }) => `${key}:${options?.time ?? ''}` }),
}));

import { CallDuration, CallEndedDuration } from './CallDuration';

const START = new Date('2026-01-01T10:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START + 65_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CallDuration', () => {
  it('ticks every second while the call runs', () => {
    render(<CallDuration connectedAt={START} running />);
    expect(screen.getByText('1:05')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('1:06')).toBeTruthy();
  });

  it('stays still when the call is not running', () => {
    render(<CallDuration connectedAt={START} running={false} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('1:05')).toBeTruthy();
  });

  it('shows zero before the call connects', () => {
    render(<CallDuration connectedAt={null} running={false} />);
    expect(screen.getByText('0:00')).toBeTruthy();
  });
});

describe('CallEndedDuration', () => {
  it('freezes the duration when the ended card appears', () => {
    render(<CallEndedDuration connectedAt={START} />);
    expect(screen.getByText('calls.endedDuration:1:05')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText('calls.endedDuration:1:05')).toBeTruthy();
  });

  it('renders nothing for a call that never connected', () => {
    const { container } = render(<CallEndedDuration connectedAt={null} />);
    expect(container.innerHTML).toBe('');
  });
});
