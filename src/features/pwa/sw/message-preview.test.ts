import { describe, expect, it, vi } from 'vitest';
import { openAuthenticatedField, sealAuthenticatedField } from '../../../lib/e2ee/authenticated-field';
import { deriveSigningKeyPair } from '../../../lib/e2ee/signing';
import { getSodium } from '../../../lib/e2ee/sodium';
import type { NotificationMirror } from '../lib/notification-mirror';
import { resolveMessagePreview, type PreviewDeps, type PreviewKind, type PushMessagePreview } from './message-preview';
import { WORKER_STRINGS } from './sw-strings';

const ROOM_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const GROUP_ID = '0d3c1f0e-5a2b-4c1d-9e8f-123456789abc';
const OWNER_ID = 'owner-1';
const SENDER_ID = 'sender-1';
const OTHER_ID = 'sender-2';
const MESSAGE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const KEY_ID = 'AbCdEfGhIjKlMnOpQrStUv';
const pt = WORKER_STRINGS.pt;

function mirror(overrides: Partial<NotificationMirror> = {}): NotificationMirror {
  return {
    ownerId: OWNER_ID,
    hideContent: false,
    language: 'pt',
    names: { users: { [SENDER_ID]: 'Ana', [OTHER_ID]: 'Bia' }, groups: { [GROUP_ID]: 'Família' } },
    ...overrides,
  };
}

async function sealed(value: string, options: { roomId?: string; label?: string } = {}) {
  const sodium = await getSodium();
  const roomKey = sodium.randombytes_buf(32);
  const signing = await deriveSigningKeyPair(sodium.randombytes_buf(32));
  const content = await sealAuthenticatedField(value, roomKey, signing.privateKey, {
    roomId: options.roomId ?? ROOM_ID,
    senderId: SENDER_ID,
    messageId: MESSAGE_ID,
    keyId: KEY_ID,
    label: options.label ?? 'content',
  });
  return { roomKey, signingPublicKey: signing.publicKey, content };
}

interface DepsOptions {
  mirror?: NotificationMirror | null;
  roomKey?: Uint8Array | null;
  signingKey?: Uint8Array | null;
  seen?: Set<string>;
}

function deps(options: DepsOptions = {}) {
  const seen = options.seen ?? new Set<string>();
  const loadRoomKey = vi.fn((_roomId: string, keyId: string) => Promise.resolve(keyId === KEY_ID && options.roomKey ? Uint8Array.from(options.roomKey) : null));
  const value: PreviewDeps = {
    readMirror: () => Promise.resolve(options.mirror === undefined ? mirror() : options.mirror),
    loadRoomKey,
    loadSigningKey: (ownerId: string, senderId: string) => Promise.resolve(ownerId === OWNER_ID && senderId === SENDER_ID ? (options.signingKey ?? null) : null),
    openField: openAuthenticatedField,
    rememberMessage: (messageId: string) => {
      const fresh = !seen.has(messageId);
      seen.add(messageId);
      return Promise.resolve(fresh);
    },
  };
  return { ...value, loadRoomKey };
}

function preview(content: string | undefined, kind: PreviewKind = 'text', overrides: Partial<PushMessagePreview> = {}): PushMessagePreview {
  return { id: MESSAGE_ID, senderId: SENDER_ID, kind, ...(content ? { content } : {}), ...overrides };
}

