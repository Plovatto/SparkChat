import { hasTranslation, translate } from '@lib/i18n/app-i18n';

export type ApiErrorParams = Record<string, string | number | null>;

export interface ApiErrorPayload {
  message?: string;
  code?: string;
  params?: ApiErrorParams;
}

export class ApiError extends Error {
  readonly payload: ApiErrorPayload;
  readonly fallbackKey: string;

  constructor(payload: ApiErrorPayload, fallbackKey: string) {
    super(payload.message ?? translate(fallbackKey));
    this.name = 'ApiError';
    this.payload = payload;
    this.fallbackKey = fallbackKey;
  }

  get code(): string | undefined {
    return this.payload.code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readApiErrorPayload(value: unknown): ApiErrorPayload {
  if (!isRecord(value)) {
    return {};
  }
  return {
    ...(typeof value.message === 'string' ? { message: value.message } : {}),
    ...(typeof value.code === 'string' ? { code: value.code } : {}),
    ...(isRecord(value.params) ? { params: value.params as ApiErrorParams } : {}),
  };
}

export function toApiError(value: unknown, fallbackKey: string): ApiError {
  return new ApiError(readApiErrorPayload(value), fallbackKey);
}

export function translateErrorPayload(payload: ApiErrorPayload, fallbackKey: string): string {
  if (payload.code) {
    const kind = payload.params?.kind;
    const candidates = typeof kind === 'string' ? [`errors.${payload.code}_${kind}`, `errors.${payload.code}`] : [`errors.${payload.code}`];
    const key = candidates.find(hasTranslation);
    if (key) {
      return translate(key, payload.params ?? {});
    }
  }
  return payload.message ?? translate(fallbackKey);
}

export function translateError(error: unknown, networkFallbackKey: string): string {
  if (error instanceof ApiError) {
    return translateErrorPayload(error.payload, error.fallbackKey);
  }
  return translate(networkFallbackKey);
}
