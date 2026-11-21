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

describe('CallNotices call on another device', () => {
  const otherDevice = { callId: 'c1', peerId: 'p1', kind: 'voice' as const, roomId: 'r1', role: 'callee' as const, answeredAt: null };

  function renderOtherDevice(transferring = false) {
    const transferHere = vi.fn();
    const endOtherDeviceCall = vi.fn();
    const api = { snapshot: { ...EMPTY_CALL_SNAPSHOT, otherDevice, transferring }, minimized: false, dismissNotice: vi.fn(), transferHere, endOtherDeviceCall } as unknown as CallApi;
    render(
      <CallContext value={api}>
        <CallNotices />
      </CallContext>,
    );
    return { transferHere, endOtherDeviceCall };
  }

  it('stacks the message above its actions in the responsive notice layout', () => {
    renderOtherDevice();
    const notice = screen.getByRole('status');
    expect(notice.className).toBe('sc-call-device-notice');
    expect(notice.querySelector('.sc-call-device-notice__text')?.textContent).toBe('calls.otherDevicecalls.otherDeviceHint');
    expect(notice.querySelectorAll('.sc-call-device-notice__actions button')).toHaveLength(2);
  });

  it('switches the call here or ends it from the buttons', () => {
    const { transferHere, endOtherDeviceCall } = renderOtherDevice();
    screen.getByRole('button', { name: 'calls.transferHere' }).click();
    screen.getByRole('button', { name: 'calls.otherDeviceEnd' }).click();
    expect(transferHere).toHaveBeenCalledTimes(1);
    expect(endOtherDeviceCall).toHaveBeenCalledTimes(1);
  });

  it('disables switching while a transfer is in progress', () => {
    renderOtherDevice(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'calls.transferHere' }).disabled).toBe(true);
  });
});
