export interface MenuRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface MenuPlacement {
  placement: 'below' | 'above';
  top: number | undefined;
  bottom: number | undefined;
  left: number;
  width: number;
  maxHeight: number;
}

export interface PlaceMenuInput {
  trigger: MenuRect;
  viewport: { width: number; height: number };
  contentHeight: number;
  gap?: number;
  margin?: number;
  limit?: number;
}

const MIN_COMFORT_PX = 160;

export function placeMenu({ trigger, viewport, contentHeight, gap = 6, margin = 12, limit = 280 }: PlaceMenuInput): MenuPlacement {
  const below = Math.max(0, viewport.height - trigger.bottom - gap - margin);
  const above = Math.max(0, trigger.top - gap - margin);
  const wanted = Math.min(contentHeight, limit);
  const flip = below < Math.min(wanted, MIN_COMFORT_PX) && above > below;
  const width = Math.min(trigger.width, Math.max(0, viewport.width - margin * 2));
  const left = Math.min(Math.max(margin, trigger.left), Math.max(margin, viewport.width - margin - width));
  const maxHeight = Math.max(0, Math.min(limit, flip ? above : below));
  return flip
    ? { placement: 'above', top: undefined, bottom: viewport.height - trigger.top + gap, left, width, maxHeight }
    : { placement: 'below', top: trigger.bottom + gap, bottom: undefined, left, width, maxHeight };
}

export function moveActive(count: number, active: number, key: string): number | null {
  if (count <= 0) {
    return null;
  }
  switch (key) {
    case 'ArrowDown':
      return active < 0 ? 0 : Math.min(count - 1, active + 1);
    case 'ArrowUp':
      return active < 0 ? count - 1 : Math.max(0, active - 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

export function typeAhead(labels: readonly string[], active: number, buffer: string): number | null {
  const query = buffer.toLocaleLowerCase();
  if (query === '' || labels.length === 0) {
    return null;
  }
  const repeated = query.split('').every((char) => char === query[0]);
  const needle = repeated ? (query[0] ?? '') : query;
  const start = repeated ? active + 1 : Math.max(0, active);
  for (let step = 0; step < labels.length; step += 1) {
    const index = (start + step) % labels.length;
    if ((labels[index] ?? '').toLocaleLowerCase().startsWith(needle)) {
      return index;
    }
  }
  return null;
}
