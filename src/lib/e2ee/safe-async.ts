export function safeAsync<Args extends unknown[]>(
  label: string,
  fn: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await fn(...args);
    } catch (error) {
      console.error(`[e2e] ${label} failed`, error);
    }
  };
}
