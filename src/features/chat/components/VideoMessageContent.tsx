import { useEffect, useState } from 'react';
import { FaExpand } from 'react-icons/fa';
import type { ChatMessage } from '../types';
import { CHAT_ATTACHMENT_MAX_WIDTH, fitAttachmentHeight } from '../utils/chat-attachment-layout';
import { renderVideoThumbnail, type VideoThumbnail } from '../utils/render-video-thumbnail';
import { VideoPreviewModal } from './VideoPreviewModal';

const VIDEO_THUMBNAIL_WIDTH = 380;

interface VideoMessageContentProps {
  message: ChatMessage;
}

export function VideoMessageContent({ message }: VideoMessageContentProps) {
  const [thumbnail, setThumbnail] = useState<VideoThumbnail | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

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
    <div style={{ padding: '0 10px' }}>
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'relative',
          width: thumbnail ? `${CHAT_ATTACHMENT_MAX_WIDTH}px` : '100%',
          maxWidth: '100%',
          height: thumbnail ? fitAttachmentHeight(thumbnail.width, thumbnail.height) : undefined,
          minHeight: thumbnail ? undefined : '160px',
          borderRadius: '16px',
          background: '#000',
          overflow: 'hidden',
        }}
      >
        <video
          src={message.content}
          controls
          poster={thumbnail?.dataUrl}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <button
          onClick={(event) => {
            event.stopPropagation();
            setIsPreviewOpen(true);
          }}
          title="Abrir em tela cheia"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.55)',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
          }}
        >
          <FaExpand size={12} />
        </button>
      </div>
      <VideoPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        url={message.content}
        fileName={message.fileMeta?.name ?? 'Vídeo.mp4'}
      />
    </div>
  );
}
