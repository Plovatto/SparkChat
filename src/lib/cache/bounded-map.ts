export class BoundedMap<K, V> {
  private readonly entries = new Map<K, V>();

  constructor(
    private readonly maxSize: number,
    private readonly onEvict?: (value: V, key: K) => void,
  ) {}

  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  has(key: K): boolean {
    return this.entries.has(key);
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.maxSize) {
      const oldest = this.entries.entries().next().value;
      if (!oldest) {
        break;
      }
      this.entries.delete(oldest[0]);
      this.onEvict?.(oldest[1], oldest[0]);
    }
  }

  delete(key: K): void {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.onEvict?.(value, key);
    }
  }

  clear(): void {
    if (this.onEvict) {
      for (const [key, value] of this.entries) {
        this.onEvict(value, key);
      }
    }
    this.entries.clear();
  }
}
