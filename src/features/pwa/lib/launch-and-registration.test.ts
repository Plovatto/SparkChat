import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePushStatus, type PushStatusInput } from '../hooks/usePushNotifications';
import { readLaunchIntent, stripLaunchParams } from './launch-params';
import {
  dismissUpdate,
  isUpdateAvailable,
  onWorkerMessage,
  postToWorker,
  registerServiceWorker,
  resetServiceWorkerStateForTests,
  SW_UPDATE_CHECK_INTERVAL_MS,
} from './sw-registration';

describe('launch params', () => {
  it('reads the room, the new chat shortcut and the install flag', () => {
    expect(readLaunchIntent('?room=r1')).toEqual({ roomId: 'r1', newChat: false, install: false, answerCallId: null, reminder: null });
    expect(readLaunchIntent('?action=new-chat')).toEqual({ roomId: null, newChat: true, install: false, answerCallId: null, reminder: null });
    expect(readLaunchIntent('?install=1')).toEqual({ roomId: null, newChat: false, install: true, answerCallId: null, reminder: null });
    expect(readLaunchIntent('?room=r1&call=c1')).toEqual({ roomId: 'r1', newChat: false, install: false, answerCallId: 'c1', reminder: null });
    expect(readLaunchIntent('?room=r1&call=../c1')).toEqual({ roomId: 'r1', newChat: false, install: false, answerCallId: null, reminder: null });
    expect(readLaunchIntent('?room=../../x&install=yes')).toEqual({ roomId: null, newChat: false, install: false, answerCallId: null, reminder: null });
    expect(readLaunchIntent('?room=r1&reminder=rem1&reminderAction=snooze10').reminder).toEqual({ roomId: 'r1', reminderId: 'rem1', action: 'snooze10' });
    expect(readLaunchIntent('?room=r1&reminder=rem1&reminderAction=snooze60').reminder).toBeNull();
    expect(readLaunchIntent('?reminder=rem1&reminderAction=done').reminder).toBeNull();
  });

  it('strips only its own params and keeps deep links and the invite fragment', () => {
    expect(stripLaunchParams('https://chat.example/app/')).toBeNull();
    expect(stripLaunchParams('https://chat.example/app/?startChat=bob')).toBeNull();
    expect(stripLaunchParams('https://chat.example/app/?room=r1&call=c1&startChat=bob#invite=abc')).toBe('/app/?startChat=bob#invite=abc');
    expect(stripLaunchParams('https://chat.example/app/?install=1')).toBe('/app/');
    expect(stripLaunchParams('https://chat.example/app/?room=r1&reminder=rem1&reminderAction=done')).toBe('/app/');
  });
});

class FakeContainer extends EventTarget {
  controller: object | null;
  readonly update = vi.fn(() => Promise.resolve());
  readonly register = vi.fn((_url: string, _options: RegistrationOptions) => Promise.resolve({ update: this.update } as unknown as ServiceWorkerRegistration));

  constructor(controller: object | null) {
    super();
    this.controller = controller;
  }
}

afterEach(() => {
  resetServiceWorkerStateForTests();
});

describe('registerServiceWorker', () => {
  it('registers /app/sw.js with the /app/ scope and checks for updates periodically', async () => {
    const container = new FakeContainer(null);
    const intervals: number[] = [];
    let tick: (() => void) | null = null;
    await registerServiceWorker({
      container: container as unknown as ServiceWorkerContainer,
      setInterval: (callback, ms) => {
        intervals.push(ms);
        tick = callback;
      },
    });
    expect(container.register).toHaveBeenCalledWith('/app/sw.js', { scope: '/app/', updateViaCache: 'none' });
    expect(intervals).toEqual([SW_UPDATE_CHECK_INTERVAL_MS]);
    tick!();
    expect(container.update).toHaveBeenCalledTimes(1);
  });

  it('offers a reload only when a new worker replaces an existing one', async () => {
    const firstVisit = new FakeContainer(null);
    await registerServiceWorker({ container: firstVisit as unknown as ServiceWorkerContainer, setInterval: () => 0 });
    firstVisit.dispatchEvent(new Event('controllerchange'));
    expect(isUpdateAvailable()).toBe(false);

    const returning = new FakeContainer({});
    await registerServiceWorker({ container: returning as unknown as ServiceWorkerContainer, setInterval: () => 0 });
    returning.dispatchEvent(new Event('controllerchange'));
    expect(isUpdateAvailable()).toBe(true);
    dismissUpdate();
    expect(isUpdateAvailable()).toBe(false);
  });

  it('forwards only valid worker messages to listeners', async () => {
    const container = new FakeContainer(null);
    await registerServiceWorker({ container: container as unknown as ServiceWorkerContainer, setInterval: () => 0 });
    const received: unknown[] = [];
    onWorkerMessage((message) => received.push(message));
    const send = (data: unknown) => container.dispatchEvent(Object.assign(new Event('message'), { data }));
    send({ type: 'sparkchat:open-room', roomId: 'r1' });
    send({ type: 'sparkchat:open-room', roomId: 'bad id' });
    send('noise');
    expect(received).toEqual([{ type: 'sparkchat:open-room', roomId: 'r1' }]);
  });

  it('survives a failed registration', async () => {
    const container = new FakeContainer(null);
    container.register.mockImplementationOnce(() => Promise.reject(new Error('blocked')));
    await expect(registerServiceWorker({ container: container as unknown as ServiceWorkerContainer, setInterval: () => 0 })).resolves.toBeNull();
  });
});

describe('postToWorker', () => {
  it('posts to the controlling worker when the page is controlled', () => {
    const controller = { postMessage: vi.fn() };
    postToWorker({ type: 'sparkchat:locale', language: 'en' }, { controller, ready: new Promise(() => undefined) } as unknown as ServiceWorkerContainer);
    expect(controller.postMessage).toHaveBeenCalledWith({ type: 'sparkchat:locale', language: 'en' });
  });

  it('reaches the active worker on the first visit before it controls the page', async () => {
    const active = { postMessage: vi.fn() };
    const ready = Promise.resolve({ active });
    postToWorker({ type: 'sparkchat:locale', language: 'pt' }, { controller: null, ready } as unknown as ServiceWorkerContainer);
    await ready;
    await Promise.resolve();
    expect(active.postMessage).toHaveBeenCalledWith({ type: 'sparkchat:locale', language: 'pt' });
  });
});

describe('resolvePushStatus', () => {
  const READY: PushStatusInput = {
    isIos: false,
    isStandalone: false,
    supported: true,
    permission: 'default',
    config: { enabled: true, publicKey: 'k' },
    subscribed: false,
  };

  it('maps the environment to the switch state', () => {
    expect(resolvePushStatus(READY)).toBe('off');
    expect(resolvePushStatus({ ...READY, permission: 'granted', subscribed: true })).toBe('on');
    expect(resolvePushStatus({ ...READY, permission: 'default', subscribed: true })).toBe('off');
    expect(resolvePushStatus({ ...READY, permission: 'denied' })).toBe('blocked');
    expect(resolvePushStatus({ ...READY, config: null })).toBe('checking');
    expect(resolvePushStatus({ ...READY, config: { enabled: false, publicKey: null } })).toBe('server-disabled');
    expect(resolvePushStatus({ ...READY, supported: false })).toBe('unsupported');
    expect(resolvePushStatus({ ...READY, isIos: true, supported: false })).toBe('ios-needs-install');
    expect(resolvePushStatus({ ...READY, isIos: true, isStandalone: true })).toBe('off');
  });
});
