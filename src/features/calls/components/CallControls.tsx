import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { LuMic, LuMicOff, LuPhoneOff, LuScreenShare, LuScreenShareOff, LuSettings, LuVideo, LuVideoOff } from 'react-icons/lu';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { useCall } from '../call-context';
import { speakingClass } from '../lib/self-speaking';
import { isMounted } from '../lib/presence';
import { usePresence } from './use-presence';
import { DevicePicker, type BroadcastSettings, type DeviceSelection } from './DevicePicker';

interface CallControlsProps {
  supportsOutput: boolean;
  onAudioOutput: (deviceId: string) => void;
  infoRef?: RefObject<HTMLElement | null>;
  broadcast?: BroadcastSettings | null;
  onPanelChange?: (open: boolean) => void;
}

const PANEL_GAP_PX = 24;
const MIN_PANEL_HEIGHT_PX = 220;

export function CallControls({ supportsOutput, onAudioOutput, infoRef, broadcast = null, onPanelChange }: CallControlsProps) {
  const { t } = useTranslation();
  const call = useCall();
  const [showDevices, setShowDevices] = useState(false);
  const panelStage = usePresence(showDevices, 220, 160);
  const [panelHeight, setPanelHeight] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<DeviceSelection>({ audioInput: '', videoInput: '', audioOutput: '' });
  const settingsRef = useRef<HTMLButtonElement>(null);
  const popover = useMediaQuery('(min-width: 600px)');
  const { snapshot } = call;
  const connected = snapshot.state.phase === 'active' || snapshot.state.phase === 'reconnecting';
  const muteLabel = snapshot.muted ? t('calls.unmute') : t('calls.mute');
  const muteTitle = call.localSpeaking ? `${muteLabel} · ${t('calls.micPickingUp')}` : muteLabel;
  const cameraLabel = snapshot.cameraOn ? t('calls.cameraOff') : t('calls.cameraOn');
  const shareBlocked = !snapshot.canShareScreen || snapshot.degrade === 'audio-only-relay';
  const shareLabel = snapshot.screenSharing ? t('calls.share.stop') : shareBlocked ? t('calls.share.unavailable') : t('calls.share.start');

  useEffect(() => {
    onPanelChange?.(showDevices);
  }, [showDevices, onPanelChange]);

  useEffect(() => () => onPanelChange?.(false), [onPanelChange]);

  useLayoutEffect(() => {
    if (!showDevices || !popover) {
      setPanelHeight(undefined);
      return;
    }
    const measure = () => {
      const button = settingsRef.current?.getBoundingClientRect();
      if (!button) {
        return;
      }
      const top = infoRef?.current?.getBoundingClientRect().bottom ?? 84;
      setPanelHeight(Math.max(MIN_PANEL_HEIGHT_PX, Math.floor(button.top - top - PANEL_GAP_PX)));
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
      {isMounted(panelStage) && <span className="sc-call-scrim" data-state={panelStage} aria-hidden="true" />}
      <button
        type="button"
        className={speakingClass('sc-call-round', call.localSpeaking)}
        data-tone={snapshot.muted ? 'off' : undefined}
        onClick={call.toggleMute}
        title={muteTitle}
        aria-label={muteLabel}
        aria-pressed={snapshot.muted}
      >
        <span key={snapshot.muted ? 'muted' : 'live'} className="sc-call-icon-swap">
          {snapshot.muted ? <LuMicOff size={22} /> : <LuMic size={22} />}
        </span>
      </button>
      <button
        type="button"
        className="sc-call-round"
        data-tone={snapshot.cameraOn ? 'on' : undefined}
        onClick={call.toggleCamera}
        title={cameraLabel}
        aria-label={cameraLabel}
        aria-pressed={snapshot.cameraOn}
        disabled={!connected}
      >
        <span key={snapshot.cameraOn ? 'on' : 'off'} className="sc-call-icon-swap">
          {snapshot.cameraOn ? <LuVideo size={22} /> : <LuVideoOff size={22} />}
        </span>
      </button>
      {call.canShareScreen && (
        <button
          type="button"
          className="sc-call-round"
          data-tone={snapshot.screenSharing ? 'live' : undefined}
          onClick={call.toggleScreenShare}
          title={shareLabel}
          aria-label={shareLabel}
          aria-pressed={snapshot.screenSharing}
          data-active={snapshot.screenSharing}
          disabled={!connected || (!snapshot.screenSharing && shareBlocked)}
        >
          <span key={snapshot.screenSharing ? 'live' : 'idle'} className="sc-call-icon-swap">
            {snapshot.screenSharing ? <LuScreenShareOff size={21} /> : <LuScreenShare size={21} />}
          </span>
          {snapshot.screenSharing && <span className="sc-call-round__live" aria-hidden="true" />}
        </button>
      )}
      <span className="sc-call-anchor">
        <button
          ref={settingsRef}
          type="button"
          className="sc-call-round sc-call-round--settings"
          onClick={() => setShowDevices((value) => !value)}
          title={t('calls.settings')}
          aria-label={t('calls.settings')}
          aria-expanded={showDevices}
          aria-haspopup="dialog"
          data-active={showDevices}
        >
          <LuSettings size={21} />
        </button>
        {isMounted(panelStage) && (
          <DevicePicker
            stage={panelStage}
            broadcast={broadcast}
            cameraOn={snapshot.cameraOn}
            supportsOutput={supportsOutput}
            selected={selected}
            maxHeight={panelHeight}
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
      <span className="sc-call-controls__divider" aria-hidden="true" />
      <button type="button" className="sc-call-round sc-call-round--danger" onClick={call.hangup} title={t('calls.hangup')} aria-label={t('calls.hangup')}>
        <LuPhoneOff size={22} />
      </button>
    </div>
  );
}
