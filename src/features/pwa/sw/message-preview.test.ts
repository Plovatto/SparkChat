import { describe, expect, it, vi } from 'vitest';
import { openAuthenticatedField, sealAuthenticatedField } from '../../../lib/e2ee/authenticated-field';
import { deriveSigningKeyPair } from '../../../lib/e2ee/signing';
import { getSodium } from '../../../lib/e2ee/sodium';
import type { NotificationMirror } from '../lib/notification-mirror';
import { resolveMessagePreview, type PreviewDeps, type PushMessagePreview } from './message-preview';
import { WORKER_STRINGS } from './sw-strings';

const ROOM_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const GROUP_ID = '0d3c1f0e-5a2b-4c1d-9e8f-123456789abc';
const OWNER_ID = 'owner-1';
const SENDER_ID = 'sender-1';
const MESSAGE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const KEY_ID = 'AbCdEfGhIjKlMnOpQrStUv';
const pt = WORKER_STRINGS.pt;

function mirror(overrides: Partial<NotificationMirror> = {}): NotificationMirror {
  return {
    ownerId: OWNER_ID,
    hideContent: false,
    language: 'pt',
    names: { users: { [SENDER_ID]: 'Ana' }, groups: { [GROUP_ID]: 'Família' } },
    ...overrides,
  };
}

async function sealed(text: string, roomId = ROOM_ID) {
  const sodium = await getSodium();
  const roomKey = sodium.randombytes_buf(32);
  const signing = await deriveSigningKeyPair(sodium.randombytes_buf(32));
  const content = await sealAuthenticatedField(text, roomKey, signing.privateKey, { roomId, senderId: SENDER_ID, messageId: MESSAGE_ID, keyId: KEY_ID, label: 'content' });
  return { roomKey, signingPublicKey: signing.publicKey, content };
}

function deps(options: { mirror?: NotificationMirror | null; roomKey?: Uint8Array | null; signingKey?: Uint8Array | null } = {}): PreviewDeps & { loadRoomKey: ReturnType<typeof vi.fn> } {
  return {
    readMirror: () => Promise.resolve(options.mirror === undefined ? mirror() : options.mirror),
    loadRoomKey: vi.fn((_roomId: string, keyId: string) => Promise.resolve(keyId === KEY_ID && options.roomKey ? Uint8Array.from(options.roomKey) : null)),
    loadSigningKey: (ownerId: string, senderId: string) => Promise.resolve(ownerId === OWNER_ID && senderId === SENDER_ID ? (options.signingKey ?? null) : null),
    openField: openAuthenticatedField,
  };
}

function text(content: string): PushMessagePreview {
  return { id: MESSAGE_ID, senderId: SENDER_ID, kind: 'text', content };
}

describe('resolveMessagePreview', () => {
  it('decrypts a real end-to-end encrypted text with the stored room key and the pinned signing key', async () => {
    const { roomKey, signingPublicKey, content } = await sealed('Oi, tudo bem?\nChego às 8');
    const result = await resolveMessagePreview(ROOM_ID, text(content), pt, deps({ roomKey, signingKey: signingPublicKey }));
    expect(result).toEqual({ title: 'Ana', body: 'Oi, tudo bem? Chego às 8' });
  });

  it('prefixes the sender in a group and titles the notification with the group name', async () => {
    const { roomKey, signingPublicKey, content } = await sealed('reunião às 10', GROUP_ID);
    const result = await resolveMessagePreview(GROUP_ID, text(content), pt, deps({ roomKey, signingKey: signingPublicKey }));
    expect(result).toEqual({ title: 'Família', body: 'Ana: reunião às 10' });
  });

  it('labels media without decrypting anything, in the stored language', async () => {
    const none = deps();
    expect(await resolveMessagePreview(ROOM_ID, { id: MESSAGE_ID, senderId: SENDER_ID, kind: 'image' }, pt, none)).toEqual({ title: 'Ana', body: '📷 Foto' });
    expect(await resolveMessagePreview(ROOM_ID, { id: MESSAGE_ID, senderId: SENDER_ID, kind: 'audio' }, WORKER_STRINGS.en, none)).toEqual({ title: 'Ana', body: '🎤 Audio' });
    expect(await resolveMessagePreview(GROUP_ID, { id: MESSAGE_ID, senderId: SENDER_ID, kind: 'file' }, pt, none)).toEqual({ title: 'Família', body: 'Ana: 📎 Arquivo' });
    expect(none.loadRoomKey).not.toHaveBeenCalled();
  });

  it('shows nothing specific when the person chose to hide content or the app never mirrored its settings', async () => {
    const { roomKey, signingPublicKey, content } = await sealed('segredo');
    expect(await resolveMessagePreview(ROOM_ID, text(content), pt, deps({ roomKey, signingKey: signingPublicKey, mirror: mirror({ hideContent: true }) }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, text(content), pt, deps({ roomKey, signingKey: signingPublicKey, mirror: null }))).toBeNull();
  });

  it('falls back to the generic text when the key, the signature or the binding does not match', async () => {
    const { roomKey, signingPublicKey, content } = await sealed('segredo');
    const sodium = await getSodium();
    const wrongKey = sodium.randombytes_buf(32);
    const otherSigner = (await deriveSigningKeyPair(sodium.randombytes_buf(32))).publicKey;
    expect(await resolveMessagePreview(ROOM_ID, text(content), pt, deps({ roomKey: null, signingKey: signingPublicKey }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, text(content), pt, deps({ roomKey, signingKey: null }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, text(content), pt, deps({ roomKey: wrongKey, signingKey: signingPublicKey }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, text(content), pt, deps({ roomKey, signingKey: otherSigner }))).toBeNull();
    expect(await resolveMessagePreview(GROUP_ID, text(content), pt, deps({ roomKey, signingKey: signingPublicKey }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, { ...text(content), id: 'another-message' }, pt, deps({ roomKey, signingKey: signingPublicKey }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, { id: MESSAGE_ID, senderId: SENDER_ID, kind: 'text' }, pt, deps({ roomKey, signingKey: signingPublicKey }))).toBeNull();
  });

  it('uses a generic title for an unknown sender, shortens long texts and ignores own messages', async () => {
    const long = 'a'.repeat(400);
    const { roomKey, signingPublicKey, content } = await sealed(long);
    const result = await resolveMessagePreview(ROOM_ID, text(content), pt, deps({ roomKey, signingKey: signingPublicKey, mirror: mirror({ names: { users: {}, groups: {} } }) }));
    expect(result?.title).toBe('Nova mensagem');
    expect(result?.body.length).toBe(180);
    expect(result?.body.endsWith('…')).toBe(true);
    expect(await resolveMessagePreview(ROOM_ID, text(content), pt, deps({ roomKey, signingKey: signingPublicKey, mirror: mirror({ ownerId: SENDER_ID }) }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, undefined, pt, deps())).toBeNull();
  });
});
