export interface EscapeKeyEvent {
  key: string;
  defaultPrevented: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export function consumeEscape(event: EscapeKeyEvent, onEscape: () => void): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  onEscape();
  return true;
}
