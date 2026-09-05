import { format } from 'date-fns';
import { FaBan, FaExclamationCircle } from 'react-icons/fa';
import { resolveBubbleStyle, useTheme } from '@features/theme';
import { processSystemMessage, splitSystemMessageActor } from '@lib/format';
import type { EntrancePhase } from '@features/motion';
import type { MessageView } from '@lib/socket';

interface DeletedMessageBubbleProps {
  isOwn: boolean;
  entrancePhase: EntrancePhase;
  roomId: string;
}

export function DeletedMessageBubble({ isOwn, roomId, entrancePhase }: DeletedMessageBubbleProps) {
  const { theme, getRoomAppearance } = useTheme();
  const bubbleStyle = resolveBubbleStyle(theme, getRoomAppearance(roomId), isOwn);

  return (
    <div
      className={`${entrancePhase === 'none' ? '' : 'sc-anim-bubble-in '}chat-bubble-wrap`}
      data-own={isOwn}
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
          color: bubbleStyle.mutedTextColor,
          opacity: 0.7,
          borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          padding: '10px 14px',
          boxShadow: isOwn ? theme.shadowMd : theme.shadowSm,
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
  entrancePhase: EntrancePhase;
}

export function ErrorMessageBubble({ message, entrancePhase }: ErrorMessageBubbleProps) {
  const { theme } = useTheme();

  return (
    <div
      className={entrancePhase === 'none' ? undefined : 'sc-anim-rise-in'}
      style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '4px 0' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          background: theme.dangerSoft,
          border: `1px solid ${theme.danger}`,
          color: theme.dangerText,
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
  entrancePhase: EntrancePhase;
}

export function SystemMessageBubble({ message, currentNickname, entrancePhase }: SystemMessageBubbleProps) {
  const { theme } = useTheme();
  const processed = processSystemMessage(message.content, currentNickname);
  const split = splitSystemMessageActor(processed);

  return (
    <div
      className={entrancePhase === 'none' ? undefined : 'sc-anim-rise-in'}
      style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '4px 0' }}
    >
      <div
        style={{
          background: theme.messageSystem,
          color: theme.messageSystemText,
          border: `1px solid ${theme.accentSoft}`,
          borderRadius: '12px',
          padding: '8px 16px',
          fontSize: '0.85rem',
          textAlign: 'center',
          maxWidth: '80%',
          fontStyle: 'italic',
          fontWeight: 500,
          boxShadow: theme.shadowSm,
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
        <span style={{ fontSize: '0.7rem', opacity: 0.75, display: 'block', marginTop: '4px' }}>
          {format(new Date(message.timestamp), 'HH:mm')}
        </span>
      </div>
    </div>
  );
}
