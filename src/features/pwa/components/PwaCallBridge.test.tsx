import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { armCallAnswer } from '../lib/armed-answer';
import { captureLaunchIntent } from '../lib/launch-params';

const queued = vi.hoisted(() => [] as unknown[]);

vi.mock('@features/calls', () => ({
  queueNotificationCallAction: (action: unknown) => queued.push(action),
}));

const { PwaCallBridge } = await import('./PwaCallBridge');

function memoryCaches() {
  const store = new Map<string, Response>();
  return {
    open: () =>
      Promise.resolve({
        put: (url: string, response: Response) => Promise.resolve(void store.set(url, response)),
        match: (url: string) => Promise.resolve(store.get(url)?.clone()),
        delete: (url: string) => Promise.resolve(store.delete(url)),
      } as unknown as Cache),
  };
}

function launch(search: string): void {
  window.history.replaceState(null, '', `/app/${search}`);
  captureLaunchIntent();
}

afterEach(() => {
  queued.length = 0;
  vi.unstubAllGlobals();
});

describe('PwaCallBridge', () => {
  it('opens the chat without answering when the launch url was crafted outside the notification', async () => {
    vi.stubGlobal('caches', memoryCaches());
    launch('?room=r1&call=c1');
    render(<PwaCallBridge />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queued).toEqual([]);
  });

  it('answers once when the notification armed that call, and not again on a replayed url', async () => {
    const caches = memoryCaches();
    vi.stubGlobal('caches', caches);
    await armCallAnswer(caches, new URL('/app/', window.location.origin).toString(), 'c1', Date.now());
    launch('?room=r1&call=c1');
    const first = render(<PwaCallBridge />);

    await waitFor(() => expect(queued).toEqual([{ type: 'answer', callId: 'c1' }]));
    first.unmount();

    launch('?room=r1&call=c1');
    render(<PwaCallBridge />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queued).toHaveLength(1);
  });
});
