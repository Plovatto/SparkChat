import type { CallKind } from '@lib/e2ee/call-crypto';

export const CALL_OWNER_LOCK = 'call-owner';
export const RINGTONE_LOCK = 'ringtone';
export const CALL_CHANNEL_NAME = 'sparkchat-calls';

export interface LockManagerLike {
  request: (name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<void>) => Promise<unknown>;
  query: () => Promise<{ held?: Array<{ name?: string }> }>;
}

export interface ChannelLike {
  postMessage: (message: unknown) => void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close: () => void;
}

export interface TabCallInfo {
  callId: string;
  peerId: string;
  kind: CallKind;
  phase: string;
}

export type TabCallMessage =
  | { type: 'state'; tabId: string; info: TabCallInfo }
  | { type: 'released'; tabId: string; callId: string };

export interface TabOwnershipDeps {
  locks: LockManagerLike | null;
  createChannel: (name: string) => ChannelLike | null;
  tabId: string;
}

export interface TabOwnership {
  readonly tabId: string;
  claimCall: () => Promise<boolean>;
  releaseCall: () => void;
  isCallHeldByOtherTab: () => Promise<boolean>;
  claimRingtone: () => Promise<boolean>;
  releaseRingtone: () => void;
  announce: (info: TabCallInfo) => void;
  announceReleased: (callId: string) => void;
  subscribe: (listener: (message: TabCallMessage) => void) => () => void;
  dispose: () => void;
}

function isTabCallMessage(value: unknown): value is TabCallMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (typeof message.tabId !== 'string') {
    return false;
  }
  if (message.type === 'released') {
    return typeof message.callId === 'string';
  }
  if (message.type === 'state') {
    const info = message.info as Record<string, unknown> | null;
    return (
      typeof info === 'object' &&
      info !== null &&
      typeof info.callId === 'string' &&
      typeof info.peerId === 'string' &&
      (info.kind === 'voice' || info.kind === 'video') &&
      typeof info.phase === 'string'
    );
  }
  return false;
}

interface Hold {
  release: () => void;
}

async function acquire(locks: LockManagerLike | null, name: string): Promise<Hold | null> {
  if (!locks) {
    return { release: () => undefined };
  }
  return new Promise<Hold | null>((resolve) => {
    void locks
      .request(name, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null);
          return Promise.resolve();
        }
        return new Promise<void>((done) => {
          resolve({ release: done });
        });
      })
      .catch(() => resolve(null));
  });
}

export function createTabOwnership(deps: TabOwnershipDeps): TabOwnership {
  const channel = deps.createChannel(CALL_CHANNEL_NAME);
  const listeners = new Set<(message: TabCallMessage) => void>();
  let callHold: Hold | null = null;
  let ringtoneHold: Hold | null = null;

  if (channel) {
    channel.onmessage = (event) => {
      if (!isTabCallMessage(event.data) || event.data.tabId === deps.tabId) {
        return;
      }
      for (const listener of Array.from(listeners)) {
        listener(event.data);
      }
    };
  }

  const post = (message: TabCallMessage) => {
    try {
      channel?.postMessage(message);
    } catch {
      return;
    }
  };

  return {
    tabId: deps.tabId,
    async claimCall() {
      if (callHold) {
        return true;
      }
      callHold = await acquire(deps.locks, CALL_OWNER_LOCK);
      return callHold !== null;
    },
    releaseCall() {
      callHold?.release();
      callHold = null;
    },
    async isCallHeldByOtherTab() {
      if (callHold || !deps.locks) {
        return false;
      }
      try {
        const snapshot = await deps.locks.query();
        return (snapshot.held ?? []).some((entry) => entry.name === CALL_OWNER_LOCK);
      } catch {
        return false;
      }
    },
    async claimRingtone() {
      if (ringtoneHold) {
        return true;
      }
      ringtoneHold = await acquire(deps.locks, RINGTONE_LOCK);
      return ringtoneHold !== null;
    },
    releaseRingtone() {
      ringtoneHold?.release();
      ringtoneHold = null;
    },
    announce(info) {
      post({ type: 'state', tabId: deps.tabId, info });
    },
    announceReleased(callId) {
      post({ type: 'released', tabId: deps.tabId, callId });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      callHold?.release();
      ringtoneHold?.release();
      callHold = null;
      ringtoneHold = null;
      listeners.clear();
      if (channel) {
        channel.onmessage = null;
        channel.close();
      }
    },
  };
}

function randomTabId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createBrowserTabOwnership(): TabOwnership {
  const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? (navigator.locks as unknown as LockManagerLike) : null;
  return createTabOwnership({
    locks,
    createChannel: (name) => (typeof BroadcastChannel === 'undefined' ? null : (new BroadcastChannel(name) as unknown as ChannelLike)),
    tabId: randomTabId(),
  });
}
