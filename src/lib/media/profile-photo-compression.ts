import { canvasToBlob } from './image-compression';

export const PROFILE_PHOTO_SIZE = 512;
export const PROFILE_PHOTO_MAX_BYTES = 200 * 1024;
export const PROFILE_PHOTO_MAX_INPUT_BYTES = 30 * 1024 * 1024;
export const PROFILE_PHOTO_QUALITY_STEPS = [0.86, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4] as const;

const WEBP_TYPE = 'image/webp';
const JPEG_TYPE = 'image/jpeg';
const JPEG_BACKGROUND = '#ffffff';
const BLOCKED_IMAGE_TYPES = new Set(['image/svg+xml']);

export type ProfilePhotoErrorCode = 'notImage' | 'tooLarge' | 'decodeFailed' | 'encodeFailed';

export class ProfilePhotoError extends Error {
  readonly code: ProfilePhotoErrorCode;

  constructor(code: ProfilePhotoErrorCode) {
    super(`profile photo: ${code}`);
    this.name = 'ProfilePhotoError';
    this.code = code;
  }
}

export interface PhotoCropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function assertProfilePhotoInput(file: Blob): void {
  const type = file.type.toLowerCase();
  if (!type.startsWith('image/') || BLOCKED_IMAGE_TYPES.has(type)) {
    throw new ProfilePhotoError('notImage');
  }
  if (file.size > PROFILE_PHOTO_MAX_INPUT_BYTES) {
    throw new ProfilePhotoError('tooLarge');
  }
}

export async function decodeProfilePhoto(file: Blob): Promise<ImageBitmap> {
  assertProfilePhotoInput(file);
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ProfilePhotoError('decodeFailed');
  }
}

function clampCrop(crop: PhotoCropArea | undefined, width: number, height: number): PhotoCropArea {
  if (!crop) {
    const side = Math.min(width, height);
    return { x: (width - side) / 2, y: (height - side) / 2, width: side, height: side };
  }
  const x = Math.min(Math.max(0, crop.x), width - 1);
  const y = Math.min(Math.max(0, crop.y), height - 1);
  return {
    x,
    y,
    width: Math.max(1, Math.min(crop.width, width - x)),
    height: Math.max(1, Math.min(crop.height, height - y)),
  };
}

function drawCrop(bitmap: ImageBitmap, crop: PhotoCropArea, background: string | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PROFILE_PHOTO_SIZE;
  canvas.height = PROFILE_PHOTO_SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new ProfilePhotoError('encodeFailed');
  }
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE);
  return canvas;
}

async function encodeWithinBudget(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  let smallest: Blob | null = null;
  for (const quality of PROFILE_PHOTO_QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, type, quality);
    if (!blob || blob.type !== type) {
      return null;
    }
    if (blob.size <= PROFILE_PHOTO_MAX_BYTES) {
      return blob;
    }
    if (!smallest || blob.size < smallest.size) {
      smallest = blob;
    }
  }
  return smallest;
}

export async function compressProfilePhoto(file: Blob, crop?: PhotoCropArea): Promise<Blob> {
  const bitmap = await decodeProfilePhoto(file);
  try {
    const area = clampCrop(crop, bitmap.width, bitmap.height);
    const webp = await encodeWithinBudget(drawCrop(bitmap, area, null), WEBP_TYPE);
    if (webp) {
      return webp;
    }
    const jpeg = await encodeWithinBudget(drawCrop(bitmap, area, JPEG_BACKGROUND), JPEG_TYPE);
    if (jpeg) {
      return jpeg;
    }
    throw new ProfilePhotoError('encodeFailed');
  } finally {
    bitmap.close();
  }
}

export type ProfilePhotoErrorKey = `profilePhotos.errors.${ProfilePhotoErrorCode}`;

export function profilePhotoErrorKey(error: unknown): ProfilePhotoErrorKey {
  const code = error instanceof ProfilePhotoError ? error.code : 'encodeFailed';
  return `profilePhotos.errors.${code}` as const;
}
