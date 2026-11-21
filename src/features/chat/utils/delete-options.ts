import type { ChatMessage } from '../types';

export const HIDE_MESSAGES_BATCH_LIMIT = 100;

export interface DeleteOptions {
  count: number;
  canDeleteForEveryone: boolean;
}

export function resolveDeleteOptions(messages: ChatMessage[], currentUserId: string): DeleteOptions {
  return {
    count: messages.length,
    canDeleteForEveryone:
      messages.length > 0 &&
      messages.every(
        (message) =>
          message.sender.id === currentUserId &&
          !message.deletedForEveryone &&
          !message.pending &&
          !message.failed &&
          message.type !== 'system' &&
          message.type !== 'error',
      ),
  };
}

export function chunkMessageIds(messageIds: string[], size = HIDE_MESSAGES_BATCH_LIMIT): string[][] {
  const unique = [...new Set(messageIds)];
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += size) {
    chunks.push(unique.slice(index, index + size));
  }
  return chunks;
}

export function isSelectableMessage(message: ChatMessage): boolean {
  return !message.pending && !message.failed && !message.exiting;
}
