export interface FrameSource {
  videoWidth: number;
  videoHeight: number;
}

export interface FrameTarget {
  width: number;
  height: number;
  getContext: (type: '2d') => { drawImage: (source: never, x: number, y: number, width: number, height: number) => void } | null;
}

export function drawFrame(video: FrameSource, canvas: FrameTarget): boolean {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    return false;
  }
  try {
    const context = canvas.getContext('2d');
    if (!context) {
      return false;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video as never, 0, 0, canvas.width, canvas.height);
    return true;
  } catch {
    return false;
  }
}

export interface TrackLike {
  addEventListener: (type: 'mute' | 'unmute', listener: () => void) => void;
  removeEventListener: (type: 'mute' | 'unmute', listener: () => void) => void;
}

export function watchTrackMute(tracks: TrackLike[], onMute: () => void, onUnmute: () => void): () => void {
  for (const track of tracks) {
    track.addEventListener('mute', onMute);
    track.addEventListener('unmute', onUnmute);
  }
  return () => {
    for (const track of tracks) {
      track.removeEventListener('mute', onMute);
      track.removeEventListener('unmute', onUnmute);
    }
  };
}
