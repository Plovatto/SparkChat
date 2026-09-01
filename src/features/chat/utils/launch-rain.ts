import { runOverlayAnimation } from './overlay-canvas';

const DROP_COUNT = 130;
const DURATION_MS = 3000;

interface RainDrop {
  x: number;
  y: number;
  length: number;
  speed: number;
}

function createDrop(width: number, height: number): RainDrop {
  return {
    x: Math.random() * width,
    y: -Math.random() * height,
    length: 14 + Math.random() * 18,
    speed: 9 + Math.random() * 7,
  };
}

export function launchRain(): void {
  let drops: RainDrop[] | null = null;

  runOverlayAnimation(DURATION_MS, (context, _elapsed, width, height) => {
    drops ??= Array.from({ length: DROP_COUNT }, () => createDrop(width, height));

    context.strokeStyle = 'rgba(174, 214, 255, 0.55)';
    context.lineWidth = 1.5;

    for (const drop of drops) {
      drop.y += drop.speed;
      drop.x -= drop.speed * 0.15;
      if (drop.y > height) {
        drop.y = -drop.length;
        drop.x = Math.random() * width;
      }

      context.beginPath();
      context.moveTo(drop.x, drop.y);
      context.lineTo(drop.x - drop.speed * 0.6, drop.y + drop.length);
      context.stroke();
    }
  });
}
