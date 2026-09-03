export interface VideoThumbnail {
  dataUrl: string;
  width: number;
  height: number;
}

export function renderVideoThumbnail(url: string, maxWidth: number): Promise<VideoThumbnail> {
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
