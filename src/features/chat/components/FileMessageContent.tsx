import { useEffect, useState } from 'react';
import { FaDownload } from 'react-icons/fa';
import type { ThemePalette } from '@features/theme';
import { downloadFromUrl } from '@lib/download-file';
import { formatFileSize } from '@lib/format';
import type { ChatMessage } from '../types';
import { resolveBubbleInnerPalette } from '../utils/bubble-palette';
import type { FileTypeIcon } from '../utils/get-file-type-icon';
import { renderPdfThumbnail, type PdfThumbnail } from '../utils/render-pdf-thumbnail';
import { PdfPreviewModal } from './PdfPreviewModal';

const PDF_THUMBNAIL_WIDTH = 380;
const CHAT_FILE_CARD_MAX_WIDTH = 280;

interface FileMessageContentProps {
  message: ChatMessage;
  isOwn: boolean;
  baseTheme: string;
  theme: ThemePalette;
  fileTypeIcon: FileTypeIcon;
}

export function FileMessageContent({ message, isOwn, baseTheme, theme, fileTypeIcon }: FileMessageContentProps) {
  const isPdf = message.fileMeta?.mimeType === 'application/pdf';
  const [pdfThumbnail, setPdfThumbnail] = useState<PdfThumbnail | null>(null);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const innerPalette = resolveBubbleInnerPalette(isOwn, baseTheme);
  const fileName = message.fileMeta?.name ?? 'arquivo';

  useEffect(() => {
    if (!isPdf) {
      return;
    }

    let cancelled = false;
    renderPdfThumbnail(message.content, PDF_THUMBNAIL_WIDTH)
      .then((thumbnail) => {
        if (!cancelled) {
          setPdfThumbnail(thumbnail);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isPdf, message.content]);

  const download = () => void downloadFromUrl(message.content, fileName);

  return (
    <div style={{ padding: '0 9px' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          if (isPdf) {
            setIsPdfPreviewOpen(true);
          } else {
            download();
          }
        }}
        style={{
          borderRadius: '12px',
          background: innerPalette.background,
          cursor: 'pointer',
          width: '100%',
          minWidth: '230px',
          maxWidth: `${CHAT_FILE_CARD_MAX_WIDTH}px`,
          overflow: 'hidden',
        }}
      >
        {isPdf && pdfThumbnail && (
          <img
            src={pdfThumbnail.dataUrl}
            alt="Prévia do PDF"
            style={{
              display: 'block',
              width: '100%',
              maxHeight: '70px',
              objectFit: 'cover',
              objectPosition: 'top',
              borderBottom: `1px solid ${isOwn ? 'rgba(255, 255, 255, 0.2)' : theme.border}`,
            }}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: `${fileTypeIcon.color}22`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <fileTypeIcon.icon size={15} color={fileTypeIcon.color} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: isOwn ? 'white' : theme.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {message.fileMeta?.name ?? 'Arquivo'}
            </div>
            <div
              style={{
                fontSize: '0.65rem',
                color: isOwn ? 'rgba(255, 255, 255, 0.75)' : theme.textSecondary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {isPdf && pdfThumbnail ? `${pdfThumbnail.pageCount} página${pdfThumbnail.pageCount === 1 ? '' : 's'} · ` : `${fileTypeIcon.label} · `}
              {message.fileMeta ? formatFileSize(message.fileMeta.size) : ''}
            </div>
          </div>
          <button
            onClick={(event) => {
              event.stopPropagation();
              download();
            }}
            title="Baixar arquivo"
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              flexShrink: 0,
            }}
          >
            <FaDownload size={14} color={isOwn ? 'white' : theme.textSecondary} />
          </button>
        </div>
      </div>
      {isPdf && (
        <PdfPreviewModal
          isOpen={isPdfPreviewOpen}
          onClose={() => setIsPdfPreviewOpen(false)}
          url={message.content}
          fileName={message.fileMeta?.name ?? 'Documento.pdf'}
        />
      )}
    </div>
  );
}
