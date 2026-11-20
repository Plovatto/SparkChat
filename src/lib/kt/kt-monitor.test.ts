import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setCurrentIdentity } from '@lib/e2ee/current-identity';
import { generateIdentity, type Identity } from '@lib/e2ee/identity';
import { ownSigningKey } from '@lib/e2ee/signing';
import { getActiveKtAlerts, resetKtAlerts } from './kt-alerts';
import { setKtBuildConfigForTests, setKtSocketConfig } from './kt-config';
import { runSelfAudit } from './kt-monitor';
import { loadOwnerState, saveOwnerState } from './kt-store';
import { FakeLog, FakeSocket, logServer, memoryKtStorage, newLogKeys, type ServerBehavior } from './kt-test-support';

const OWNER = 'owner-1';

let identity: Identity;
let signing: string;

beforeEach(async () => {
  memoryKtStorage();
  setKtBuildConfigForTests({ pinnedLogPublicKey: null, witnessUrl: null });
  resetKtAlerts();
  identity = await generateIdentity();
  signing = await ownSigningKey(identity.privateKey);
  setCurrentIdentity({ userId: OWNER, publicKey: identity.publicKey, privateKey: identity.privateKey });
});

afterEach(() => {
  setCurrentIdentity(null);
  setKtBuildConfigForTests(null);
});

async function setup(leaves: { userId: string; version: number; identityKey: string; signingKey: string }[]) {
  const keys = await newLogKeys();
  const log = new FakeLog(keys, leaves);
  const socket = new FakeSocket();
  const behavior: ServerBehavior = { log, auditUser: OWNER };
  socket.server = logServer(behavior);
  setKtSocketConfig(socket.asSocket(), { logPublicKey: keys.publicKey });
  return { keys, log, socket, behavior };
}

const own = (version: number, signingKey: string) => ({ userId: OWNER, version, identityKey: identity.publicKey, signingKey });
const noise = (userId: string) => ({ userId, version: 1, identityKey: `pub-${userId}`, signingKey: '' });

describe('runSelfAudit', () => {
  it('stays quiet when every entry is one of the real keys, including the two step publication', async () => {
    const { socket } = await setup([noise('a'), own(1, ''), noise('b'), own(2, signing)]);
    expect(await runSelfAudit(socket.asSocket())).toBe('ok');
    expect(getActiveKtAlerts()).toEqual([]);
    expect(loadOwnerState(OWNER).head?.size).toBe(4);
  });

  it('does nothing without transparency or without an identity', async () => {
    const socket = new FakeSocket();
    expect(await runSelfAudit(socket.asSocket())).toBe('skipped');
    const { socket: configured } = await setup([own(1, signing)]);
    setCurrentIdentity(null);
    expect(await runSelfAudit(configured.asSocket())).toBe('skipped');
    expect(configured.sent).toEqual([]);
  });

  it('alerts with the exact warning when an unknown identity key was registered', async () => {
    const { socket } = await setup([own(1, signing), { userId: OWNER, version: 2, identityKey: 'pub-mallory', signingKey: 'sign-mallory' }]);
    expect(await runSelfAudit(socket.asSocket())).toBe('alert');
    expect(getActiveKtAlerts().map((alert) => alert.kind)).toEqual(['unknownOwnKey']);
  });

  it('alerts when only the signing key is not the real one', async () => {
    const { socket } = await setup([own(1, 'sign-mallory')]);
    expect(await runSelfAudit(socket.asSocket())).toBe('alert');
    expect(getActiveKtAlerts()[0]?.kind).toBe('unknownOwnKey');
  });

  it('does not repeat the same alert on every run', async () => {
    const { socket } = await setup([own(1, 'sign-mallory')]);
    await runSelfAudit(socket.asSocket());
    await runSelfAudit(socket.asSocket());
    await runSelfAudit(socket.asSocket());
    expect(getActiveKtAlerts()).toHaveLength(1);
  });

  it('remembers previously known keys of the account so legitimate history never alarms', async () => {
    const older = await generateIdentity();
    const { socket } = await setup([{ userId: OWNER, version: 1, identityKey: older.publicKey, signingKey: '' }, own(2, signing)]);
    expect(await runSelfAudit(socket.asSocket())).toBe('alert');
    const state = loadOwnerState(OWNER);
    saveOwnerState(OWNER, { ...state, ownKeys: [...state.ownKeys, { publicKey: older.publicKey, signingPublicKey: null }] });
    expect(await runSelfAudit(socket.asSocket())).toBe('ok');
  });

  it('alerts when an entry is missing from the version sequence', async () => {
    const { socket } = await setup([own(1, ''), own(3, signing)]);
    expect(await runSelfAudit(socket.asSocket())).toBe('alert');
    expect(getActiveKtAlerts()[0]?.kind).toBe('splitView');
  });

  it('alerts when an audit proof does not match the head', async () => {
    const { socket, log } = await setup([noise('a'), own(1, signing)]);
    const original = socket.server;
    socket.server = (event, payload, target) => {
      if (event !== 'kt:audit') {
        original(event, payload, target);
        return;
      }
      target.deliver('kt:audit', {
        requestId: payload.requestId,
        head: log.head(),
        entries: [{ position: 1, version: 1, publicKey: identity.publicKey, signingPublicKey: signing, proof: log.inclusion(0) }],
        truncated: false,
      });
    };
    expect(await runSelfAudit(socket.asSocket())).toBe('alert');
    expect(getActiveKtAlerts()[0]?.kind).toBe('splitView');
  });

  it('follows truncated pages until the history is complete', async () => {
    const leaves = [own(1, ''), { userId: OWNER, version: 2, identityKey: identity.publicKey, signingKey: signing }];
    const { socket, behavior } = await setup(leaves);
    behavior.pageSize = 1;
    expect(await runSelfAudit(socket.asSocket())).toBe('ok');
    expect(socket.count('kt:audit')).toBe(2);
    expect(socket.sent.filter((entry) => entry.event === 'kt:audit').map((entry) => entry.payload.fromVersion)).toEqual([1, 2]);
  });

  it('catches an unknown key hidden on a later page', async () => {
    const { socket, behavior } = await setup([own(1, signing), { userId: OWNER, version: 2, identityKey: 'pub-mallory', signingKey: '' }]);
    behavior.pageSize = 1;
    expect(await runSelfAudit(socket.asSocket())).toBe('alert');
    expect(getActiveKtAlerts()[0]?.kind).toBe('unknownOwnKey');
  });

  it('is silent and returns unreachable when the log cannot be read', async () => {
    const { socket, behavior } = await setup([own(1, 'sign-mallory')]);
    behavior.failEvents = new Set(['kt:audit']);
    expect(await runSelfAudit(socket.asSocket())).toBe('unreachable');
    expect(getActiveKtAlerts()).toEqual([]);
  });

  it('refuses a head signed by another log key', async () => {
    const { socket, log, behavior } = await setup([own(1, signing)]);
    await runSelfAudit(socket.asSocket());
    const rogue = log.clone(await newLogKeys());
    behavior.headOverride = () => rogue.head();
    expect(await runSelfAudit(socket.asSocket())).toBe('alert');
    expect(getActiveKtAlerts()[0]?.kind).toBe('logKeyChanged');
  });

  it('detects a rolled back log during the audit', async () => {
    const { socket, log, behavior } = await setup([noise('a'), noise('b'), own(1, signing)]);
    await runSelfAudit(socket.asSocket());
    behavior.headOverride = () => log.head(2);
    expect(await runSelfAudit(socket.asSocket())).toBe('alert');
    expect(getActiveKtAlerts()[0]?.kind).toBe('splitView');
  });
});
