import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as PipModule from '../lib/picture-in-picture';
import { usePip } from './use-pip';

vi.mock('../lib/picture-in-picture', async (importOriginal) => {
  const actual = await importOriginal<typeof PipModule>();
  return { ...actual, copyStyles: () => undefined, registerAutoPip: () => () => undefined };
});

afterEach(() => {
  delete (window as Window & { documentPictureInPicture?: unknown }).documentPictureInPicture;
});

describe('usePip', () => {
  it('closes a picture in picture window that opens after the call already ended', async () => {
    let resolve: (win: Window) => void = () => undefined;
    const close = vi.fn();
    const opened = { close, addEventListener: vi.fn(), document: {} } as unknown as Window;
    (window as Window & { documentPictureInPicture?: unknown }).documentPictureInPicture = {
      window: null,
      requestWindow: () => new Promise<Window>((done) => (resolve = done)),
    };
    const { result, rerender } = renderHook((props: { active: boolean }) => usePip({ mode: 'document', videoFor: () => null, active: props.active, auto: false }), {
      initialProps: { active: true },
    });

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.openPip();
    });
    rerender({ active: false });
    await act(async () => {
      resolve(opened);
      await pending;
    });

    expect(close).toHaveBeenCalled();
    expect(result.current.window).toBeNull();
  });
});
