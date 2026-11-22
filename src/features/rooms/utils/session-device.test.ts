import { describe, expect, it } from 'vitest';
import { sessionDeviceKind } from './session-device';

describe('sessionDeviceKind', () => {
  it('shows phones for iPhone and Android sessions', () => {
    expect(sessionDeviceKind('Safari · iPhone')).toBe('phone');
    expect(sessionDeviceKind('Chrome · Android')).toBe('phone');
  });

  it('shows a tablet for iPad sessions', () => {
    expect(sessionDeviceKind('Safari · iPad')).toBe('tablet');
  });

  it('falls back to a computer for desktop and unknown devices', () => {
    expect(sessionDeviceKind('Chrome · Windows')).toBe('desktop');
    expect(sessionDeviceKind('Firefox · Linux')).toBe('desktop');
    expect(sessionDeviceKind('Dispositivo desconhecido')).toBe('desktop');
  });
});
