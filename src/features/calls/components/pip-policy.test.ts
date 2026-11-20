import { describe, expect, it } from 'vitest';
import { allowAutoPip, openOnMinimize, shouldClosePip } from './pip-policy';

describe('openOnMinimize', () => {
  it('opens when minimizing during an active share', () => {
    expect(openOnMinimize({ sharing: true, available: true, open: false })).toBe(true);
  });

  it('just minimizes without a share, without support or when already open', () => {
    expect(openOnMinimize({ sharing: false, available: true, open: false })).toBe(false);
    expect(openOnMinimize({ sharing: true, available: false, open: false })).toBe(false);
    expect(openOnMinimize({ sharing: true, available: true, open: true })).toBe(false);
  });
});

describe('shouldClosePip', () => {
  it('closes when the call is expanded again', () => {
    expect(shouldClosePip({ minimized: true, sharing: true }, { minimized: false, sharing: true })).toBe(true);
  });

  it('closes when the share ends', () => {
    expect(shouldClosePip({ minimized: true, sharing: true }, { minimized: true, sharing: false })).toBe(true);
  });

  it('stays open while nothing relevant changes', () => {
    expect(shouldClosePip({ minimized: true, sharing: true }, { minimized: true, sharing: true })).toBe(false);
    expect(shouldClosePip({ minimized: false, sharing: false }, { minimized: true, sharing: true })).toBe(false);
  });
});

describe('allowAutoPip', () => {
  it('allows the automatic picture-in-picture only until the user closes it', () => {
    expect(allowAutoPip({ running: true, video: true, dismissed: false })).toBe(true);
    expect(allowAutoPip({ running: true, video: true, dismissed: true })).toBe(false);
    expect(allowAutoPip({ running: false, video: true, dismissed: false })).toBe(false);
    expect(allowAutoPip({ running: true, video: false, dismissed: false })).toBe(false);
  });
});
