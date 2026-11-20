import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CallContext, type CallApi } from '../call-context';
import { EMPTY_CALL_SNAPSHOT, type CallSnapshot } from '../lib/call-controller';
import { CallNotices } from './CallNotices';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@lib/i18n/app-i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('@lib/api/api-error', () => ({
  translateErrorPayload: () => 'error',
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: { warningSoft: 'w', warningText: 'w', surfaceElevated: 's', textPrimary: 't', textSecondary: 't', dangerSoft: 'd', dangerText: 'd', shadowMd: 'none' } }),
}));

function renderNotices(patch: Partial<CallSnapshot>, minimized = true) {
  const api = { snapshot: { ...EMPTY_CALL_SNAPSHOT, ...patch }, minimized, dismissNotice: vi.fn() } as unknown as CallApi;
  return render(
    <CallContext value={api}>
      <CallNotices />
    </CallContext>,
  );
}

describe('CallNotices screen paused toast', () => {
  it('tells the sharer with a minimized call that the viewer cannot see a minimized window', () => {
    renderNotices({ screenSharing: true, screenPaused: true });
    expect(screen.getByRole('status').textContent).toBe('calls.share.pausedSharer');
  });

  it('leaves the message to the call screen while it is on display', () => {
    const view = renderNotices({ screenSharing: true, screenPaused: true }, false);
    expect(view.container.textContent).toBe('');
  });

  it('shows nothing once the capture resumes or sharing ends', () => {
    const resumed = renderNotices({ screenSharing: true, screenPaused: false });
    expect(resumed.container.textContent).toBe('');
    resumed.unmount();
    const stopped = renderNotices({ screenSharing: false, screenPaused: true });
    expect(stopped.container.textContent).toBe('');
  });
});
