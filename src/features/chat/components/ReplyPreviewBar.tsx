import { FaPlay, FaTimes } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { formatAudioTime } from '@lib/format';
import type { MessageView } from '@lib/socket';
import { useReplyVideoThumbnail } from '../hooks/useReplyVideoThumbnail';
import { getFileTypeIcon } from '../utils/get-file-type-icon';

interface ReplyPreviewBarProps {
  message: MessageView;
  currentUserId: string;
  isExiting?: boolean;
  onCancel: () => void;
}

export function ReplyPreviewBar({ message, currentUserId, isExiting = false, onCancel }: ReplyPreviewBarProps) {
  const { theme } = useTheme();
  const isVideo = message.type === 'file' && Boolean(message.fileMeta?.mimeType.startsWith('video/'));
  const videoThumbnail = useReplyVideoThumbnail(isVideo, message.content);

  const renderPreview = () => {
    if (message.type === 'image') {
      const imageSrc = message.fileMeta?.thumbnailUrl ?? message.content;
      return imageSrc ? (
        <img
          src={imageSrc}
          alt="Imagem"
          style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
        />
      ) : (
        <div style={{ width: 56, height: 40, borderRadius: 6, flexShrink: 0, background: theme.skeleton }} />
      );
    }

    if (message.type === 'audio') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <FaPlay size={12} />
          <span>Áudio {formatAudioTime(message.duration ?? 0)}</span>
        </div>
      );
    }

    if (message.type === 'file') {
      if (isVideo) {
        return videoThumbnail ? (
          <img
            src={videoThumbnail}
            alt="Vídeo"
            style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: theme.skeleton }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 40,
              borderRadius: 6,
              flexShrink: 0,
              background: theme.skeleton,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FaPlay size={12} />
          </div>
        );
      }

      const fileIcon = getFileTypeIcon(message.fileMeta?.mimeType ?? '');
      const FileIcon = fileIcon.icon;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <FileIcon size={14} color={fileIcon.color} style={{ flexShrink: 0 }} />
          <span style={{ display: 'inline-block', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {message.fileMeta?.name ?? fileIcon.label}
          </span>
        </div>
      );
    }

    return (
      <span style={{ display: 'inline-block', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {message.content}
      </span>
    );
  };

  return (
    <div
      className={`chat-preview-bar ${isExiting ? 'sc-anim-rise-out' : 'sc-anim-rise-in'}`}
      style={{
        background: theme.surfaceSelected,
        borderLeft: `4px solid ${theme.accent}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: theme.accentText, marginBottom: '4px' }}>
          Respondendo {message.sender.id === currentUserId ? 'a você mesmo' : `a ${message.sender.nickname}`}
        </div>
        <div
          style={{
            fontSize: '0.9rem',
            color: theme.textPrimary,
            maxWidth: '300px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflow: 'hidden',
          }}
        >
          {renderPreview()}
        </div>
      </div>
      <button type="button" onClick={onCancel} title="Cancelar resposta" className="sc-icon-btn sc-icon-btn--ghost" style={{ width: '32px', height: '32px' }}>
        <FaTimes size={14} />
      </button>
    </div>
  );
}
