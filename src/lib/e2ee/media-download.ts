import { downloadFromUrl, withFileExtension } from '@lib/download-file';
import { translate } from '@lib/i18n/app-i18n';
import { isStorageMediaUrl } from '@lib/media/media-origin';
import type { MessageFileMeta, MessageType } from '@lib/socket';
import { decryptMediaContentIfNeeded, isEncryptedMediaUrl } from './message-crypto';

export class UndecryptableMediaError extends Error {
  constructor() {
    super(translate('errors.e2ee.mediaUndecryptable'));
    this.name = 'UndecryptableMediaError';
  }
}

export class UntrustedMediaSourceError extends Error {
  constructor() {
    super(translate('errors.download.failed'));
    this.name = 'UntrustedMediaSourceError';
  }
}

export interface MessageMediaDownload {
  content: string;
  roomId: string | null | undefined;
  messageId: string | null | undefined;
  fileMeta: MessageFileMeta | null | undefined;
  fileName: string;
  messageType: MessageType;
}

function isLocalObjectUrl(content: string): boolean {
  return content.startsWith('blob:');
}

export async function resolveDownloadableMediaUrl({
  content,
  roomId,
  messageId,
  fileMeta,
  messageType,
}: Omit<MessageMediaDownload, 'fileName'>): Promise<string> {
  if (isLocalObjectUrl(content)) {
    return content;
  }
  if (!isStorageMediaUrl(content)) {
    throw new UntrustedMediaSourceError();
  }
  if (!isEncryptedMediaUrl(content)) {
    return content;
  }
  if (!roomId || !messageId) {
    throw new UndecryptableMediaError();
  }

  const resolved = await decryptMediaContentIfNeeded(content, { roomId, messageId, fileMeta: fileMeta ?? null, messageType });
  if (!isLocalObjectUrl(resolved)) {
    throw new UndecryptableMediaError();
  }
  return resolved;
}

export async function downloadMessageMedia(download: MessageMediaDownload): Promise<boolean> {
  try {
    const url = await resolveDownloadableMediaUrl(download);
    await downloadFromUrl(url, withFileExtension(download.fileName, download.fileMeta?.mimeType));
    return true;
  } catch (error) {
    window.alert(error instanceof UndecryptableMediaError ? error.message : translate('errors.download.failed'));
    return false;
  }
}
