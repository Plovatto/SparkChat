export type StageMain = 'remote-screen' | 'local-screen' | null;

export interface StageLayout {
  main: StageMain;
  localScreenTile: boolean;
}

export interface StageInput {
  running: boolean;
  remoteSharing: boolean;
  localSharing: boolean;
}

export function selectStageLayout({ running, remoteSharing, localSharing }: StageInput): StageLayout {
  if (!running) {
    return { main: null, localScreenTile: false };
  }
  if (remoteSharing) {
    return { main: 'remote-screen', localScreenTile: localSharing };
  }
  if (localSharing) {
    return { main: 'local-screen', localScreenTile: false };
  }
  return { main: null, localScreenTile: false };
}

export type CallView = 'ended' | 'share' | 'video' | 'tiles';

export interface CallViewInput {
  ended: boolean;
  stageActive: boolean;
  remoteVideo: boolean;
}

export function selectCallView({ ended, stageActive, remoteVideo }: CallViewInput): CallView {
  if (ended) {
    return 'ended';
  }
  if (stageActive) {
    return 'share';
  }
  return remoteVideo ? 'video' : 'tiles';
}

export const CHROME_HIDE_MS = 3_000;

export interface ChromeInput {
  view: CallView;
  phase: string;
  panelOpen: boolean;
}

export function chromeAutoHides({ view, phase, panelOpen }: ChromeInput): boolean {
  return (view === 'video' || view === 'share') && phase === 'active' && !panelOpen;
}

export interface ChromeVisibilityInput {
  autoHide: boolean;
  pinned: boolean;
  recentActivity: boolean;
}

export function chromeVisible({ autoHide, pinned, recentActivity }: ChromeVisibilityInput): boolean {
  return !autoHide || pinned || recentActivity;
}

export function describeSurface(kindText: string, label: string | null | undefined, unknown: boolean): string {
  const parts = unknown ? [] : [kindText];
  if (label) {
    parts.push(label);
  }
  return parts.join(' · ');
}
