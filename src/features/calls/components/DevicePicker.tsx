import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FaChevronDown, FaMicrophone, FaTimes, FaVideo, FaVolumeUp } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import { Switch } from '@components/common/Switch';
import { useCall } from '../call-context';
import { useAudioProcessing, type AudioProcessing } from '../lib/call-settings';
import { listDevices, supportsVoiceIsolation, type DeviceLists } from '../lib/media-devices';

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
  onClose: () => void;
}

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
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <span
        aria-hidden="true"
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: '18px',
          background: theme.surfaceSunken,
          color: theme.accentText,
        }}
      >
        {icon}
      </span>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0, fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.2px', color: theme.textSecondary }}>
        {label}
        <span style={{ position: 'relative', display: 'block' }}>
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
              padding: '10px 34px 10px 12px',
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
    </div>
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

export function DevicePicker({ cameraOn, supportsOutput, selected, onAudioInput, onVideoInput, onAudioOutput, onClose }: DevicePickerProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const call = useCall();
  const [processing] = useAudioProcessing();
  const voiceIsolation = supportsVoiceIsolation();
  const [devices, setDevices] = useState<DeviceLists>({ audioInputs: [], videoInputs: [], audioOutputs: [] });
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

  return (
    <div
      role="dialog"
      aria-label={t('calls.devices')}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '14px 16px 16px',
        width: 'min(380px, 92vw)',
        maxHeight: '60vh',
        overflowY: 'auto',
        background: theme.surfaceElevated,
        color: theme.textPrimary,
        border: `1px solid ${theme.border}`,
        borderRadius: '16px',
        boxShadow: theme.shadowLg ?? theme.shadowSm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: '1rem' }}>{t('calls.devices')}</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('calls.closeDevices')}
          title={t('calls.closeDevices')}
          style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: theme.surfaceSunken, color: theme.textSecondary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <FaTimes size={13} />
        </button>
      </div>
      <DeviceField
        icon={<FaMicrophone size={14} />}
        label={t('calls.microphone')}
        emptyLabel={t('calls.noMicrophone')}
        defaultLabel={t('calls.defaultDevice')}
        value={selected.audioInput}
        list={devices.audioInputs}
        onChange={onAudioInput}
      />
      <DeviceField
        icon={<FaVideo size={14} />}
        label={t('calls.camera')}
        hint={cameraOn ? undefined : t('calls.cameraHint')}
        emptyLabel={t('calls.noCamera')}
        defaultLabel={t('calls.defaultDevice')}
        value={selected.videoInput}
        list={devices.videoInputs}
        onChange={onVideoInput}
      />
      <div style={{ height: '1px', background: theme.border }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <strong style={{ fontSize: '0.8rem', letterSpacing: '0.3px', textTransform: 'uppercase', color: theme.textSecondary }}>{t('calls.audio.title')}</strong>
        <AudioOption id="call-audio-noise" label={t('calls.audio.noise')} description={t('calls.audio.noiseHint')} checked={processing.noiseSuppression} onChange={() => toggle('noiseSuppression')} />
        <AudioOption id="call-audio-echo" label={t('calls.audio.echo')} description={t('calls.audio.echoHint')} checked={processing.echoCancellation} onChange={() => toggle('echoCancellation')} />
        <AudioOption id="call-audio-gain" label={t('calls.audio.gain')} description={t('calls.audio.gainHint')} checked={processing.autoGainControl} onChange={() => toggle('autoGainControl')} />
        {voiceIsolation && (
          <AudioOption id="call-audio-isolation" label={t('calls.audio.isolation')} description={t('calls.audio.isolationHint')} checked={processing.voiceIsolation} onChange={() => toggle('voiceIsolation')} />
        )}
      </div>
      {supportsOutput && (
        <DeviceField
          icon={<FaVolumeUp size={14} />}
          label={t('calls.speaker')}
          emptyLabel={t('calls.noSpeaker')}
          defaultLabel={t('calls.defaultDevice')}
          value={selected.audioOutput}
          list={devices.audioOutputs}
          onChange={onAudioOutput}
        />
      )}
    </div>
  );
}
