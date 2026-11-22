import { isSameDay } from 'date-fns';
import { isGifMimeType } from '@lib/media/media-type';
import type { ChatMessage } from '../types';

export type ImageGroup = [ChatMessage, ChatMessage, ...ChatMessage[]];
export type RenderItem = { kind: 'single'; message: ChatMessage } | { kind: 'image-group'; messages: ImageGroup };

export const MIN_ALBUM_SIZE = 4;
const RUN_BREAK_MS = 5 * 60 * 1000;

function isImageGroup(messages: ChatMessage[]): messages is ImageGroup {
  return messages.length >= MIN_ALBUM_SIZE;
}

export function isAlbumCandidate(message: ChatMessage): boolean {
  if (message.deletedForEveryone || message.pending || message.failed || message.caption || message.replyTo) {
    return false;
  }
  if (message.type === 'image') {
    return !isGifMimeType(message.fileMeta?.mimeType);
  }
  return message.type === 'file' && Boolean(message.fileMeta?.mimeType.startsWith('video/'));
}

export function canJoinRun(previous: ChatMessage, next: ChatMessage): boolean {
  const joinable = (message: ChatMessage) => message.type !== 'system' && message.type !== 'error' && !message.deletedForEveryone;
  return (
    joinable(previous) &&
    joinable(next) &&
    previous.sender.id === next.sender.id &&
    isSameDay(new Date(previous.timestamp), new Date(next.timestamp)) &&
    new Date(next.timestamp).getTime() - new Date(previous.timestamp).getTime() < RUN_BREAK_MS
  );
}

function isSameMessageList(left: ChatMessage[], right: ChatMessage[]): boolean {
  return left.length === right.length && left.every((message, index) => message === right[index]);
}

export function buildRenderItems(messages: ChatMessage[], previousGroups: Map<string, ImageGroup>): RenderItem[] {
  const items: RenderItem[] = [];
  let buffer: ChatMessage[] = [];

  const flushBuffer = () => {
    const [first] = buffer;
    if (!first) {
      return;
    }
    if (isImageGroup(buffer)) {
      const previous = previousGroups.get(first.id);
      items.push({ kind: 'image-group', messages: previous && isSameMessageList(previous, buffer) ? previous : buffer });
    } else {
      for (const message of buffer) {
        items.push({ kind: 'single', message });
      }
    }
    buffer = [];
  };

  for (const message of messages) {
    const isGroupable = isAlbumCandidate(message);
    const bufferTail = buffer[buffer.length - 1];

    if (isGroupable && (!bufferTail || (bufferTail.sender.id === message.sender.id && isSameDay(new Date(bufferTail.timestamp), new Date(message.timestamp))))) {
      buffer.push(message);
      continue;
    }

    flushBuffer();

    if (isGroupable) {
      buffer.push(message);
    } else {
      items.push({ kind: 'single', message });
    }
  }
  flushBuffer();

  return items;
}

export function renderItemFirstMessage(item: RenderItem): ChatMessage {
  return item.kind === 'single' ? item.message : item.messages[0];
}

export function renderItemAnchorMessage(item: RenderItem): ChatMessage {
  return item.kind === 'single' ? item.message : (item.messages[item.messages.length - 1] ?? item.messages[0]);
}

export function renderItemMessages(item: RenderItem): ChatMessage[] {
  return item.kind === 'single' ? [item.message] : item.messages;
}

export function renderItemKey(item: RenderItem): string {
  return item.kind === 'single' ? item.message.id : `group-${item.messages[0].id}`;
}
