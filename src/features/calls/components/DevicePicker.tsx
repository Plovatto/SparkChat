import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@features/theme';
import { listDevices, type DeviceLists } from '../lib/media-devices';

interface DevicePickerProps {
  showCamera: boolean;
  supportsOutput: boolean;
  onAudioInput: (deviceId: string) => void;
  onVideoInput: (deviceId: string) => void;
  onAudioOutput: (deviceId: string) => void;
}

export function DevicePicker({ showCamera, supportsOutput, onAudioInput, onVideoInput, onAudioOutput }: DevicePickerProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [devices, setDevices] = useState<DeviceLists>({ audioInputs: [], videoInputs: [], audioOutputs: [] });

  useEffect(() => {
    let cancelled = false;
    void listDevices().then((result) => {
      if (!cancelled) {
        setDevices(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const select = (label: string, list: MediaDeviceInfo[], onChange: (id: string) => void) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: theme.textSecondary }}>
      {label}
      <select
        defaultValue=""
        onChange={(event) => event.target.value && onChange(event.target.value)}
        style={{ background: theme.input, color: theme.textPrimary, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '6px 8px' }}
      >
        <option value="">{t('calls.defaultDevice')}</option>
        {list.map((device, index) => (
          <option key={device.deviceId || index} value={device.deviceId}>
            {device.label || `${label} ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: theme.surfaceElevated, borderRadius: '12px', minWidth: '240px' }}>
      {select(t('calls.microphone'), devices.audioInputs, onAudioInput)}
      {showCamera && select(t('calls.camera'), devices.videoInputs, onVideoInput)}
      {supportsOutput && select(t('calls.speaker'), devices.audioOutputs, onAudioOutput)}
    </div>
  );
}
