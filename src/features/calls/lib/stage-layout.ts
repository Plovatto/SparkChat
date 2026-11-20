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
