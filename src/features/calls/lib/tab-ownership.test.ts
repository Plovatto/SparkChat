import { describe, expect, it } from 'vitest';
import {
  CALL_CHANNEL_NAME,
  CALL_OWNER_LOCK,
  RINGTONE_LOCK,
  createTabOwnership,
  type ChannelLike,
  type LockManagerLike,
  type TabCallMessage,
  type TabOwnership,
} from './tab-ownership';

function createLockManager(): LockManagerLike {
  const held = new Set<string>();
  return {
    request: async (name, options, callback) => {
      if (held.has(name)) {
        if (options.ifAvailable) {
          await callback(null);
        }
        return;
      }
      held.add(name);
      try {
        await callback({ name });
      } finally {
        held.delete(name);
      }
    },
    query: () => Promise.resolve({ held: Array.from(held, (name) => ({ name })) }),
  };
}

function createBus() {
  const channels = new Set<ChannelLike>();
  const create = (name: string): ChannelLike => {
    const channel: ChannelLike = {
      onmessage: null,
      postMessage: (message) => {
        if (name !== CALL_CHANNEL_NAME) {
          return;
        }
        for (const other of channels) {
          if (other !== channel) {
            other.onmessage?.({ data: message });
          }
        }
      },
      close: () => {
        channels.delete(channel);
      },
    };
    channels.add(channel);
    return channel;
  };
  return create;
}

function tabs(count: number): TabOwnership[] {
  const locks = createLockManager();
  const create = createBus();
  return Array.from({ length: count }, (_, index) => createTabOwnership({ locks, createChannel: create, tabId: `tab-${index}` }));
}

describe('call owner lock', () => {
  it('lets exactly one tab own the call', async () => {
    const [first, second] = tabs(2) as [TabOwnership, TabOwnership];

    expect(await first.claimCall()).toBe(true);
    expect(await second.claimCall()).toBe(false);
    expect(await first.claimCall()).toBe(true);
  });

  it('lets another tab claim after the owner releases', async () => {
    const [first, second] = tabs(2) as [TabOwnership, TabOwnership];
    await first.claimCall();

    first.releaseCall();
    await Promise.resolve();
    await Promise.resolve();

    expect(await second.claimCall()).toBe(true);
  });

  it('lets other tabs see that a call is held elsewhere, but not the owner itself', async () => {
    const [first, second] = tabs(2) as [TabOwnership, TabOwnership];
    expect(await second.isCallHeldByOtherTab()).toBe(false);

    await first.claimCall();

    expect(await second.isCallHeldByOtherTab()).toBe(true);
    expect(await first.isCallHeldByOtherTab()).toBe(false);
  });

  it('releases the lock when the tab is disposed', async () => {
    const [first, second] = tabs(2) as [TabOwnership, TabOwnership];
    await first.claimCall();

    first.dispose();
    await Promise.resolve();
    await Promise.resolve();

    expect(await second.isCallHeldByOtherTab()).toBe(false);
  });

  it('assumes ownership when the Web Locks API is unavailable', async () => {
    const tab = createTabOwnership({ locks: null, createChannel: () => null, tabId: 'solo' });

    expect(await tab.claimCall()).toBe(true);
    expect(await tab.isCallHeldByOtherTab()).toBe(false);
  });
});

describe('ringtone lock', () => {
  it('lets only one tab play the ringtone and uses a separate lock', async () => {
    const [first, second] = tabs(2) as [TabOwnership, TabOwnership];

    expect(await first.claimRingtone()).toBe(true);
    expect(await second.claimRingtone()).toBe(false);
    expect(await second.claimCall()).toBe(true);
    first.releaseRingtone();
    await Promise.resolve();
    await Promise.resolve();
    expect(await second.claimRingtone()).toBe(true);
    expect(CALL_OWNER_LOCK).not.toBe(RINGTONE_LOCK);
  });
});

describe('broadcast', () => {
  it('delivers state and release messages to other tabs only', () => {
    const [first, second] = tabs(2) as [TabOwnership, TabOwnership];
    const secondSeen: TabCallMessage[] = [];
    const firstSeen: TabCallMessage[] = [];
    second.subscribe((message) => secondSeen.push(message));
    first.subscribe((message) => firstSeen.push(message));

    first.announce({ callId: 'c1', peerId: 'p', kind: 'voice', phase: 'active' });
    first.announceReleased('c1');

    expect(secondSeen).toEqual([
      { type: 'state', tabId: 'tab-0', info: { callId: 'c1', peerId: 'p', kind: 'voice', phase: 'active' } },
      { type: 'released', tabId: 'tab-0', callId: 'c1' },
    ]);
    expect(firstSeen).toEqual([]);
  });

  it('ignores malformed messages and stops after unsubscribe', () => {
    const create = createBus();
    const raw = create(CALL_CHANNEL_NAME);
    const tab = createTabOwnership({ locks: null, createChannel: create, tabId: 'me' });
    const seen: TabCallMessage[] = [];
    const unsubscribe = tab.subscribe((message) => seen.push(message));

    for (const data of [null, 'x', { type: 'state' }, { type: 'state', tabId: 'o', info: { callId: 1 } }, { type: 'released', tabId: 'o' }, { type: 'other', tabId: 'o' }]) {
      raw.postMessage(data);
    }
    expect(seen).toEqual([]);

    raw.postMessage({ type: 'released', tabId: 'o', callId: 'c' });
    expect(seen).toHaveLength(1);
    unsubscribe();
    raw.postMessage({ type: 'released', tabId: 'o', callId: 'c' });
    expect(seen).toHaveLength(1);
  });
});
