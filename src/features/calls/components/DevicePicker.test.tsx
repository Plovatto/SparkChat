import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ShareMonitorSupport } from '../lib/share-monitor';
import { DevicePicker, type SharerSettings } from './DevicePicker';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@features/theme', () => ({ useTheme: () => ({ theme: {} }) }));
vi.mock('../call-context', () => ({ useCall: () => ({ snapshot: { localStream: null }, changeAudioProcessing: () => undefined }) }));
vi.mock('../lib/media-devices', () => ({
  listDevicesReliably: () => Promise.resolve({ audioInputs: [], videoInputs: [], audioOutputs: [] }),
  supportsVoiceIsolation: () => false,
}));

function sharer(monitor: ShareMonitorSupport, extra: Partial<SharerSettings> = {}): SharerSettings {
  return {
    movieMode: false,
    onMovieMode: () => undefined,
    hasAudio: monitor !== 'none',
    volume: 1,
    onVolume: () => undefined,
    previewHidden: false,
    onPreviewHidden: () => undefined,
    monitor,
    monitorVolume: 0.6,
    onMonitorVolume: () => undefined,
    ...extra,
  };
}

function renderPicker(settings: SharerSettings) {
  render(
    <DevicePicker
      cameraOn={false}
      supportsOutput
      selected={{ audioInput: '', videoInput: '', audioOutput: '' }}
      onAudioInput={() => undefined}
      onVideoInput={() => undefined}
      onAudioOutput={() => undefined}
      onClose={() => undefined}
      broadcast={{ sharer: settings, receiver: null }}
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'calls.tabs.broadcast' }));
}

describe('DevicePicker sharer monitor', () => {
  it('shows the series volume slider when the tab sound plays inside the app', () => {
    const onMonitorVolume = vi.fn();
    renderPicker(sharer('local', { onMonitorVolume }));

    const slider = screen.getByRole('slider', { name: 'calls.broadcast.monitorVolume' });
    expect((slider as HTMLInputElement).value).toBe('60');
    expect(screen.queryByText('calls.broadcast.monitorUnsupported')).toBeNull();

    fireEvent.change(slider, { target: { value: '25' } });
    expect(onMonitorVolume).toHaveBeenCalledWith(0.25);
  });

  it('shows the hint instead of the slider when the browser cannot silence the tab', () => {
    renderPicker(sharer('unsupported'));

    expect(screen.queryByRole('slider', { name: 'calls.broadcast.monitorVolume' })).toBeNull();
    expect(screen.getByText('calls.broadcast.monitorUnsupported')).toBeTruthy();
  });

  it('shows neither when the share has no sound', () => {
    renderPicker(sharer('none'));

    expect(screen.queryByRole('slider', { name: 'calls.broadcast.monitorVolume' })).toBeNull();
    expect(screen.queryByText('calls.broadcast.monitorUnsupported')).toBeNull();
    expect(screen.getByText('calls.broadcast.noShareAudio')).toBeTruthy();
  });
});
