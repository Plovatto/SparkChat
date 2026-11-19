import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FaChevronDown, FaMicrophone, FaTimes, FaVideo, FaVolumeUp } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { Switch } from '@components/common/Switch';
import { useCall } from '../call-context';
import { useAudioProcessing, type AudioProcessing } from '../lib/call-settings';
import { listDevices, supportsVoiceIsolation, type DeviceLists } from '../lib/media-devices';
import type { PresenceStage } from '../lib/presence';
import { isOutside } from './call-hooks';

export interface DeviceSelection {
  audioInput: string;
  videoInput: string;
  audioOutput: string;
}

interface DevicePickerProps {
  cameraOn: boolean;
  supportsOutput: boolean;
  selected: DeviceSelection;
  onAudioInput: (deviceId: string) => void;
  onVideoInput: (deviceId: string) => void;
  onAudioOutput: (deviceId: string) => void;
  onClose: (restoreFocus: boolean) => void;
  maxHeight?: number | undefined;
  bottom?: number | undefined;
  trigger?: RefObject<HTMLElement | null>;
  stage?: PresenceStage;
}

type PanelTab = 'devices' | 'audio';

interface DeviceFieldProps {
  icon: ReactNode;
  label: string;
  hint?: string | undefined;
  emptyLabel: string;
  value: string;
  list: MediaDeviceInfo[];
  defaultLabel: string;
  onChange: (deviceId: string) => void;
}

function DeviceField({ icon, label, hint, emptyLabel, value, list, defaultLabel, onChange }: DeviceFieldProps) {
  const { theme } = useTheme();
  const empty = list.length === 0;
  const known = value === '' || list.some((device) => device.deviceId === value);

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', lineHeight: '18px', minWidth: 0, fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.2px', color: theme.textSecondary }}>
        {label}
        <span style={{ position: 'relative', display: 'block' }}>
          <span aria-hidden="true" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', pointerEvents: 'none', color: theme.accentText }}>
            {icon}
          </span>
          <select
            value={known ? value : ''}
            disabled={empty}
            onChange={(event) => onChange(event.target.value)}
            style={{
              width: '100%',
              appearance: 'none',
              WebkitAppearance: 'none',
              background: theme.input,
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px',
              height: '42px',
              padding: '0 34px 0 40px',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: empty ? 'not-allowed' : 'pointer',
              opacity: empty ? 0.6 : 1,
              textOverflow: 'ellipsis',
            }}
          >
            {empty ? (
              <option value="">{emptyLabel}</option>
            ) : (
              <>
                <option value="">{defaultLabel}</option>
                {list.map((device, index) => (
                  <option key={device.deviceId || index} value={device.deviceId}>
                    {device.label || `${label} ${index + 1}`}
                  </option>
                ))}
              </>
            )}
          </select>
          <FaChevronDown size={11} aria-hidden="true" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: theme.textSecondary }} />
        </span>
        {hint && <span style={{ fontSize: '0.72rem', fontWeight: 400, color: theme.textSecondary, lineHeight: 1.3 }}>{hint}</span>}
      </label>
  );
}

interface AudioOptionProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

function AudioOption({ id, label, description, checked, onChange }: AudioOptionProps) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <span id={id} style={{ fontSize: '0.88rem', fontWeight: 600 }}>
          {label}
        </span>
        <span id={id + '-hint'} style={{ fontSize: '0.74rem', color: theme.textSecondary, lineHeight: 1.3 }}>
          {description}
        </span>
      </div>
      <Switch checked={checked} onChange={onChange} aria-labelledby={id} aria-describedby={id + '-hint'} />
    </div>
  );
}

