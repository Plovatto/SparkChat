const FAVICON_SIZE = 64;
const BASE_FAVICON_HREF = '/favicon.svg';

let baseFaviconPromise: Promise<HTMLImageElement> | null = null;

function loadBaseFavicon(): Promise<HTMLImageElement> {
  baseFaviconPromise ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar o favicon base.'));
    image.src = BASE_FAVICON_HREF;
  });
  return baseFaviconPromise;
}

export async function drawBadgedFavicon(count: number): Promise<string> {
  const image = await loadBaseFavicon();

  const canvas = document.createElement('canvas');
  canvas.width = FAVICON_SIZE;
  canvas.height = FAVICON_SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Contexto de canvas indisponível.');
  }

  context.clearRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);
  context.drawImage(image, 0, 0, FAVICON_SIZE, FAVICON_SIZE);

  const badgeRadius = FAVICON_SIZE * 0.32;
  const badgeX = FAVICON_SIZE - badgeRadius;
  const badgeY = badgeRadius;

  context.beginPath();
  context.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
  context.fillStyle = '#ef4444';
  context.fill();
  context.lineWidth = FAVICON_SIZE * 0.045;
  context.strokeStyle = '#ffffff';
  context.stroke();

  context.fillStyle = '#ffffff';
  context.font = `700 ${badgeRadius * 1.15}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(count > 9 ? '9+' : String(count), badgeX, badgeY + 1);

  return canvas.toDataURL('image/png');
}

export { BASE_FAVICON_HREF };
