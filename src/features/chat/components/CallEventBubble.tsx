import type { IconType } from 'react-icons';
import { LuPhone, LuPhoneMissed, LuVideo, LuVideoOff } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { useOptionalCall } from '@features/calls';
import type { EntrancePhase } from '@features/motion';
import { describeCallCard, type CallPreviewGlyph } from '@lib/format/call-event';
import { formatTime } from '@lib/format';
import type { MessageView, RoomSummary } from '@lib/socket';
import { useActiveRoom } from '../hooks/active-room-context';
import '../styles/call-event-bubble.css';

interface CallEventBubbleProps {
  message: MessageView;
  entrancePhase: EntrancePhase;
  room?: RoomSummary | null;
}

const GLYPHS: Record<CallPreviewGlyph, IconType> = {
  'voice-outgoing': LuPhone,
  'voice-incoming': LuPhone,
  'voice-missed': LuPhoneMissed,
  video: LuVideo,
  'video-off': LuVideoOff,
};

export function CallEventBubble({ message, entrancePhase, room: roomProp }: CallEventBubbleProps) {
  const activeRoom = useActiveRoom();
  const room = roomProp ?? (activeRoom?.id === message.roomId ? activeRoom : null);
  const { t } = useTranslation();
  const call = useOptionalCall();
  if (!message.systemEvent) {
    return null;
  }
  const card = describeCallCard(message.systemEvent);
  const own = card.direction === 'outgoing';
  const Glyph = GLYPHS[card.glyph];
  const ButtonIcon = card.kind === 'video' ? LuVideo : LuPhone;
  const callable = call !== null && (room ? call.canCall(room) : call.snapshot.enabled);
  const busy = call !== null && call.snapshot.state.phase !== 'idle' && call.snapshot.state.phase !== 'ended';
  const time = formatTime(message.timestamp);

  const startCallBack = () => {
    if (!call || busy) {
      return;
    }
    if (room) {
      call.startCall(room, card.kind);
      return;
    }
    call.startCallInRoom(message.roomId, card.kind);
  };

  return (
    <div className="sc-call-card-row" data-own={own}>
      <div
        className={`sc-call-card${entrancePhase === 'none' ? '' : ' sc-anim-bubble-in'}`}
        data-own={own}
        data-tone={card.tone}
        data-status={card.status}
        role="group"
        aria-label={`${card.fullText} · ${time}`}
      >
        <div className="sc-call-card__panel">
          <span className="sc-call-card__halo" data-pulse={card.pulse} aria-hidden="true">
            <span className="sc-call-card__glyph">
              <Glyph />
            </span>
          </span>
          <div className="sc-call-card__text">
            <strong className="sc-call-card__title">{card.title}</strong>
            <span className="sc-call-card__who">{card.who}</span>
          </div>
          <div className="sc-call-card__side">
            <span className="sc-call-card__pill">
              {card.status === 'answered' && <span className="sc-call-card__dot" aria-hidden="true" />}
              <span className="sc-call-card__pill-text">{card.statusLabel}</span>
            </span>
            <time className="sc-call-card__time" dateTime={message.timestamp}>
              {time}
            </time>
          </div>
        </div>
        {callable && (
          <button
            type="button"
            className="sc-call-card__action"
            onClick={startCallBack}
            disabled={busy}
            title={busy ? t('calls.alreadyInCall') : undefined}
          >
            <ButtonIcon aria-hidden="true" />
            <span>{t('calls.callBack')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
