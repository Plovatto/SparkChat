export type StageItem = 'stream' | 'remote' | 'self' | 'my-screen';

export interface StageItems {
  stream: boolean;
  self: boolean;
  myScreen: boolean;
}

export function availableItems(items: StageItems): StageItem[] {
  const list: StageItem[] = [];
  if (items.stream) {
    list.push('stream');
  }
  list.push('remote');
  if (items.self) {
    list.push('self');
  }
  if (items.myScreen) {
    list.push('my-screen');
  }
  return list;
}

export function resolveFocus(focus: StageItem, items: StageItems): StageItem {
  const list = availableItems(items);
  if (list.includes(focus)) {
    return focus;
  }
  return list[0] ?? 'remote';
}

export function stripItems(focus: StageItem, items: StageItems): StageItem[] {
  const resolved = resolveFocus(focus, items);
  return availableItems(items).filter((item) => item !== resolved);
}

export const OVERLAY_HIDE_MS = 2_500;

export class OverlayVisibility {
  private visible = false;
  private hovering = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onChange: (visible: boolean) => void,
    private readonly hideMs: number = OVERLAY_HIDE_MS,
    private readonly timers: { set: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>; clear: (timer: ReturnType<typeof setTimeout>) => void } = {
      set: (handler, ms) => setTimeout(handler, ms),
      clear: (timer) => clearTimeout(timer),
    },
  ) {}

  get isVisible(): boolean {
    return this.visible;
  }

  activity(): void {
    this.set(true);
    this.schedule();
  }

  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.activity();
    }
  }

  holdOpen(hold: boolean): void {
    this.hovering = hold;
    if (hold) {
      this.cancel();
      this.set(true);
    } else {
      this.schedule();
    }
  }

  hide(): void {
    this.cancel();
    this.hovering = false;
    this.set(false);
  }

  dispose(): void {
    this.cancel();
  }

  private schedule(): void {
    this.cancel();
    if (this.hovering) {
      return;
    }
    this.timer = this.timers.set(() => {
      this.timer = null;
      this.set(false);
    }, this.hideMs);
  }

  private cancel(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }

  private set(visible: boolean): void {
    if (this.visible !== visible) {
      this.visible = visible;
      this.onChange(visible);
    }
  }
}
