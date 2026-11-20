import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_ICON_CACHE_NAME, notificationIconUrl } from '@features/profile-photos/lib/notification-icon-cache';
import { buildLaunchUrl, isClientToWorkerMessage, isWorkerToClientMessage } from './protocol';
import {
  resolveWorkerLanguage,
  CALL_VIBRATION,
  callTag,
  createWorkerState,
  handleClientMessage,
  handleNavigation,
  handleNotificationClick,
  handlePush,
  messageTag,
  NOTIFICATION_ICON,
  parsePushMessage,
  LANGUAGE_TIMEOUT_MS,
  PREVIEW_TIMEOUT_MS,
  readCachedRoomIcon,
  type WorkerEnvironment,
  type WorkerNotification,
  type WorkerNotificationOptions,
  type WorkerWindowClient,
} from './sw-handlers';

interface ShownNotification {
  title: string;
  options: WorkerNotificationOptions;
  closed: boolean;
}

type FakeClient = WorkerWindowClient & { messages: unknown[]; focusCalls: number };

function fakeClient(overrides: Partial<WorkerWindowClient> = {}): FakeClient {
  const client: FakeClient = {
    id: 'client-1',
    url: 'https://chat.example/app/',
    focused: false,
    visibilityState: 'hidden',
    messages: [],
    focusCalls: 0,
    focus: () => {
      client.focusCalls += 1;
      return Promise.resolve(client);
    },
    postMessage: (message: unknown) => {
      client.messages.push(message);
    },
    ...overrides,
  };
  return client;
}

function fakeEnv(options: { clients?: WorkerWindowClient[]; maxActions?: number; language?: 'pt' | 'en' } = {}) {
  const shown: ShownNotification[] = [];
  const opened: string[] = [];
  const savedLanguages: string[] = [];
  const env: WorkerEnvironment = {
    scope: 'https://chat.example/app/',
    showNotification: (title, notificationOptions) => {
      const existing = shown.find((entry) => !entry.closed && entry.options.tag === notificationOptions.tag);
      if (existing) {
        existing.closed = true;
      }
      shown.push({ title, options: notificationOptions, closed: false });
      return Promise.resolve();
    },
    getNotifications: (tag) =>
      Promise.resolve(
        shown
          .filter((entry) => !entry.closed && entry.options.tag === tag)
          .map<WorkerNotification>((entry) => ({
            tag,
            data: entry.options.data,
            close: () => {
              entry.closed = true;
            },
          })),
      ),
    windowClients: () => Promise.resolve(options.clients ?? []),
    openWindow: (url) => {
      opened.push(url);
      return Promise.resolve(null);
    },
    maxActions: () => options.maxActions ?? 2,
    language: () => Promise.resolve(options.language ?? 'pt'),
    saveLanguage: (language) => {
      savedLanguages.push(language);
      return Promise.resolve();
    },
    now: () => 1_000,
  };
  return { env, shown, opened, savedLanguages, visible: () => shown.filter((entry) => !entry.closed) };
}

describe('resolveWorkerLanguage', () => {
  it('prefers the language the app stored', () => {
    expect(resolveWorkerLanguage('en', 'pt-BR')).toBe('en');
    expect(resolveWorkerLanguage('pt', 'en-US')).toBe('pt');
  });

  it('falls back to English only for an English browser and to Portuguese otherwise', () => {
    expect(resolveWorkerLanguage(null, 'en-GB')).toBe('en');
    expect(resolveWorkerLanguage(null, 'pt-PT')).toBe('pt');
    expect(resolveWorkerLanguage('xx', 'es-ES')).toBe('pt');
    expect(resolveWorkerLanguage(null, undefined)).toBe('pt');
  });
});

