import type { CallKind } from '@lib/e2ee/call-crypto';
import { DEFAULT_AUDIO_PROCESSING, type AudioProcessing } from './call-settings';

export interface MediaSelection {
  audioProcessing?: AudioProcessing | undefined;
  audioInputId?: string | undefined;
  videoInputId?: string | undefined;
}

export interface LocalMedia {
  stream: MediaStream;
  cameraFailed: boolean;
}

export interface DeviceLists {
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
}

export function supportsVoiceIsolation(): boolean {
  try {
    return Boolean((navigator.mediaDevices?.getSupportedConstraints?.() as Record<string, unknown> | undefined)?.voiceIsolation);
  } catch {
    return false;
  }
}

export function audioProcessingConstraints(processing: AudioProcessing): MediaTrackConstraints {
  return {
    echoCancellation: processing.echoCancellation,
    noiseSuppression: processing.noiseSuppression,
    autoGainControl: processing.autoGainControl,
    ...(processing.voiceIsolation && supportsVoiceIsolation() ? ({ voiceIsolation: true } as MediaTrackConstraints) : {}),
  };
}

export function audioConstraints(deviceId?: string, processing: AudioProcessing = DEFAULT_AUDIO_PROCESSING): MediaTrackConstraints {
  return {
    ...audioProcessingConstraints(processing),
    channelCount: 1,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

export function videoConstraints(mobile: boolean, deviceId?: string): MediaTrackConstraints {
  return {
    width: { ideal: mobile ? 640 : 1280 },
    height: { ideal: mobile ? 480 : 720 },
    frameRate: { ideal: 30 },
    ...(mobile ? { facingMode: 'user' } : {}),
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const hint = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  return hint ?? /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function prepareIosAudioSession(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) {
    try {
      session.type = 'play-and-record';
    } catch {
      return;
    }
  }
}

export async function acquireLocalMedia(
  kind: CallKind,
  selection: MediaSelection = {},
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream> = (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  mobile: boolean = isMobileDevice(),
): Promise<LocalMedia> {
  prepareIosAudioSession();
  if (kind === 'voice') {
    return { stream: await getUserMedia({ audio: audioConstraints(selection.audioInputId, selection.audioProcessing), video: false }), cameraFailed: false };
  }
  try {
    const stream = await getUserMedia({
      audio: audioConstraints(selection.audioInputId, selection.audioProcessing),
      video: videoConstraints(mobile, selection.videoInputId),
    });
    return { stream, cameraFailed: false };
  } catch {
    const audioOnly = await getUserMedia({ audio: audioConstraints(selection.audioInputId, selection.audioProcessing), video: false });
    return { stream: audioOnly, cameraFailed: true };
  }
}

export async function acquireCameraTrack(
  selection: MediaSelection = {},
  mobile: boolean = isMobileDevice(),
): Promise<MediaStreamTrack | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(mobile, selection.videoInputId) });
    return stream.getVideoTracks()[0] ?? null;
  } catch {
    return null;
  }
}

export function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) {
    track.stop();
  }
}

export async function listDevices(): Promise<DeviceLists> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      audioInputs: devices.filter((device) => device.kind === 'audioinput'),
      videoInputs: devices.filter((device) => device.kind === 'videoinput'),
      audioOutputs: devices.filter((device) => device.kind === 'audiooutput'),
    };
  } catch {
    return { audioInputs: [], videoInputs: [], audioOutputs: [] };
  }
}

export interface DisplayMediaHost {
  getDisplayMedia?: (options?: DisplayMediaStreamOptions) => Promise<MediaStream>;
}

function displayHost(): DisplayMediaHost | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator.mediaDevices);
}

export function supportsScreenShare(host: DisplayMediaHost | undefined = displayHost()): boolean {
  return typeof host?.getDisplayMedia === 'function';
}

export function screenShareOptions(): DisplayMediaStreamOptions {
  return {
    video: { frameRate: { ideal: 15, max: 30 } },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true } as MediaTrackConstraints,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    systemAudio: 'include',
    monitorTypeSurfaces: 'include',
  } as DisplayMediaStreamOptions;
}

export async function acquireScreenShare(host: DisplayMediaHost | undefined = displayHost()): Promise<MediaStream | null> {
  if (!host?.getDisplayMedia) {
    return null;
  }
  try {
    const stream = await host.getDisplayMedia(screenShareOptions());
    if (stream.getVideoTracks().length === 0) {
      stopStream(stream);
      return null;
    }
    return stream;
  } catch {
    return null;
  }
}

export function shareVideoConstraints(movie: boolean): MediaTrackConstraints {
  return movie ? { frameRate: { ideal: 30, max: 30 }, width: { max: 3840 }, height: { max: 2160 } } : { frameRate: { ideal: 15, max: 30 } };
}

export const SHARE_AUDIO_CONSTRAINTS: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

export async function applyShareConstraints(stream: MediaStream, movie: boolean): Promise<void> {
  for (const track of stream.getVideoTracks()) {
    await track.applyConstraints(shareVideoConstraints(movie)).catch(() => undefined);
  }
  for (const track of stream.getAudioTracks()) {
    await track.applyConstraints(SHARE_AUDIO_CONSTRAINTS).catch(() => undefined);
  }
}
