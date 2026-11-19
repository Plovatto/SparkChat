import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCog, FaMicrophone, FaMicrophoneSlash, FaPhoneSlash, FaVideo, FaVideoSlash } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { useCall } from '../call-context';
import { DevicePicker } from './DevicePicker';

interface CallControlsProps {
  supportsOutput: boolean;
  onAudioOutput: (deviceId: string) => void;
}

export function CallControls({ supportsOutput, onAudioOutput }: CallControlsProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const call = useCall();
  const [showDevices, setShowDevices] = useState(false);
  const { snapshot } = call;
  const connected = snapshot.state.phase === 'active' || snapshot.state.phase === 'reconnecting';
  const round = {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  } as const;
  const neutral = { ...round, background: theme.surfaceElevated, color: theme.textPrimary };
  const muteLabel = snapshot.muted ? t('calls.unmute') : t('calls.mute');
  const cameraLabel = snapshot.cameraOn ? t('calls.cameraOff') : t('calls.cameraOn');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      {showDevices && (
        <DevicePicker
          showCamera={snapshot.state.kind === 'video'}
          supportsOutput={supportsOutput}
          onAudioInput={call.changeAudioInput}
          onVideoInput={call.changeVideoInput}
          onAudioOutput={onAudioOutput}
        />
      )}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <button type="button" style={neutral} onClick={call.toggleMute} title={muteLabel} aria-label={muteLabel} aria-pressed={snapshot.muted}>
          {snapshot.muted ? <FaMicrophoneSlash size={20} /> : <FaMicrophone size={20} />}
        </button>
        {connected && (
          <button type="button" style={neutral} onClick={call.toggleCamera} title={cameraLabel} aria-label={cameraLabel} aria-pressed={snapshot.cameraOn}>
            {snapshot.cameraOn ? <FaVideo size={20} /> : <FaVideoSlash size={20} />}
          </button>
        )}
        <button type="button" style={neutral} onClick={() => setShowDevices((value) => !value)} title={t('calls.devices')} aria-label={t('calls.devices')} aria-expanded={showDevices}>
          <FaCog size={20} />
        </button>
        <button type="button" style={{ ...round, background: theme.danger, color: theme.textOnAccent }} onClick={call.hangup} title={t('calls.hangup')} aria-label={t('calls.hangup')}>
          <FaPhoneSlash size={20} />
        </button>
      </div>
    </div>
  );
}
