import { getSodium } from '@lib/e2ee/sodium';
import type { AppSocket } from '@lib/socket';
import { setKtStorage, type KtStorage } from './kt-store';
import { headSigningBytes, leafHash, type SignedTreeHead, type Sodium } from './kt-crypto';

export interface FakeLogKeys {
  sodium: Sodium;
  publicKey: string;
  privateKey: Uint8Array;
}

export async function newLogKeys(): Promise<FakeLogKeys> {
  const sodium = await getSodium();
  const pair = sodium.crypto_sign_keypair();
  return { sodium, publicKey: sodium.to_base64(pair.publicKey), privateKey: pair.privateKey };
}

export interface FakeLeaf {
  userId: string;
  version: number;
  identityKey: string;
  signingKey: string;
}

function largestPowerOfTwoBelow(n: number): number {
  let k = 1;
  while (k * 2 < n) {
    k *= 2;
  }
  return k;
}

export class FakeLog {
  readonly leaves: FakeLeaf[] = [];
  now = 1_700_000_000_000;

  constructor(
    private readonly keys: FakeLogKeys,
    leaves: FakeLeaf[] = [],
  ) {
    this.leaves.push(...leaves);
  }

  get logPublicKey(): string {
    return this.keys.publicKey;
  }

  clone(keys: FakeLogKeys = this.keys): FakeLog {
    return new FakeLog(keys, this.leaves.map((leaf) => ({ ...leaf })));
  }

  append(leaf: FakeLeaf): number {
    this.leaves.push(leaf);
    return this.leaves.length - 1;
  }

  private leafHashAt(index: number): Uint8Array {
    const leaf = this.leaves[index] as FakeLeaf;
    return leafHash(this.keys.sodium, leaf) as Uint8Array;
  }

  private hash(prefix: number, ...parts: Uint8Array[]): Uint8Array {
    const total = 1 + parts.reduce((sum, part) => sum + part.length, 0);
    const joined = new Uint8Array(total);
    joined[0] = prefix;
    let offset = 1;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.length;
    }
    return this.keys.sodium.crypto_hash_sha256(joined);
  }

  private mth(start: number, end: number): Uint8Array {
    const length = end - start;
    if (length === 0) {
      return this.keys.sodium.crypto_hash_sha256(new Uint8Array(0));
    }
    if (length === 1) {
      return this.leafHashAt(start);
    }
    const k = largestPowerOfTwoBelow(length);
    return this.hash(1, this.mth(start, start + k), this.mth(start + k, end));
  }

  root(size: number = this.leaves.length): Uint8Array {
    return this.mth(0, size);
  }

  head(size: number = this.leaves.length, issuedAt: number = this.now): SignedTreeHead {
    const root = this.root(size);
    const signature = this.keys.sodium.crypto_sign_detached(headSigningBytes(size, root, issuedAt), this.keys.privateKey);
    return { size, root: this.keys.sodium.to_base64(root), issuedAt, signature: this.keys.sodium.to_base64(signature) };
  }

  private path(index: number, start: number, end: number): Uint8Array[] {
    const length = end - start;
    if (length <= 1) {
      return [];
    }
    const k = largestPowerOfTwoBelow(length);
    if (index < start + k) {
      return [...this.path(index, start, start + k), this.mth(start + k, end)];
    }
    return [...this.path(index, start + k, end), this.mth(start, start + k)];
  }

  inclusion(index: number, size: number = this.leaves.length): string[] {
    return this.path(index, 0, size).map((hash) => this.keys.sodium.to_base64(hash));
  }

  private subproof(m: number, start: number, end: number, complete: boolean): Uint8Array[] {
    const n = end - start;
    if (m === n) {
      return complete ? [] : [this.mth(start, end)];
    }
    const k = largestPowerOfTwoBelow(n);
    if (m <= k) {
      return [...this.subproof(m, start, start + k, complete), this.mth(start + k, end)];
    }
    return [...this.subproof(m - k, start + k, end, false), this.mth(start, start + k)];
  }

  consistency(first: number, second: number): string[] {
    return this.subproof(first, 0, second, true).map((hash) => this.keys.sodium.to_base64(hash));
  }

  findLeaf(userId: string, identityKey: string, signingKey: string): { index: number; leaf: FakeLeaf } | null {
    for (let index = this.leaves.length - 1; index >= 0; index -= 1) {
      const leaf = this.leaves[index] as FakeLeaf;
      if (leaf.userId === userId && leaf.identityKey === identityKey && leaf.signingKey === signingKey) {
        return { index, leaf };
      }
    }
    return null;
  }
}

