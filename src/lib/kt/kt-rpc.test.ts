import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentIdentity } from '@lib/e2ee/current-identity';
import { generateIdentity } from '@lib/e2ee/identity';
import { getActiveKtAlerts, resetKtAlerts } from './kt-alerts';
import { recordKtFailure, recordKtSuccess, resetKtHealth } from './kt-health';
import { KtOfflineError, KtServerError, KtUnavailableError, ktRequest, ktRequestWithRetry, setKtRetryDelaysForTests } from './kt-rpc';
import { FakeSocket, memoryKtStorage } from './kt-test-support';

beforeEach(async () => {
  memoryKtStorage();
  resetKtAlerts();
  resetKtHealth();
  setKtRetryDelaysForTests([0, 0]);
  const identity = await generateIdentity();
  setCurrentIdentity({ userId: 'me', publicKey: identity.publicKey, privateKey: identity.privateKey });
});

afterEach(() => {
  setKtRetryDelaysForTests(null);
  setCurrentIdentity(null);
  vi.useRealTimers();
});

describe('ktRequest', () => {
  it('rejects with an offline error when the socket is disconnected and sends nothing', async () => {
    const socket = new FakeSocket();
    socket.connected = false;
    const error = await ktRequest(socket.asSocket(), 'kt:get-head', 'kt:head', {}).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(KtOfflineError);
    expect(error).toBeInstanceOf(KtUnavailableError);
    expect(socket.sent).toEqual([]);
  });

  it('treats an error event from the server as a server error, not as being offline', async () => {
    const socket = new FakeSocket();
    socket.server = (event, _payload, target) => target.deliver('error', { event, code: 'x', message: 'x' });
    const error = await ktRequest(socket.asSocket(), 'kt:get-head', 'kt:head', {}).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(KtServerError);
    expect(error).not.toBeInstanceOf(KtOfflineError);
  });

  it('treats a timeout as a server error', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const pending = ktRequest(socket.asSocket(), 'kt:get-head', 'kt:head', {}, 1000).catch((reason: unknown) => reason);
    await vi.advanceTimersByTimeAsync(1100);
    expect(await pending).toBeInstanceOf(KtServerError);
  });

  it('ignores errors that belong to other events and replies with other request ids', async () => {
    const socket = new FakeSocket();
    socket.server = (_event, payload, target) => {
      target.deliver('error', { event: 'e2e:get-public-keys', code: 'x', message: 'x' });
      target.deliver('kt:head', { requestId: 'someone-else', head: {} });
      target.deliver('kt:head', { requestId: payload.requestId, head: { ok: true } });
    };
    expect(await ktRequest(socket.asSocket(), 'kt:get-head', 'kt:head', {})).toMatchObject({ head: { ok: true } });
  });
});

describe('ktRequestWithRetry', () => {
  it('retries server errors up to the configured delays and then gives up', async () => {
    const socket = new FakeSocket();
    socket.server = (event, _payload, target) => target.deliver('error', { event, code: 'x', message: 'x' });
    await expect(ktRequestWithRetry(socket.asSocket(), 'kt:get-head', 'kt:head', {})).rejects.toBeInstanceOf(KtServerError);
    expect(socket.count('kt:get-head')).toBe(3);
  });

  it('does not retry when the socket is offline', async () => {
    const socket = new FakeSocket();
    socket.connected = false;
    await expect(ktRequestWithRetry(socket.asSocket(), 'kt:get-head', 'kt:head', {})).rejects.toBeInstanceOf(KtOfflineError);
  });
});

describe('request health', () => {
  it('alerts only after enough consecutive failures of one event while others succeed', () => {
    recordKtSuccess('kt:get-head', 1000);
    for (let i = 0; i < 3; i += 1) {
      recordKtFailure('kt:get-proofs', 2000 + i);
    }
    expect(getActiveKtAlerts()).toEqual([]);
    recordKtSuccess('kt:get-head', 3000);
    recordKtFailure('kt:get-proofs', 3001);
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['logUnavailable']);
  });

  it('resets the run when the event answers again', () => {
    recordKtSuccess('kt:get-head', 1000);
    for (let i = 0; i < 3; i += 1) {
      recordKtFailure('kt:get-proofs', 2000);
    }
    recordKtSuccess('kt:get-proofs', 2500);
    recordKtFailure('kt:get-proofs', 3000);
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('does not count answers that came before the failures began', () => {
    recordKtSuccess('kt:get-head', 100);
    for (let i = 0; i < 6; i += 1) {
      recordKtFailure('kt:get-proofs', 2000 + i);
    }
    expect(getActiveKtAlerts()).toEqual([]);
  });
});
