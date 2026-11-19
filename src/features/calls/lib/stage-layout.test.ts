import { describe, expect, it } from 'vitest';
import { selectStageLayout } from './stage-layout';

describe('selectStageLayout', () => {
  it('shows no stage when nobody shares or the call is not connected', () => {
    expect(selectStageLayout({ running: true, remoteSharing: false, localSharing: false })).toEqual({ main: null, localScreenTile: false });
    expect(selectStageLayout({ running: false, remoteSharing: true, localSharing: true })).toEqual({ main: null, localScreenTile: false });
  });

  it('puts my own share on the main stage when only I share', () => {
    expect(selectStageLayout({ running: true, remoteSharing: false, localSharing: true })).toEqual({ main: 'local-screen', localScreenTile: false });
  });

  it('puts the remote share on the main stage when only the other person shares', () => {
    expect(selectStageLayout({ running: true, remoteSharing: true, localSharing: false })).toEqual({ main: 'remote-screen', localScreenTile: false });
  });

  it('keeps the remote share as the main stage and moves mine to a tile when both share', () => {
    expect(selectStageLayout({ running: true, remoteSharing: true, localSharing: true })).toEqual({ main: 'remote-screen', localScreenTile: true });
  });
});
