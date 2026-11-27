import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetBackLayersForTests, useBackLayer } from './useBackLayer';

function MobileShell({ isWide }: { isWide: boolean }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  useBackLayer(roomId !== null && !isWide, () => setRoomId(null));
  return (
    <>
      <button onClick={() => setRoomId('room-1')}>open-chat</button>
      <div data-testid="list" style={{ display: roomId && !isWide ? 'none' : 'block' }} />
      {roomId ? <div data-testid="chat" /> : null}
    </>
  );
}

describe('mobile chat back navigation', () => {
  beforeEach(() => {
    resetBackLayersForTests();
  });

  it('returns from an open chat to the list on back', async () => {
    render(<MobileShell isWide={false} />);
    fireEvent.click(screen.getByText('open-chat'));
    expect(screen.getByTestId('chat')).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(screen.queryByTestId('chat')).toBeNull());
    expect(screen.getByTestId('list').style.display).toBe('block');
  });

  it('does not add history entries on a wide layout', async () => {
    const before = window.history.length;
    render(<MobileShell isWide />);
    fireEvent.click(screen.getByText('open-chat'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(window.history.length).toBe(before);
  });
});
