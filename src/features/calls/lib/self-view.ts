export function mirrorSelfView(stream: MediaStream | null): boolean {
  const track = stream?.getVideoTracks()[0];
  if (!track) {
    return false;
  }
  return track.getSettings?.().facingMode !== 'environment';
}
