import { describe, expect, it, vi } from 'vitest';
import { audioTrackKey, voiceOnly } from './voice-stream';

function fakeStream(audioIds: string[], videoIds: string[]) {
  const audio = audioIds.map((id) => ({ id, kind: 'audio' }));
  const video = videoIds.map((id) => ({ id, kind: 'video' }));
  return { getAudioTracks: () => audio, getVideoTracks: () => video, getTracks: () => [...audio, ...video] } as unknown as MediaStream;
}

describe('voice stream', () => {
  it('keys a stream by its audio track ids only', () => {
    expect(audioTrackKey(null)).toBe('');
    expect(audioTrackKey(fakeStream([], ['v1']))).toBe('');
    expect(audioTrackKey(fakeStream(['a1', 'a2'], ['v1']))).toBe('a1,a2');
  });

  it('builds an audio only stream so a muted camera track cannot block voice playback', () => {
    const created: unknown[][] = [];
    vi.stubGlobal('MediaStream', class {
      constructor(tracks: unknown[]) {
        created.push(tracks);
      }
    });
    const source = fakeStream(['a1'], ['v1']);
    expect(voiceOnly(null, '')).toBeNull();
    expect(voiceOnly(fakeStream([], ['v1']), '')).toBeNull();
    expect(voiceOnly(source, audioTrackKey(source))).not.toBeNull();
    expect(created).toEqual([[{ id: 'a1', kind: 'audio' }]]);
    vi.unstubAllGlobals();
  });
});
