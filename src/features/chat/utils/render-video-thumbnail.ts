import { BoundedMap } from '@lib/cache/bounded-map';

export interface VideoThumbnail {
  dataUrl: string;
  width: number;
  height: number;
}

const MAX_CACHED_THUMBNAILS = 120;
const thumbnailCache = new BoundedMap<string, VideoThumbnail>(MAX_CACHED_THUMBNAILS);
const pendingThumbnails = new Map<string, Promise<VideoThumbnail>>();

function captureVideoThumbnail(url: string, maxWidth: number): Promise<VideoThumbnail> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    video.addEventListener('loadeddata', () => {
      video.currentTime = Math.min(0.1, video.duration || 0);
    });

    video.addEventListener('seeked', () => {
      const scale = maxWidth / video.videoWidth;
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = video.videoHeight * scale;
      const context = canvas.getContext('2d');
      if (!context) {
        cleanup();
        reject(new Error('Não foi possível criar o contexto de renderização do vídeo.'));
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const { videoWidth: width, videoHeight: height } = video;
      cleanup();
      resolve({ dataUrl, width, height });
    });

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error('Não foi possível carregar o vídeo.'));
    });

    video.src = url;
  });
}

export function renderVideoThumbnail(url: string, maxWidth: number): Promise<VideoThumbnail> {
  const cacheKey = `${maxWidth}|${url}`;
  const cached = thumbnailCache.get(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingThumbnails.get(cacheKey);
  if (pending) {
    return pending;
  }

  const task = captureVideoThumbnail(url, maxWidth)
    .then((thumbnail) => {
      thumbnailCache.set(cacheKey, thumbnail);
      return thumbnail;
    })
    .finally(() => {
      pendingThumbnails.delete(cacheKey);
    });

  pendingThumbnails.set(cacheKey, task);
  return task;
}
