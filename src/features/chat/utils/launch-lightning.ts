import { runOverlayAnimation } from './overlay-canvas';

const BOLT_LIFETIME_MS = 220;
const STRIKE_START_MS = 80;
const STRIKE_INTERVAL_MS = 420;

interface Point {
  x: number;
  y: number;
}

interface Bolt {
  points: Point[];
  born: number;
}

function generateBoltPoints(width: number, height: number): Point[] {
  const startX = width * (0.15 + Math.random() * 0.7);
  const endY = height * (0.5 + Math.random() * 0.4);
  const segments = 10;
  const points: Point[] = [{ x: startX, y: 0 }];

  let x = startX;
  for (let i = 1; i <= segments; i += 1) {
    x += (Math.random() - 0.5) * 60;
    points.push({ x, y: (endY / segments) * i });
  }

  return points;
}

function buildStrikeTimes(boltCount: number): number[] {
  return Array.from({ length: boltCount }, (_unused, index) => STRIKE_START_MS + index * STRIKE_INTERVAL_MS);
}

export function launchLightning(boltCount = 1): void {
  const strikeTimes = buildStrikeTimes(Math.max(1, boltCount));
  const lastStrike = strikeTimes.at(-1) ?? STRIKE_START_MS;
  const durationMs = lastStrike + BOLT_LIFETIME_MS + 300;

  const spawnedAt = new Set<number>();
  const bolts: Bolt[] = [];

  runOverlayAnimation(durationMs, (context, elapsed, width, height) => {
    for (const time of strikeTimes) {
      if (elapsed >= time && !spawnedAt.has(time)) {
        spawnedAt.add(time);
        bolts.push({ points: generateBoltPoints(width, height), born: elapsed });
      }
    }

    for (const bolt of bolts) {
      const age = elapsed - bolt.born;
      if (age > BOLT_LIFETIME_MS) {
        continue;
      }

      const alpha = 1 - age / BOLT_LIFETIME_MS;

      if (age < 40) {
        context.fillStyle = `rgba(255,255,255,${0.35 * (1 - age / 40)})`;
        context.fillRect(0, 0, width, height);
      }

      context.strokeStyle = `rgba(220,230,255,${alpha})`;
      context.lineWidth = 3;
      context.shadowColor = '#9fc9ff';
      context.shadowBlur = 18;
      context.beginPath();
      bolt.points.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });
      context.stroke();
      context.shadowBlur = 0;
    }
  });
}
