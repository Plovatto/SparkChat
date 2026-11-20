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

export function setKtSocketConfig(socket: AppSocket, config: KtSocketConfig | null): void {
  if (config) {
    socketConfigs.set(socket, config);
  } else {
    socketConfigs.delete(socket);
  }
}

export function getKtSocketConfig(socket: AppSocket): KtSocketConfig | null {
  return socketConfigs.get(socket) ?? null;
}
