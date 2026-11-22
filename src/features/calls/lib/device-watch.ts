import type { DevicePrefs } from './call-settings';
import type { DeviceLists } from './media-devices';

export interface ActiveDevices {
  mic: MediaStreamTrack | null;
  camera: MediaStreamTrack | null;
  prefs: DevicePrefs;
}

export interface DeviceFallback {
  mic: boolean;
  camera: boolean;
  output: string;
}

function settingsOf(track: MediaStreamTrack): { deviceId: string; groupId: string } {
  const settings = track.getSettings?.() ?? {};
  return { deviceId: settings.deviceId ?? '', groupId: settings.groupId ?? '' };
}

function needsSwitch(track: MediaStreamTrack | null, list: MediaDeviceInfo[], preferred: string): boolean {
  if (!track) {
    return false;
  }
  if (track.readyState === 'ended') {
    return true;
  }
  const { deviceId, groupId } = settingsOf(track);
  if (deviceId === '') {
    return false;
  }
  if (!list.some((device) => device.deviceId === deviceId)) {
    return true;
  }
  if (preferred !== '' && preferred !== deviceId && list.some((device) => device.deviceId === preferred)) {
    return true;
  }
  if (preferred === '' && deviceId === 'default') {
    const systemDefault = list.find((device) => device.deviceId === 'default');
    return Boolean(systemDefault && groupId !== '' && systemDefault.groupId !== '' && systemDefault.groupId !== groupId);
  }
  return false;
}

export function deviceFallback(lists: DeviceLists, active: ActiveDevices): DeviceFallback {
  const empty = lists.audioInputs.length + lists.videoInputs.length + lists.audioOutputs.length === 0;
  if (empty) {
    return { mic: false, camera: false, output: active.prefs.audioOutput };
  }
  const outputKnown = active.prefs.audioOutput === '' || lists.audioOutputs.some((device) => device.deviceId === active.prefs.audioOutput);
  return {
    mic: lists.audioInputs.length > 0 && needsSwitch(active.mic, lists.audioInputs, active.prefs.audioInput),
    camera: lists.videoInputs.length > 0 && needsSwitch(active.camera, lists.videoInputs, active.prefs.videoInput),
    output: outputKnown ? active.prefs.audioOutput : '',
  };
}
