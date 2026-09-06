const ORIGINAL_MAX_DIMENSION = 1920;
const ORIGINAL_QUALITY = 0.88;
const ORIGINAL_SKIP_THRESHOLD_BYTES = 300 * 1024;
const THUMBNAIL_MAX_DIMENSION = 480;
const THUMBNAIL_QUALITY = 0.65;
export const THUMBNAIL_MIME_TYPE = 'image/webp';

export interface ImageVariants {
  original: Blob;
  thumbnail: Blob | null;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function drawScaled(bitmap: ImageBitmap, maxDimension: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

async function recompress(file: File, maxDimension: number, quality: number): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const canvas = drawScaled(bitmap, maxDimension);
      return await canvasToBlob(canvas, THUMBNAIL_MIME_TYPE, quality);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

function isAnimated(file: File): boolean {
  return file.type === 'image/gif';
}

export async function buildImageVariants(file: File): Promise<ImageVariants> {
  if (isAnimated(file)) {
    return { original: file, thumbnail: null };
  }

  const [compressedOriginal, thumbnail] = await Promise.all([
    file.size > ORIGINAL_SKIP_THRESHOLD_BYTES ? recompress(file, ORIGINAL_MAX_DIMENSION, ORIGINAL_QUALITY) : null,
    recompress(file, THUMBNAIL_MAX_DIMENSION, THUMBNAIL_QUALITY),
  ]);

  const original = compressedOriginal && compressedOriginal.size < file.size ? compressedOriginal : file;
  return { original, thumbnail };
}
