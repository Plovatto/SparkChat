import { env } from '@config/env';
import { toApiError } from './api-error';
import { buildAuthHeader, type SessionAuth } from './session-auth';

export type GifLocale = 'br' | 'us';

export interface GifItem {
  id: string;
  title: string;
  url: string;
  width: number;
  height: number;
  size: number;
}

export interface GifPage {
  items: GifItem[];
  page: number;
  hasNext: boolean;
}

export interface GifPageRequest {
  page?: number;
  locale?: GifLocale;
}

export interface GifSearchRequest extends GifPageRequest {
  q: string;
}

const LOAD_FAILED_KEY = 'gifs.loadFailed';
const MEDIA_FAILED_KEY = 'gifs.mediaFailed';

function postJson(path: string, body: unknown, auth: SessionAuth, signal?: AbortSignal): Promise<Response> {
  return fetch(`${env.apiUrl}${path}`, {
    method: 'POST',
    headers: { ...buildAuthHeader(auth), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function readGifItem(value: unknown): GifItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const { id, title, url, width, height, size } = value;
  if (typeof id !== 'string' || !id || typeof url !== 'string' || !url.startsWith('https://')) {
    return null;
  }
  if (!isPositiveNumber(width) || !isPositiveNumber(height)) {
    return null;
  }
  return {
    id,
    title: typeof title === 'string' ? title : '',
    url,
    width,
    height,
    size: isPositiveNumber(size) ? size : 0,
  };
}

function readGifPage(value: unknown, requestedPage: number): GifPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return { items: [], page: requestedPage, hasNext: false };
  }
  return {
    items: value.items.map(readGifItem).filter((item): item is GifItem => item !== null),
    page: typeof value.page === 'number' ? value.page : requestedPage,
    hasNext: value.hasNext === true,
  };
}

async function requestGifPage(
  path: string,
  body: GifPageRequest & { q?: string },
  auth: SessionAuth,
  signal?: AbortSignal,
): Promise<GifPage> {
  const response = await postJson(path, body, auth, signal);
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiError(data, LOAD_FAILED_KEY);
  }
  return readGifPage(data, body.page ?? 1);
}

export async function fetchGifStatus(auth: SessionAuth): Promise<boolean> {
  const response = await fetch(`${env.apiUrl}/api/gifs/status`, { headers: buildAuthHeader(auth) });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiError(data, LOAD_FAILED_KEY);
  }
  if (!isRecord(data) || typeof data.enabled !== 'boolean') {
    throw toApiError(null, LOAD_FAILED_KEY);
  }
  return data.enabled;
}

export function fetchTrendingGifs(auth: SessionAuth, request: GifPageRequest = {}, signal?: AbortSignal): Promise<GifPage> {
  return requestGifPage('/api/gifs/trending', request, auth, signal);
}

export function searchGifs(auth: SessionAuth, request: GifSearchRequest, signal?: AbortSignal): Promise<GifPage> {
  return requestGifPage('/api/gifs/search', request, auth, signal);
}

export async function fetchGifMedia(url: string, auth: SessionAuth, signal?: AbortSignal): Promise<Blob> {
  const response = await postJson('/api/gifs/media', { url }, auth, signal);
  if (!response.ok) {
    throw toApiError(await response.json().catch(() => null), MEDIA_FAILED_KEY);
  }
  return response.blob();
}
