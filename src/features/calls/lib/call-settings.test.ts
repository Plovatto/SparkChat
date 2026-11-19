import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLegacyCallSettings, getAudioProcessing, getShareVolume, setAudioProcessing, setShareVolume } from './call-settings';

function createStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
  vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });
});

describe('audio processing settings', () => {
  it('starts with noise suppression, echo cancellation and automatic gain on and voice isolation off', () => {
    expect(getAudioProcessing()).toEqual({ noiseSuppression: true, echoCancellation: true, autoGainControl: true, voiceIsolation: false });
  });

  it('keeps each change and merges it with the previous ones', () => {
    setAudioProcessing({ noiseSuppression: false });
    setAudioProcessing({ voiceIsolation: true });
    expect(getAudioProcessing()).toEqual({ noiseSuppression: false, echoCancellation: true, autoGainControl: true, voiceIsolation: true });
  });

  it('returns the same object until something changes so subscribers do not loop', () => {
    const first = getAudioProcessing();
    expect(getAudioProcessing()).toBe(first);
    setAudioProcessing({ echoCancellation: false });
    expect(getAudioProcessing()).not.toBe(first);
  });

  it('ignores stored values that are not booleans', () => {
    localStorage.setItem('chatCallAudioProcessing', JSON.stringify({ noiseSuppression: 'no', echoCancellation: false, autoGainControl: 3 }));
    expect(getAudioProcessing()).toEqual({ noiseSuppression: true, echoCancellation: false, autoGainControl: true, voiceIsolation: false });
  });
});

describe('legacy protect my IP setting', () => {
  it('deletes the stored protect my IP key and keeps the other settings', () => {
    localStorage.setItem('chatCallProtectIp', 'true');
    setAudioProcessing({ voiceIsolation: true });

    clearLegacyCallSettings();

    expect(localStorage.getItem('chatCallProtectIp')).toBeNull();
    expect(getAudioProcessing().voiceIsolation).toBe(true);
  });

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw new Error('blocked');
      },
    });

    expect(() => clearLegacyCallSettings()).not.toThrow();
  });
});

describe('shared audio volume', () => {
  it('defaults to 100% and remembers the last value clamped to 0-100%', () => {
    expect(getShareVolume()).toBe(1);
    expect(setShareVolume(0.4)).toBe(0.4);
    expect(getShareVolume()).toBe(0.4);
    expect(setShareVolume(3)).toBe(1);
    expect(setShareVolume(-1)).toBe(0);
    localStorage.setItem('chatCallShareVolume', '"loud"');
    expect(getShareVolume()).toBe(1);
  });
});
