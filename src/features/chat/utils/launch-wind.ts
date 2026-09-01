import { runOverlayAnimation, shakeElements } from './overlay-canvas';

const STREAK_COUNT = 55;
const DEBRIS_COUNT = 18;
const DURATION_MS = 2400;
const GUST_SHEET_MS = 220;

interface WindStreak {
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
  thickness: number;
}

interface Debris {
  x: number;
  y: number;
  size: number;
  speed: number;
  angle: number;
  spin: number;
  bobPhase: number;
  color: string;
}

const DEBRIS_COLORS = ['#c9a06b', '#b98b4e', '#8f9779', '#d9c08a'];

function createStreak(width: number, height: number): WindStreak {
  return {
    x: -Math.random() * width,
    y: Math.random() * height,
    length: 90 + Math.random() * 160,
    speed: 20 + Math.random() * 26,
    opacity: 0.12 + Math.random() * 0.3,
    thickness: 1 + Math.random() * 2,
  };
}

function createDebris(width: number, height: number): Debris {
  return {
    x: -Math.random() * width,
    y: Math.random() * height,
    size: 5 + Math.random() * 7,
    speed: 12 + Math.random() * 14,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.4,
    bobPhase: Math.random() * Math.PI * 2,
    color: DEBRIS_COLORS[Math.floor(Math.random() * DEBRIS_COLORS.length)] ?? '#c9a06b',
  };
}

export function launchWind(): void {
  shakeElements('[data-message-bubble]', 1000, 150);
  window.setTimeout(() => shakeElements('[data-message-bubble]', 1000, 150), 900);

  let streaks: WindStreak[] | null = null;
  let debris: Debris[] | null = null;

  runOverlayAnimation(DURATION_MS, (context, elapsed, width, height) => {
    streaks ??= Array.from({ length: STREAK_COUNT }, () => createStreak(width, height));
    debris ??= Array.from({ length: DEBRIS_COUNT }, () => createDebris(width, height));

    if (elapsed < GUST_SHEET_MS) {
      const sheetAlpha = 0.16 * (1 - elapsed / GUST_SHEET_MS);
      const gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.5, `rgba(255,255,255,${sheetAlpha})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    }

    for (const streak of streaks) {
      streak.x += streak.speed;
      if (streak.x > width + streak.length) {
        streak.x = -streak.length;
        streak.y = Math.random() * height;
      }

      const wobble = Math.sin(elapsed / 150 + streak.y) * 5;
      const gradient = context.createLinearGradient(streak.x, streak.y, streak.x + streak.length, streak.y);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.5, `rgba(255,255,255,${streak.opacity})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');

      context.strokeStyle = gradient;
      context.lineWidth = streak.thickness;
      context.beginPath();
      context.moveTo(streak.x, streak.y);
      context.lineTo(streak.x + streak.length, streak.y + wobble + streak.length * 0.06);
      context.stroke();
    }

    for (const piece of debris) {
      piece.x += piece.speed;
      piece.angle += piece.spin;
      const bob = Math.sin(elapsed / 220 + piece.bobPhase) * 10;
      if (piece.x > width + piece.size * 2) {
        piece.x = -piece.size * 2;
        piece.y = Math.random() * height;
      }

      context.save();
      context.translate(piece.x, piece.y + bob);
      context.rotate(piece.angle);
      context.fillStyle = piece.color;
      context.beginPath();
      context.ellipse(0, 0, piece.size, piece.size * 0.55, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  });
}
