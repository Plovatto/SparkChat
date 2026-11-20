import { env } from '@config/env';
import type { AppSocket } from '@lib/socket';

export interface KtBuildConfig {
  pinnedLogPublicKey: string | null;
  witnessUrl: string | null;
}

export interface KtSocketConfig {
  logPublicKey: string;
}

const LOG_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function normalizeWitnessUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost') ? url.toString() : null;
  } catch {
    return null;
  }
}

function readBuildConfig(): KtBuildConfig {
  const pinned = env.ktLogPublicKey?.trim();
  return {
    pinnedLogPublicKey: pinned && LOG_KEY_PATTERN.test(pinned) ? pinned : null,
    witnessUrl: normalizeWitnessUrl(env.ktWitnessUrl),
  };
}

let buildConfig: KtBuildConfig | null = null;
const socketConfigs = new WeakMap<AppSocket, KtSocketConfig>();

export function getKtBuildConfig(): KtBuildConfig {
  buildConfig ??= readBuildConfig();
  return buildConfig;
}

export function setKtBuildConfigForTests(next: KtBuildConfig | null): void {
  buildConfig = next;
}

export function isValidLogPublicKey(value: unknown): value is string {
  return typeof value === 'string' && LOG_KEY_PATTERN.test(value);
}

export const KT_CONFIG_DEADLINE_MS = 5000;

const authenticatedAt = new WeakMap<AppSocket, number>();
const disabledSockets = new WeakSet<AppSocket>();
const configWaiters = new WeakMap<AppSocket, ((config: KtSocketConfig | null) => void)[]>();

function flushWaiters(socket: AppSocket, config: KtSocketConfig | null): void {
  const waiters = configWaiters.get(socket) ?? [];
  configWaiters.delete(socket);
  for (const waiter of waiters) {
    waiter(config);
  }
}

export function setKtSocketConfig(socket: AppSocket, config: KtSocketConfig | null): void {
  if (config) {
    socketConfigs.set(socket, config);
    disabledSockets.delete(socket);
    flushWaiters(socket, config);
  } else {
    socketConfigs.delete(socket);
  }
}

export function markKtDisabled(socket: AppSocket): void {
  socketConfigs.delete(socket);
  disabledSockets.add(socket);
  flushWaiters(socket, null);
}

export function isKtDisabled(socket: AppSocket): boolean {
  return disabledSockets.has(socket);
}

export function markKtAuthenticated(socket: AppSocket, now: number = Date.now()): void {
  authenticatedAt.set(socket, now);
  disabledSockets.delete(socket);
}

export function ktAuthenticatedAt(socket: AppSocket): number | null {
  return authenticatedAt.get(socket) ?? null;
}

export function awaitKtConfig(socket: AppSocket, now: number = Date.now()): Promise<KtSocketConfig | null> {
  const existing = socketConfigs.get(socket);
  if (existing) {
    return Promise.resolve(existing);
  }
  const since = authenticatedAt.get(socket);
  if (disabledSockets.has(socket) || since === undefined) {
    return Promise.resolve(null);
  }
  const remaining = since + KT_CONFIG_DEADLINE_MS - now;
  if (remaining <= 0) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const waiters = configWaiters.get(socket) ?? [];
      configWaiters.set(socket, waiters.filter((waiter) => waiter !== done));
      resolve(null);
    }, remaining);
    const done = (config: KtSocketConfig | null) => {
      clearTimeout(timer);
      resolve(config);
    };
    configWaiters.set(socket, [...(configWaiters.get(socket) ?? []), done]);
  });
}

export function getKtSocketConfig(socket: AppSocket): KtSocketConfig | null {
  return socketConfigs.get(socket) ?? null;
}
