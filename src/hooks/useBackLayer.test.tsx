import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBackLayersForTests, useBackLayer } from './useBackLayer';

function pressBack() {
  act(() => {
    window.history.back();
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
}

function Layer({ name, open, onClose }: { name: string; open: boolean; onClose: () => void }) {
  useBackLayer(open, onClose);
  return open ? <div data-testid={name} /> : null;
}

function Stack() {
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);
  return (
    <>
      <button onClick={() => setFirst(true)}>open-first</button>
      <button onClick={() => setSecond(true)}>open-second</button>
      <button onClick={() => setFirst(false)}>close-first</button>
      <button onClick={() => setSecond(false)}>close-second</button>
      <Layer name="first" open={first} onClose={() => setFirst(false)} />
      <Layer name="second" open={second} onClose={() => setSecond(false)} />
    </>
  );
}

function click(label: string) {
  fireEvent.click(screen.getByText(label));
}

describe('useBackLayer', () => {
  beforeEach(() => {
    resetBackLayersForTests();
  });

  afterEach(async () => {
    await settle();
    resetBackLayersForTests();
  });

  it('pushes a history entry when a layer opens', async () => {
    const before = window.history.length;
    render(<Stack />);
    click('open-first');
    await settle();
    expect(window.history.length).toBe(before + 1);
  });

  it('closes the layer on back', async () => {
    render(<Stack />);
    click('open-first');
    await settle();
    pressBack();
    await settle();
    expect(screen.queryByTestId('first')).toBeNull();
  });

  it('closes only the top layer per back press', async () => {
    render(<Stack />);
    click('open-first');
    await settle();
    click('open-second');
    await settle();
    pressBack();
    await waitFor(() => expect(screen.queryByTestId('second')).toBeNull());
    expect(screen.getByTestId('first')).toBeTruthy();
    pressBack();
    await waitFor(() => expect(screen.queryByTestId('first')).toBeNull());
  });

  it('consumes the history entry when closed from the UI', async () => {
    render(<Stack />);
    const startIndex = window.history.length;
    click('open-first');
    await settle();
    click('close-first');
    await settle();
    expect(screen.queryByTestId('first')).toBeNull();
    click('open-second');
    await settle();
    await settle();
    pressBack();
    await settle();
    expect(screen.queryByTestId('second')).toBeNull();
    expect(window.history.length).toBeLessThanOrEqual(startIndex + 2);
  });

  it('keeps stack order when a lower layer closes from the UI first', async () => {
    render(<Stack />);
    click('open-first');
    await settle();
    click('open-second');
    await settle();
    click('close-first');
    await settle();
    expect(screen.getByTestId('second')).toBeTruthy();
    pressBack();
    await settle();
    expect(screen.queryByTestId('second')).toBeNull();
  });

  it('does nothing on back when no layer is open', async () => {
    render(<Stack />);
    click('open-first');
    await settle();
    click('close-first');
    await settle();
    click('open-second');
    await settle();
    click('close-second');
    await settle();
    expect(screen.queryByTestId('first')).toBeNull();
    expect(screen.queryByTestId('second')).toBeNull();
  });

  it('keeps the history entry when the rearm key changes', async () => {
    function Keyed() {
      const [key, setKey] = useState(0);
      useBackLayer(true, () => {}, key);
      return <button onClick={() => setKey((value) => value + 1)}>bump</button>;
    }
    render(<Keyed />);
    await settle();
    const length = window.history.length;
    const layer = (window.history.state as { scLayer: number }).scLayer;
    click('bump');
    await settle();
    expect(window.history.length).toBe(length);
    expect((window.history.state as { scLayer: number }).scLayer).toBe(layer);
  });

  it('re-pushes a rearmed layer after back consumed its entry', async () => {
    function Keyed() {
      const [key, setKey] = useState(0);
      useBackLayer(true, () => setKey((value) => value + 1), key);
      return <span data-testid="key">{key}</span>;
    }
    render(<Keyed />);
    await settle();
    pressBack();
    await waitFor(() => expect(screen.getByTestId('key').textContent).toBe('1'));
    await settle();
    expect((window.history.state as { scLayer?: number } | null)?.scLayer).toBeTypeOf('number');
  });

  it('coalesces layers closed in the same tick into one history jump', async () => {
    const go = vi.spyOn(window.history, 'go');
    render(<Stack />);
    click('open-first');
    await settle();
    click('open-second');
    await settle();
    await settle();
    go.mockClear();
    act(() => {
      fireEvent.click(screen.getByText('close-first'));
      fireEvent.click(screen.getByText('close-second'));
    });
    await settle();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(-2);
    go.mockRestore();
  });

  it('leaves no extra entries under StrictMode', async () => {
    let closed = 0;
    const baseLayer = (window.history.state as { scLayer?: number } | null)?.scLayer;
    render(
      <StrictMode>
        <Layer name="strict" open onClose={() => (closed += 1)} />
      </StrictMode>,
    );
    await settle();
    pressBack();
    await waitFor(() => expect(closed).toBe(1));
    await settle();
    expect((window.history.state as { scLayer?: number } | null)?.scLayer).toBe(baseLayer);
  });

  it('stacks a parent before its child opened in the same commit', async () => {
    function Child({ open, onClose }: { open: boolean; onClose: () => void }) {
      useBackLayer(open, onClose);
      return open ? <div data-testid="child" /> : null;
    }
    function Wrapper() {
      const [childClosed, setChildClosed] = useState(false);
      const [open, setOpen] = useState(false);
      useBackLayer(open, () => setOpen(false));
      return (
        <>
          <button onClick={() => setOpen(true)}>open-both</button>
          {open ? <div data-testid="parent" /> : null}
          {open ? <Child open={!childClosed} onClose={() => setChildClosed(true)} /> : null}
        </>
      );
    }
    render(<Wrapper />);
    click('open-both');
    await settle();
    pressBack();
    await waitFor(() => expect(screen.queryByTestId('child')).toBeNull());
    expect(screen.getByTestId('parent')).toBeTruthy();
  });

  it('keeps a sticky guard armed so back at the bottom does not leave the app', async () => {
    function Guarded() {
      useBackLayer(true, () => {}, undefined, true);
      return null;
    }
    render(<Guarded />);
    await settle();
    expect((window.history.state as { scLayer?: number } | null)?.scLayer).toBeTypeOf('number');
    pressBack();
    await settle();
    expect((window.history.state as { scLayer?: number } | null)?.scLayer).toBeTypeOf('number');
  });

  it('lets back close a normal layer before the sticky guard re-arms', async () => {
    function GuardedStack() {
      const [open, setOpen] = useState(false);
      useBackLayer(true, () => {}, undefined, true);
      return (
        <>
          <button onClick={() => setOpen(true)}>open-chat</button>
          <Layer name="chat" open={open} onClose={() => setOpen(false)} />
        </>
      );
    }
    render(<GuardedStack />);
    await settle();
    click('open-chat');
    await settle();
    pressBack();
    await waitFor(() => expect(screen.queryByTestId('chat')).toBeNull());
    await settle();
    expect((window.history.state as { scLayer?: number } | null)?.scLayer).toBeTypeOf('number');
  });
});
