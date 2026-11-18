import { afterEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ bergamot: false }));

vi.mock('./engines/bergamot-loader', () => ({
  isBergamotRuntimeSupported: () => runtime.bergamot,
}));

import { isTranslationSupportedOnDevice } from './device-support';

afterEach(() => {
  runtime.bergamot = false;
  delete (globalThis as Record<string, unknown>).Translator;
});

describe('isTranslationSupportedOnDevice', () => {
  it('is supported with the native translator API', () => {
    (globalThis as Record<string, unknown>).Translator = {};
    expect(isTranslationSupportedOnDevice()).toBe(true);
  });

  it('is supported when the fallback runtime can run', () => {
    runtime.bergamot = true;
    expect(isTranslationSupportedOnDevice()).toBe(true);
  });

  it('is not supported without either', () => {
    expect(isTranslationSupportedOnDevice()).toBe(false);
  });
});
