import { FaPlay } from 'react-icons/fa';
import { LuX } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { formatAudioTime } from '@lib/format';
import { isGifMimeType } from '@lib/media/media-type';
import type { MessageView } from '@lib/socket';
import { useReplyVideoThumbnail } from '../hooks/useReplyVideoThumbnail';
import { getFileTypeIcon } from '../utils/get-file-type-icon';
import { toLocalMediaUrl } from '../utils/safe-media-url';
import '../styles/reply-preview-bar.css';

interface ReplyPreviewBarProps {
  message: MessageView;
  currentUserId: string;
  isExiting?: boolean;
  onCancel: () => void;
}

export function ReplyPreviewBar({ message, currentUserId, isExiting = false, onCancel }: ReplyPreviewBarProps) {
  const { t } = useTranslation();
  const isVideo = message.type === 'file' && Boolean(message.fileMeta?.mimeType.startsWith('video/'));
  const videoThumbnail = useReplyVideoThumbnail(isVideo, message.content);
  const isGif = isGifMimeType(message.fileMeta?.mimeType);

  const title = message.sender.id === currentUserId
    ? t('chat.message.replyingToSelf')
    : t('chat.message.replyingTo', { name: message.sender.unknown ? t('common.unknownUser') : message.sender.nickname });

  const renderPreviewText = () => {
    if (message.type === 'image') {
      return <span className="sc-reply-bar__ellipsis">{message.caption || (isGif ? t('chat.message.gif') : t('chat.message.image'))}</span>;
    }

    if (message.type === 'audio') {
      return (
        <>
          <FaPlay size={10} className="sc-reply-bar__inline-icon" aria-hidden="true" />
          <span className="sc-reply-bar__ellipsis">{t('chat.message.audio', { duration: formatAudioTime(message.duration ?? 0) })}</span>
        </>
      );
    }

    if (message.type === 'file') {
      if (isVideo) {
        return <span className="sc-reply-bar__ellipsis">{message.caption || t('chat.message.video')}</span>;
      }

      const fileIcon = getFileTypeIcon(message.fileMeta?.mimeType ?? '');
      const FileIcon = fileIcon.icon;
      return (
        <>
          <FileIcon size={13} color={fileIcon.color} className="sc-reply-bar__inline-icon" aria-hidden="true" />
          <span className="sc-reply-bar__ellipsis">{message.fileMeta?.name ?? fileIcon.label}</span>
        </>
      );
    }

    return <span className="sc-reply-bar__ellipsis">{message.content}</span>;
  };

  const renderThumbnail = () => {
    if (message.type === 'image') {
      const imageSrc = toLocalMediaUrl(message.fileMeta?.thumbnailUrl) ?? toLocalMediaUrl(message.content);
      return imageSrc ? (
        <img className="sc-reply-bar__thumb" src={imageSrc} alt={isGif ? t('chat.message.gif') : t('chat.message.image')} />
      ) : (
        <div className="sc-reply-bar__thumb" aria-hidden="true" />
      );
    }

    if (isVideo) {
      return videoThumbnail ? (
        <img className="sc-reply-bar__thumb" src={videoThumbnail} alt={t('chat.message.video')} />
      ) : (
        <div className="sc-reply-bar__thumb sc-reply-bar__thumb--video" aria-hidden="true">
          <FaPlay size={10} />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="sc-reply-bar-wrap">
      <div className={`sc-reply-bar${isExiting ? ' is-exiting' : ''}`} data-testid="reply-preview-bar">
        <span className="sc-reply-bar__accent" aria-hidden="true" />
        <div className="sc-reply-bar__text">
          <div className="sc-reply-bar__title sc-reply-bar__ellipsis">{title}</div>
          <div className="sc-reply-bar__preview">{renderPreviewText()}</div>
        </div>
        {renderThumbnail()}
        <button
          type="button"
          onClick={onCancel}
          title={t('chat.message.cancelReply')}
          aria-label={t('chat.message.cancelReply')}
          className="sc-reply-bar__close"
        >
          <LuX size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
