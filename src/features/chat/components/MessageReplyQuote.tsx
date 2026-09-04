import type { MouseEvent } from 'react';
import { FaImage, FaPlay } from 'react-icons/fa';
import type { ThemePalette } from '@features/theme';
import { formatAudioTime, getDisplayName } from '@lib/format';
import type { MessageReplySnapshot, MessageType } from '@lib/socket';
import { useReplyVideoThumbnail } from '../hooks/useReplyVideoThumbnail';
import { getFileTypeIcon } from '../utils/get-file-type-icon';

const REPLY_QUOTE_HEIGHT = 52;
const HIGHLIGHT_DURATION_MS = 1500;

interface MessageReplyQuoteProps {
  replyTo: MessageReplySnapshot;
  parentType: MessageType;
  isOwn: boolean;
  baseTheme: string;
  theme: ThemePalette;
  currentUserId: string | undefined;
}

function jumpToMessage(messageId: string): void {
  const target = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!target) {
    return;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('message-highlight-flash');
  setTimeout(() => target.classList.remove('message-highlight-flash'), HIGHLIGHT_DURATION_MS);
}

export function MessageReplyQuote({ replyTo, parentType, isOwn, baseTheme, theme, currentUserId }: MessageReplyQuoteProps) {
  const isReplyToImage = replyTo.type === 'image';
  const isReplyToVideo = replyTo.type === 'file' && Boolean(replyTo.fileMeta?.mimeType.startsWith('video/'));
  const hasThumbnail = isReplyToImage || isReplyToVideo;
  const replyVideoThumbnail = useReplyVideoThumbnail(isReplyToVideo, replyTo.content);
  const replyThumbnailUrl = isReplyToImage ? replyTo.content : isReplyToVideo ? replyVideoThumbnail : null;

  const quoteBackground = isOwn ? 'rgba(0, 0, 0, 0.14)' : baseTheme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.08)';
  const quoteAccent = isOwn ? 'rgba(255, 255, 255, 0.55)' : theme.primary;

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    jumpToMessage(replyTo.id);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        margin: '8px 10px 0',
        marginBottom: parentType === 'text' ? 0 : '6px',
        minWidth: '160px',
        maxWidth: 'calc(100% - 20px)',
        boxSizing: 'border-box',
        background: quoteBackground,
        borderLeft: `3px solid ${quoteAccent}`,
        borderRadius: '6px',
        fontSize: '0.8rem',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'stretch',
        gap: '8px',
        overflow: 'hidden',
        height: hasThumbnail ? `${REPLY_QUOTE_HEIGHT}px` : undefined,
      }}
    >
      <div
        style={{
          minWidth: 0,
          flex: 1,
          padding: hasThumbnail ? '0 0 0 10px' : '6px 0 6px 10px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontWeight: 700,
            opacity: 0.85,
            marginBottom: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {getDisplayName(replyTo.sender.id, replyTo.sender.nickname, currentUserId)}
        </div>
        {replyTo.type === 'image' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', opacity: 0.72 }}>
            <FaImage size={12} style={{ flexShrink: 0 }} />
            <span>Imagem</span>
          </div>
        ) : replyTo.type === 'audio' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', opacity: 0.72 }}>
            <FaPlay size={12} style={{ flexShrink: 0 }} />
            <span>Áudio {formatAudioTime(replyTo.duration ?? 0)}</span>
          </div>
        ) : replyTo.type === 'file' ? (
          (() => {
            const replyFileIcon = getFileTypeIcon(replyTo.fileMeta?.mimeType ?? '');
            const ReplyFileIcon = replyFileIcon.icon;
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', opacity: 0.72 }}>
                {!isReplyToVideo && <ReplyFileIcon size={12} style={{ flexShrink: 0 }} />}
                <span style={{ display: 'inline-block', maxWidth: '172px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {replyTo.fileMeta?.name ?? replyFileIcon.label}
                </span>
              </div>
            );
          })()
        ) : (
          <div
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              minWidth: 0,
              opacity: 0.72,
            }}
          >
            {replyTo.content}
          </div>
        )}
      </div>
      {hasThumbnail && (
        <div
          style={{
            width: `${REPLY_QUOTE_HEIGHT}px`,
            height: `${REPLY_QUOTE_HEIGHT}px`,
            flexShrink: 0,
            background: 'rgba(0, 0, 0, 0.25)',
          }}
        >
          {replyThumbnailUrl && <img src={replyThumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
      )}
    </div>
  );
}