type Listener = (payload: unknown) => void;
export type FakeServer = (event: string, payload: Record<string, unknown>, socket: FakeSocket) => void;

export class FakeSocket {
  connected = true;
  readonly sent: { event: string; payload: Record<string, unknown> }[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();
  server: FakeServer = () => undefined;

  on(event: string, handler: Listener): this {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(handler);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, handler: Listener): this {
    this.listeners.get(event)?.delete(handler);
    return this;
  }

  listeners_(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  emit(event: string, payload: Record<string, unknown> = {}): this {
    this.sent.push({ event, payload });
    queueMicrotask(() => this.server(event, payload, this));
    return this;
  }

  deliver(event: string, payload: unknown): void {
    for (const listener of Array.from(this.listeners.get(event) ?? [])) {
      listener(payload);
    }
  }

  count(event: string): number {
    return this.sent.filter((entry) => entry.event === event).length;
  }

  asSocket(): AppSocket {
    return this as unknown as AppSocket;
  }
}

export interface ServerBehavior {
  log: FakeLog;
  tamperProofs?: (proofs: Record<string, unknown>[]) => Record<string, unknown>[];
  headOverride?: () => SignedTreeHead;
  failEvents?: Set<string>;
  consistencyOverride?: (first: number, second: number) => string[] | null;
  auditUser?: string;
  pageSize?: number;
}

export function logServer(behavior: ServerBehavior): FakeServer {
  return (event, payload, socket) => {
    const requestId = payload.requestId as string | undefined;
    const fail = () => socket.deliver('error', { event, code: 'internal.unexpected', message: 'x' });
    if (behavior.failEvents?.has(event)) {
      fail();
      return;
    }
    const { log } = behavior;
    const head = () => behavior.headOverride?.() ?? log.head();
    switch (event) {
      case 'kt:get-head':
        socket.deliver('kt:head', { requestId, head: head() });
        return;
      case 'kt:get-proofs': {
        const items = payload.items as { userId: string; publicKey: string; signingPublicKey?: string }[];
        const currentHead = head();
        let proofs: Record<string, unknown>[] = items.map((item) => {
          const found = log.findLeaf(item.userId, item.publicKey, item.signingPublicKey ?? '');
          if (!found || found.index >= currentHead.size) {
            return { userId: item.userId, found: false };
          }
          return {
            userId: item.userId,
            found: true,
            position: found.index,
            version: found.leaf.version,
            proof: log.inclusion(found.index, currentHead.size),
          };
        });
        if (behavior.tamperProofs) {
          proofs = behavior.tamperProofs(proofs);
        }
        socket.deliver('kt:proofs', { requestId, head: currentHead, proofs });
        return;
      }
      case 'kt:get-consistency': {
        const first = payload.first as number;
        const second = payload.second as number;
        const override = behavior.consistencyOverride?.(first, second);
        if (override === null || first < 1 || first > second) {
          fail();
          return;
        }
        if (second > log.leaves.length) {
          socket.deliver('kt:consistency', { requestId, first, second, proof: null });
          return;
        }
        socket.deliver('kt:consistency', { requestId, first, second, proof: override ?? log.consistency(first, second) });
        return;
      }
      case 'kt:audit': {
        const fromVersion = (payload.fromVersion as number | undefined) ?? 1;
        const currentHead = head();
        const mine = log.leaves
          .map((leaf, index) => ({ leaf, index }))
          .filter(({ leaf, index }) => leaf.userId === behavior.auditUser && leaf.version >= fromVersion && index < currentHead.size);
        const pageSize = behavior.pageSize ?? 50;
        const page = mine.slice(0, pageSize);
        socket.deliver('kt:audit', {
          requestId,
          head: currentHead,
          entries: page.map(({ leaf, index }) => ({
            position: index,
            version: leaf.version,
            publicKey: leaf.identityKey,
            signingPublicKey: leaf.signingKey === '' ? null : leaf.signingKey,
            proof: log.inclusion(index, currentHead.size),
          })),
          truncated: mine.length > pageSize,
        });
        return;
      }
      default:
    }
  };
}

export function memoryKtStorage(): KtStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  const storage = {
    data,
    read: <T>(key: string): T | null => (data.has(key) ? (JSON.parse(JSON.stringify(data.get(key))) as T) : null),
    write: <T>(key: string, value: T): void => {
      data.set(key, JSON.parse(JSON.stringify(value)));
    },
  };
  setKtStorage(storage);
  return storage;
}
