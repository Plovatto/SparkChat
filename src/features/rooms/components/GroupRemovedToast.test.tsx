import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, string>) => (params?.name ? `${key}:${params.name}` : key) }),
}));
vi.mock('@features/theme', () => ({ useTheme: () => ({ theme: {} }) }));
vi.mock('@features/motion', () => ({
  MOTION_DURATION_MS: { fast: 0 },
  usePresence: (visible: boolean) => ({ isPresent: visible, isExiting: false }),
}));
vi.mock('@features/pwa/hooks/useUpdateAvailable', () => ({ useUpdateAvailable: () => false }));
vi.mock('@features/pwa/styles/pwa.css', () => ({}));

const { GroupRemovedToast } = await import('./GroupRemovedToast');
const { dismissGroupRemovalNotice, showGroupRemovalNotice } = await import('../utils/group-removal-notice');

afterEach(() => {
  act(() => dismissGroupRemovalNotice());
  vi.useRealTimers();
});

describe('GroupRemovedToast', () => {
  it('renders nothing without a notice', () => {
    render(<GroupRemovedToast />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('tells the user which group removed them and closes on dismiss', () => {
    render(<GroupRemovedToast />);
    act(() => showGroupRemovalNotice('Amigos'));

    expect(screen.getByRole('status').textContent).toContain('roomInfo.removedNotice:Amigos');

    fireEvent.click(screen.getByRole('button', { name: 'roomInfo.removedDismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('hides itself after a few seconds', () => {
    vi.useFakeTimers();
    render(<GroupRemovedToast />);
    act(() => showGroupRemovalNotice('Amigos'));

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
