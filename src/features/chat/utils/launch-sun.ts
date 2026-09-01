import { runOverlayAnimation } from './overlay-canvas';

const DURATION_MS = 2800;
const RAY_COUNT = 7;
const FULL_TURN = Math.PI * 2;

export function launchSun(): void {
  runOverlayAnimation(DURATION_MS, (context, elapsed, width, height) => {
    const progress = elapsed / DURATION_MS;
    const fade = progress < 0.22 ? progress / 0.22 : progress > 0.7 ? Math.max(0, (1 - progress) / 0.3) : 1;

    const originX = width;
    const originY = 0;
    const reach = Math.hypot(width, height) * 1.15;
    const sway = Math.sin(elapsed / 900) * 0.03;

    context.save();
    context.globalAlpha = fade;

    const glow = context.createRadialGradient(originX, originY, 0, originX, originY, reach * 0.35);
    glow.addColorStop(0, 'rgba(255, 250, 224, 0.9)');
    glow.addColorStop(0.35, 'rgba(255, 221, 130, 0.4)');
    glow.addColorStop(1, 'rgba(255, 221, 130, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(originX, originY, reach * 0.35, 0, FULL_TURN);
    context.fill();

    const spanStart = Math.PI * 0.52 + sway;
    const spanEnd = Math.PI * 1.08 + sway;
    const totalSpan = spanEnd - spanStart;

    const gradient = context.createConicGradient(spanStart, originX, originY);

    for (let i = 0; i < RAY_COUNT; i += 1) {
      const sliceStart = (totalSpan * i) / RAY_COUNT;
      const sliceEnd = (totalSpan * (i + 1)) / RAY_COUNT;
      const center = (sliceStart + sliceEnd) / 2;
      const shimmer = 0.22 + 0.12 * Math.sin(elapsed / 260 + i * 1.7);

      gradient.addColorStop(sliceStart / FULL_TURN, 'rgba(255,244,214,0)');
      gradient.addColorStop(center / FULL_TURN, `rgba(255,244,214,${shimmer})`);
      gradient.addColorStop(sliceEnd / FULL_TURN, 'rgba(255,244,214,0)');
    }

    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(originX, originY);
    context.arc(originX, originY, reach, spanStart, spanEnd);
    context.closePath();
    context.fill();

    context.restore();
  });
}
