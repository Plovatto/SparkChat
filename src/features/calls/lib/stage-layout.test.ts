import { describe, expect, it } from 'vitest';
import { chromeAutoHides, chromeVisible, describeSurface, selectCallView, selectStageLayout } from './stage-layout';

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

describe('selectCallView', () => {
  it('prefers the ended card over everything else', () => {
    expect(selectCallView({ ended: true, stageActive: true, remoteVideo: true })).toBe('ended');
  });

  it('shows the share stage whenever a screen is on stage', () => {
    expect(selectCallView({ ended: false, stageActive: true, remoteVideo: true })).toBe('share');
  });

  it('shows the remote camera card when the other person has video', () => {
    expect(selectCallView({ ended: false, stageActive: false, remoteVideo: true })).toBe('video');
  });

  it('falls back to participant tiles', () => {
    expect(selectCallView({ ended: false, stageActive: false, remoteVideo: false })).toBe('tiles');
  });
});

describe('chrome auto hide', () => {
  it('only hides the controls over live video or a share', () => {
    expect(chromeAutoHides({ view: 'video', phase: 'active', panelOpen: false })).toBe(true);
    expect(chromeAutoHides({ view: 'share', phase: 'active', panelOpen: false })).toBe(true);
    expect(chromeAutoHides({ view: 'tiles', phase: 'active', panelOpen: false })).toBe(false);
    expect(chromeAutoHides({ view: 'ended', phase: 'ended', panelOpen: false })).toBe(false);
  });

  it('never hides while reconnecting or while the settings panel is open', () => {
    expect(chromeAutoHides({ view: 'video', phase: 'reconnecting', panelOpen: false })).toBe(false);
    expect(chromeAutoHides({ view: 'share', phase: 'active', panelOpen: true })).toBe(false);
  });

  it('stays visible when pinned or recently used', () => {
    expect(chromeVisible({ autoHide: false, pinned: false, recentActivity: false })).toBe(true);
    expect(chromeVisible({ autoHide: true, pinned: true, recentActivity: false })).toBe(true);
    expect(chromeVisible({ autoHide: true, pinned: false, recentActivity: true })).toBe(true);
    expect(chromeVisible({ autoHide: true, pinned: false, recentActivity: false })).toBe(false);
  });
});

describe('describeSurface', () => {
  it('drops the generic surface name so titles are never repeated', () => {
    expect(describeSurface('Sua tela', null, true)).toBe('');
    expect(describeSurface('Sua tela', 'Docs', true)).toBe('Docs');
  });

  it('joins the surface kind and its label', () => {
    expect(describeSurface('Uma janela', 'Figma', false)).toBe('Uma janela · Figma');
    expect(describeSurface('Uma janela', '', false)).toBe('Uma janela');
  });
});
