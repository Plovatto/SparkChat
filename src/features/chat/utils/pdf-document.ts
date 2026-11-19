import type { PDFDocumentProxy } from 'pdfjs-dist';
import { toLocalMediaUrl } from './safe-media-url';

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

export async function readLocalPdfBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const localUrl = toLocalMediaUrl(url);
  if (!localUrl) {
    throw new Error('PDF source must be a local object URL.');
  }
  const response = await fetch(localUrl);
  if (!response.ok) {
    throw new Error('PDF source could not be read.');
  }
  return new Uint8Array(await response.arrayBuffer());
}

export interface LocalPdf {
  document: PDFDocumentProxy;
  destroy: () => Promise<void>;
}

export async function loadLocalPdfDocument(url: string): Promise<LocalPdf> {
  const [pdfjsLib, data] = await Promise.all([loadPdfjs(), readLocalPdfBytes(url)]);
  const loadingTask = pdfjsLib.getDocument({ data, enableXfa: false });
  try {
    return { document: await loadingTask.promise, destroy: () => loadingTask.destroy() };
  } catch (error) {
    void loadingTask.destroy();
    throw error;
  }
}
