import { Button } from 'react-bootstrap';
import { FaPlay, FaTimes } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { formatAudioTime } from '@lib/format';
import type { MessageView } from '@lib/socket';
import { useReplyVideoThumbnail } from '../hooks/useReplyVideoThumbnail';
import { getFileTypeIcon } from '../utils/get-file-type-icon';

interface ReplyPreviewBarProps {
  message: MessageView;
  currentUserId: string;
  onCancel: () => void;
}

export function ReplyPreviewBar({ message, currentUserId, onCancel }: ReplyPreviewBarProps) {
  const { theme } = useTheme();
  const isVideo = message.type === 'file' && Boolean(message.fileMeta?.mimeType.startsWith('video/'));
  const videoThumbnail = useReplyVideoThumbnail(isVideo, message.content);

  const renderPreview = () => {
    if (message.type === 'image') {
      return (
        <img
          src={message.content}
          alt="thumb"
          style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
        />
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
        return (
          <img
            src={videoThumbnail ?? undefined}
            alt="thumb"
            style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'rgba(0, 0, 0, 0.15)' }}
          />
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
      className="chat-preview-bar"
      style={{
        background: theme.surfaceLight,
        borderLeft: `4px solid ${theme.primary}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: theme.textSecondary, marginBottom: '4px' }}>
          Respondendo {message.sender.id === currentUserId ? 'a você mesmo' : `a ${message.sender.nickname}`}
        </div>
        <div
          style={{
            fontSize: '0.9rem',
            color: theme.text,
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
      <Button
        variant="link"
        onClick={onCancel}
        style={{ color: theme.textSecondary, padding: '4px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center' }}
      >
        <FaTimes size={14} />
      </Button>
    </div>
  );
}
