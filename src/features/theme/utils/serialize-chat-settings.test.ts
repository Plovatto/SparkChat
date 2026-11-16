import { describe, expect, it } from 'vitest';
import { DEFAULT_CHAT_APPEARANCE, type ChatSettings } from '../constants/chat-appearance';
import { serializeChatSettings } from './serialize-chat-settings';

const empty: ChatSettings = { roomWallpapers: {}, globalWallpaper: null, roomAppearance: {}, globalAppearance: null };

describe('serializeChatSettings', () => {
  it('changes when a single room wallpaper changes', () => {
    const before = serializeChatSettings({ ...empty, roomWallpapers: { room1: 'gradient1' } });
    const after = serializeChatSettings({ ...empty, roomWallpapers: { room1: 'gradient2' } });
    expect(after).not.toBe(before);
  });

  it('changes when a room appearance changes', () => {
    const before = serializeChatSettings({ ...empty, roomAppearance: { room1: DEFAULT_CHAT_APPEARANCE } });
    const after = serializeChatSettings({ ...empty, roomAppearance: { room1: { ...DEFAULT_CHAT_APPEARANCE, bubbleBlur: 6 } } });
    expect(after).not.toBe(before);
  });

  it('ignores key order, so server and local copies compare equal', () => {
    const local = serializeChatSettings({ ...empty, roomWallpapers: { a: 'gradient1', b: 'gradient2' } });
    const server = serializeChatSettings({ globalAppearance: null, roomAppearance: {}, globalWallpaper: null, roomWallpapers: { b: 'gradient2', a: 'gradient1' } });
    expect(server).toBe(local);
  });
});
