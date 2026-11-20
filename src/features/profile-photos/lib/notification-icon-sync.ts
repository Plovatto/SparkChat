import { getRoomPhotoUrl, isRoomBlocked, privateRoomsWith, subscribeProfilePhotos, type ProfilePhotoChange } from '@lib/e2ee';
import { clearNotificationIcons, deleteNotificationIcon, NOTIFICATION_ICON_SIZE, writeNotificationIcon } from './notification-icon-cache';
import { renderCircularPhotoBlob } from './photo-icon';

type RenderIcon = (photoUrl: string, size: number) => Promise<Blob | null>;

const writtenIcons = new Map<string, string | null>();
const roomQueues = new Map<string, Promise<void>>();
let stopSync: (() => void) | null = null;
let renderIcon: RenderIcon = renderCircularPhotoBlob;

async function syncRoomIcon(roomId: string): Promise<void> {
  const photoUrl = isRoomBlocked(roomId) ? null : getRoomPhotoUrl(roomId);
  const previous = writtenIcons.get(roomId);
  if (previous === photoUrl) {
    return;
  }
  writtenIcons.set(roomId, photoUrl);
  if (!photoUrl) {
    if (previous !== null) {
      await deleteNotificationIcon(roomId);
    }
    return;
  }
  const png = await renderIcon(photoUrl, NOTIFICATION_ICON_SIZE);
  if (writtenIcons.get(roomId) !== photoUrl) {
    return;
  }
  if (png) {
    await writeNotificationIcon(roomId, png);
  } else {
    await deleteNotificationIcon(roomId);
  }
}

function queueRoom(roomId: string): Promise<void> {
  const previous = roomQueues.get(roomId) ?? Promise.resolve();
  const next = previous.then(() => syncRoomIcon(roomId)).catch(() => undefined);
  roomQueues.set(roomId, next);
  void next.finally(() => {
    if (roomQueues.get(roomId) === next) {
      roomQueues.delete(roomId);
    }
  });
  return next;
}

function handleChange(change: ProfilePhotoChange): void {
  if (change.kind === 'reset') {
    writtenIcons.clear();
    void clearNotificationIcons();
    return;
  }
  if (change.kind === 'room') {
    void queueRoom(change.id);
  } else if (change.kind === 'user') {
    for (const roomId of privateRoomsWith(change.id)) {
      void queueRoom(roomId);
    }
  }
}

export function startNotificationIconSync(render?: RenderIcon): void {
  if (render) {
    renderIcon = render;
  }
  if (stopSync) {
    return;
  }
  stopSync = subscribeProfilePhotos(handleChange);
}

export function stopNotificationIconSync(): void {
  stopSync?.();
  stopSync = null;
  writtenIcons.clear();
  renderIcon = renderCircularPhotoBlob;
}

export async function settleNotificationIconSync(): Promise<void> {
  await Promise.all(Array.from(roomQueues.values()));
}
