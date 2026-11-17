import { describe, expect, it, vi } from 'vitest';

const fallback = vi.hoisted(() => ({
  engine: {
    id: 'bergamot',
    support: () => Promise.resolve('downloadable'),
    prepare: () => Promise.resolve(),
    translate: (text: string) => Promise.resolve(text),
    onProgress: () => () => undefined,
  },
  loads: 0,
}));

vi.mock('./engines/native-engine', () => ({ nativeEngine: { id: 'native' } }));

vi.mock('./engines/bergamot-loader', () => ({
  loadBergamotEngine: () => {
    fallback.loads += 1;
    return Promise.resolve(fallback.engine);
  },
}));

// Imported directly, not through the barrel: the router registers the Bergamot loader itself.
import { resolveEngine } from './router';

describe('router default fallback', () => {
  it('uses the Bergamot loader without anyone importing the barrel', async () => {
    expect(await resolveEngine('en', 'pt')).toEqual({ engine: fallback.engine, support: 'downloadable' });
    expect(fallback.loads).toBe(1);
  });
});
