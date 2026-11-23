type TimeoutHandle = ReturnType<typeof setTimeout>;
type IntervalHandle = ReturnType<typeof setInterval>;

export function cancelTimeout(handle: TimeoutHandle | null): null {
  if (handle !== null) {
    clearTimeout(handle);
  }
  return null;
}

export function cancelInterval(handle: IntervalHandle | null): null {
  if (handle !== null) {
    clearInterval(handle);
  }
  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function takeTimed<K, V extends { timer: TimeoutHandle }>(entries: Map<K, V>, key: K): V | undefined {
  const entry = entries.get(key);
  if (entry) {
    clearTimeout(entry.timer);
    entries.delete(key);
  }
  return entry;
}
