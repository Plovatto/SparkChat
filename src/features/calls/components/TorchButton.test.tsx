import { act, fireEvent, render, screen } from '@testing-library/react';
import type * as ReactI18next from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { CallContext, type CallApi } from '../call-context';
import { EMPTY_CALL_SNAPSHOT, type CallSnapshot } from '../lib/call-controller';
import { CallControls } from './CallControls';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactI18next>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

function fakeTrack(torch: boolean) {
  const applied: Array<boolean | undefined> = [];
  const track = Object.assign(new EventTarget(), {
    kind: 'video',
    readyState: 'live',
    getCapabilities: () => (torch ? { torch: true } : {}),
    applyConstraints: vi.fn((constraints: MediaTrackConstraints) => {
      applied.push((constraints.advanced?.[0] as { torch?: boolean } | undefined)?.torch);
      return Promise.resolve();
    }),
  }) as unknown as MediaStreamTrack;
  return { track, applied };
}

function streamWith(track: MediaStreamTrack | null) {
  return { getVideoTracks: () => (track ? [track] : []), getAudioTracks: () => [], getTracks: () => (track ? [track] : []) } as unknown as MediaStream;
}

function renderControls(patch: Partial<CallSnapshot>, extra: Partial<CallApi> = {}) {
  const api = {
    snapshot: { ...EMPTY_CALL_SNAPSHOT, ...patch, state: { ...EMPTY_CALL_SNAPSHOT.state, phase: 'active', kind: 'video', peerId: 'p' } },
    localSpeaking: false,
    canShareScreen: false,
    toggleMute: vi.fn(),
    toggleCamera: vi.fn(),
    toggleScreenShare: vi.fn(),
    hangup: vi.fn(),
    changeAudioInput: vi.fn(),
    changeVideoInput: vi.fn(),
    ...extra,
  } as unknown as CallApi;
  const view = render(
    <CallContext value={api}>
      <CallControls supportsOutput={false} onAudioOutput={vi.fn()} />
    </CallContext>,
  );
  return { api, view };
}

describe('TorchButton in the call controls', () => {
  it('stays hidden when the camera track has no torch', () => {
    const { track } = fakeTrack(false);
    renderControls({ cameraOn: true, localStream: streamWith(track) });
    expect(screen.queryByRole('button', { name: 'calls.torch.on' })).toBeNull();
  });

  it('stays hidden when the camera is off even if the track supports torch', () => {
    const { track } = fakeTrack(true);
    renderControls({ cameraOn: false, localStream: streamWith(track) });
    expect(screen.queryByRole('button', { name: 'calls.torch.on' })).toBeNull();
  });

  it('shows a round toggle that switches the torch on and off', async () => {
    const { track, applied } = fakeTrack(true);
    renderControls({ cameraOn: true, localStream: streamWith(track) });
    const button = screen.getByRole('button', { name: 'calls.torch.on' });
    expect(button.className).toContain('sc-call-round');
    expect(button.getAttribute('title')).toBe('calls.torch.on');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    const active = screen.getByRole('button', { name: 'calls.torch.off' });
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(active.getAttribute('data-tone')).toBe('on');
    expect(applied).toEqual([true]);
  });

  it('turns the torch off before hanging up', async () => {
    const { track, applied } = fakeTrack(true);
    const { api } = renderControls({ cameraOn: true, localStream: streamWith(track) });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'calls.torch.on' }));
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'calls.hangup' }));

    expect(applied).toEqual([true, false]);
    expect(api.hangup).toHaveBeenCalledTimes(1);
  });

  it('turns the torch off before the camera stops', async () => {
    const { track, applied } = fakeTrack(true);
    const { api } = renderControls({ cameraOn: true, localStream: streamWith(track) });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'calls.torch.on' }));
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'calls.cameraOff' }));

    expect(applied).toEqual([true, false]);
    expect(api.toggleCamera).toHaveBeenCalledTimes(1);
  });
});
