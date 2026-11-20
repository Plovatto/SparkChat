import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentIdentity } from '@lib/e2ee/current-identity';
import { generateIdentity } from '@lib/e2ee/identity';
import { getActiveKtAlerts, resetKtAlerts } from './kt-alerts';
import { KT_CONFIG_DEADLINE_MS, getKtSocketConfig, setKtBuildConfigForTests } from './kt-config';
import { emptyOwnerState, saveOwnerState } from './kt-store';
import { attachKeyTransparency as attach } from './kt-manager';
import { FakeLog, FakeSocket, logServer, memoryKtStorage, newLogKeys } from './kt-test-support';

const OWNER = 'owner-1';

const detachers: (() => void)[] = [];

function attachKeyTransparency(socket: Parameters<typeof attach>[0]): () => void {
  const detach = attach(socket);
  detachers.push(detach);
  return detach;
}

async function login(): Promise<void> {
  const identity = await generateIdentity();
  setCurrentIdentity({ userId: OWNER, publicKey: identity.publicKey, privateKey: identity.privateKey });
}

beforeEach(() => {
  memoryKtStorage();
  setKtBuildConfigForTests({ pinnedLogPublicKey: null, witnessUrl: null });
  resetKtAlerts();
});

afterEach(() => {
  for (const detach of detachers.splice(0)) {
    detach();
  }
  vi.useRealTimers();
  setCurrentIdentity(null);
  setKtBuildConfigForTests(null);
});

describe('attachKeyTransparency', () => {
  it('does nothing at all when the server never advertises the feature', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const detach = attachKeyTransparency(socket.asSocket());
    await login();
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);

    expect(socket.sent).toEqual([]);
    expect(getKtSocketConfig(socket.asSocket())).toBeNull();
    detach();
  });

  it('ignores a disabled or malformed configuration', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    attachKeyTransparency(socket.asSocket());
    await login();
    for (const payload of [{ enabled: false, logPublicKey: 'A'.repeat(43) }, { enabled: true, logPublicKey: 'short' }, { enabled: true }, null, 'x']) {
      socket.deliver('kt:config', payload);
      await vi.advanceTimersByTimeAsync(60_000);
    }
    expect(getKtSocketConfig(socket.asSocket())).toBeNull();
    expect(socket.sent).toEqual([]);
  });

  it('stores the advertised log key and runs a round after the first delay', async () => {
    vi.useFakeTimers();
    const keys = await newLogKeys();
    const log = new FakeLog(keys, [{ userId: OWNER, version: 1, identityKey: 'x', signingKey: '' }]);
    const socket = new FakeSocket();
    socket.server = logServer({ log, auditUser: OWNER });
    attachKeyTransparency(socket.asSocket());
    await login();

    socket.deliver('kt:config', { enabled: true, logPublicKey: keys.publicKey });
    expect(getKtSocketConfig(socket.asSocket())).toEqual({ logPublicKey: keys.publicKey });
    expect(socket.sent).toEqual([]);

    await vi.advanceTimersByTimeAsync(7000);
    expect(socket.count('kt:get-head')).toBe(1);
    expect(socket.count('kt:audit')).toBe(1);
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['unknownOwnKey']);

    await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
    expect(socket.count('kt:get-head')).toBe(2);
  });

  it('starts once the identity becomes available and stops on logout', async () => {
    vi.useFakeTimers();
    const keys = await newLogKeys();
    const socket = new FakeSocket();
    socket.server = logServer({ log: new FakeLog(keys, []), auditUser: OWNER });
    attachKeyTransparency(socket.asSocket());
    socket.deliver('kt:config', { enabled: true, logPublicKey: keys.publicKey });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(socket.sent).toEqual([]);

    await login();
    await vi.advanceTimersByTimeAsync(7000);
    expect(socket.count('kt:get-head')).toBe(1);

    setCurrentIdentity(null);
    const before = socket.sent.length;
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(socket.sent.length).toBe(before);
  });

  it('stops when the server stops advertising the feature', async () => {
    vi.useFakeTimers();
    const keys = await newLogKeys();
    const socket = new FakeSocket();
    socket.server = logServer({ log: new FakeLog(keys, []), auditUser: OWNER });
    attachKeyTransparency(socket.asSocket());
    await login();
    socket.deliver('kt:config', { enabled: true, logPublicKey: keys.publicKey });
    socket.deliver('kt:config', { enabled: false, logPublicKey: keys.publicKey });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(socket.sent).toEqual([]);
    expect(getKtSocketConfig(socket.asSocket())).toBeNull();
  });

  it('raises a downgrade alert when a pinned account is told the feature is disabled', async () => {
    vi.useFakeTimers();
    const keys = await newLogKeys();
    const socket = new FakeSocket();
    attachKeyTransparency(socket.asSocket());
    await login();
    saveOwnerState(OWNER, { ...emptyOwnerState(), logPublicKey: keys.publicKey });

    socket.deliver('kt:config', { enabled: false, logPublicKey: keys.publicKey });

    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['downgrade']);
    expect(getKtSocketConfig(socket.asSocket())).toBeNull();
  });

  it('does not alert when an account that never used the log is told the feature is disabled', async () => {
    const socket = new FakeSocket();
    attachKeyTransparency(socket.asSocket());
    await login();
    socket.deliver('kt:config', { enabled: false, logPublicKey: 'A'.repeat(43) });
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('raises a downgrade alert when no configuration arrives before the deadline', async () => {
    vi.useFakeTimers();
    const keys = await newLogKeys();
    const socket = new FakeSocket();
    attachKeyTransparency(socket.asSocket());
    await login();
    saveOwnerState(OWNER, { ...emptyOwnerState(), logPublicKey: keys.publicKey });

    socket.deliver('user:resumed', { user: { id: OWNER }, authMethod: 'password' });
    await vi.advanceTimersByTimeAsync(KT_CONFIG_DEADLINE_MS - 100);
    expect(getActiveKtAlerts()).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['downgrade']);
  });

  it('does not raise the downgrade alert when the configuration arrives in time', async () => {
    vi.useFakeTimers();
    const keys = await newLogKeys();
    const socket = new FakeSocket();
    socket.server = logServer({ log: new FakeLog(keys, []), auditUser: OWNER });
    attachKeyTransparency(socket.asSocket());
    await login();
    saveOwnerState(OWNER, { ...emptyOwnerState(), logPublicKey: keys.publicKey });

    socket.deliver('user:resumed', { user: { id: OWNER }, authMethod: 'password' });
    socket.deliver('kt:config', { enabled: true, logPublicKey: keys.publicKey });
    await vi.advanceTimersByTimeAsync(KT_CONFIG_DEADLINE_MS + 500);
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('removes its listeners and configuration when detached', () => {
    const socket = new FakeSocket();
    const detach = attachKeyTransparency(socket.asSocket());
    socket.deliver('kt:config', { enabled: true, logPublicKey: 'A'.repeat(43) });
    expect(socket.listeners_('kt:config')).toBe(1);
    detach();
    expect(socket.listeners_('kt:config')).toBe(0);
    expect(socket.listeners_('kt:gossip')).toBe(0);
    expect(socket.listeners_('user:resumed')).toBe(0);
    expect(getKtSocketConfig(socket.asSocket())).toBeNull();
  });
});