describe('resolveMessagePreview', () => {
  it('decrypts a real end-to-end encrypted text with the stored room key and the pinned signing key', async () => {
    const { roomKey, signingPublicKey, content } = await sealed('Oi, tudo bem?\nChego às 8');
    const result = await resolveMessagePreview(ROOM_ID, preview(content), pt, deps({ roomKey, signingKey: signingPublicKey }));
    expect(result).toEqual({ title: 'Ana', body: 'Oi, tudo bem? Chego às 8' });
  });

  it('prefixes the sender in a group and titles the notification with the locally known group name', async () => {
    const { roomKey, signingPublicKey, content } = await sealed('reunião às 10', { roomId: GROUP_ID });
    const result = await resolveMessagePreview(GROUP_ID, preview(content), pt, deps({ roomKey, signingKey: signingPublicKey }));
    expect(result).toEqual({ title: 'Família', body: 'Ana: reunião às 10' });
  });

  it('labels media from the signed and encrypted mime type, not from the kind the server claims', async () => {
    const image = await sealed('image/webp', { label: 'file-mime' });
    expect(await resolveMessagePreview(ROOM_ID, preview(image.content, 'image'), pt, deps({ roomKey: image.roomKey, signingKey: image.signingPublicKey }))).toEqual({ title: 'Ana', body: '📷 Foto' });
    const audio = await sealed('audio/webm;codecs=opus', { label: 'file-mime' });
    expect(await resolveMessagePreview(ROOM_ID, preview(audio.content, 'image'), WORKER_STRINGS.en, deps({ roomKey: audio.roomKey, signingKey: audio.signingPublicKey }))).toEqual({ title: 'Ana', body: '🎤 Audio' });
    const file = await sealed('application/pdf', { roomId: GROUP_ID, label: 'file-mime' });
    expect(await resolveMessagePreview(GROUP_ID, preview(file.content, 'file'), pt, deps({ roomKey: file.roomKey, signingKey: file.signingPublicKey }))).toEqual({ title: 'Família', body: 'Ana: 📎 Arquivo' });
  });

  it('refuses media notifications a server could forge without a verifiable field', async () => {
    const forged = deps({ roomKey: new Uint8Array(32), signingKey: new Uint8Array(32) });
    for (const kind of ['image', 'audio', 'file'] as const) {
      expect(await resolveMessagePreview(ROOM_ID, preview(undefined, kind), pt, forged)).toBeNull();
    }
    expect(forged.loadRoomKey).not.toHaveBeenCalled();
  });

  it('rejects a field moved to another kind, sender or message', async () => {
    const text = await sealed('oi');
    const valid = { roomKey: text.roomKey, signingKey: text.signingPublicKey };
    expect(await resolveMessagePreview(ROOM_ID, preview(text.content, 'image'), pt, deps(valid))).toBeNull();
    const mime = await sealed('image/png', { label: 'file-mime' });
    expect(await resolveMessagePreview(ROOM_ID, preview(mime.content, 'text'), pt, deps({ roomKey: mime.roomKey, signingKey: mime.signingPublicKey }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, preview(text.content, 'text', { senderId: OTHER_ID }), pt, deps(valid))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, preview(text.content, 'text', { id: 'another-message' }), pt, deps(valid))).toBeNull();
  });

  it('shows nothing specific when the person chose to hide content or the app never mirrored its settings', async () => {
    const { roomKey, signingPublicKey, content } = await sealed('segredo');
    expect(await resolveMessagePreview(ROOM_ID, preview(content), pt, deps({ roomKey, signingKey: signingPublicKey, mirror: mirror({ hideContent: true }) }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, preview(content), pt, deps({ roomKey, signingKey: signingPublicKey, mirror: null }))).toBeNull();
  });

  it('falls back to the generic text when the key or the signature does not match', async () => {
    const { roomKey, signingPublicKey, content } = await sealed('segredo');
    const sodium = await getSodium();
    const wrongKey = sodium.randombytes_buf(32);
    const otherSigner = (await deriveSigningKeyPair(sodium.randombytes_buf(32))).publicKey;
    expect(await resolveMessagePreview(ROOM_ID, preview(content), pt, deps({ roomKey: null, signingKey: signingPublicKey }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, preview(content), pt, deps({ roomKey, signingKey: null }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, preview(content), pt, deps({ roomKey: wrongKey, signingKey: signingPublicKey }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, preview(content), pt, deps({ roomKey, signingKey: otherSigner }))).toBeNull();
    expect(await resolveMessagePreview(GROUP_ID, preview(content), pt, deps({ roomKey, signingKey: signingPublicKey }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, preview(undefined), pt, deps({ roomKey, signingKey: signingPublicKey }))).toBeNull();
  });

  it('shows a replayed message only once', async () => {
    const { roomKey, signingPublicKey, content } = await sealed('uma vez');
    const seen = new Set<string>();
    expect(await resolveMessagePreview(ROOM_ID, preview(content), pt, deps({ roomKey, signingKey: signingPublicKey, seen }))).toEqual({ title: 'Ana', body: 'uma vez' });
    expect(await resolveMessagePreview(ROOM_ID, preview(content), pt, deps({ roomKey, signingKey: signingPublicKey, seen }))).toBeNull();
  });

  it('uses a generic title for an unknown sender, shortens long texts and ignores own messages', async () => {
    const long = 'a'.repeat(400);
    const { roomKey, signingPublicKey, content } = await sealed(long);
    const result = await resolveMessagePreview(ROOM_ID, preview(content), pt, deps({ roomKey, signingKey: signingPublicKey, mirror: mirror({ names: { users: {}, groups: {} } }) }));
    expect(result?.title).toBe('Nova mensagem');
    expect(result?.body.length).toBe(180);
    expect(result?.body.endsWith('…')).toBe(true);
    expect(await resolveMessagePreview(ROOM_ID, preview(content), pt, deps({ roomKey, signingKey: signingPublicKey, mirror: mirror({ ownerId: SENDER_ID }) }))).toBeNull();
    expect(await resolveMessagePreview(ROOM_ID, undefined, pt, deps())).toBeNull();
  });
});
