import { describe, expect, it } from 'vitest';
import { panelTabs, resolveTab, stepTab, toPercent } from './settings-tabs';

describe('panelTabs', () => {
  it('shows the broadcast tab only while a share is active', () => {
    expect(panelTabs(false)).toEqual(['devices', 'audio']);
    expect(panelTabs(true)).toEqual(['devices', 'audio', 'broadcast']);
  });
});

describe('resolveTab', () => {
  it('keeps a visible tab', () => {
    expect(resolveTab('audio', panelTabs(false))).toBe('audio');
    expect(resolveTab('broadcast', panelTabs(true))).toBe('broadcast');
  });

  it('falls back to devices when the broadcast tab disappears', () => {
    expect(resolveTab('broadcast', panelTabs(false))).toBe('devices');
  });
});

describe('stepTab', () => {
  const tabs = panelTabs(true);

  it('moves with the arrow keys and wraps around', () => {
    expect(stepTab(tabs, 'devices', 'ArrowRight')).toBe('audio');
    expect(stepTab(tabs, 'broadcast', 'ArrowRight')).toBe('devices');
    expect(stepTab(tabs, 'devices', 'ArrowLeft')).toBe('broadcast');
  });

  it('jumps to the edges with Home and End', () => {
    expect(stepTab(tabs, 'audio', 'Home')).toBe('devices');
    expect(stepTab(tabs, 'audio', 'End')).toBe('broadcast');
  });

  it('ignores other keys', () => {
    expect(stepTab(tabs, 'audio', 'Enter')).toBeNull();
  });

  it('starts from the first tab when the current one is gone', () => {
    expect(stepTab(panelTabs(false), 'broadcast', 'ArrowRight')).toBe('audio');
  });
});

describe('toPercent', () => {
  it('rounds and clamps the volume', () => {
    expect(toPercent(0.456)).toBe(46);
    expect(toPercent(1.4)).toBe(100);
    expect(toPercent(-1)).toBe(0);
    expect(toPercent(Number.NaN)).toBe(0);
  });
});
