import { act, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareStage, type ShareStageProps } from './ShareStage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

class FakeTrack extends EventTarget {
  kind = 'video';
}

class FakeStream {
  readonly track = new FakeTrack();
  getVideoTracks() {
    return [this.track];
  }
  getAudioTracks() {
    return [];
  }
  getTracks() {
    return [this.track];
  }
}

function props(stream: FakeStream, patch: Partial<ShareStageProps> = {}): ShareStageProps {
  return {
    stream: stream as unknown as MediaStream,
    local: false,
    title: 'Ada is sharing',
    detail: 'A window',
    remote: { name: 'Ada', avatar: undefined, stream: null, speaking: false, muted: false },
    self: null,
    myScreen: null,
    stageRef: createRef<HTMLDivElement>(),
    streamVideoRef: createRef<HTMLVideoElement>(),
    fullscreen: { available: false, active: false, toggle: () => undefined },
    pip: { available: false, open: false, toggle: () => undefined },
    previewHidden: false,
    paused: false,
    streamWindow: null,
    onStop: null,
    ...patch,
  };
}

describe('ShareStage frozen share', () => {
  const drawImage = vi.fn();

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, writable: true, value: null });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 360 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({ drawImage })) as unknown as HTMLCanvasElement['getContext']);
    drawImage.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows no overlay while the share is flowing', () => {
    render(<ShareStage {...props(new FakeStream())} />);
    expect(screen.queryByText('calls.share.pausedViewer')).toBeNull();
  });

  it('overlays the minimized message on the kept frame and clears it on resume', () => {
    const stream = new FakeStream();
    const view = render(<ShareStage {...props(stream)} />);

    view.rerender(<ShareStage {...props(stream, { paused: true })} />);
    expect(screen.getByRole('status').textContent).toContain('calls.share.pausedViewer');
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(document.querySelector('canvas[data-frozen="true"]')).not.toBeNull();

    view.rerender(<ShareStage {...props(stream, { paused: false })} />);
    expect(screen.queryByText('calls.share.pausedViewer')).toBeNull();
    expect(document.querySelector('canvas[data-frozen="true"]')).toBeNull();
  });

  it('keeps the last frame when the received track is muted and releases it on unmute', () => {
    const stream = new FakeStream();
    render(<ShareStage {...props(stream)} />);
    expect(document.querySelector('canvas[data-frozen="true"]')).toBeNull();

    act(() => {
      stream.track.dispatchEvent(new Event('mute'));
    });
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(document.querySelector('canvas[data-frozen="true"]')).not.toBeNull();

    act(() => {
      stream.track.dispatchEvent(new Event('unmute'));
    });
    expect(document.querySelector('canvas[data-frozen="true"]')).toBeNull();
  });

  it('never overlays the sharer own preview', () => {
    render(<ShareStage {...props(new FakeStream(), { local: true, paused: true })} />);
    expect(screen.queryByText('calls.share.pausedViewer')).toBeNull();
    expect(document.querySelector('canvas')).toBeNull();
  });
});
