import { describe, expect, it } from 'vitest';
import { deriveMessageIdFromCard } from './card-message-id';

describe('deriveMessageIdFromCard', () => {
  it('is deterministic per card and shaped like a v4 uuid', async () => {
    const first = await deriveMessageIdFromCard('card-1');
    expect(await deriveMessageIdFromCard('card-1')).toBe(first);
    expect(await deriveMessageIdFromCard('card-2')).not.toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
