import type { ComponentType } from 'react';
import type { EmojiPickerPanelProps } from '../components/EmojiPickerPanel';

let pending: Promise<{ default: ComponentType<EmojiPickerPanelProps> }> | null = null;

export function loadEmojiPickerPanel(): Promise<{ default: ComponentType<EmojiPickerPanelProps> }> {
  pending ??= import('../components/EmojiPickerPanel').catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

export function preloadEmojiPicker(): void {
  void loadEmojiPickerPanel().catch(() => undefined);
}
