import { describe, expect, it } from 'vitest';
import { describeShareSurface } from './share-surface';

function streamWith(label: string, displaySurface?: string): MediaStream {
  const track = { label, getSettings: () => (displaySurface ? { displaySurface } : {}) };
  return { getVideoTracks: () => [track] } as unknown as MediaStream;
}

describe('describeShareSurface', () => {
  it('returns null without a video track', () => {
    expect(describeShareSurface(null)).toBeNull();
    expect(describeShareSurface({ getVideoTracks: () => [] } as unknown as MediaStream)).toBeNull();
  });

  it('keeps the tab or window title', () => {
    expect(describeShareSurface(streamWith('Planilha de vendas', 'browser'))).toEqual({ kind: 'browser', label: 'Planilha de vendas' });
    expect(describeShareSurface(streamWith('Visual Studio Code', 'window'))).toEqual({ kind: 'window', label: 'Visual Studio Code' });
  });

  it('hides machine labels and monitor names', () => {
    expect(describeShareSurface(streamWith('screen:0:0', 'monitor'))).toEqual({ kind: 'monitor', label: null });
    expect(describeShareSurface(streamWith('Monitor 1', 'monitor'))).toEqual({ kind: 'monitor', label: null });
    expect(describeShareSurface(streamWith('window:1234:0', 'window'))).toEqual({ kind: 'window', label: null });
    expect(describeShareSurface(streamWith('web-contents-media-stream://1:2'))).toEqual({ kind: 'unknown', label: null });
  });

  it('truncates very long titles', () => {
    expect(describeShareSurface(streamWith('a'.repeat(200), 'browser'))?.label).toHaveLength(80);
  });
});
