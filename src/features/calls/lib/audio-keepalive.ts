import { onPageResume, type ResumeSource } from './page-resume';

export interface ResumableContext {
  state?: string;
  resume?: () => Promise<void>;
  addEventListener?: (type: 'statechange', listener: () => void) => void;
  removeEventListener?: (type: 'statechange', listener: () => void) => void;
}

const tracked = new Map<ResumableContext, () => void>();
let stopListening: (() => void) | null = null;

function isHalted(context: ResumableContext): boolean {
  return context.state === 'suspended' || context.state === 'interrupted';
}

function revive(context: ResumableContext): void {
  if (!isHalted(context)) {
    return;
  }
  try {
    void context.resume?.()?.catch(() => undefined);
  } catch {
    return;
  }
}

export function resumeTrackedContexts(): void {
  for (const context of Array.from(tracked.keys())) {
    revive(context);
  }
}

export function keepAudioContextRunning(context: ResumableContext, source?: ResumeSource | null): () => void {
  if (tracked.has(context)) {
    return tracked.get(context) ?? (() => undefined);
  }
  const onChange = () => revive(context);
  context.addEventListener?.('statechange', onChange);
  const release = () => {
    context.removeEventListener?.('statechange', onChange);
    tracked.delete(context);
    if (tracked.size === 0) {
      stopListening?.();
      stopListening = null;
    }
  };
  tracked.set(context, release);
  if (!stopListening) {
    stopListening = source === undefined ? onPageResume(resumeTrackedContexts) : onPageResume(resumeTrackedContexts, source);
  }
  revive(context);
  return release;
}

export function trackedContextCount(): number {
  return tracked.size;
}
