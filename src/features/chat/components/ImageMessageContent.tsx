import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { MdGif } from 'react-icons/md';
import { useTheme } from '@features/theme';
import { isExpiredMediaUrl } from '@lib/e2ee';
import { isGifMimeType } from '@lib/media/media-type';
import type { ChatMessage } from '../types';
import { CHAT_ATTACHMENT_MAX_WIDTH, fitAttachmentHeight } from '../utils/chat-attachment-layout';
import { toLocalMediaUrl } from '../utils/safe-media-url';
import { ImageModal } from './ImageModal';

interface ImageMessageContentProps {
  message: ChatMessage;
}

export function GifExpiredBlock() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <div style={{ padding: '0 10px' }}>
      <div
        data-testid="gif-expired"
        className="sc-anim-fade-in"
        role="note"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          width: '220px',
          maxWidth: '100%',
          boxSizing: 'border-box',
          padding: '12px 14px',
          borderRadius: '16px',
          border: `1px dashed ${theme.border}`,
          background: theme.surfaceSunken,
          color: theme.textSecondary,
        }}
      >
        <MdGif size={28} aria-hidden="true" style={{ flexShrink: 0, color: theme.textMuted }} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: theme.textPrimary }}>{t('chat.message.gifExpired')}</span>
          <span style={{ fontSize: '0.74rem', lineHeight: 1.35 }}>{t('chat.message.gifExpiredHint')}</span>
        </div>
      </div>
    </div>
  );
}

export function ImageMessageContent({ message }: ImageMessageContentProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [isLoaded, setIsLoaded] = useState(false);
  const [displayHeight, setDisplayHeight] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isGif = isGifMimeType(message.fileMeta?.mimeType);
  const localSource = toLocalMediaUrl(message.fileMeta?.thumbnailUrl) ?? toLocalMediaUrl(message.content);

  if (isGif && !localSource && isExpiredMediaUrl(message.content)) {
    return <GifExpiredBlock />;
  }

  return (
    <>
      <div
        data-testid={isGif ? 'gif-message' : undefined}
        style={{
          position: 'relative',
          padding: '0 10px',
          width: isLoaded ? `${CHAT_ATTACHMENT_MAX_WIDTH}px` : undefined,
          maxWidth: '100%',
          height: displayHeight ?? undefined,
          minWidth: isLoaded ? undefined : '220px',
          minHeight: isLoaded ? undefined : '160px',
        }}
      >
        {!isLoaded && (
          <div
            className="shimmer-bg"
            style={
              {
                position: 'absolute',
                inset: '0 10px',
                borderRadius: '16px',
                '--shimmer-a': theme.skeleton,
              } as CSSProperties
            }
          />
        )}
        <img
          src={localSource}
          alt={isGif ? t('chat.message.sentGif') : t('chat.message.sentImage')}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            setDisplayHeight(fitAttachmentHeight(naturalWidth, naturalHeight));
            setIsLoaded(true);
          }}
          onClick={(event) => {
            event.stopPropagation();
            setIsModalOpen(true);
          }}
          className="sc-media-thumb"
          style={{
            display: 'block',
            width: isLoaded ? '100%' : undefined,
            height: isLoaded ? '100%' : undefined,
            objectFit: isLoaded ? 'cover' : undefined,
            maxWidth: isLoaded ? undefined : `min(100%, ${CHAT_ATTACHMENT_MAX_WIDTH}px)`,
            maxHeight: isLoaded ? undefined : '320px',
            borderRadius: '16px',
            opacity: isLoaded ? 1 : 0,
          }}
        />
      </div>
      <ImageModal
        isOpen={isModalOpen}
        images={[message.content]}
        roomId={message.roomId}
        messageIds={[message.id]}
        fileMetas={[message.fileMeta]}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