export function DevicePicker({ cameraOn, supportsOutput, selected, onAudioInput, onVideoInput, onAudioOutput, onClose, maxHeight, bottom, trigger, stage = 'open' }: DevicePickerProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const call = useCall();
  const [processing] = useAudioProcessing();
  const voiceIsolation = supportsVoiceIsolation();
  const [tab, setTab] = useState<PanelTab>('devices');
  const [devices, setDevices] = useState<DeviceLists>({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const toggle = (key: keyof AudioProcessing) => call.changeAudioProcessing({ [key]: !processing[key] });

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void listDevices().then((result) => {
        if (!cancelled) {
          setDevices(result);
        }
      });
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (isOutside(event.target, panelRef.current, trigger?.current ?? null)) {
        onClose(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose(true);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, trigger]);

  const tabButton = (id: PanelTab, label: string) => (
    <button type="button" role="tab" id={`${titleId}-${id}`} aria-selected={tab === id} aria-controls={`${titleId}-panel`} onClick={() => setTab(id)}>
      {label}
    </button>
  );

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      className="sc-call-panel"
      data-state={stage}
      style={{ ...(maxHeight !== undefined ? { maxHeight: `${maxHeight}px` } : {}), ...(bottom !== undefined ? { bottom: `${bottom}px` } : {}) }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 16px 10px' }}>
        <strong id={titleId} style={{ fontSize: '1rem' }}>
          {t('calls.settings')}
        </strong>
        <button
          type="button"
          onClick={() => onClose(true)}
          aria-label={t('calls.closeDevices')}
          title={t('calls.closeDevices')}
          style={{ width: '30px', height: '30px', flexShrink: 0, borderRadius: '50%', border: 'none', background: theme.surfaceSunken, color: theme.textSecondary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <FaTimes size={13} />
        </button>
      </div>
      <div className="sc-call-segmented" role="tablist" aria-label={t('calls.settings')}>
        <span className="sc-call-segmented__indicator" data-tab={tab} aria-hidden="true" />
        {tabButton('devices', t('calls.tabs.devices'))}
        {tabButton('audio', t('calls.tabs.audio'))}
      </div>
      <div className="sc-call-panel__body" role="tabpanel" id={`${titleId}-panel`} aria-labelledby={`${titleId}-${tab}`}>
        {tab === 'devices' ? (
          <div key="devices" className="sc-call-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <DeviceField
              icon={<FaMicrophone size={13} />}
              label={t('calls.microphone')}
              emptyLabel={t('calls.noMicrophone')}
              defaultLabel={t('calls.defaultDevice')}
              value={selected.audioInput}
              list={devices.audioInputs}
              onChange={onAudioInput}
            />
            {supportsOutput && (
              <DeviceField
                icon={<FaVolumeUp size={13} />}
                label={t('calls.speaker')}
                emptyLabel={t('calls.noSpeaker')}
                defaultLabel={t('calls.defaultDevice')}
                value={selected.audioOutput}
                list={devices.audioOutputs}
                onChange={onAudioOutput}
              />
            )}
            <DeviceField
              icon={<FaVideo size={13} />}
              label={t('calls.camera')}
              hint={cameraOn ? undefined : t('calls.cameraHint')}
              emptyLabel={t('calls.noCamera')}
              defaultLabel={t('calls.defaultDevice')}
              value={selected.videoInput}
              list={devices.videoInputs}
              onChange={onVideoInput}
            />
          </div>
        ) : (
          <div key="audio" className="sc-call-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '2px' }}>
            <AudioOption id="call-audio-noise" label={t('calls.audio.noise')} description={t('calls.audio.noiseHint')} checked={processing.noiseSuppression} onChange={() => toggle('noiseSuppression')} />
            <AudioOption id="call-audio-echo" label={t('calls.audio.echo')} description={t('calls.audio.echoHint')} checked={processing.echoCancellation} onChange={() => toggle('echoCancellation')} />
            <AudioOption id="call-audio-gain" label={t('calls.audio.gain')} description={t('calls.audio.gainHint')} checked={processing.autoGainControl} onChange={() => toggle('autoGainControl')} />
            {voiceIsolation && (
              <AudioOption id="call-audio-isolation" label={t('calls.audio.isolation')} description={t('calls.audio.isolationHint')} checked={processing.voiceIsolation} onChange={() => toggle('voiceIsolation')} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
