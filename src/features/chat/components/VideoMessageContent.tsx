import { useEffect, useState } from 'react';
import { FaExpand } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../types';
import { CHAT_ATTACHMENT_MAX_WIDTH, fitAttachmentHeight } from '../utils/chat-attachment-layout';
import { renderVideoThumbnail, type VideoThumbnail } from '../utils/render-video-thumbnail';
import { toLocalMediaUrl } from '../utils/safe-media-url';
import { VideoPreviewModal } from './lazy-panels';
import { useMediaViewer } from './media-viewer/media-viewer-context';

const VIDEO_THUMBNAIL_WIDTH = 380;
const VIDEO_FALLBACK_HEIGHT = fitAttachmentHeight(16, 9);

interface VideoMessageContentProps {
  message: ChatMessage;
  flush?: boolean;
}

export function VideoMessageContent({ message, flush = false }: VideoMessageContentProps) {
  const { t } = useTranslation();
  const [thumbnail, setThumbnail] = useState<VideoThumbnail | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const mediaViewer = useMediaViewer();

  useEffect(() => {
    let cancelled = false;
    renderVideoThumbnail(message.content, VIDEO_THUMBNAIL_WIDTH)
      .then((result) => {
        if (!cancelled) {
          setThumbnail(result);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [message.content]);

  return (
    <div style={{ padding: flush ? 0 : '0 10px' }}>
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'relative',
          width: `${CHAT_ATTACHMENT_MAX_WIDTH}px`,
          maxWidth: '100%',
          height: thumbnail ? fitAttachmentHeight(thumbnail.width, thumbnail.height) : VIDEO_FALLBACK_HEIGHT,
          borderRadius: flush ? 0 : '16px',
          background: '#000000',
          overflow: 'hidden',
        }}
      >
        <video
          src={toLocalMediaUrl(message.content)}
          controls
          poster={thumbnail?.dataUrl}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (!mediaViewer?.open(message.id)) {
              setIsPreviewOpen(true);
            }
          }}
          title={t('chat.message.fullscreen')}
          className="sc-icon-btn sc-icon-btn--scrim-solid"
          style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderWidth: '1px', pointerEvents: 'auto' }}
        >
          <FaExpand size={12} />
        </button>
      </div>
      <VideoPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        url={message.content}
        fileName={message.fileMeta?.name ?? t('chat.message.defaultVideoName')}
        roomId={message.roomId}
        messageId={message.id}
        fileMeta={message.fileMeta}
      />
    </div>
  );
}