describe('parsePushMessage', () => {
  it('accepts the three content-free payloads', () => {
    expect(parsePushMessage({ t: 'call', callId: 'c1', roomId: 'r1', kind: 'video' })).toEqual({ t: 'call', callId: 'c1', roomId: 'r1', kind: 'video' });
    expect(parsePushMessage({ t: 'call-end', callId: 'c1', reason: 'missed' })).toEqual({ t: 'call-end', callId: 'c1', reason: 'missed' });
    expect(parsePushMessage({ t: 'msg', roomId: 'r1' })).toEqual({ t: 'msg', roomId: 'r1' });
  });

  it('rejects unknown types, unsafe ids and wrong kinds', () => {
    expect(parsePushMessage(null)).toBeNull();
    expect(parsePushMessage({ t: 'other' })).toBeNull();
    expect(parsePushMessage({ t: 'msg', roomId: '../evil' })).toBeNull();
    expect(parsePushMessage({ t: 'msg', roomId: 'x'.repeat(65) })).toBeNull();
    expect(parsePushMessage({ t: 'call', callId: 'c1', roomId: 'r1', kind: 'screen' })).toBeNull();
    expect(parsePushMessage({ t: 'call-end', callId: 'c1', reason: 5 })).toBeNull();
  });

  it('drops extra fields so nothing else reaches a notification', () => {
    expect(parsePushMessage({ t: 'msg', roomId: 'r1', body: 'secret' })).toEqual({ t: 'msg', roomId: 'r1' });
  });
});

describe('message previews in pushes', () => {
  const content = `e2e:v2:${'A'.repeat(22)}:${'B'.repeat(80)}`;

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps only well formed ids, a known kind and an encrypted field', () => {
    expect(parsePushMessage({ t: 'msg', roomId: 'r1', m: { id: 'm1', s: 'u1', k: 'text', c: content, extra: 'x' } })).toEqual({
      t: 'msg',
      roomId: 'r1',
      preview: { id: 'm1', senderId: 'u1', kind: 'text', content },
    });
    expect(parsePushMessage({ t: 'msg', roomId: 'r1', m: { id: 'm1', s: 'u1', k: 'image' } })).toEqual({ t: 'msg', roomId: 'r1', preview: { id: 'm1', senderId: 'u1', kind: 'image' } });
    expect(parsePushMessage({ t: 'msg', roomId: 'r1', m: { id: 'm1', s: 'u1', k: 'text', c: 'texto em claro' } })).toEqual({ t: 'msg', roomId: 'r1', preview: { id: 'm1', senderId: 'u1', kind: 'text' } });
    expect(parsePushMessage({ t: 'msg', roomId: 'r1', m: { id: 'm 1', s: 'u1', k: 'text' } })).toEqual({ t: 'msg', roomId: 'r1' });
    expect(parsePushMessage({ t: 'msg', roomId: 'r1', m: { id: 'm1', s: 'u1', k: 'video' } })).toEqual({ t: 'msg', roomId: 'r1' });
    expect(parsePushMessage({ t: 'msg', roomId: 'r1', m: { id: 'm1', s: 'u1', k: 'text', c: `e2e:v2:${'x'.repeat(5000)}` } })).toEqual({ t: 'msg', roomId: 'r1', preview: { id: 'm1', senderId: 'u1', kind: 'text' } });
  });

  it('shows the decrypted sender and text when the preview resolves', async () => {
    const { env, visible } = fakeEnv();
    const previewMessage = vi.fn(() => Promise.resolve({ title: 'Ana', body: 'oi' }));
    await handlePush({ ...env, previewMessage }, createWorkerState(), { t: 'msg', roomId: 'r1', m: { id: 'm1', s: 'u1', k: 'text', c: content } });
    expect(previewMessage).toHaveBeenCalledWith('r1', { id: 'm1', senderId: 'u1', kind: 'text', content }, expect.objectContaining({ photo: '📷 Foto' }));
    expect(visible()[0]).toMatchObject({ title: 'Ana', options: { body: 'oi', tag: messageTag('r1') } });
  });

  it('falls back to the generic text when the preview fails, returns nothing or is missing', async () => {
    for (const previewMessage of [() => Promise.reject(new Error('no key')), () => Promise.resolve(null)]) {
      const { env, visible } = fakeEnv();
      await handlePush({ ...env, previewMessage }, createWorkerState(), { t: 'msg', roomId: 'r1', m: { id: 'm1', s: 'u1', k: 'text', c: content } });
      expect(visible()[0]).toMatchObject({ title: 'Nova mensagem', options: { body: 'Abra o SparkChat para ler' } });
    }
    const { env, visible } = fakeEnv();
    const previewMessage = vi.fn(() => Promise.resolve({ title: 'x', body: 'y' }));
    await handlePush({ ...env, previewMessage }, createWorkerState(), { t: 'msg', roomId: 'r1' });
    expect(previewMessage).not.toHaveBeenCalled();
    expect(visible()[0]!.title).toBe('Nova mensagem');
  });

  it('falls back to Portuguese when reading the language hangs instead of delaying the notification', async () => {
    vi.useFakeTimers();
    const { env, visible } = fakeEnv({ language: 'en' });
    const done = handlePush({ ...env, language: () => new Promise(() => undefined) }, createWorkerState(), { t: 'msg', roomId: 'r1' });
    await vi.advanceTimersByTimeAsync(LANGUAGE_TIMEOUT_MS);
    await done;
    expect(visible()[0]!.title).toBe('Nova mensagem');
  });

  it('never waits on a stuck preview longer than the timeout before notifying', async () => {
    vi.useFakeTimers();
    const { env, visible } = fakeEnv();
    const done = handlePush({ ...env, previewMessage: () => new Promise(() => undefined) }, createWorkerState(), { t: 'msg', roomId: 'r1', m: { id: 'm1', s: 'u1', k: 'image' } });
    await vi.advanceTimersByTimeAsync(PREVIEW_TIMEOUT_MS);
    await done;
    expect(visible()[0]!.title).toBe('Nova mensagem');
  });
});

