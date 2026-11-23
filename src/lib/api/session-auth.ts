import { env } from '@config/env';
import {
  adjustClockOffset,
  ensureDeviceKey,
  proofHeaders,
  sha256Base64Url,
  signForSession,
  signWithRecord,
  UNSIGNED_PAYLOAD,
  type DeviceKeyRecord,
} from './device-key';

export interface SessionAuth {
  userId: string;
  sessionToken: string;
}

export const DEVICE_KEY_ENDPOINT = '/api/users/session/device-key';
const DEVICE_KEY_TIMEOUT_MS = 8000;

export function buildAuthHeader(auth: SessionAuth): HeadersInit {
  return { Authorization: `Bearer ${auth.userId}:${auth.sessionToken}` };
}

function signedPath(url: string): string {
  const parsed = new URL(url, (globalThis.location as Location | undefined)?.href ?? 'http://localhost');
  return `${parsed.pathname}${parsed.search}`;
}

async function bodyHash(body: BodyInit | null | undefined): Promise<string> {
  if (typeof body === 'string') {
    return sha256Base64Url(body);
  }
  if (body === undefined || body === null) {
    return sha256Base64Url('');
  }
  return UNSIGNED_PAYLOAD;
}

async function readStaleServerTime(response: Response): Promise<number | null> {
  if (response.status !== 401) {
    return null;
  }
  const data = (await response
    .clone()
    .json()
    .catch(() => null)) as { code?: unknown; params?: { serverTime?: unknown } } | null;
  const serverTime = data?.params?.serverTime;
  return data?.code === 'auth.signatureStale' && typeof serverTime === 'number' ? serverTime : null;
}

async function sendSigned(auth: SessionAuth, url: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const proof = await signForSession(auth.userId, method, signedPath(url), await bodyHash(init.body));
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${auth.userId}:${auth.sessionToken}`);
  if (proof) {
    for (const [name, value] of Object.entries(proofHeaders(proof))) {
      headers.set(name, value);
    }
  }
  return fetch(url, { ...init, headers });
}

export async function authorizedFetch(auth: SessionAuth, path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${env.apiUrl}${path}`;
  const response = await sendSigned(auth, url, init);
  const serverTime = await readStaleServerTime(response);
  if (serverTime === null) {
    return response;
  }
  adjustClockOffset(serverTime);
  return sendSigned(auth, url, init);
}

async function postDeviceKey(auth: SessionAuth, record: DeviceKeyRecord): Promise<Response> {
  const url = `${env.apiUrl}${DEVICE_KEY_ENDPOINT}`;
  const body = JSON.stringify({ publicKey: record.publicKey });
  const proof = await signWithRecord(record, auth.userId, 'POST', signedPath(url), await sha256Base64Url(body));
  return fetch(url, {
    method: 'POST',
    headers: { ...buildAuthHeader(auth), 'Content-Type': 'application/json', ...proofHeaders(proof) },
    body,
    credentials: 'omit',
    signal: AbortSignal.timeout(DEVICE_KEY_TIMEOUT_MS),
  });
}

export async function registerDeviceKey(auth: SessionAuth, record: DeviceKeyRecord): Promise<'bound' | 'conflict' | 'unsupported'> {
  let response = await postDeviceKey(auth, record);
  const serverTime = await readStaleServerTime(response);
  if (serverTime !== null) {
    adjustClockOffset(serverTime);
    response = await postDeviceKey(auth, record);
  }
  if (response.ok) {
    return 'bound';
  }
  if (response.status === 409) {
    return 'conflict';
  }
  return 'unsupported';
}

export function ensureSessionDeviceKey(auth: SessionAuth): Promise<DeviceKeyRecord | null> {
  return ensureDeviceKey(auth.userId, (record) => registerDeviceKey(auth, record).catch(() => 'unsupported' as const));
}
