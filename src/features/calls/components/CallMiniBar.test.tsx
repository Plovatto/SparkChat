import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CallContext, type CallApi } from '../call-context';
import { EMPTY_CALL_SNAPSHOT, type CallSnapshot } from '../lib/call-controller';
import type { CallState } from '../state/call-machine';
import { CallMiniBar, CallStatusBar } from './CallMiniBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@lib/i18n/app-i18n', () => ({
  translate: (key: string) => key,
}));

function renderBar(state: Partial<CallState>, patch: Partial<CallSnapshot> = {}, extra: Partial<CallApi> = {}, attached = false) {
  const api = {
    snapshot: { ...EMPTY_CALL_SNAPSHOT, ...patch, state: { ...EMPTY_CALL_SNAPSHOT.state, peerId: 'p', ...state } },
    minimized: true,
    localSpeaking: false,
    hasStatusBar: false,
    registerStatusBar: vi.fn(() => () => undefined),
    setMinimized: vi.fn(),
    toggleMute: vi.fn(),
    hangup: vi.fn(),
    peerDisplay: () => ({ id: 'p', name: 'Ada', avatar: 1 }),
    ...extra,
  } as unknown as CallApi;
  const view = render(<CallContext value={api}>{attached ? <CallStatusBar /> : <CallMiniBar />}</CallContext>);
  return { api, view };
}

describe('CallMiniBar', () => {
  it('shows the peer and the running duration once connected', () => {
    renderBar({ phase: 'active', kind: 'voice', connectedAt: Date.now() - 65_000 });
    const bar = screen.getByRole('status');
    expect(bar.textContent).toContain('Ada');
    expect(bar.textContent).toContain('1:05');
    expect(bar.getAttribute('data-connected')).toBe('true');
  });

  it('shows the connecting status before the media flows', () => {
    renderBar({ phase: 'connecting', kind: 'video' });
    expect(screen.getByRole('status').textContent).toContain('calls.status.connecting');
    expect(screen.getByRole('status').getAttribute('data-connected')).toBe('false');
  });

  it('marks the muted microphone and keeps the bar actions from expanding the call', () => {
    const { api } = renderBar({ phase: 'active', kind: 'voice', connectedAt: Date.now() }, { muted: true });
    const mute = screen.getByRole('button', { name: 'calls.unmute' });
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(mute.getAttribute('data-muted')).toBe('true');
    fireEvent.click(mute);
    fireEvent.click(screen.getByRole('button', { name: 'calls.hangup' }));
    expect(api.toggleMute).toHaveBeenCalledTimes(1);
    expect(api.hangup).toHaveBeenCalledTimes(1);
    expect(api.setMinimized).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'calls.expand' }));
    expect(api.setMinimized).toHaveBeenCalledWith(false);
  });

  it('leaves the floating bar out while the chat column shows its own', () => {
    const { view } = renderBar({ phase: 'active', kind: 'voice', connectedAt: Date.now() }, {}, { hasStatusBar: true });
    expect(view.container.textContent).toBe('');
  });

  it('registers the attached bar and renders it inline', () => {
    const { api, view } = renderBar({ phase: 'active', kind: 'voice', connectedAt: Date.now() }, {}, { hasStatusBar: true }, true);
    expect(api.registerStatusBar).toHaveBeenCalled();
    expect(view.container.querySelector('.sc-livebar--attached')).not.toBeNull();
  });
});