describe('handlePush', () => {
  it('shows an incoming call with the call tag, interaction, vibration and actions', async () => {
    const { env, visible } = fakeEnv();
    await handlePush(env, createWorkerState(), { t: 'call', callId: 'c1', roomId: 'r1', kind: 'voice' });

    expect(visible()).toHaveLength(1);
    const [entry] = visible();
    expect(entry!.title).toBe('Chamada recebida');
    expect(entry!.options).toMatchObject({
      tag: callTag('c1'),
      requireInteraction: true,
      renotify: true,
      vibrate: CALL_VIBRATION,
      body: 'Chamada de voz no SparkChat',
      data: { kind: 'call', callId: 'c1', roomId: 'r1' },
      actions: [
        { action: 'answer', title: 'Atender' },
        { action: 'decline', title: 'Recusar' },
      ],
    });
  });

  it('omits actions where the platform does not support them and uses english when asked', async () => {
    const { env, visible } = fakeEnv({ maxActions: 0, language: 'en' });
    await handlePush(env, createWorkerState(), { t: 'call', callId: 'c1', roomId: 'r1', kind: 'video' });
    expect(visible()[0]!.title).toBe('Incoming call');
    expect(visible()[0]!.options.body).toBe('Video call on SparkChat');
    expect(visible()[0]!.options.actions).toBeUndefined();
  });

  it('skips the call notification only when a focused visible window is already ringing', async () => {
    const focused = fakeEnv({ clients: [fakeClient({ focused: true, visibilityState: 'visible' })] });
    await handlePush(focused.env, createWorkerState(), { t: 'call', callId: 'c1', roomId: 'r1', kind: 'voice' });
    expect(focused.shown).toHaveLength(0);

    const background = fakeEnv({ clients: [fakeClient({ focused: false, visibilityState: 'visible' })] });
    await handlePush(background.env, createWorkerState(), { t: 'call', callId: 'c1', roomId: 'r1', kind: 'voice' });
    expect(background.visible()).toHaveLength(1);
  });

  it('replaces the ringing notification with a missed call for missed and cancelled endings', async () => {
    for (const reason of ['missed', 'cancelled']) {
      const { env, visible } = fakeEnv();
      const state = createWorkerState();
      await handlePush(env, state, { t: 'call', callId: 'c1', roomId: 'r1', kind: 'voice' });
      await handlePush(env, state, { t: 'call-end', callId: 'c1', reason });

      expect(visible()).toHaveLength(1);
      expect(visible()[0]!.title).toBe('Chamada perdida');
      expect(visible()[0]!.options).toMatchObject({ tag: callTag('c1'), data: { kind: 'missed', callId: 'c1', roomId: 'r1' } });
    }
  });

  it('only closes the call notification when it was answered elsewhere or declined', async () => {
    for (const reason of ['answered', 'declined', 'completed']) {
      const { env, visible } = fakeEnv();
      const state = createWorkerState();
      await handlePush(env, state, { t: 'call', callId: 'c1', roomId: 'r1', kind: 'voice' });
      await handlePush(env, state, { t: 'call-end', callId: 'c1', reason });
      expect(visible()).toHaveLength(0);
    }
  });

  it('shows a content-free message notification that collapses per room', async () => {
    const { env, visible } = fakeEnv();
    const state = createWorkerState();
    await handlePush(env, state, { t: 'msg', roomId: 'r1' });
    await handlePush(env, state, { t: 'msg', roomId: 'r1' });
    await handlePush(env, state, { t: 'msg', roomId: 'r2' });

    expect(visible().map((entry) => entry.options.tag)).toEqual([messageTag('r1'), messageTag('r2')]);
    expect(visible()[0]!.title).toBe('Nova mensagem');
    expect(visible()[0]!.options.body).toBe('Abra o SparkChat para ler');
    expect(visible()[0]!.options.silent).toBe(false);
  });

  it('still shows a message for the room open in a visible window, but silently', async () => {
    const client = fakeClient({ id: 'w1', visibilityState: 'visible', focused: true });
    const { env, visible } = fakeEnv({ clients: [client] });
    const state = createWorkerState();
    await handleClientMessage(env, state, 'w1', { type: 'sparkchat:active-room', roomId: 'r1' });

    await handlePush(env, state, { t: 'msg', roomId: 'r1' });
    await handlePush(env, state, { t: 'msg', roomId: 'r2' });

    expect(visible()).toHaveLength(2);
    expect(visible()[0]!.options).toMatchObject({ tag: messageTag('r1'), silent: true, renotify: false });
    expect(visible()[1]!.options).toMatchObject({ tag: messageTag('r2'), silent: false });
  });

  it('always shows something for unreadable or unknown pushes', async () => {
    for (const payload of [null, 'garbage', { t: 'unknown' }, { t: 'msg', roomId: '<script>' }]) {
      const { env, visible } = fakeEnv();
      await handlePush(env, createWorkerState(), payload);
      expect(visible()).toHaveLength(1);
      expect(visible()[0]!.options.data).toEqual({ kind: 'generic' });
    }
  });

  it('falls back to a generic notification if building the specific one fails', async () => {
    const { env, shown } = fakeEnv();
    const show = vi.fn((title: string, options: WorkerNotificationOptions) => {
      if (options.tag !== 'sparkchat') {
        return Promise.reject(new Error('boom'));
      }
      shown.push({ title, options, closed: false });
      return Promise.resolve();
    });
    await handlePush({ ...env, showNotification: show }, createWorkerState(), { t: 'msg', roomId: 'r1' });
    expect(shown).toHaveLength(1);
    expect(shown[0]!.options.tag).toBe('sparkchat');
  });
});

