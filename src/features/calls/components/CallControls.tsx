import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCog, FaDesktop, FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash } from 'react-icons/fa';
import { MdCallEnd } from 'react-icons/md';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { useCall } from '../call-context';
import { isMounted } from '../lib/presence';
import { usePresence } from './use-presence';
import { DevicePicker, type BroadcastSettings, type DeviceSelection } from './DevicePicker';

interface CallControlsProps {
  supportsOutput: boolean;
  onAudioOutput: (deviceId: string) => void;
  infoRef?: RefObject<HTMLElement | null>;
  broadcast?: BroadcastSettings | null;
}

const PANEL_GAP_PX = 32;
const SHEET_TOP_PX = 76;
const SHEET_GAP_PX = 12;
const MIN_PANEL_HEIGHT_PX = 220;

export function CallControls({ supportsOutput, onAudioOutput, infoRef, broadcast = null }: CallControlsProps) {
  const { t } = useTranslation();
  const call = useCall();
  const [showDevices, setShowDevices] = useState(false);
  const panelStage = usePresence(showDevices, 180, 140);
  const [panelHeight, setPanelHeight] = useState<number | undefined>(undefined);
  const [panelBottom, setPanelBottom] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<DeviceSelection>({ audioInput: '', videoInput: '', audioOutput: '' });
  const settingsRef = useRef<HTMLButtonElement>(null);
  const popover = useMediaQuery('(min-width: 600px)');
  const { snapshot } = call;
  const connected = snapshot.state.phase === 'active' || snapshot.state.phase === 'reconnecting';
  const muteLabel = snapshot.muted ? t('calls.unmute') : t('calls.mute');
  const cameraLabel = snapshot.cameraOn ? t('calls.cameraOff') : t('calls.cameraOn');
  const shareBlocked = !snapshot.canShareScreen || snapshot.degrade === 'audio-only-relay';
  const shareLabel = snapshot.screenSharing ? t('calls.share.stop') : shareBlocked ? t('calls.share.unavailable') : t('calls.share.start');

  useLayoutEffect(() => {
    if (!showDevices) {
      setPanelHeight(undefined);
      setPanelBottom(undefined);
      return;
    }
    const measure = () => {
      const button = settingsRef.current?.getBoundingClientRect();
      if (!button) {
        return;
      }
      const top = popover ? (infoRef?.current?.getBoundingClientRect().bottom ?? 84) : SHEET_TOP_PX;
      setPanelHeight(Math.max(MIN_PANEL_HEIGHT_PX, Math.floor(button.top - top - PANEL_GAP_PX)));
      setPanelBottom(popover ? undefined : Math.ceil(window.innerHeight - button.top + SHEET_GAP_PX));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [showDevices, popover, infoRef]);

  const closeDevices = useCallback((restoreFocus: boolean) => {
    setShowDevices(false);
    if (restoreFocus) {
      settingsRef.current?.focus();
    }
  }, []);

  return (
    <div className="sc-call-controls" role="toolbar" aria-label={t('calls.settings')}>
      <button type="button" className="sc-call-round" onClick={call.toggleMute} title={muteLabel} aria-label={muteLabel} aria-pressed={snapshot.muted}>
        <span key={snapshot.muted ? 'muted' : 'live'} className="sc-call-icon-swap">
          {snapshot.muted ? <FaMicrophoneSlash size={20} /> : <FaMicrophone size={20} />}
        </span>
      </button>
      {connected && (
        <button type="button" className="sc-call-round" onClick={call.toggleCamera} title={cameraLabel} aria-label={cameraLabel} aria-pressed={snapshot.cameraOn}>
          <span key={snapshot.cameraOn ? 'on' : 'off'} className="sc-call-icon-swap">
            {snapshot.cameraOn ? <FaVideo size={20} /> : <FaVideoSlash size={20} />}
          </span>
        </button>
      )}
      {connected && call.canShareScreen && (
        <button
          type="button"
          className="sc-call-round"
          onClick={call.toggleScreenShare}
          title={shareLabel}
          aria-label={shareLabel}
          aria-pressed={snapshot.screenSharing}
          data-active={snapshot.screenSharing}
          disabled={!snapshot.screenSharing && shareBlocked}
        >
          <FaDesktop size={19} />
        </button>
      )}
      <span style={{ display: 'inline-flex' }}>
        <button
          ref={settingsRef}
          type="button"
          className="sc-call-round"
          onClick={() => setShowDevices((value) => !value)}
          title={t('calls.settings')}
          aria-label={t('calls.settings')}
          aria-expanded={showDevices}
          aria-haspopup="dialog"
          data-active={showDevices}
        >
          <FaCog size={20} />
        </button>
        {isMounted(panelStage) && (
          <DevicePicker
            stage={panelStage}
            broadcast={broadcast}
            cameraOn={snapshot.cameraOn}
            supportsOutput={supportsOutput}
            selected={selected}
            maxHeight={panelHeight}
            bottom={panelBottom}
            trigger={settingsRef}
            onAudioInput={(deviceId) => {
              setSelected((current) => ({ ...current, audioInput: deviceId }));
              call.changeAudioInput(deviceId);
            }}
            onVideoInput={(deviceId) => {
              setSelected((current) => ({ ...current, videoInput: deviceId }));
              call.changeVideoInput(deviceId);
            }}
            onAudioOutput={(deviceId) => {
              setSelected((current) => ({ ...current, audioOutput: deviceId }));
              onAudioOutput(deviceId);
            }}
            onClose={closeDevices}
          />
        )}
      </span>
      <button type="button" className="sc-call-round sc-call-round--danger" onClick={call.hangup} title={t('calls.hangup')} aria-label={t('calls.hangup')}>
        <MdCallEnd size={26} />
      </button>
    </div>
  );
}
