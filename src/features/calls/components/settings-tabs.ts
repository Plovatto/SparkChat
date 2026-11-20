export type PanelTab = 'devices' | 'audio' | 'broadcast';

export function panelTabs(broadcast: boolean): PanelTab[] {
  return broadcast ? ['devices', 'audio', 'broadcast'] : ['devices', 'audio'];
}

export function resolveTab(tab: PanelTab, tabs: readonly PanelTab[]): PanelTab {
  return tabs.includes(tab) ? tab : 'devices';
}

export function stepTab(tabs: readonly PanelTab[], current: PanelTab, key: string): PanelTab | null {
  const index = Math.max(0, tabs.indexOf(current));
  switch (key) {
    case 'ArrowRight':
      return tabs[(index + 1) % tabs.length] ?? null;
    case 'ArrowLeft':
      return tabs[(index - 1 + tabs.length) % tabs.length] ?? null;
    case 'Home':
      return tabs[0] ?? null;
    case 'End':
      return tabs[tabs.length - 1] ?? null;
    default:
      return null;
  }
}

export function toPercent(volume: number, min = 0, max = 1): number {
  if (!Number.isFinite(volume)) {
    return Math.round(min * 100);
  }
  return Math.round(Math.min(max, Math.max(min, volume)) * 100);
}

export function rangeFill(percent: number, minPercent: number, maxPercent: number): number {
  if (maxPercent <= minPercent) {
    return 0;
  }
  return Math.round(((Math.min(maxPercent, Math.max(minPercent, percent)) - minPercent) / (maxPercent - minPercent)) * 1000) / 10;
}
