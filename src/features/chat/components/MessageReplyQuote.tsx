import type { MouseEvent } from 'react';
import { FaImage, FaPlay } from 'react-icons/fa';
import { withAlpha, type ResolvedBubbleStyle } from '@features/theme';
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
  bubble: ResolvedBubbleStyle;
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

export function MessageReplyQuote({ replyTo, parentType, isOwn, bubble, currentUserId }: MessageReplyQuoteProps) {
  const isReplyToImage = replyTo.type === 'image';
  const isReplyToVideo = replyTo.type === 'file' && Boolean(replyTo.fileMeta?.mimeType.startsWith('video/'));
  const hasThumbnail = isReplyToImage || isReplyToVideo;
  const replyVideoThumbnail = useReplyVideoThumbnail(isReplyToVideo, replyTo.content);
  const replyThumbnailUrl = isReplyToImage ? replyTo.content : isReplyToVideo ? replyVideoThumbnail : null;

  const quoteAccent = isOwn ? withAlpha(bubble.accentColor, 0.65) : bubble.accentColor;

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    jumpToMessage(replyTo.id);
  };

  const secondaryLineStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    color: bubble.mutedTextColor,
  };

  return (
    <div
      onClick={handleClick}
      className="sc-bubble-quote"
      style={{
        margin: '8px 10px 0',
        marginBottom: parentType === 'text' ? 0 : '6px',
        minWidth: '90px',
        maxWidth: 'calc(100% - 20px)',
        boxSizing: 'border-box',
        background: bubble.innerBackground,
        borderLeft: `3px solid ${quoteAccent}`,
        borderRadius: '6px',
        fontSize: '0.8rem',
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
          padding: hasThumbnail ? '0 0 0 10px' : '7px 12px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: isOwn ? bubble.textColor : bubble.accentColor,
            marginBottom: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {getDisplayName(replyTo.sender.id, replyTo.sender.nickname, currentUserId)}
        </div>
        {replyTo.type === 'image' ? (
          <div style={secondaryLineStyle}>
            <FaImage size={12} style={{ flexShrink: 0 }} />
            <span>Imagem</span>
          </div>
        ) : replyTo.type === 'audio' ? (
          <div style={secondaryLineStyle}>
            <FaPlay size={12} style={{ flexShrink: 0 }} />
            <span>Áudio {formatAudioTime(replyTo.duration ?? 0)}</span>
          </div>
        ) : replyTo.type === 'file' ? (
          (() => {
            const replyFileIcon = getFileTypeIcon(replyTo.fileMeta?.mimeType ?? '');
            const ReplyFileIcon = replyFileIcon.icon;
            return (
              <div style={secondaryLineStyle}>
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
              color: bubble.mutedTextColor,
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
            background: bubble.innerStrongBackground,
          }}
        >
          {replyThumbnailUrl && <img src={replyThumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
      )}
    </div>
  );
}
