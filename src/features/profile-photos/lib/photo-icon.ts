function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load photo'));
    image.src = src;
  });
}

async function drawCircularPhoto(photoUrl: string, size: number): Promise<HTMLCanvasElement | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  const image = await loadImage(photoUrl);
  const width = image.naturalWidth || size;
  const height = image.naturalHeight || size;
  const side = Math.min(width, height);
  const center = size / 2;
  context.beginPath();
  context.arc(center, center, center, 0, Math.PI * 2);
  context.closePath();
  context.clip();
  context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size);
  return canvas;
}

export async function renderCircularPhotoDataUrl(photoUrl: string, size: number): Promise<string | null> {
  try {
    const canvas = await drawCircularPhoto(photoUrl, size);
    return canvas ? canvas.toDataURL('image/png') : null;
  } catch {
    return null;
  }
}

export async function renderCircularPhotoBlob(photoUrl: string, size: number): Promise<Blob | null> {
  try {
    const canvas = await drawCircularPhoto(photoUrl, size);
    if (!canvas) {
      return null;
    }
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  }
}
