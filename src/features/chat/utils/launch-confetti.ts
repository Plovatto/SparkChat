const CONFETTI_COLORS = ['#6c5ce7', '#ff6b6b', '#feca57', '#1dd1a1', '#54a0ff', '#ff9ff3'];
const PARTICLE_COUNT = 140;
const DURATION_MS = 3200;

interface ConfettiParticle {
  x: number;
  y: number;
  size: number;
  color: string;
  velocityX: number;
  velocityY: number;
  rotation: number;
  rotationSpeed: number;
  shape: 'rect' | 'circle';
}

function createParticle(width: number): ConfettiParticle {
  return {
    x: Math.random() * width,
    y: -20 - Math.random() * 200,
    size: 6 + Math.random() * 6,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ?? '#6c5ce7',
    velocityX: (Math.random() - 0.5) * 2.4,
    velocityY: 2 + Math.random() * 3,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 12,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  };
}

export function launchConfetti(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);

  const context = canvas.getContext('2d');
  if (!context) {
    canvas.remove();
    return;
  }

  const particles = Array.from({ length: PARTICLE_COUNT }, () => createParticle(canvas.width));
  const startTime = performance.now();
  let frameId: number;

  const handleResize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', handleResize);

  const tick = (now: number) => {
    const elapsed = now - startTime;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const fadeStart = DURATION_MS * 0.7;
    const opacity = elapsed > fadeStart ? Math.max(0, 1 - (elapsed - fadeStart) / (DURATION_MS - fadeStart)) : 1;

    for (const particle of particles) {
      particle.x += particle.velocityX;
      particle.y += particle.velocityY;
      particle.velocityY += 0.02;
      particle.rotation += particle.rotationSpeed;

      context.save();
      context.globalAlpha = opacity;
      context.translate(particle.x, particle.y);
      context.rotate((particle.rotation * Math.PI) / 180);
      context.fillStyle = particle.color;

      if (particle.shape === 'rect') {
        context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      } else {
        context.beginPath();
        context.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
        context.fill();
      }

      context.restore();
    }

    if (elapsed < DURATION_MS) {
      frameId = requestAnimationFrame(tick);
    } else {
      window.removeEventListener('resize', handleResize);
      canvas.remove();
    }
  };

  frameId = requestAnimationFrame(tick);

  window.setTimeout(() => {
    cancelAnimationFrame(frameId);
    window.removeEventListener('resize', handleResize);
    canvas.remove();
  }, DURATION_MS + 200);
}
