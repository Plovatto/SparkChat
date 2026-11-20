import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { LuImage } from 'react-icons/lu';
import type { MessageView } from '@lib/socket';
import type { ChatMessage } from '../../types';
import { GalleryMediaTile } from '../GalleryMediaTile';

interface InfoMediaGridProps {
  media: ChatMessage[];
  messagesLoaded: boolean;
  limit?: number;
  variant: 'preview' | 'full';
  onSelect: (message: MessageView) => void;
}

const SKELETON_COUNT = 3;

export function InfoMediaGrid({ media, messagesLoaded, limit, variant, onSelect }: InfoMediaGridProps) {
  const { t } = useTranslation();

  if (!messagesLoaded) {
    return (
      <div className="sc-info-media" data-variant={variant}>
        {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
          <span key={index} className="sc-info-media__tile shimmer-bg" style={{ '--shimmer-a': 'var(--sc-skeleton)' } as CSSProperties} />
        ))}
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div className="sc-info-empty sc-info-empty--compact">
        <LuImage size={22} aria-hidden="true" />
        <span>{t('chat.gallery.empty')}</span>
      </div>
    );
  }

  const visible = limit ? media.slice(0, limit) : media;

  return (
    <div className="sc-info-media" data-variant={variant}>
      {visible.map((message, index) => (
        <button
          key={message.id}
          type="button"
          className="sc-info-media__tile"
          onClick={() => onSelect(message)}
          style={{ '--sc-info-i': Math.min(index, 12) } as CSSProperties}
        >
          <GalleryMediaTile message={message} />
        </button>
      ))}
    </div>
  );
}
