import { BoundedMap } from '@lib/cache/bounded-map';

let workerConfigured = false;

async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  if (!workerConfigured) {
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    workerConfigured = true;
  }
  return pdfjsLib;
}

export interface PdfThumbnail {
  dataUrl: string;
  pageCount: number;
}

const MAX_CACHED_THUMBNAILS = 120;
const thumbnailCache = new BoundedMap<string, PdfThumbnail>(MAX_CACHED_THUMBNAILS);
const pendingThumbnails = new Map<string, Promise<PdfThumbnail>>();

async function capturePdfThumbnail(url: string, maxWidth: number): Promise<PdfThumbnail> {
  const pdfjsLib = await loadPdfjs();
  const pdf = await pdfjsLib.getDocument({ url }).promise;
  const page = await pdf.getPage(1);

  const baseViewport = page.getViewport({ scale: 1 });
  const scale = maxWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Não foi possível criar o contexto de renderização do PDF.');
  }

  await page.render({ canvasContext: context, viewport, canvas }).promise;

  return { dataUrl: canvas.toDataURL('image/png'), pageCount: pdf.numPages };
}

export function renderPdfThumbnail(url: string, maxWidth: number): Promise<PdfThumbnail> {
  const cacheKey = `${maxWidth}|${url}`;
  const cached = thumbnailCache.get(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingThumbnails.get(cacheKey);
  if (pending) {
    return pending;
  }

  const task = capturePdfThumbnail(url, maxWidth)
    .then((thumbnail) => {
      thumbnailCache.set(cacheKey, thumbnail);
      return thumbnail;
    })
    .finally(() => {
      pendingThumbnails.delete(cacheKey);
    });

  pendingThumbnails.set(cacheKey, task);
  return task;
}
