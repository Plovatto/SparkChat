export const NATIVE_API_TIMEOUT_MS = 3_000;

export const TIMED_OUT = Symbol('native-api-timeout');

/** Resolves with TIMED_OUT when the browser API neither settles nor rejects in time. Rejections pass through. */
export function withNativeTimeout<T>(promise: Promise<T>): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), NATIVE_API_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('native-api-failed'));
      },
    );
  });
}
