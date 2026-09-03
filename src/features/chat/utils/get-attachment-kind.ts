export type AttachmentKind = 'image' | 'video' | 'pdf' | 'generic';

export function getAttachmentKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }
  return 'generic';
}
