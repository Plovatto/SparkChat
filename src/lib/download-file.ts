import { translate } from '@lib/i18n/app-i18n';

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

const FILE_EXTENSION_PATTERN = /\.[a-z0-9]{1,8}$/i;
const MIME_SUBTYPE_PATTERN = /^[a-z0-9]{1,8}$/i;

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array<number>(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  return new Uint8Array(byteNumbers);
}

export function extensionForMimeType(mimeType: string | null | undefined): string | null {
  if (!mimeType) {
    return null;
  }
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const known = EXTENSION_BY_MIME_TYPE[normalized];
  if (known) {
    return known;
  }
  const subtype = normalized.split('/')[1] ?? '';
  return MIME_SUBTYPE_PATTERN.test(subtype) ? subtype : null;
}

export function withFileExtension(fileName: string, mimeType: string | null | undefined): string {
  const trimmed = fileName.trim();
  if (FILE_EXTENSION_PATTERN.test(trimmed)) {
    return trimmed;
  }
  const extension = extensionForMimeType(mimeType);
  return extension ? `${trimmed}.${extension}` : trimmed;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function downloadBytes(bytes: Uint8Array<ArrayBuffer>, filename: string, mimeType = 'application/octet-stream'): void {
  triggerBlobDownload(new Blob([bytes], { type: mimeType }), filename);
}

export async function downloadFromUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(translate('errors.download.failed'));
  }

  triggerBlobDownload(await response.blob(), filename);
}
