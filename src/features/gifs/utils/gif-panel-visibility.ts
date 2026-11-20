export function keepGifPanelOpen(isOpen: boolean, composerText: string): boolean {
  return isOpen && composerText.trim().length === 0;
}
