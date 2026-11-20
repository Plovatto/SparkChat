export interface PipMoment {
  minimized: boolean;
  sharing: boolean;
}

export function openOnMinimize(input: { sharing: boolean; available: boolean; open: boolean }): boolean {
  return input.sharing && input.available && !input.open;
}

export function shouldClosePip(previous: PipMoment, next: PipMoment): boolean {
  return (previous.minimized && !next.minimized) || (previous.sharing && !next.sharing);
}

export function allowAutoPip(input: { running: boolean; video: boolean; dismissed: boolean }): boolean {
  return input.running && input.video && !input.dismissed;
}
