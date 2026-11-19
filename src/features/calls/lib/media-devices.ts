import type { CallKind } from '@lib/e2ee/call-crypto';

export interface MediaSelection {
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

export function audioConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
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
    return { stream: await getUserMedia({ audio: audioConstraints(selection.audioInputId), video: false }), cameraFailed: false };
  }
  try {
    const stream = await getUserMedia({
      audio: audioConstraints(selection.audioInputId),
      video: videoConstraints(mobile, selection.videoInputId),
    });
    return { stream, cameraFailed: false };
  } catch {
    const audioOnly = await getUserMedia({ audio: audioConstraints(selection.audioInputId), video: false });
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
