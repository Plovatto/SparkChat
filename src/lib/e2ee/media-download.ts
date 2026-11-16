import { downloadFromUrl, withFileExtension } from '@lib/download-file';
import { translate } from '@lib/i18n/app-i18n';
import type { AppSocket, MessageFileMeta } from '@lib/socket';
import { decryptMediaContentIfNeeded, isEncryptedMediaUrl } from './message-crypto';

export class UndecryptableMediaError extends Error {
  constructor() {
    super(translate('errors.e2ee.mediaUndecryptable'));
    this.name = 'UndecryptableMediaError';
  }
}

export interface MessageMediaDownload {
  content: string;
  roomId: string | null | undefined;
  fileMeta: MessageFileMeta | null | undefined;
  fileName: string;
}

export async function resolveDownloadableMediaUrl(
  socket: AppSocket | null | undefined,
  content: string,
  roomId: string | null | undefined,
  fileMeta: MessageFileMeta | null | undefined,
): Promise<string> {
  if (!isEncryptedMediaUrl(content)) {
    return content;
  }
  if (!socket || !roomId) {
    throw new UndecryptableMediaError();
  }

  const resolved = await decryptMediaContentIfNeeded(socket, content, roomId, fileMeta ?? null);
  if (isEncryptedMediaUrl(resolved)) {
    throw new UndecryptableMediaError();
  }
  return resolved;
}

export async function downloadMessageMedia(socket: AppSocket | null | undefined, download: MessageMediaDownload): Promise<boolean> {
  try {
    const url = await resolveDownloadableMediaUrl(socket, download.content, download.roomId, download.fileMeta);
    await downloadFromUrl(url, withFileExtension(download.fileName, download.fileMeta?.mimeType));
    return true;
  } catch (error) {
    window.alert(error instanceof UndecryptableMediaError ? error.message : translate('errors.download.failed'));
    return false;
  }
}
