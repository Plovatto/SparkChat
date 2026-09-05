import { useEffect, useState, type CSSProperties } from 'react';
import { FaDownload } from 'react-icons/fa';
import { withAlpha, type ResolvedBubbleStyle } from '@features/theme';
import { downloadFromUrl } from '@lib/download-file';
import { formatFileSize } from '@lib/format';
import type { ChatMessage } from '../types';
import type { FileTypeIcon } from '../utils/get-file-type-icon';
import { renderPdfThumbnail, type PdfThumbnail } from '../utils/render-pdf-thumbnail';
import { PdfPreviewModal } from './PdfPreviewModal';

const PDF_THUMBNAIL_WIDTH = 380;
const CHAT_FILE_CARD_MAX_WIDTH = 280;

interface FileMessageContentProps {
  message: ChatMessage;
  bubble: ResolvedBubbleStyle;
  fileTypeIcon: FileTypeIcon;
}

export function FileMessageContent({ message, bubble, fileTypeIcon }: FileMessageContentProps) {
  const isPdf = message.fileMeta?.mimeType === 'application/pdf';
  const [pdfThumbnail, setPdfThumbnail] = useState<PdfThumbnail | null>(null);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
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
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            if (isPdf) {
              setIsPdfPreviewOpen(true);
            } else {
              download();
            }
          }
        }}
        className="sc-bubble-card"
        style={
          {
            borderRadius: '12px',
            background: bubble.innerBackground,
            width: '100%',
            minWidth: '180px',
            maxWidth: `${CHAT_FILE_CARD_MAX_WIDTH}px`,
            overflow: 'hidden',
            '--sc-bubble-inner-strong': bubble.innerStrongBackground,
            '--sc-bubble-text': bubble.textColor,
          } as CSSProperties
        }
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
              borderBottom: `1px solid ${withAlpha(bubble.textColor, 0.2)}`,
            }}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '9px',
              background: withAlpha(fileTypeIcon.color, 0.18),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <fileTypeIcon.icon size={18} color={fileTypeIcon.color} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: bubble.textColor,
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
                color: bubble.mutedTextColor,
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
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              download();
            }}
            title="Baixar arquivo"
            className="sc-icon-btn sc-icon-btn--bubble"
            style={{ width: '28px', height: '28px' }}
          >
            <FaDownload size={13} />
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
