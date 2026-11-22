import { useEffect, useRef } from 'react';
import { particleAlpha, particleCount, spawnParticle, stepParticle, warpBoost, type WarpParticle } from './splash-warp';
import { REDUCED_MOTION_QUERY } from '@constants/media-queries';

const MAX_PIXEL_RATIO = 2;
const MAX_FRAME_MS = 48;
const CENTER_LIFT_PX = 64;

interface SplashWarpFieldProps {
  inkColor: string;
  accentColor: string;
  leaving: boolean;
  className?: string;
  paused?: boolean;
}

export function SplashWarpField({ inkColor, accentColor, leaving, className = 'sc-splash__warp', paused = false }: SplashWarpFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leavingSinceRef = useRef<number | null>(null);

  useEffect(() => {
    leavingSinceRef.current = leaving ? performance.now() : null;
  }, [leaving]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || paused || window.matchMedia?.(REDUCED_MOTION_QUERY).matches) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    let width = 0;
    let height = 0;
    let maxRadius = 0;
    let particles: WarpParticle[] = [];

    const resize = () => {
      const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      maxRadius = Math.hypot(width / 2, height / 2 + CENTER_LIFT_PX);
      const count = particleCount(width, height);
      particles = Array.from({ length: count }, (_, index) => particles[index] ?? spawnParticle(Math.random, maxRadius, true));
    };

    resize();
    window.addEventListener('resize', resize);

    let frame = 0;
    let lastTime = performance.now();

    const draw = (time: number) => {
      const elapsed = Math.min(MAX_FRAME_MS, time - lastTime);
      lastTime = time;
      const leavingSince = leavingSinceRef.current;
      const warp = warpBoost(leavingSince === null ? null : time - leavingSince);
      const centerX = width / 2;
      const centerY = height / 2 - CENTER_LIFT_PX;

      context.clearRect(0, 0, width, height);
      context.lineCap = 'round';

      particles = particles.map((particle) => {
        const next = stepParticle(particle, elapsed, warp, maxRadius, Math.random);
        const cos = Math.cos(next.angle);
        const sin = Math.sin(next.angle);
        const tail = Math.max(0, next.radius - Math.max(next.radius - next.previousRadius, 1.5 + next.speed * warp * 2.5));
        context.globalAlpha = particleAlpha(next.radius, maxRadius);
        context.strokeStyle = next.tone === 'accent' ? accentColor : inkColor;
        context.lineWidth = next.size;
        context.beginPath();
        context.moveTo(centerX + cos * tail, centerY + sin * tail);
        context.lineTo(centerX + cos * next.radius, centerY + sin * next.radius);
        context.stroke();
        return next;
      });

      context.globalAlpha = 1;
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [inkColor, accentColor, paused]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