describe('handleNotificationClick', () => {
  function notification(data: unknown): WorkerNotification & { closed: boolean } {
    const entry = {
      tag: 't',
      data,
      closed: false,
      close: () => {
        entry.closed = true;
      },
    };
    return entry;
  }

  it('opens the app at the room when no window exists', async () => {
    const { env, opened } = fakeEnv();
    const clicked = notification({ kind: 'msg', roomId: 'r1' });
    await handleNotificationClick(env, clicked, '');
    expect(clicked.closed).toBe(true);
    expect(opened).toEqual(['https://chat.example/app/?room=r1']);
  });

  it('focuses an existing window and tells it which room to open', async () => {
    const hidden = fakeClient({ id: 'a' });
    const visible = fakeClient({ id: 'b', visibilityState: 'visible' });
    const { env, opened } = fakeEnv({ clients: [hidden, visible] });
    await handleNotificationClick(env, notification({ kind: 'msg', roomId: 'r1' }), '');
    expect(opened).toEqual([]);
    expect(visible.focusCalls).toBe(1);
    expect(visible.messages).toEqual([{ type: 'sparkchat:open-room', roomId: 'r1' }]);
    expect(hidden.messages).toEqual([]);
  });

  it('opens the room with the call id for answer without accepting anything itself', async () => {
    const { env, opened } = fakeEnv();
    await handleNotificationClick(env, notification({ kind: 'call', callId: 'c1', roomId: 'r1' }), 'answer');
    expect(opened).toEqual(['https://chat.example/app/?room=r1&call=c1']);

    const client = fakeClient();
    const withWindow = fakeEnv({ clients: [client] });
    await handleNotificationClick(withWindow.env, notification({ kind: 'call', callId: 'c1', roomId: 'r1' }), '');
    expect(client.messages).toEqual([{ type: 'sparkchat:open-room', roomId: 'r1', callId: 'c1' }]);
  });

  it('declines through open windows and never opens a new one', async () => {
    const client = fakeClient();
    const { env, opened } = fakeEnv({ clients: [client] });
    await handleNotificationClick(env, notification({ kind: 'call', callId: 'c1', roomId: 'r1' }), 'decline');
    expect(opened).toEqual([]);
    expect(client.focusCalls).toBe(0);
    expect(client.messages).toEqual([{ type: 'sparkchat:call-decline', callId: 'c1' }]);

    const empty = fakeEnv();
    await handleNotificationClick(empty.env, notification({ kind: 'call', callId: 'c1', roomId: 'r1' }), 'decline');
    expect(empty.opened).toEqual([]);
  });

  it('opens the app root for generic notifications and ignores unsafe ids', async () => {
    const { env, opened } = fakeEnv();
    await handleNotificationClick(env, notification({ kind: 'msg', roomId: 'javascript:alert(1)' }), '');
    await handleNotificationClick(env, notification(null), '');
    expect(opened).toEqual(['https://chat.example/app/', 'https://chat.example/app/']);
  });
});

