import { useState, type CSSProperties } from 'react';
import { useTheme } from '@features/theme';
import type { ChatMessage } from '../types';
import { CHAT_ATTACHMENT_MAX_WIDTH, fitAttachmentHeight } from '../utils/chat-attachment-layout';
import { ImageModal } from './ImageModal';

interface ImageMessageContentProps {
  message: ChatMessage;
}

export function ImageMessageContent({ message }: ImageMessageContentProps) {
  const { theme } = useTheme();
  const [isLoaded, setIsLoaded] = useState(false);
  const [displayHeight, setDisplayHeight] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div
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
          src={message.content}
          alt="Imagem enviada"
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
      <ImageModal isOpen={isModalOpen} images={[message.content]} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
