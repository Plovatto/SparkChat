import { format } from 'date-fns';
import { FaBan, FaExclamationCircle } from 'react-icons/fa';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import { processSystemMessage, splitSystemMessageActor } from '@lib/format';
import type { MessageView } from '@lib/socket';

interface DeletedMessageBubbleProps {
  isOwn: boolean;
  roomId: string;
}

export function DeletedMessageBubble({ isOwn, roomId }: DeletedMessageBubbleProps) {
  const { theme, getRoomAppearance } = useTheme();
  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);

  return (
    <div
      className="animate__animated animate__fadeInUp animate__faster chat-bubble-wrap"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: '2px',
      }}
    >
      <div
        style={{
          background: bubbleStyle.background,
          color: bubbleStyle.textColor,
          opacity: 0.65,
          borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          padding: '10px 14px',
          boxShadow: isOwn ? '0 2px 10px rgba(0, 0, 0, 0.18)' : '0 2px 8px rgba(0, 0, 0, 0.08)',
          backdropFilter: bubbleStyle.blur > 0 ? `blur(${bubbleStyle.blur}px)` : undefined,
          WebkitBackdropFilter: bubbleStyle.blur > 0 ? `blur(${bubbleStyle.blur}px)` : undefined,
          fontStyle: 'italic',
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <FaBan size={13} style={{ flexShrink: 0 }} />
        <span>Mensagem deletada</span>
      </div>
    </div>
  );
}

interface ErrorMessageBubbleProps {
  message: MessageView;
}

export function ErrorMessageBubble({ message }: ErrorMessageBubbleProps) {
  return (
    <div
      className="animate__animated animate__fadeIn"
      style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '4px 0' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          background: 'rgba(239, 83, 80, 0.14)',
          border: '1px solid rgba(239, 83, 80, 0.35)',
          color: '#ef5350',
          borderRadius: '12px',
          padding: '8px 16px',
          fontSize: '0.85rem',
          textAlign: 'left',
          maxWidth: '80%',
          fontWeight: 500,
        }}
      >
        <FaExclamationCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <p style={{ margin: 0, lineHeight: 1.4 }}>{message.content}</p>
          <span style={{ fontSize: '0.7rem', opacity: 0.75, display: 'block', marginTop: '2px' }}>
            {format(new Date(message.timestamp), 'HH:mm')}
          </span>
        </div>
      </div>
    </div>
  );
}

interface SystemMessageBubbleProps {
  message: MessageView;
  currentNickname: string;
}

export function SystemMessageBubble({ message, currentNickname }: SystemMessageBubbleProps) {
  const { theme } = useTheme();
  const processed = processSystemMessage(message.content, currentNickname);
  const split = splitSystemMessageActor(processed);

  return (
    <div
      className="animate__animated animate__fadeIn"
      style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '4px 0' }}
    >
      <div
        style={{
          background: `${theme.primary}A0`,
          color: theme.headerTextColor,
          borderRadius: '12px',
          padding: '8px 16px',
          fontSize: '0.85rem',
          textAlign: 'center',
          maxWidth: '80%',
          fontStyle: 'italic',
          fontWeight: 500,
        }}
      >
        <p style={{ margin: 0, lineHeight: 1.4 }}>
          {split ? (
            <>
              <span style={{ fontWeight: 700 }}>{split.actor}</span>
              {split.rest}
            </>
          ) : (
            processed
          )}
        </p>
        <span style={{ fontSize: '0.7rem', opacity: 0.7, display: 'block', marginTop: '4px' }}>
          {format(new Date(message.timestamp), 'HH:mm')}
        </span>
      </div>
    </div>
  );
}