describe('handleClientMessage', () => {
  it('stores the language and tracks or clears the active room per window', async () => {
    const { env, savedLanguages } = fakeEnv();
    const state = createWorkerState();
    await handleClientMessage(env, state, 'w1', { type: 'sparkchat:locale', language: 'en' });
    await handleClientMessage(env, state, 'w1', { type: 'sparkchat:active-room', roomId: 'r1' });
    expect(savedLanguages).toEqual(['en']);
    expect(state.activeRooms.get('w1')).toBe('r1');
    await handleClientMessage(env, state, 'w1', { type: 'sparkchat:active-room', roomId: null });
    expect(state.activeRooms.has('w1')).toBe(false);
  });

  it('ignores malformed messages', async () => {
    const { env, savedLanguages } = fakeEnv();
    const state = createWorkerState();
    await handleClientMessage(env, state, 'w1', { type: 'sparkchat:locale', language: 'fr' });
    await handleClientMessage(env, state, 'w1', { type: 'sparkchat:active-room', roomId: '../x' });
    await handleClientMessage(env, state, null, { type: 'sparkchat:active-room', roomId: 'r1' });
    expect(savedLanguages).toEqual([]);
    expect(state.activeRooms.size).toBe(0);
  });
});

describe('handleNavigation', () => {
  it('is network first and serves the offline page only when the network fails', async () => {
    const page = new Response('online');
    const offline = new Response('offline');
    await expect(handleNavigation(() => Promise.resolve(page), () => Promise.resolve(offline))).resolves.toBe(page);
    await expect(handleNavigation(() => Promise.reject(new TypeError('offline')), () => Promise.resolve(offline))).resolves.toBe(offline);
    await expect(handleNavigation(() => Promise.reject(new TypeError('offline')), () => Promise.resolve(undefined))).rejects.toThrow('offline');
  });
});

describe('protocol', () => {
  it('builds launch urls inside the scope', () => {
    expect(buildLaunchUrl('https://chat.example/app/')).toBe('https://chat.example/app/');
    expect(buildLaunchUrl('https://chat.example/app/', { roomId: 'r1', callId: 'c1' })).toBe('https://chat.example/app/?room=r1&call=c1');
  });

  it('validates messages in both directions', () => {
    expect(isWorkerToClientMessage({ type: 'sparkchat:open-room', roomId: 'r1' })).toBe(true);
    expect(isWorkerToClientMessage({ type: 'sparkchat:open-room', roomId: 'r1', callId: 'bad id' })).toBe(false);
    expect(isWorkerToClientMessage({ type: 'sparkchat:call-decline', callId: 'c1' })).toBe(true);
    expect(isWorkerToClientMessage({ type: 'sparkchat:push-subscription-changed' })).toBe(true);
    expect(isWorkerToClientMessage({ type: 'other' })).toBe(false);
    expect(isClientToWorkerMessage({ type: 'sparkchat:active-room', roomId: null })).toBe(true);
    expect(isClientToWorkerMessage('x')).toBe(false);
  });
});

