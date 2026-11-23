import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FaMicrophone, FaMicrophoneSlash, FaTimes } from 'react-icons/fa';
import { MdCallEnd } from 'react-icons/md';
import { AVATAR_ICON_COLOR, type AVATARS } from '@features/auth/constants/avatars';
import { useStreamOn, useToggleRipple } from './call-hooks';

interface CallPipProps {
  target: Window;
  peerName: string;
  avatar: (typeof AVATARS)[number] | undefined;
  photo?: string | null;
  stream: MediaStream | null;
  speaking: boolean;
  muted: boolean;
  remoteMuted: boolean;
  onToggleMute: () => void;
  onHangup: () => void;
  onClose: () => void;
}

export function CallPip({ target, peerName, avatar, photo, stream, speaking, muted, remoteMuted, onToggleMute, onHangup, onClose }: CallPipProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  useStreamOn(videoRef, stream);
  const muteLabel = muted ? t('calls.unmute') : t('calls.mute');
  const [muteRipple, armMuteRipple] = useToggleRipple(muted);

  return createPortal(
    <div className="sc-call-pip">
      <button type="button" className="sc-call-pip__close" onClick={onClose} title={t('calls.pip.dismiss')} aria-label={t('calls.pip.dismiss')}>
        <FaTimes size={14} />
      </button>
      <div className="sc-call-pip__media">
        {stream ? (
          <video ref={videoRef} autoPlay playsInline muted />
        ) : (
          <div className={`sc-call-avatar${speaking ? ' sc-call-speaking' : ''}`} style={{ width: '88px', height: '88px', background: avatar?.bgGradient }}>
            {photo ? <img src={photo} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} /> : avatar ? <avatar.icon size={42} color={AVATAR_ICON_COLOR} /> : null}
            {remoteMuted && (
              <span className="sc-call-muted-badge" role="img" aria-label={t('calls.mutedBadge')}>
                <FaMicrophoneSlash size={12} />
              </span>
            )}
          </div>
        )}
      </div>
      <div className="sc-call-pip__bar">
        <span className={`sc-call-pip__name${speaking && stream ? ' sc-call-speaking' : ''}`} style={speaking && stream ? { borderRadius: '6px', padding: '0 6px' } : undefined}>
          {peerName}
        </span>
        <button
          type="button"
          className="sc-call-round"
          onClick={() => {
            armMuteRipple();
            onToggleMute();
          }}
          title={muteLabel}
          aria-label={muteLabel}
          aria-pressed={muted}
          data-ripple={muteRipple}
        >
          {muted ? <FaMicrophoneSlash size={16} /> : <FaMicrophone size={16} />}
        </button>
        <button type="button" className="sc-call-round sc-call-round--danger" onClick={onHangup} title={t('calls.hangup')} aria-label={t('calls.hangup')}>
          <MdCallEnd size={22} />
        </button>
      </div>
    </div>,
    target.document.body,
  );
}
