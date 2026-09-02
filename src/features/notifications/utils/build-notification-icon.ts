import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IconType } from 'react-icons';

const ICON_SIZE = 128;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load icon image'));
    image.src = src;
  });
}

function drawAvatarBackground(context: CanvasRenderingContext2D, avatarColor: string): void {
  const center = ICON_SIZE / 2;
  context.fillStyle = avatarColor;
  context.beginPath();
  context.arc(center, center, center, 0, Math.PI * 2);
  context.fill();
}

function drawInitial(context: CanvasRenderingContext2D, nickname: string): void {
  const center = ICON_SIZE / 2;
  const initial = nickname.trim().charAt(0).toUpperCase() || '?';
  context.fillStyle = '#ffffff';
  context.font = `700 ${ICON_SIZE * 0.5}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(initial, center, center + ICON_SIZE * 0.04);
}

export async function buildNotificationIcon(
  nickname: string,
  avatarColor: string,
  AvatarIcon?: IconType,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }

  drawAvatarBackground(context, avatarColor);

  if (!AvatarIcon) {
    drawInitial(context, nickname);
    return canvas.toDataURL('image/png');
  }

  try {
    const glyphSize = ICON_SIZE * 0.55;
    const svgMarkup = renderToStaticMarkup(createElement(AvatarIcon, { color: '#ffffff', size: glyphSize }));
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
    const glyphImage = await loadImage(svgDataUrl);
    const offset = (ICON_SIZE - glyphSize) / 2;
    context.drawImage(glyphImage, offset, offset, glyphSize, glyphSize);
  } catch {
    drawInitial(context, nickname);
  }

  return canvas.toDataURL('image/png');
}
