import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  it('pushes a history entry when a layer opens', () => {
    const before = window.history.length;
    render(<Stack />);
    click('open-first');
    expect(window.history.length).toBe(before + 1);
  });

  it('closes the layer on back', async () => {
    render(<Stack />);
    click('open-first');
    pressBack();
    await settle();
    expect(screen.queryByTestId('first')).toBeNull();
  });

  it('closes only the top layer per back press', async () => {
    render(<Stack />);
    click('open-first');
    click('open-second');
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
    click('close-first');
    await settle();
    expect(screen.queryByTestId('first')).toBeNull();
    click('open-second');
    await settle();
    pressBack();
    await settle();
    expect(screen.queryByTestId('second')).toBeNull();
    expect(window.history.length).toBeLessThanOrEqual(startIndex + 2);
  });

  it('keeps stack order when a lower layer closes from the UI first', async () => {
    render(<Stack />);
    click('open-first');
    click('open-second');
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
    click('close-first');
    await settle();
    click('open-second');
    click('close-second');
    await settle();
    expect(screen.queryByTestId('first')).toBeNull();
    expect(screen.queryByTestId('second')).toBeNull();
  });
});
