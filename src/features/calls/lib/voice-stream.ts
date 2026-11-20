export function voiceOnly(stream: MediaStream | null, key: string): MediaStream | null {
  if (!stream || key === '') {
    return null;
  }
  return new MediaStream(stream.getAudioTracks());
}

export function audioTrackKey(stream: MediaStream | null): string {
  return stream ? stream.getAudioTracks().map((track) => track.id).join(',') : '';
}
