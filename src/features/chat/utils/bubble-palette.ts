export interface BubbleInnerPalette {
  background: string;
  iconBackground: string;
  secondaryText: string;
}

const OWN_PALETTE: BubbleInnerPalette = {
  background: 'rgba(255, 255, 255, 0.14)',
  iconBackground: 'rgba(255, 255, 255, 0.18)',
  secondaryText: 'rgba(255, 255, 255, 0.8)',
};

const LIGHT_PALETTE: BubbleInnerPalette = {
  background: '#77777720',
  iconBackground: '#77777730',
  secondaryText: '#555555ff',
};

const DARK_PALETTE: BubbleInnerPalette = {
  background: 'rgba(255, 255, 255, 0.07)',
  iconBackground: 'rgba(255, 255, 255, 0.15)',
  secondaryText: '#ffffffc7',
};

export function resolveBubbleInnerPalette(isOwn: boolean, baseTheme: string): BubbleInnerPalette {
  if (isOwn) {
    return OWN_PALETTE;
  }

  return baseTheme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
}
