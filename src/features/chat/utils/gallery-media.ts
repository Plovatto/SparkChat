import type { ChatMessage } from '../types';

export function getGalleryMedia(messages: readonly ChatMessage[]): ChatMessage[] {
  return messages
    .filter((message) => (message.type === 'image' || message.type === 'file') && !message.deletedForEveryone && !message.pending && !message.failed)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
