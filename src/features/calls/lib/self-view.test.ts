import { describe, expect, it } from 'vitest';
import { mirrorSelfView } from './self-view';

function stream(settings: MediaTrackSettings | null): MediaStream {
  const tracks = settings === null ? [] : [{ kind: 'video', getSettings: () => settings }];
  return { getVideoTracks: () => tracks } as unknown as MediaStream;
}

describe('mirrorSelfView', () => {
  it('mirrors a front camera', () => {
    expect(mirrorSelfView(stream({ facingMode: 'user' }))).toBe(true);
  });

  it('mirrors a desktop webcam without a facing mode', () => {
    expect(mirrorSelfView(stream({}))).toBe(true);
  });

  it('does not mirror a rear camera', () => {
    expect(mirrorSelfView(stream({ facingMode: 'environment' }))).toBe(false);
  });

  it('does not mirror without a video track', () => {
    expect(mirrorSelfView(stream(null))).toBe(false);
    expect(mirrorSelfView(null)).toBe(false);
  });

  it('tolerates tracks without getSettings', () => {
    const bare = { getVideoTracks: () => [{ kind: 'video' }] } as unknown as MediaStream;
    expect(mirrorSelfView(bare)).toBe(true);
  });
});
