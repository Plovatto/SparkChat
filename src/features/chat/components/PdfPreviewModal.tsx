import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useTranslation } from 'react-i18next';
import { Modal } from '@components/common/Modal';
import { Spinner } from '@components/common/Spinner';
import { loadLocalPdfDocument, type LocalPdf } from '../utils/pdf-document';
import { toLocalMediaUrl } from '../utils/safe-media-url';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  fileName: string;
}

const MAX_PIXEL_RATIO = 2;
const FALLBACK_PAGE_WIDTH = 860;
const MAX_PREVIEW_PAGES = 30;

type PdfStatus = 'loading' | 'ready' | 'failed';

async function renderPages(pdf: PDFDocumentProxy, container: HTMLDivElement, isCancelled: () => boolean, onFirstPage: () => void) {
  const cssWidth = container.clientWidth || FALLBACK_PAGE_WIDTH;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

  const lastPage = Math.min(pdf.numPages, MAX_PREVIEW_PAGES);
  for (let pageNumber = 1; pageNumber <= lastPage; pageNumber += 1) {
    if (isCancelled()) {
      return;
    }
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (cssWidth / baseViewport.width) * pixelRatio });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = '100%';
    canvas.style.display = 'block';
    canvas.style.background = '#fff';
    canvas.style.borderRadius = '8px';
    canvas.style.marginBottom = '8px';
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas context unavailable');
    }

    await page.render({ canvasContext: context, viewport, canvas }).promise;
    if (isCancelled()) {
      return;
    }
    container.appendChild(canvas);
    if (pageNumber === 1) {
      onFirstPage();
    }
  }
}

function PdfPages({ url, fileName }: { url: string; fileName: string }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<PdfStatus>('loading');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    let pdf: LocalPdf | null = null;
    const isCancelled = () => cancelled;
    setStatus('loading');
    container.replaceChildren();

    loadLocalPdfDocument(url)
      .then(async (loaded) => {
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        pdf = loaded;
        await renderPages(loaded.document, container, isCancelled, () => setStatus('ready'));
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('failed');
        }
      });

    return () => {
      cancelled = true;
      void pdf?.destroy();
      container.replaceChildren();
    };
  }, [url]);

  return (
    <div style={{ maxHeight: '75vh', overflowY: 'auto' }}>
      {status === 'loading' && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
          <Spinner size={32} />
        </div>
      )}
      {status === 'failed' && <p style={{ margin: 0, textAlign: 'center' }}>{t('chat.message.pdfFailed')}</p>}
      <div ref={containerRef} role="document" aria-label={fileName} hidden={status === 'failed'} />
    </div>
  );
}

export function PdfPreviewModal({ isOpen, onClose, url, fileName }: PdfPreviewModalProps) {
  const { t } = useTranslation();
  const localUrl = toLocalMediaUrl(url);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={fileName} maxWidth="900px">
      {localUrl ? (
        <PdfPages url={localUrl} fileName={fileName} />
      ) : (
        <p style={{ margin: 0, textAlign: 'center' }}>{t('chat.message.pdfFailed')}</p>
      )}
    </Modal>
  );
}
