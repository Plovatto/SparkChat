import { autoplay } from './autoplay';
import { clampVolume, createShareAudio, type ShareAudio } from './share-audio';

export type ShareMonitorSupport = 'none' | 'local' | 'unsupported';

interface UserAgentSource {
  userAgent?: string;
  userAgentData?: { brands?: Array<{ brand: string }> };
}

export function isChromium(source: UserAgentSource | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!source) {
    return false;
  }
  const brands = source.userAgentData?.brands;
  if (Array.isArray(brands) && brands.length > 0) {
    return brands.some((entry) => /Chromium|Google Chrome|Microsoft Edge/i.test(entry.brand));
  }
  const agent = source.userAgent ?? '';
  return /Chrome\/|Chromium\/|Edg\//.test(agent) && !/Firefox\/|FxiOS/.test(agent);
}

function settingsOf(track: MediaStreamTrack | undefined): Record<string, unknown> {
  try {
    return (track?.getSettings?.() ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function shareAudioTrack(stream: MediaStream | null): MediaStreamTrack | null {
  return stream?.getAudioTracks().find((track) => track.readyState !== 'ended') ?? null;
}

export function shareMonitorSupport(stream: MediaStream | null, chromium: boolean = isChromium()): ShareMonitorSupport {
  const audio = shareAudioTrack(stream);
  if (!stream || !audio) {
    return 'none';
  }
  const suppressed = settingsOf(audio).suppressLocalAudioPlayback;
  if (typeof suppressed === 'boolean') {
    return suppressed ? 'local' : 'unsupported';
  }
  const surface = settingsOf(stream.getVideoTracks()[0]).displaySurface;
  return chromium && surface === 'browser' ? 'local' : 'unsupported';
}

export interface MonitorElement {
  srcObject: MediaProvider | null;
  volume: number;
  pause?: () => void;
}

export interface ShareMonitorDeps {
  createShareAudio: (track: MediaStreamTrack, volume: number) => ShareAudio;
  createStream: (tracks: MediaStreamTrack[]) => MediaStream;
  play: (element: MonitorElement) => void;
}

export interface ShareMonitor {
  setVolume: (volume: number) => void;
  stop: () => void;
}

const defaultDeps: ShareMonitorDeps = {
  createShareAudio: (track, volume) => createShareAudio(track, volume),
  createStream: (tracks) => new MediaStream(tracks),
  play: (element) => autoplay.play(element as HTMLMediaElement),
};

export function startShareMonitor(element: MonitorElement, track: MediaStreamTrack, volume: number, deps: Partial<ShareMonitorDeps> = {}): ShareMonitor {
  const resolved = { ...defaultDeps, ...deps };
  const audio = resolved.createShareAudio(track, clampVolume(volume));
  element.srcObject = resolved.createStream([audio.track]);
  element.volume = audio.controllable ? 1 : clampVolume(volume);
  resolved.play(element);
  let stopped = false;
  return {
    setVolume: (next) => {
      if (stopped) {
        return;
      }
      if (audio.controllable) {
        audio.setVolume(next);
      } else {
        element.volume = clampVolume(next);
      }
    },
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      try {
        element.pause?.();
      } catch {
        element.srcObject = null;
      }
      element.srcObject = null;
      audio.stop();
    },
  };
}
