import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ShareMonitorSupport } from '../lib/share-monitor';
import { DevicePicker, type ReceiverSettings, type SharerSettings } from './DevicePicker';

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

function renderPicker(settings: SharerSettings | null, receiver: ReceiverSettings | null = null) {
  render(
    <DevicePicker
      cameraOn={false}
      supportsOutput
      selected={{ audioInput: '', videoInput: '', audioOutput: '' }}
      onAudioInput={() => undefined}
      onVideoInput={() => undefined}
      onAudioOutput={() => undefined}
      onClose={() => undefined}
      broadcast={{ sharer: settings, receiver }}
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

describe('DevicePicker duck level', () => {
  it('lets the viewer pick how low the show goes while someone talks in movie mode', () => {
    const onDuckLevel = vi.fn();
    renderPicker(null, { hasAudio: true, volume: 1, onVolume: () => undefined, movie: true, duckLevel: 0.12, onDuckLevel });

    const slider = screen.getByRole('slider', { name: 'calls.broadcast.duckLevel' });
    expect((slider as HTMLInputElement).value).toBe('12');
    fireEvent.change(slider, { target: { value: '40' } });
    expect(onDuckLevel).toHaveBeenCalledWith(0.4);
  });

  it('hides the viewer slider outside movie mode', () => {
    renderPicker(null, { hasAudio: true, volume: 1, onVolume: () => undefined, movie: false, duckLevel: 0.12, onDuckLevel: () => undefined });

    expect(screen.queryByRole('slider', { name: 'calls.broadcast.duckLevel' })).toBeNull();
  });

  it('lets the sharer pick it when the show plays inside the app in movie mode', () => {
    const onDuckLevel = vi.fn();
    renderPicker(sharer('local', { movieMode: true, duckLevel: 0.3, onDuckLevel }));

    const slider = screen.getByRole('slider', { name: 'calls.broadcast.duckLevel' });
    expect((slider as HTMLInputElement).value).toBe('30');
    fireEvent.change(slider, { target: { value: '0' } });
    expect(onDuckLevel).toHaveBeenCalledWith(0);
  });

  it('shows a single slider while sharing and watching at the same time', () => {
    renderPicker(sharer('local', { movieMode: true, duckLevel: 0.3, onDuckLevel: () => undefined }), { hasAudio: true, volume: 1, onVolume: () => undefined, movie: true, duckLevel: 0.3, onDuckLevel: () => undefined });

    expect(screen.getAllByRole('slider', { name: 'calls.broadcast.duckLevel' })).toHaveLength(1);
  });

  it('hides the sharer slider when movie mode is off or the tab sound cannot be lowered', () => {
    renderPicker(sharer('local', { movieMode: false, onDuckLevel: () => undefined }));
    expect(screen.queryByRole('slider', { name: 'calls.broadcast.duckLevel' })).toBeNull();
  });
});

describe('DevicePicker share source', () => {
  it('offers to change the shared screen without stopping the share', () => {
    const onChangeSource = vi.fn();
    renderPicker(sharer('none', { onChangeSource }));
    fireEvent.click(screen.getByRole('button', { name: /calls.broadcast.changeSource/ }));
    expect(onChangeSource).toHaveBeenCalledTimes(1);
  });

  it('hides the option when the source cannot be changed', () => {
    renderPicker(sharer('none'));
    expect(screen.queryByRole('button', { name: /calls.broadcast.changeSource/ })).toBeNull();
  });
});
