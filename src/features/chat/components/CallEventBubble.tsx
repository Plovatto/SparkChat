import { FaPhone, FaPhoneSlash, FaVideo } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useOptionalCall } from '@features/calls';
import { useTheme } from '@features/theme';
import type { EntrancePhase } from '@features/motion';
import { describeCallEvent } from '@lib/format/call-event';
import { formatTime } from '@lib/format';
import type { MessageView } from '@lib/socket';

interface CallEventBubbleProps {
  message: MessageView;
  entrancePhase: EntrancePhase;
}

const MISSED_COLOR = '#ff7b7b';
const ANSWERED_COLOR = '#4cd08a';

export function CallEventBubble({ message, entrancePhase }: CallEventBubbleProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const call = useOptionalCall();
  if (!message.systemEvent) {
    return null;
  }
  const described = describeCallEvent(message.systemEvent);
  const answered = described.tone === 'answered';
  const accent = answered ? ANSWERED_COLOR : MISSED_COLOR;
  const Icon = answered ? (described.kind === 'video' ? FaVideo : FaPhone) : FaPhoneSlash;
  const canCallBack = call !== null && call.snapshot.enabled && call.snapshot.state.phase === 'idle';

  return (
    <div
      className={entrancePhase === 'none' ? undefined : 'sc-anim-rise-in'}
      style={{ display: 'flex', justifyContent: described.direction === 'outgoing' ? 'flex-end' : 'flex-start', width: '100%', margin: '6px 0' }}
    >
      <div
        style={{
          background: theme.messageSystem,
          color: theme.messageSystemText,
          border: `1px solid ${theme.accentSoft}`,
          borderRadius: '14px',
          padding: '10px 14px 8px',
          minWidth: '230px',
          maxWidth: '85%',
          boxShadow: theme.shadowSm,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            aria-hidden="true"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: accent,
              background: 'rgba(255, 255, 255, 0.08)',
              border: `1px solid ${accent}`,
            }}
          >
            <Icon size={16} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            <strong style={{ fontSize: '0.92rem', lineHeight: 1.25 }}>{described.title}</strong>
            <span style={{ fontSize: '0.8rem', opacity: 0.85, lineHeight: 1.3 }}>{described.subtitle}</span>
          </div>
        </div>
        {canCallBack && call && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${theme.accentSoft}` }}>
            <button type="button" className="sc-btn sc-btn--text" style={{ fontSize: '0.85rem', fontWeight: 600, padding: '4px 16px' }} onClick={() => call.startCallInRoom(message.roomId, 'voice')}>
              {t('calls.callBack')}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: canCallBack ? '2px' : '8px' }}>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{formatTime(message.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
