import { fireEvent, render, screen } from '@testing-library/react';
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

function renderWith(patch: Partial<CallSnapshot>, extra: Partial<CallApi> = {}) {
  const api = {
    snapshot: { ...EMPTY_CALL_SNAPSHOT, ...patch },
    minimized: false,
    hasStatusBar: false,
    dismissNotice: vi.fn(),
    transferHere: vi.fn(),
    endOtherDeviceCall: vi.fn(),
    ...extra,
  } as unknown as CallApi;
  const view = render(
    <CallContext value={api}>
      <CallNotices />
    </CallContext>,
  );
  return { api, view };
}

describe('CallNotices toasts', () => {
  it('shows the security warning with a title and a labelled close button', () => {
    const { api } = renderWith({ notice: { kind: 'key-changed' } });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('calls.keyChangedTitle');
    expect(alert.textContent).toContain('calls.notice.key-changed');
    expect(alert.getAttribute('data-tone')).toBe('warning');
    fireEvent.click(screen.getByRole('button', { name: 'calls.close' }));
    expect(api.dismissNotice).toHaveBeenCalledTimes(1);
  });

  it('announces a transfer politely as a status', () => {
    renderWith({ notice: { kind: 'transferred' } });
    expect(screen.getByRole('status').textContent).toContain('calls.notice.transferred');
  });

  it('offers both actions for a call answered on another device', () => {
    const { api } = renderWith({ otherDevice: { callId: 'c', peerId: 'p', kind: 'voice', roomId: 'r', role: 'caller', answeredAt: '2026-01-01T00:00:00.000Z' } });
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('calls.otherDevice');
    expect(status.textContent).toContain('calls.otherDeviceHint');
    fireEvent.click(screen.getByRole('button', { name: 'calls.transferHere' }));
    fireEvent.click(screen.getByRole('button', { name: 'calls.otherDeviceEnd' }));
    expect(api.transferHere).toHaveBeenCalledTimes(1);
    expect(api.endOtherDeviceCall).toHaveBeenCalledTimes(1);
  });

  it('disables the transfer while one is in flight', () => {
    renderWith({ transferring: true, otherDevice: { callId: 'c', peerId: 'p', kind: 'voice', roomId: 'r', role: 'caller', answeredAt: '2026-01-01T00:00:00.000Z' } });
    expect(screen.getByRole('button', { name: 'calls.transferHere' })).toHaveProperty('disabled', true);
  });

  it('stays at the bottom over the chat and lifts above the controls while the call screen is open', () => {
    const { view } = renderWith({ otherDevice: { callId: 'c', peerId: 'p', kind: 'voice', roomId: 'r', role: 'caller', answeredAt: null } });
    expect(view.container.querySelector('.sc-call-toast-region')?.getAttribute('data-over-call')).toBe('false');

    const minimized = renderWith({ screenSharing: true, screenPaused: true, state: { ...EMPTY_CALL_SNAPSHOT.state, phase: 'active', callId: 'c' } }, { minimized: true });
    expect(minimized.view.container.querySelector('.sc-call-toast-region')?.getAttribute('data-over-call')).toBe('false');

    const open = renderWith({ notice: { kind: 'transfer-failed' }, state: { ...EMPTY_CALL_SNAPSHOT.state, phase: 'active', callId: 'd' } });
    expect(open.view.container.querySelector('.sc-call-toast-region')?.getAttribute('data-over-call')).toBe('true');
  });
});
