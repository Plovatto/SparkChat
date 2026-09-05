import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'select',
  'summary',
  'label[for]',
  '[role="button"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="option"]',
  'input[type="range"]',
  'input[type="color"]',
  'input[type="file"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  '.sc-btn',
  '.sc-icon-btn',
  '.sc-pill',
  '.sc-tab',
  '.sc-chip',
  '.sc-link',
  '.sc-switch',
  '.sc-tile',
  '.sc-avatar-option',
  '.sc-list-item',
  '.sc-menu-item',
  '.sc-toggle-icon',
  '.sc-card--interactive',
  '.sc-bubble-quote',
  '.sc-bubble-card',
  '.sc-media-thumb',
  '.sc-header-avatar',
  '.sc-header-status',
].join(', ');

const TEXT_SELECTOR = [
  'input:not([type])',
  'input[type="text"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="email"]',
  'input[type="number"]',
  'input[type="tel"]',
  'input[type="url"]',
  'textarea',
  '[contenteditable="true"]',
].join(', ');

const SPARK_MIN_DISTANCE_PX = 24;
const SPARK_INTERVAL_MS = 45;
const SPARK_LIFETIME_MS = 480;
const SPARK_MIN_DRIFT_PX = 8;
const SPARK_DRIFT_RANGE_PX = 12;
const SPARK_MIN_SIZE_PX = 2;
const SPARK_SIZE_RANGE_PX = 2.5;
const BURST_SPARK_COUNT = 8;
const BURST_MIN_DISTANCE_PX = 14;
const BURST_DISTANCE_RANGE_PX = 12;
const BURST_LIFETIME_MS = 460;
const PULSE_LIFETIME_MS = 420;

type CursorState = 'idle' | 'interactive' | 'text';

function resolveState(target: EventTarget | null): CursorState {
  if (!(target instanceof Element)) {
    return 'idle';
  }
  if (target.closest(TEXT_SELECTOR)) {
    return 'text';
  }
  return target.closest(INTERACTIVE_SELECTOR) ? 'interactive' : 'idle';
}

export function CustomCursor() {
  const layerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supportsFinePointer = window.matchMedia('(pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const layer = layerRef.current;
    const pointer = pointerRef.current;

    if (!supportsFinePointer || prefersReducedMotion || !layer || !pointer) {
      return;
    }

    document.documentElement.classList.add('sc-cursor-active');

    const particles = new Set<HTMLSpanElement>();
    const timers = new Set<number>();
    let lastSparkX = 0;
    let lastSparkY = 0;
    let lastSparkAt = 0;

    const spawnParticle = (className: string, x: number, y: number, lifetime: number, variables: Record<string, string>) => {
      const particle = document.createElement('span');
      particle.className = className;
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      for (const [name, value] of Object.entries(variables)) {
        particle.style.setProperty(name, value);
      }
      layer.appendChild(particle);
      particles.add(particle);

      const timer = window.setTimeout(() => {
        particle.remove();
        particles.delete(particle);
        timers.delete(timer);
      }, lifetime);
      timers.add(timer);
    };

    const emitSpark = (x: number, y: number, driftAngle: number, distance: number, lifetime: number) => {
      spawnParticle('sc-cursor__spark', x, y, lifetime, {
        '--sc-spark-x': `${Math.cos(driftAngle) * distance}px`,
        '--sc-spark-y': `${Math.sin(driftAngle) * distance}px`,
        '--sc-spark-size': `${SPARK_MIN_SIZE_PX + Math.random() * SPARK_SIZE_RANGE_PX}px`,
        '--sc-spark-life': `${lifetime}ms`,
      });
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointer.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
      layer.dataset.visible = 'true';
      layer.dataset.state = resolveState(event.target);

      const deltaX = event.clientX - lastSparkX;
      const deltaY = event.clientY - lastSparkY;
      const distance = Math.hypot(deltaX, deltaY);
      const now = event.timeStamp;

      if (distance < SPARK_MIN_DISTANCE_PX || now - lastSparkAt < SPARK_INTERVAL_MS) {
        return;
      }

      const trailAngle = Math.atan2(deltaY, deltaX) + Math.PI + (Math.random() - 0.5) * 0.9;
      emitSpark(event.clientX, event.clientY, trailAngle, SPARK_MIN_DRIFT_PX + Math.random() * SPARK_DRIFT_RANGE_PX, SPARK_LIFETIME_MS);
      lastSparkX = event.clientX;
      lastSparkY = event.clientY;
      lastSparkAt = now;
    };

    const handlePointerDown = (event: PointerEvent) => {
      layer.dataset.pressed = 'true';
      spawnParticle('sc-cursor__pulse', event.clientX, event.clientY, PULSE_LIFETIME_MS, {});

      for (let index = 0; index < BURST_SPARK_COUNT; index++) {
        const burstAngle = (index / BURST_SPARK_COUNT) * Math.PI * 2 + Math.random() * 0.4;
        emitSpark(event.clientX, event.clientY, burstAngle, BURST_MIN_DISTANCE_PX + Math.random() * BURST_DISTANCE_RANGE_PX, BURST_LIFETIME_MS);
      }
    };

    const handlePointerUp = () => {
      layer.dataset.pressed = 'false';
    };

    const handlePointerLeave = () => {
      layer.dataset.visible = 'false';
    };

    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerdown', handlePointerDown, { passive: true });
    document.addEventListener('pointerup', handlePointerUp, { passive: true });
    document.addEventListener('pointercancel', handlePointerUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('blur', handlePointerLeave);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('blur', handlePointerLeave);
      timers.forEach((timer) => window.clearTimeout(timer));
      particles.forEach((particle) => particle.remove());
      document.documentElement.classList.remove('sc-cursor-active');
    };
  }, []);

  return createPortal(
    <div ref={layerRef} className="sc-cursor-layer" data-state="idle" data-visible="false" data-pressed="false" aria-hidden="true">
      <div ref={pointerRef} className="sc-cursor__pointer">
        <span className="sc-cursor__arrow" />
        <span className="sc-cursor__caret" />
      </div>
    </div>,
    document.body,
  );
}
