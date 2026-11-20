import { describe, expect, it, vi } from 'vitest';
import { reportBackgroundAfterAuth } from './useSocketAuthSync';

describe('reportBackgroundAfterAuth', () => {
  it('tells the server a socket that authenticated in the background is hidden', () => {
    const socket = { emit: vi.fn() };
    reportBackgroundAfterAuth(socket, 'hidden');
    expect(socket.emit).toHaveBeenCalledWith('user:visibility', { visible: false });
  });

  it('stays quiet for a visible page so the default visible state holds', () => {
    const socket = { emit: vi.fn() };
    reportBackgroundAfterAuth(socket, 'visible');
    expect(socket.emit).not.toHaveBeenCalled();
  });
});
