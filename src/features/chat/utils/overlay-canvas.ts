export type OverlayFrameCallback = (
  context: CanvasRenderingContext2D,
  elapsed: number,
  width: number,
  height: number,
) => void;

export function runOverlayAnimation(durationMs: number, onFrame: OverlayFrameCallback, zIndex = 9999): void {
  if (typeof document === 'undefined') {
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = String(zIndex);
  document.body.appendChild(canvas);

  const context = canvas.getContext('2d');
  if (!context) {
    canvas.remove();
    return;
  }

  const startTime = performance.now();
  let frameId: number;

  const handleResize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', handleResize);

  const cleanup = () => {
    window.removeEventListener('resize', handleResize);
    canvas.remove();
  };

  const tick = (now: number) => {
    const elapsed = now - startTime;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onFrame(context, elapsed, canvas.width, canvas.height);

    if (elapsed < durationMs) {
      frameId = requestAnimationFrame(tick);
    } else {
      cleanup();
    }
  };

  frameId = requestAnimationFrame(tick);

  window.setTimeout(() => {
    cancelAnimationFrame(frameId);
    cleanup();
  }, durationMs + 300);
}

function shakeSingleElement(element: HTMLElement, durationMs: number): void {
  element.classList.remove('chat-shake');
  void element.offsetWidth;
  element.classList.add('chat-shake');
  window.setTimeout(() => element.classList.remove('chat-shake'), durationMs);
}

export function shakeElement(selector: string, durationMs = 550): void {
  const element = document.querySelector(selector);
  if (element instanceof HTMLElement) {
    shakeSingleElement(element, durationMs);
  }
}

export function shakeElements(selector: string, durationMs = 700, maxStaggerMs = 0): void {
  document.querySelectorAll(selector).forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    const delay = maxStaggerMs > 0 ? Math.random() * maxStaggerMs : 0;
    if (delay === 0) {
      shakeSingleElement(element, durationMs);
    } else {
      window.setTimeout(() => shakeSingleElement(element, durationMs), delay);
    }
  });
}
