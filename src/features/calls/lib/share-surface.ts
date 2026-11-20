export type ShareSurfaceKind = 'browser' | 'window' | 'monitor' | 'unknown';

export interface ShareSurface {
  kind: ShareSurfaceKind;
  label: string | null;
}

const MACHINE_LABEL = /^(screen|window|web-contents-media-stream|tab):/i;
const MAX_LABEL_LENGTH = 80;

function surfaceKind(value: unknown): ShareSurfaceKind {
  return value === 'browser' || value === 'window' || value === 'monitor' ? value : 'unknown';
}

export function describeShareSurface(stream: MediaStream | null): ShareSurface | null {
  const track = stream?.getVideoTracks()[0];
  if (!track) {
    return null;
  }
  const settings = track.getSettings() as MediaTrackSettings & { displaySurface?: string };
  const kind = surfaceKind(settings.displaySurface);
  const raw = track.label.trim();
  const label = kind === 'monitor' || raw === '' || MACHINE_LABEL.test(raw) ? null : raw.slice(0, MAX_LABEL_LENGTH);
  return { kind, label };
}