function fakeCaches(entries: Record<string, Response>): CacheStorage {
  const cache = {
    match: (request: string) => Promise.resolve(entries[request]?.clone()),
  };
  return {
    has: (name: string) => Promise.resolve(name === NOTIFICATION_ICON_CACHE_NAME && Object.keys(entries).length > 0),
    open: (name: string) => (name === NOTIFICATION_ICON_CACHE_NAME ? Promise.resolve(cache) : Promise.reject(new Error('unknown cache'))),
  } as unknown as CacheStorage;
}

function pngResponse(bytes: number[], type = 'image/png'): Response {
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': type } });
}

describe('room photo notification icons', () => {
  it('reads the decrypted room icon from Cache Storage as a data URL', async () => {
    const storage = fakeCaches({ [notificationIconUrl('r1')]: pngResponse([137, 80, 78, 71]) });
    expect(await readCachedRoomIcon(storage, 'r1')).toBe(`data:image/png;base64,${btoa(String.fromCharCode(137, 80, 78, 71))}`);
  });

  it('returns null without a cached icon, without the caches API, for other content types or unsafe room ids', async () => {
    expect(await readCachedRoomIcon(fakeCaches({}), 'r1')).toBeNull();
    expect(await readCachedRoomIcon(fakeCaches({ [notificationIconUrl('r2')]: pngResponse([1]) }), 'r1')).toBeNull();
    expect(await readCachedRoomIcon(undefined, 'r1')).toBeNull();
    expect(await readCachedRoomIcon(null, 'r1')).toBeNull();
    expect(await readCachedRoomIcon(fakeCaches({ [notificationIconUrl('r1')]: pngResponse([1], 'text/html') }), 'r1')).toBeNull();
    expect(await readCachedRoomIcon(fakeCaches({ [notificationIconUrl('../x')]: pngResponse([1]) }), '../x')).toBeNull();
    const broken = { has: () => Promise.reject(new Error('denied')) } as unknown as CacheStorage;
    expect(await readCachedRoomIcon(broken, 'r1')).toBeNull();
  });

  it('uses the cached room icon for message, call and missed call notifications', async () => {
    const icon = 'data:image/png;base64,AAAA';
    const { env, visible } = fakeEnv();
    const lookups: string[] = [];
    env.roomIcon = (roomId) => {
      lookups.push(roomId);
      return Promise.resolve(roomId === 'r1' ? icon : null);
    };
    const state = createWorkerState();
    await handlePush(env, state, { t: 'msg', roomId: 'r1' });
    await handlePush(env, state, { t: 'msg', roomId: 'r2' });
    await handlePush(env, state, { t: 'call', callId: 'c1', roomId: 'r1', kind: 'voice' });

    expect(visible().map((entry) => entry.options.icon)).toEqual([icon, NOTIFICATION_ICON, icon]);
    await handlePush(env, state, { t: 'call-end', callId: 'c1', reason: 'missed' });
    expect(visible().find((entry) => entry.options.tag === callTag('c1'))!.options.icon).toBe(icon);
    expect(lookups).toEqual(['r1', 'r2', 'r1', 'r1']);
  });

  it('falls back to the app icon when the lookup fails or is not available', async () => {
    const failing = fakeEnv();
    failing.env.roomIcon = () => Promise.reject(new Error('boom'));
    await handlePush(failing.env, createWorkerState(), { t: 'msg', roomId: 'r1' });
    expect(failing.visible()[0]!.options.icon).toBe(NOTIFICATION_ICON);

    const plain = fakeEnv();
    await handlePush(plain.env, createWorkerState(), { t: 'msg', roomId: 'r1' });
    expect(plain.visible()[0]!.options.icon).toBe(NOTIFICATION_ICON);
  });
});
