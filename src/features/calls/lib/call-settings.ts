import { useSyncExternalStore } from 'react';
import { getItem, setItem } from '@lib/storage';

const LEGACY_PROTECT_IP_KEY = 'chatCallProtectIp';
const AUDIO_PROCESSING_KEY = 'chatCallAudioProcessing';
const SHARE_VOLUME_KEY = 'chatCallShareVolume';

export interface AudioProcessing {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  voiceIsolation: boolean;
}

export const DEFAULT_AUDIO_PROCESSING: AudioProcessing = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  voiceIsolation: false,
};

const AUDIO_PROCESSING_KEYS = Object.keys(DEFAULT_AUDIO_PROCESSING) as Array<keyof AudioProcessing>;

type Listener = () => void;

const listeners = new Set<Listener>();

export function clearLegacyCallSettings(): void {
  try {
    localStorage.removeItem(LEGACY_PROTECT_IP_KEY);
  } catch {
    return;
  }
}

let cachedAudioRaw: string | null | undefined;
let cachedAudio: AudioProcessing = DEFAULT_AUDIO_PROCESSING;

function readAudioProcessing(): AudioProcessing {
  const stored = getItem<Partial<Record<keyof AudioProcessing, unknown>>>(AUDIO_PROCESSING_KEY);
  const raw = stored === null ? null : JSON.stringify(stored);
  if (raw === cachedAudioRaw) {
    return cachedAudio;
  }
  const next = { ...DEFAULT_AUDIO_PROCESSING };
  if (stored && typeof stored === 'object') {
    for (const key of AUDIO_PROCESSING_KEYS) {
      const value = stored[key];
      if (typeof value === 'boolean') {
        next[key] = value;
      }
    }
  }
  cachedAudioRaw = raw;
  cachedAudio = next;
  return next;
}

export function getAudioProcessing(): AudioProcessing {
  return readAudioProcessing();
}

export function setAudioProcessing(patch: Partial<AudioProcessing>): AudioProcessing {
  const next = { ...readAudioProcessing(), ...patch };
  setItem(AUDIO_PROCESSING_KEY, next);
  for (const listener of Array.from(listeners)) {
    listener();
  }
  return readAudioProcessing();
}

export function subscribeAudioProcessing(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === AUDIO_PROCESSING_KEY) {
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useAudioProcessing(): [AudioProcessing, (patch: Partial<AudioProcessing>) => void] {
  const value = useSyncExternalStore(subscribeAudioProcessing, getAudioProcessing, () => DEFAULT_AUDIO_PROCESSING);
  return [value, setAudioProcessing];
}

export function getShareVolume(): number {
  const stored = getItem<unknown>(SHARE_VOLUME_KEY);
  return typeof stored === 'number' && Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 1;
}

export function setShareVolume(value: number): number {
  const next = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  setItem(SHARE_VOLUME_KEY, next);
  return next;
}
